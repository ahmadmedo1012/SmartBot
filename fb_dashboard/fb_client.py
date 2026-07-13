"""
Enhanced FB Client — connection pooling + exponential backoff retry.
Full API: posts, comments, conversations, ads, insights, messaging.
"""
import asyncio
import json
import httpx
import logging
from typing import Any

log = logging.getLogger("fb-client")

API_BASE = "https://graph.facebook.com/v22.0"
_http: httpx.AsyncClient | None = None
_http_lock = asyncio.Lock()


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

    # ── Low-level HTTP ───────────────────────────────────────────

    async def _get(self, path: str, params: dict = None) -> dict | None:
        client = await _ensure_client()
        p = {"access_token": self.token, **(params or {})}
        try:
            r = await client.get(f"{API_BASE}/{path}", params=p)
            if r.status_code != 200:
                log.error(f"GET {r.status_code} {path[:50]}: {r.text[:150]}")
                return None
            return r.json()
        except httpx.TimeoutException:
            log.error(f"GET timeout: {path[:50]}")
            return None
        except Exception as e:
            log.error(f"GET err: {e}")
            return None

    async def _post(self, path: str, data: dict = None,
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

    async def get_page_posts(self, limit: int = 10, after: str = None
                             ) -> tuple[list, dict | None]:
        params = {"limit": limit, "fields": "id,message,created_time,"
                   "likes.summary(true),shares,comments.summary(true)"}
        if after:
            params["after"] = after
        r = await self._get(f"{self.page_id}/posts", params)
        return (r or {}).get("data", []), (r or {}).get("paging")

    async def post_to_page(self, message: str) -> dict | None:
        return await self._post(f"{self.page_id}/feed", {"message": message})

    async def post_to_page_with_image(self, message: str, image_url: str) -> dict | None:
        """Post with attached image. Uploads photo first, then publishes with attachment."""
        # Upload photo to get media_fbid
        client = await _ensure_client()
        resp = await client.get(image_url)
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
            log.error(f"post_to_page_with_image error: {e}")
            return await self.post_to_page(message)

    async def post_photo(self, image_data: bytes, filename: str = "photo.jpg", message: str = "") -> dict | None:
        """Post a photo to the page. Returns photo object with id."""
        from httpx import AsyncClient
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
            log.error(f"Photo upload error: {e}")
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
        posts, _ = await self.get_page_posts(10)
        all_comments = []
        for p in posts:
            comments = await self.get_post_comments(p["id"], limit // max(len(posts), 1))
            for c in comments:
                c["_post_id"] = p["id"]
                c["_post_message"] = p.get("message", "")
            all_comments.extend(comments)
        return all_comments

    async def reply_to_comment(self, comment_id: str, message: str) -> dict | None:
        r = await self._post(f"{comment_id}/comments", {"message": message})
        return None if r and r.get("_error") else r

    async def send_private_reply(self, comment_id: str, message: str) -> dict | None:
        return await self._post(f"{comment_id}/private_replies", {"message": message})

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

    async def get_conversation_messages(self, conversation_id: str,
                                        limit: int = 50) -> list:
        r = await self._get(f"{conversation_id}/messages", {
            "limit": limit,
            "fields": "id,message,from{name,id},created_time",
        })
        return (r or {}).get("data", [])

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

    async def send_dm(self, user_id: str, message: str, messaging_type: str = "RESPONSE", tag: str = None) -> dict | None:
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

    async def get_page_fan_count(self) -> int:
        r = await self._get(f"{self.page_id}", {"fields": "fan_count"})
        return (r or {}).get("fan_count", 0)

    # ── Insights / Ads ────────────────────────────────────────────

    async def get_post_insights(self, post_id: str) -> dict:
        r = await self._get(f"{post_id}/insights", {
            "metric": "impressions,reach,engaged_users"})
        return r or {}

    async def get_ad_accounts(self) -> list:
        r = await self._get("me/adaccounts",
                            {"fields": "id,name,account_status,currency,amount_spent,balance"})
        return (r or {}).get("data", [])

    async def get_campaigns(self, ad_account_id: str, limit: int = 20) -> list:
        fields = "id,name,status,objective,created_time,adsets{name,status,daily_budget,lifetime_budget,start_time,end_time}"
        r = await self._get(f"act_{ad_account_id}/campaigns", {"limit": limit, "fields": fields})
        return (r or {}).get("data", [])

    async def get_ads(self, ad_account_id: str, limit: int = 20) -> list:
        fields = "id,name,status,adset_id,campaign_id,creative{id,title,body,image_url,object_story_spec},insights{impressions,clicks,spend,ctr,cpc}"
        r = await self._get(f"act_{ad_account_id}/ads", {"limit": limit, "fields": fields})
        return (r or {}).get("data", [])

    # ── Name helpers ──────────────────────────────────────────────

    def get_commenter_name(self, comment: dict) -> str:
        from_data = comment.get("from", {})
        full = from_data.get("name", "") or ""
        username = from_data.get("username", "") or ""
        if full: return full
        if username: return username
        uid = from_data.get("id", "")
        return f"مستخدم{uid[-4:]}" if uid else "صديقنا"

    def get_first_name(self, comment: dict) -> str:
        return self.get_commenter_name(comment).split()[0]

    def get_full_name(self, comment: dict) -> str:
        return self.get_commenter_name(comment)

    def get_commenter_id(self, comment: dict) -> str:
        return str(comment.get("from", {}).get("id", ""))

    # ── Lifecycle ─────────────────────────────────────────────────

    async def close(self):
        global _http
        if _http:
            await _http.aclose()
            _http = None
