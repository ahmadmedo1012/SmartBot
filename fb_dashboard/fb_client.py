from __future__ import annotations

"""
Enhanced FB Client — connection pooling + exponential backoff retry.
Full API: posts, comments, conversations, ads, insights, messaging.
"""
import asyncio
import json
import logging

import httpx
from ai_service import _IMAGE_MAX_BYTES, UnsafeImageUrlError, assert_safe_outbound_url

log = logging.getLogger("fb-client")

API_BASE = "https://graph.facebook.com/v22.0"
_http: httpx.AsyncClient | None = None
_http_lock = asyncio.Lock()

# v15-E7 (D8-B2): concurrency cap for the multi-post comment fan-out. 5 keeps
# us far from Graph rate limits while turning 10 serial round-trips into ~2
# "waves". Module-level (not per-call) so tests can tune it.
COMMENT_FETCH_CONCURRENCY = 5


async def _ensure_client():
    global _http
    if _http is None:
        async with _http_lock:
            if _http is None:
                limits = httpx.Limits(
                    max_keepalive_connections=10, max_connections=20, keepalive_expiry=30)
                _http = httpx.AsyncClient(timeout=15, limits=limits)
    return _http


class FBClient:
    def __init__(self, token: str, page_id: str):
        self.token = token
        self.page_id = page_id
        # v22-D2: (status_code, error_text) of the LAST failed ``_get`` — a
        # side-channel so health probes can CLASSIFY a failure (403 #200 →
        # missing pages_manage_metadata) through the same ``_get`` seam every
        # test fake already patches, without a second raw-HTTP code path.
        # ``None`` after a success; never read for control flow.
        self._last_get_error: tuple[int, str] | None = None

    # ── Low-level HTTP ───────────────────────────────────────────

    async def _get(self, path: str, params: dict | None = None) -> dict | None:
        client = await _ensure_client()
        p = {"access_token": self.token, **(params or {})}
        try:
            r = await client.get(f"{API_BASE}/{path}", params=p)
            if r.status_code != 200:
                # v22-D2: keep the failure class for the health probes
                self._last_get_error = (r.status_code, r.text[:300])
                log.error(f"GET {r.status_code} {path[:50]}: {r.text[:150]}")
                return None
            self._last_get_error = None
            return r.json()
        except httpx.TimeoutException:
            self._last_get_error = (0, "timeout")
            log.error(f"GET timeout: {path[:50]}", exc_info=True)
            return None
        except Exception as e:
            self._last_get_error = (0, str(e)[:300])
            log.error(f"GET err: {e}", exc_info=True)
            return None

    async def _get_with_status(self, path: str,
                               params: dict | None = None) -> tuple[int, dict | None, str]:
        """(status_code, parsed_body_or_None, error_text) — v22-D2.

        ``_get`` collapses EVERY non-200 into None, which is the right
        contract for data fetches but erases the failure CLASS a health
        probe needs: ``GET /{page}/subscribed_apps`` answering 403 #200
        («Requires pages_manage_metadata») must be distinguishable from a
        200 with an EMPTY data list (not subscribed) and from a timeout —
        the loud health state names the exact missing permission off this
        distinction (W1-D2 evidence: t23 200 {"data":[]} vs t25 403 #200).
        """
        client = await _ensure_client()
        p = {"access_token": self.token, **(params or {})}
        try:
            r = await client.get(f"{API_BASE}/{path}", params=p)
            if r.status_code != 200:
                return r.status_code, None, r.text[:300]
            try:
                return 200, r.json(), ""
            except Exception:
                return 200, None, r.text[:300]
        except httpx.TimeoutException:
            log.error(f"GET timeout: {path[:50]}", exc_info=True)
            return 0, None, "timeout"
        except Exception as e:
            log.error(f"GET err: {path[:50]}: {e}", exc_info=True)
            return 0, None, str(e)[:300]

    async def _post(self, path: str, data: dict | None = None,
                    max_retries: int = 3) -> dict | None:
        client = await _ensure_client()
        d = {"access_token": self.token, **(data or {})}
        last_err = None
        for attempt in range(max_retries):
            try:
                r = await client.post(f"{API_BASE}/{path}", data=d)
                if r.status_code == 200:
                    return r.json()
                if 400 <= r.status_code < 500:
                    body = r.text[:300]
                    log.error(f"POST {r.status_code} on {path[:50]}: {body}")
                    return {"_error": True, "status": r.status_code, "body": body}
                last_err = f"POST {r.status_code}: {r.text[:150]}"
                if attempt < max_retries - 1:
                    await asyncio.sleep(1.5 ** attempt)  # 1.0, 1.5, 2.25s
            except httpx.TimeoutException:
                last_err = "timeout"
                if attempt < max_retries - 1:
                    await asyncio.sleep(1.5 ** attempt)
            except Exception as e:
                last_err = str(e)
                if attempt < max_retries - 1:
                    await asyncio.sleep(1.5 ** attempt)
        log.error(f"POST failed after {max_retries} retries: {last_err}")
        return None

    # ── Posts ─────────────────────────────────────────────────────

    async def get_page_posts(self, limit: int = 10, after: str | None = None
                             ) -> tuple[list, dict | None]:
        params = {"limit": limit, "fields": "id,message,created_time,"
                   "likes.summary(true),shares,comments.summary(true)"}
        if after:
            params["after"] = after
        r = await self._get(f"{self.page_id}/posts", params)
        # v20 (live-evidenced permission split): likes.summary needs
        # pages_read_engagement and comments.summary needs
        # pages_read_user_content — neither is effective on every page token
        # (app review pending). The WHOLE posts list used to die with them.
        # Degrade to the base fields (shares included) so posts still serve
        # with counters at 0 — better a real post than an empty section.
        if r is None:
            log.warning("posts fetch with engagement summaries failed — "
                        "degrading to base fields (counts render as 0)")
            params["fields"] = "id,message,created_time,shares"
            r = await self._get(f"{self.page_id}/posts", params)
        return (r or {}).get("data", []), (r or {}).get("paging")

    async def get_page_posts_raw(self, limit: int = 50) -> dict | None:
        """v19 Step 2 (DB-first posts): the RAW ``_get`` payload — ``None``
        means the Graph call itself FAILED (error/timeout/offline), an empty
        ``data`` list means the page genuinely has no posts. The route-level
        sync needs that distinction so it can mark ``synced=False`` and the
        UI can say «فشل الاتصال» instead of a lying empty state.

        v20: same engagement-summary degradation as get_page_posts — a page
        token without pages_read_engagement/pages_read_user_content still
        syncs the posts list (counters at 0) instead of nothing at all."""
        params = {"limit": limit, "fields": "id,message,created_time,"
                   "likes.summary(true),shares,comments.summary(true)"}
        r = await self._get(f"{self.page_id}/posts", params)
        if r is None:
            params["fields"] = "id,message,created_time,shares"
            r = await self._get(f"{self.page_id}/posts", params)
        return r

    async def post_to_page(self, message: str) -> dict | None:
        return await self._post(f"{self.page_id}/feed", {"message": message})

    async def post_to_page_with_image(self, message: str, image_url: str) -> dict | None:
        """Post with attached image. Uploads photo first, then publishes with attachment.

        v12 E1.3 (D2 P1 — SSRF): image_url comes from user-controlled JSON
        (publisher/scheduler/agent) and was fetched server-side with NO
        validation — an attacker-supplied URL reached cloud metadata
        endpoints and the internal network from our server. The ai_service
        SSRF guard (v10-A8) runs BEFORE any HTTP client is built; an unsafe
        URL (non-https scheme, private/loopback/link-local host) is never
        fetched and the post degrades to text-only — the method's existing
        failure contract for unusable images.

        v16-E1 (D2-LEAD C): the guard is now the DNS-resolving async layer
        (``assert_safe_outbound_url``) — a hostname that resolves to an
        internal address (cloud metadata / RFC1918) is refused too, not just
        literal IPs. The fetched bytes also carry the ai_service 5MB cap
        (``_IMAGE_MAX_BYTES``): oversized bodies (exfil/DoS via the photo
        upload channel) degrade to the same text-only contract.
        """
        try:
            await assert_safe_outbound_url(image_url, label="صورة المنشور")
        except UnsafeImageUrlError as e:
            log.warning(f"image_url rejected by SSRF guard, posting text only: {e}")
            return await self.post_to_page(message)
        # Upload photo to get media_fbid
        client = await _ensure_client()
        resp = await client.get(image_url)
        # v16-E1: size cap BEFORE the bytes are uploaded to the Graph photo
        # endpoint — the fetched body used to be relayed uncapped.
        if len(resp.content) > _IMAGE_MAX_BYTES:
            log.warning("image body exceeded %d bytes — posting text only",
                        _IMAGE_MAX_BYTES)
            return await self.post_to_page(message)
        photo_data = {"access_token": self.token}
        files = {"source": ("photo.jpg", resp.content, "image/jpeg")} if image_url.startswith("http") else None
        if not files:
            return await self.post_to_page(message)
        try:
            r = await client.post(f"{API_BASE}/{self.page_id}/photos", data=photo_data, files=files)
            if r.status_code != 200:
                log.error(f"Photo upload: {r.status_code} {r.text[:200]}")
                return await self.post_to_page(message)
            media_id = r.json().get("id", "")
            if not media_id:
                return await self.post_to_page(message)
            return await self._post(f"{self.page_id}/feed", {
                "message": message,
                "attached_media[0]": json.dumps({"media_fbid": media_id}),
            })
        except Exception as e:
            log.error(f"post_to_page_with_image error: {e}", exc_info=True)
            return await self.post_to_page(message)

    async def post_photo(self, image_data: bytes, filename: str = "photo.jpg", message: str = "") -> dict | None:
        """Post a photo to the page. Returns photo object with id."""
        client = await _ensure_client()
        files = {"source": (filename, image_data, "image/jpeg")}
        data = {"access_token": self.token}
        if message:
            data["message"] = message
        try:
            r = await client.post(f"{API_BASE}/{self.page_id}/photos", files=files, data=data)
            if r.status_code == 200:
                return r.json()
            log.error(f"Photo upload failed: {r.status_code} {r.text[:200]}")
        except Exception as e:
            log.error(f"Photo upload error: {e}", exc_info=True)
        return None

    async def delete_post(self, post_id: str) -> dict | None:
        return await self._post(f"{post_id}", {"method": "delete"})

    async def get_post_detail(self, post_id: str) -> dict | None:
        fields = "id,message,created_time,permalink_url,comments.limit(10){id,message,from{name,id},created_time}"
        r = await self._get(f"{post_id}", {"fields": fields})
        return r or {"id": post_id, "error": "failed"}

    # ── Comments ──────────────────────────────────────────────────

    async def get_post_comments(self, post_id: str, limit: int = 50) -> list:
        r = await self._get(f"{post_id}/comments", {
            "limit": limit,
            "fields": "id,message,from{name,id},created_time,message_tags",
        })
        return (r or {}).get("data", [])

    async def get_recent_comments(self, limit: int = 50) -> list:
        """Recent comments across the page's latest posts.

        v15-E7 (D8-B2): the per-post comment fetches used to run SERIALLY
        (1 + N Graph round-trips ≈ 1.1-6.6s per /api/comments request). They
        now run concurrently under a small semaphore (see
        COMMENT_FETCH_CONCURRENCY). A failing post's comments are skipped
        (return_exceptions=True) — the surviving posts still sync, matching
        the old "best-effort, non-fatal" contract of the comments route.
        """
        posts, _ = await self.get_page_posts(10)
        if not posts:
            return []
        per_post = max(1, limit // max(len(posts), 1))
        sem = asyncio.Semaphore(COMMENT_FETCH_CONCURRENCY)

        async def _fetch(post: dict) -> list:
            async with sem:
                return await self.get_post_comments(post["id"], per_post)

        results = await asyncio.gather(
            *(_fetch(p) for p in posts), return_exceptions=True)
        all_comments: list = []
        for post, result in zip(posts, results, strict=True):
            if isinstance(result, BaseException):
                log.warning(
                    f"comments fetch failed for post {post.get('id')}: {result}")
                continue
            for c in result:
                c["_post_id"] = post["id"]
                c["_post_message"] = post.get("message", "")
            all_comments.extend(result)
        return all_comments

    async def reply_to_comment(self, comment_id: str, message: str) -> dict | None:
        """Post a public reply on a comment.

        v23: the message MAY embed a mention token ``@[{user-id}]`` — Graph
        renders it as a real tag (live-evidenced 2026-09-10: the reply came
        back with ``message_tags[0]`` populated, so the commenter gets the
        Facebook notification). The caller (pipeline Stage 7) builds it.
        """
        r = await self._post(f"{comment_id}/comments", {"message": message})
        return None if r and r.get("_error") else r

    async def send_private_reply(self, comment_id: str, message: str) -> dict | None:
        """DM the author of a comment (ONE message per comment, within 7 days).

        v23 (live-evidenced 2026-09-10): the documented edge
        ``POST /{comment-id}/private_replies`` answers Graph code 100
        subcode 33 ("object … cannot be loaded due to missing permissions")
        for this token class, while ``POST /{page-id}/messages`` with
        ``recipient={"comment_id": ...}`` succeeds AND — crucially — the
        response carries ``recipient_id``: the commenter's user id, which
        is exactly what the webhook `from` field no longer delivers (the
        2024+ privacy change hides comment authors from both reads and
        feed webhooks). The pipeline uses that id to @mention the
        commenter in the public reply.

        Returns the Graph dict (``recipient_id`` + ``message_id`` on
        success), ``None`` on failure — same contract as ``send_dm``.
        """
        if not comment_id:
            return None
        data = {
            "recipient": json.dumps({"comment_id": comment_id}),
            "message": json.dumps({"text": message}),
        }
        r = await self._post(f"{self.page_id}/messages", data, max_retries=1)
        if r and r.get("_error"):
            log.warning(
                "private reply failed (comment %s): %s",
                comment_id[:24], r.get("body", "")[:160])
            return None
        return r

    async def delete_comment(self, comment_id: str) -> dict | None:
        return await self._post(f"{comment_id}", {"method": "delete"})

    async def hide_comment(self, comment_id: str) -> dict | None:
        return await self._post(f"{comment_id}", {"is_hidden": True})

    # ── Conversations / Inbox ─────────────────────────────────────

    async def get_conversations(self, limit: int = 25) -> list:
        r = await self._get(f"{self.page_id}/conversations", {
            "limit": limit,
            "fields": "id,link,message_count,unread_count,senders,updated_time,subject",
        })
        return (r or {}).get("data", [])

    async def get_conversation_meta(self, conversation_id: str) -> dict | None:
        """One conversation's freshness markers — v22-D2 (thread staleness).

        ``updated_time`` moves on EVERY new message in the thread and
        ``message_count`` is the total — the cheap GET that lets the inbox
        decide whether the stored thread is stale (DB 46 vs live 47 — the
        W1-D2 frozen-thread evidence) WITHOUT re-fetching the messages on
        every 10s UI poll. ``None`` = probe failed (non-fatal, caller keeps
        the DB copy)."""
        return await self._get(
            f"{conversation_id}", {"fields": "updated_time,message_count"})

    async def get_conversation_messages(self, conversation_id: str,
                                        limit: int = 50) -> list:
        r = await self._get(f"{conversation_id}/messages", {
            "limit": limit,
            "fields": "id,message,from{name,id},created_time",
        })
        msgs = (r or {}).get("data", [])
        # v4 §2.4 — mark page-sent messages explicitly so the inbox UI puts
        # them on the correct bubble side (comparing from.id === "page" never
        # matched the numeric page id).
        page_id_str = str(self.page_id) if self.page_id else ""
        for m in msgs:
            m["is_from_page"] = bool(page_id_str) and str(
                (m.get("from") or {}).get("id", "")
            ) == page_id_str
        return msgs

    async def send_conversation_message(self, conversation_id: str,
                                        message: str) -> dict | None:
        conv = await self._get(f"{conversation_id}", {"fields": "senders{id,name}"})
        if not conv:
            log.error(f"Cannot fetch conversation {conversation_id[:30]}")
            return None
        page_id_str = str(self.page_id)
        user_id = None
        senders = (conv.get("senders", {}) or {}).get("data", [])
        for s in senders:
            sid = str(s.get("id", ""))
            if sid != page_id_str:
                user_id = sid
                break
        if not user_id:
            log.error(f"No non-page sender in conversation {conversation_id[:30]}")
            return None
        return await self.send_dm(user_id, message)

    async def send_dm(self, user_id: str, message: str, messaging_type: str = "RESPONSE", tag: str | None = None) -> dict | None:
        if not user_id or user_id == "None":
            return None
        data = {
            "recipient": json.dumps({"id": user_id}),
            "message": json.dumps({"text": message}),
            "messaging_type": messaging_type,
        }
        if tag:
            data["tag"] = tag
        r = await self._post(f"{self.page_id}/messages", data)
        if r and r.get("_error"):
            log.error(f"send_dm ({messaging_type}) failed: {r.get('body', r.get('error', 'unknown'))}")
            return None
        return r

    # ── Page info ─────────────────────────────────────────────────

    _FAN_COUNT_TTL = 300  # seconds — v8-A11
    _fan_count_cache: tuple[int, int | None, float] | None = None  # (page_id, count, expires_at)

    async def get_page_fan_count(self) -> int | None:
        # v4 §3.7 — honest failure: None (not 0) when the call fails, so
        # callers can fall back to the stored fb_fan_count snapshot instead
        # of displaying "0 followers" next to a "connected" badge.
        # v8-A11 — TTL cache (5 min): this live Graph call sat in the request
        # path of /api/dashboard/bundle, /api/stats and /api/analytics/overview
        # on EVERY dashboard load; a slow Graph response stalled the whole
        # dashboard (maxDuration 30s). Follower counts do not move fast —
        # a 5-minute window is invisible to users and removes the latency.
        import time as _time
        now = _time.monotonic()
        cached = FBClient._fan_count_cache
        if cached and cached[0] == self.page_id and cached[2] > now:
            return cached[1]
        r = await self._get(f"{self.page_id}", {"fields": "fan_count"})
        value = None if r is None else (r or {}).get("fan_count", 0)
        # only cache successful reads — failures keep the honest-None contract
        if r is not None:
            FBClient._fan_count_cache = (self.page_id, value, now + FBClient._FAN_COUNT_TTL)
        return value

    async def get_page_profile(self) -> dict:
        """Page identity snapshot: name + fan_count + square picture URL.

        Used by the connect flow (plan v3 §4.5) so the dashboard can show the
        page name/fans instantly from BotState without live Graph calls.
        Returns {} on failure — callers treat as best-effort."""
        r = await self._get(f"{self.page_id}", {
            "fields": "name,fan_count,picture.type(large)",
        })
        if not r or r.get("_error"):
            return {}
        pic = ((r.get("picture") or {}).get("data") or {}).get("url", "")
        return {
            "name": r.get("name", ""),
            "fan_count": r.get("fan_count", 0) or 0,
            "picture": pic,
        }

    # ── Token type / Page-token exchange (v20) ────────────────────

    async def get_me_identity(self) -> dict:
        """Who does this token represent? (v20 live-evidence fix)

        ``GET /me`` answers the PAGE id for a Page access token and the USER
        id for a User access token — the single cheapest reliable type probe.
        Returns {} on failure (invalid token / network) — ``_get`` already
        logged the Graph error text.
        """
        r = await self._get("me", {"fields": "id,name"})
        if not r or r.get("_error") or not r.get("id"):
            return {}
        return {"id": str(r.get("id")), "name": str(r.get("name") or "")}

    async def get_page_access_token(self) -> str:
        """Exchange a USER token for this page's PAGE access token.

        Live-evidenced 2026-09-10: ``GET /{page_id}?fields=access_token`` with
        a user token that administers the page returns a fresh page token
        (worked against production while every data call with the user token
        failed). Returns "" when unavailable (user doesn't manage this page,
        or the token is already a page token / invalid) — ``_get`` logs why.
        """
        r = await self._get(f"{self.page_id}", {"fields": "access_token"})
        if not r or r.get("_error"):
            return ""
        return str(r.get("access_token") or "")

    async def ensure_page_token(self) -> dict:
        """v20 root-fix: verify this token is a PAGE token; exchange if not.

        THE BUG (documented live, not guessed): a USER access token passes
        every public-field probe (name / fan_count / picture → "connected ✓")
        while /posts, /conversations and /comments all reject it —
        ``code 190 subcode 2069032 "User Access Token Is Not Supported"``
        and ``code 10 "Requested Page Does Not Match Page Access Token"`` —
        and every old failure path swallowed those errors silently.

        Returns one of:
          {"status": "page_token"}                      token already correct
          {"status": "exchanged", "token": <page tok>}  user token swapped
          {"status": "not_page_admin", "identity": …}   user token can't
                                                         manage this page
          {"status": "unverified"}                       /me failed (invalid
                                                         or network — non
                                                         fatal, callers keep
                                                         the old contract)
        """
        me = await self.get_me_identity()
        if not me:
            return {"status": "unverified"}
        if me.get("id") == str(self.page_id or ""):
            return {"status": "page_token"}
        page_token = await self.get_page_access_token()
        if page_token:
            return {"status": "exchanged", "token": page_token, "identity": me}
        return {"status": "not_page_admin", "identity": me}

    # ── Insights / Ads ────────────────────────────────────────────

    async def get_post_insights(self, post_id: str) -> dict:
        r = await self._get(f"{post_id}/insights", {
            "metric": "impressions,reach,engaged_users"})
        return r or {}

    async def get_ad_accounts(self) -> list:
        r = await self._get("me/adaccounts",
                            {"fields": "id,name,account_status,currency,amount_spent,balance"})
        return (r or {}).get("data", [])

    async def get_ad_accounts_raw(self) -> dict | None:
        """v19 Step 2: RAW ``_get`` payload — None = Graph failure (see
        get_page_posts_raw for the empty-vs-failed rationale).

        v22-D2 (W1-D2 live evidence): with a PAGE token ``me/adaccounts``
        answers 400 #100 «Tried accessing nonexisting field (adaccounts)» —
        a STRUCTURAL token-type limitation, not a permission to grant and
        not a connectivity failure. The old None-return made every ads UI
        render «فشل الاتصال بفيسبوك» (wrong diagnosis, wrong advice). A 4xx
        now answers a shaped ``{"_error": True, "_status": …, "_class":
        "page_token_unsupported"|"graph_error", "_body": …, "data": []}``
        payload (the ``_post`` convention) so the route can degrade
        HONESTLY: «غير متاح برمز صفحة — يتطلب رمز مستخدم بحساب إعلاني»."""
        status, body, err_text = await self._get_with_status(
            "me/adaccounts",
            {"fields": "id,name,account_status,currency,amount_spent,balance"})
        if status == 200 and body is not None:
            return body
        if 400 <= status < 500:
            structural = "adaccounts" in err_text and (
                "nonexisting field" in err_text or "(#100)" in err_text)
            return {
                "_error": True, "_status": status,
                "_class": ("page_token_unsupported" if structural
                           else "graph_error"),
                "_body": err_text[:200], "data": [],
            }
        return None  # 5xx / network / timeout — the honest-None contract

    async def get_campaigns(self, ad_account_id: str, limit: int = 20) -> list:
        fields = "id,name,status,objective,created_time,adsets{name,status,daily_budget,lifetime_budget,start_time,end_time}"
        # v4 §7.26 — Graph already returns ids prefixed with act_; the old
        # unconditional f"act_{id}" built act_act_… and 404'd every request.
        aid = ad_account_id if ad_account_id.startswith("act_") else f"act_{ad_account_id}"
        r = await self._get(f"{aid}/campaigns", {"limit": limit, "fields": fields})
        return (r or {}).get("data", [])

    async def get_campaigns_raw(self, ad_account_id: str, limit: int = 50) -> dict | None:
        """v19 Step 2: RAW ``_get`` payload — None = Graph failure."""
        fields = "id,name,status,objective,created_time,adsets{name,status,daily_budget,lifetime_budget,start_time,end_time}"
        aid = ad_account_id if ad_account_id.startswith("act_") else f"act_{ad_account_id}"
        return await self._get(f"{aid}/campaigns", {"limit": limit, "fields": fields})

    async def get_ads(self, ad_account_id: str, limit: int = 20) -> list:
        fields = "id,name,status,adset_id,campaign_id,creative{id,title,body,image_url,object_story_spec},insights{impressions,clicks,spend,ctr,cpc}"
        aid = ad_account_id if ad_account_id.startswith("act_") else f"act_{ad_account_id}"
        r = await self._get(f"{aid}/ads", {"limit": limit, "fields": fields})
        return (r or {}).get("data", [])

    async def get_ads_raw(self, ad_account_id: str, limit: int = 50) -> dict | None:
        """v19 Step 2: RAW ``_get`` payload — None = Graph failure."""
        fields = "id,name,status,adset_id,campaign_id,creative{id,title,body,image_url,object_story_spec},insights{impressions,clicks,spend,ctr,cpc}"
        aid = ad_account_id if ad_account_id.startswith("act_") else f"act_{ad_account_id}"
        return await self._get(f"{aid}/ads", {"limit": limit, "fields": fields})

    # ── Name helpers ──────────────────────────────────────────────

    def get_commenter_name(self, comment: dict) -> str:
        from_data = comment.get("from", {})
        full = from_data.get("name", "") or ""
        username = from_data.get("username", "") or ""
        if full:
            return full
        if username:
            return username
        uid = from_data.get("id", "")
        return f"مستخدم{uid[-4:]}" if uid else "صديقنا"

    def get_first_name(self, comment: dict) -> str:
        return self.get_commenter_name(comment).split()[0]

    def get_full_name(self, comment: dict) -> str:
        return self.get_commenter_name(comment)

    def get_commenter_id(self, comment: dict) -> str:
        return str(comment.get("from", {}).get("id", ""))

    # ── Webhook subscription ─────────────────────────────────────────

    async def subscribe_page_webhooks(self) -> dict | None:
        """Subscribe page to Facebook real-time webhooks (feed, messages, etc).
        Must be called AFTER save of valid page_id + access_token.
        POST /{page-id}/subscribed_apps?subscribed_fields=...
        """
        result = await self._post(f"{self.page_id}/subscribed_apps", {
            "subscribed_fields": "feed,messages,conversations,message_deliveries,message_reads,message_echoes,mention,comment_mentions,post_mentions",
        })
        if result and result.get("success") is not None:
            log.info(f"Webhook subscribed for page {self.page_id}: success={result.get('success')}")
        elif result and result.get("_error"):
            log.warning(f"Webhook subscribe failed for page {self.page_id}: {result.get('body','')[:200]}")
        else:
            log.warning(f"Webhook subscribe returned unexpected: {str(result)[:200]}")
        return result

    async def check_page_subscription(self) -> dict:
        """THE webhook health probe — v22-D2 (W1-D2 root-cause companion).

        ``GET /{page}/subscribed_apps`` is the single source of truth for
        "will Facebook deliver ANY event to this app": ``200 {"data": []}``
        means definitively NOT subscribed (the live t23/t24 evidence —
        zero events, zero comments, zero subscribers forever), 200 with
        data means subscribed, 403 #200 means the app lacks
        ``pages_manage_metadata`` (the t25 evidence — the exact permission
        whose absence also fails the connect-time POST).

        Goes through ``self._get`` (the seam every test fake patches — a
        fake returning None simply means "probe failed, unclassified",
        never a second network path). Returns a plain dict, NEVER raises:
          {"subscribed": bool, "fields": [str], "error": str(class-only),
           "error_code": int|None, "missing_permission": ""}
        The ``error`` value is a SHORT CLASS (``http_403``/``probe_failed``)
        — the raw Graph body stays in the server log, never in payloads.
        """
        out = {"subscribed": False, "fields": [], "error": "",
               "error_code": None, "missing_permission": ""}
        r = await self._get(f"{self.page_id}/subscribed_apps",
                            {"fields": "subscribed_fields"})
        if r is not None:
            data = r.get("data") or []
            fields: list[str] = []
            for app in data:
                fields.extend(str(f) for f in (app.get("subscribed_fields") or []) if f)
            out["subscribed"] = bool(data)
            out["fields"] = sorted(set(fields))
            return out
        status, text = (getattr(self, "_last_get_error", None) or (0, ""))
        out["error"] = f"http_{status}" if status else "probe_failed"
        out["error_code"] = status or None
        try:
            err = (json.loads(text) or {}).get("error") or {}
            if err.get("code") is not None:
                out["error_code"] = int(err.get("code"))
            msg = str(err.get("message") or "")
            if "pages_manage_metadata" in msg or (
                    out["error_code"] == 200 and status == 403):
                out["missing_permission"] = "pages_manage_metadata"
        except Exception:
            pass
        return out

    async def check_token_scopes(self) -> dict:
        """Check which Facebook permissions the current token has.
        Returns {scopes: [...], missing: [...]}.

        v20: pages_read_user_content added to the required set — reading
        comments (per-post) empirically fails without it (Graph code 10,
        live-evidenced), and the auto-reply engine's comment cycle is dead
        without comment reads.

        v21 (live-evidenced): ``/me/permissions`` is a USER-token endpoint —
        a PAGE token gets Graph 400 "Tried accessing nonexisting field
        (permissions)".

        v23 (live-evidenced 2026-09-10): the v21 fallback then assumed page
        tokens cannot be introspected and reported two scopes "missing"
        unconditionally — a FALSE warning shown to an owner whose token
        actually HAS both (the live complaint this round). The fix: a PAGE
        token CAN read its own ``debug_token`` introspection (the same call
        /api/diagnostics/permissions already uses for the global token) —
        the scopes list there is the honest source. Only when BOTH probes
        fail do we fall back to the v21 conservative answer.
        """
        required = {"pages_messaging", "pages_manage_metadata",
                    "pages_read_engagement", "pages_read_user_content"}
        r = await self._get("me/permissions")
        if r and r.get("data"):
            granted = [p["permission"] for p in r["data"] if p.get("status") == "granted"]
            missing = [s for s in required if s not in granted]
            return {"scopes": granted, "missing": missing}

        # v23: page token — introspect itself via debug_token (honest scopes)
        d = await self._get("debug_token", {"input_token": self.token})
        if d and d.get("data"):
            scopes = d["data"].get("scopes") or []
            if not scopes:
                # granular form: [{scope, permissions:[...]}, ...]
                scopes = [str(g.get("scope") or "") for g in
                          (d["data"].get("granular_scopes") or []) if g.get("scope")]
            granted = [s for s in scopes if s]
            if granted:
                missing = [s for s in required if s not in granted]
                return {"scopes": granted, "page_token": True, "missing": missing}

        # both probes failed — v21 conservative answer (unchanged doctrine)
        me = await self._get("me", {"fields": "id"})
        if me and str(me.get("id") or "") == str(self.page_id or ""):
            # page token — user-style permission list unavailable
            return {"scopes": [], "page_token": True, "missing": [
                "pages_read_engagement", "pages_read_user_content"]}
        return {"scopes": [], "missing": [
            "pages_messaging", "pages_manage_metadata",
            "pages_read_engagement", "pages_read_user_content"]}

    # ── Lifecycle ─────────────────────────────────────────────────

    async def close(self):
        global _http
        if _http:
            await _http.aclose()
            _http = None
