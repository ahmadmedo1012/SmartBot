from __future__ import annotations

"""Facebook webhook endpoints + event processing (v11-A1 extraction).

Routes (GET/POST ``/webhook``) are registered in runner.py.

v11-A1 note on the env constants: the canonical ``WEBHOOK_VERIFY_TOKEN`` /
``WEBHOOK_APP_SECRET`` values stay DEFINED ON THE RUNNER MODULE (snapshotted
from the environment at runner import time, exactly as before). This module
reads them dynamically via a deferred ``import runner`` so the historical
monkeypatch contract (tests patch ``runner.WEBHOOK_APP_SECRET`` to force the
SystemConfig fallback) keeps working — identical behavior to the monolith,
where the handlers read their own module's globals.
"""

import hashlib
import hmac
import json
import logging

from _services import _track_event, get_bot_engine, get_tenant_fb_client
from database import AsyncSessionLocal
from fastapi import HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from models import BotState
from sqlalchemy import select

log = logging.getLogger("fb-api")


async def _get_webhook_app_secret() -> str:
    """App secret resolution (plan v3 §4 final gap): env FACEBOOK_APP_SECRET
    first, then SystemConfig.facebook_app_secret (owner-entered from
    /admin/settings — the production env had NO app secret, so the webhook
    rejected every event with 401 since launch)."""
    import runner  # deferred — canonical WEBHOOK_APP_SECRET lives on runner
    if runner.WEBHOOK_APP_SECRET:
        return runner.WEBHOOK_APP_SECRET
    try:
        async with AsyncSessionLocal() as db:
            from models import SystemConfig as _SC
            row = await db.execute(
                select(_SC).where(_SC.key == "facebook_app_secret"))
            r = row.scalar_one_or_none()
            if r and r.value:
                return r.value
    except Exception:
        pass
    return ""


async def webhook_verify(
    hub_mode: str = Query("", alias="hub.mode"),
    hub_token: str = Query("", alias="hub.verify_token"),
    hub_challenge: str = Query("", alias="hub.challenge"),
):
    """Facebook subscription verification."""
    import runner  # deferred — canonical WEBHOOK_VERIFY_TOKEN lives on runner
    # v9-A9: constant-time compare (hmac.compare_digest) — a plain == leaks
    # the verify token byte-by-byte via timing. Fails CLOSED when the token
    # is unconfigured (empty secret never matches, mirroring the cron guard).
    if (hub_mode == "subscribe" and runner.WEBHOOK_VERIFY_TOKEN
            and hmac.compare_digest(hub_token, runner.WEBHOOK_VERIFY_TOKEN)):
        return PlainTextResponse(hub_challenge)
    raise HTTPException(403, "Verification failed")


async def webhook_receive(request: Request):
    """Receive real-time Facebook webhook events and process immediately.

    Handles BOTH (world-class launch plan v3 §4.3):
      - entry[].changes[]  → feed comments (auto-reply engine)
      - entry[].messaging[] → Messenger messages (persist + auto-reply)
    """
    body = await request.body()

    # Validate signature if app secret configured (env or SystemConfig)
    app_secret = await _get_webhook_app_secret()
    if not app_secret:
        log.warning("FACEBOOK_APP_SECRET not set (env nor SystemConfig) — rejecting unverified webhook")
        raise HTTPException(401, "Invalid signature")
    sig = request.headers.get("x-hub-signature-256", "")
    expected = "sha256=" + hmac.new(
        app_secret.encode(), body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(401, "Invalid signature")

    # v24-C4 (M9): the body was parsed with a bare json.loads AFTER the
    # signature check — a malformed (or non-object) payload from a
    # secret-holder raised JSONDecodeError/AttributeError → raw 500 →
    # Facebook retries the same poison payload forever (retry storm).
    # A 400 tells the platform the event is unrecoverable; the signature
    # check above stays FIRST (verified order unchanged — only
    # secret-holders can ever reach this branch).
    try:
        data = json.loads(body)
    except ValueError:
        log.warning("webhook body is not valid JSON (%d bytes) — rejected 400", len(body))
        raise HTTPException(400, "Invalid JSON payload") from None
    if not isinstance(data, dict):
        log.warning("webhook body is not a JSON object — rejected 400")
        raise HTTPException(400, "Invalid JSON payload")
    log.debug(f"Webhook received: {json.dumps(data, ensure_ascii=False)[:500]}")
    if data.get("object") and data.get("object") != "page":
        return {"ok": True}

    for entry in data.get("entry", []):
        entry_page_id = str(entry.get("id") or "")

        # ── Messenger events (messages / echoes / postbacks) ──
        for messaging in entry.get("messaging", []) or []:
            if not isinstance(messaging, dict):
                continue
            try:
                await _process_webhook_messaging(entry_page_id, messaging)
            except Exception as e:
                log.exception(f"Messaging event error: {e}")

        # ── Feed changes (posts + comments) ──
        # v19 Step 2: feed post events (item == "post") were silently DROPPED
        # here — posts had no persistence layer at all (the DB-first gap this
        # round closes). Post add/edited/remove now upserts the fb_posts table
        # so /api/posts serves webhook-fresh rows even when live Graph fails.
        for change in entry.get("changes", []):
            value = change.get("value", {})
            if change.get("field") != "feed":
                continue
            if value.get("item") == "post":
                try:
                    await _process_webhook_post(value, entry_page_id)
                except Exception as e:
                    log.exception(f"Webhook post event error: {e}")
                continue
            if value.get("item") != "comment":
                continue
            verb = value.get("verb", "")
            # Only process new comments (not edits or deletes)
            if verb not in ("add", ""):
                continue

            # Extract comment from webhook payload directly
            comment_payload = {
                "id": value.get("comment_id", ""),
                "message": value.get("message", ""),
                "from": value.get("from", {}),
                "created_time": value.get("created_time", ""),
            }
            post_id = value.get("post_id", "")

            if not comment_payload["id"]:
                continue

            # Process this single comment immediately (inline, not fire-and-forget — Vercel kills background tasks)
            # v4 §4.9 (G2) — pass entry_page_id: the old call relied on
            # comment["page_id"] (never set) or the COMMENTER's user id, so
            # the tenant lookup always failed and the comment pipeline fell
            # to a tokenless singleton → no auto-reply, ever, in multi-tenant.
            await _process_webhook_comment(comment_payload, post_id, entry_page_id)

    return {"ok": True}


async def _process_webhook_messaging(page_id: str, messaging: dict):
    """Dispatch one Messenger event to its tenant (plan v3 §4.3).

    Tenant resolution: page_id → BotState.fb_page_id (exact match on value).
    """
    try:
        if not page_id:
            return
        async with AsyncSessionLocal() as db:
            row = await db.execute(
                select(BotState).where(BotState.key == "fb_page_id", BotState.value == page_id)
            )
            bs = row.scalar_one_or_none()
        if not bs:
            log.warning(f"messaging event for unknown page {page_id} — skipped")
            return
        from messenger_service import handle_messaging_event
        fb_client = await get_tenant_fb_client(bs.tenant_id)
        await handle_messaging_event(bs.tenant_id, page_id, messaging, fb_client)
        _track_event("webhook_message_processed", {"page_id": page_id}, tenant_id=bs.tenant_id)
    except Exception as e:
        log.exception(f"Webhook messaging processing error: {e}")


async def _process_webhook_comment(comment: dict, post_id: str, entry_page_id: str = ""):
    """Process a single webhook comment — dispatches by page_id for multi-tenant."""
    try:
        # v4 §4.9 (G2) — resolve the tenant from the PAGE that emitted the
        # event (same logic as _process_webhook_messaging), never from the
        # comment author.
        page_id = entry_page_id or comment.get("page_id", "")
        if page_id:
            async with AsyncSessionLocal() as db:
                row = await db.execute(
                    select(BotState).where(
                        BotState.tenant_id.isnot(None),
                        BotState.key == "fb_page_id",
                        BotState.value == page_id,
                    )
                )
                bs = row.scalar_one_or_none()
            if bs:
                fb_client = await get_tenant_fb_client(bs.tenant_id)
                # v4 §4.10 — persist the comment regardless of engine health so
                # /api/comments (DB-first) shows it immediately
                try:
                    from database import AsyncSessionLocal as _ASL
                    from models import Comment as CommentRow
                    async with _ASL() as cdb:
                        cid = comment.get("id", "")
                        if cid:
                            existing = (await cdb.execute(
                                select(CommentRow).where(
                                    CommentRow.tenant_id == bs.tenant_id,
                                    CommentRow.fb_comment_id == cid,
                                )
                            )).scalar_one_or_none()
                            if existing is None:
                                from _utils import utcnow as _now
                                cdb.add(CommentRow(
                                    tenant_id=bs.tenant_id,
                                    fb_comment_id=cid,
                                    fb_post_id=str(post_id or ""),
                                    commenter_id=str((comment.get("from") or {}).get("id", "")),
                                    commenter_name=str((comment.get("from") or {}).get("name", "")),
                                    comment_text=str(comment.get("message", "")),
                                    created_at=_now(),
                                ))
                                await cdb.commit()
                except Exception as ce:
                    log.warning(f"webhook comment persist failed: {ce}")
                if fb_client:
                    # Use registry — ensures dedup cache and cooldown are shared with background bot loop
                    engine = get_bot_engine(fb_client, tenant_id=bs.tenant_id)
                    await engine.process_single_comment(comment, post_id)
                    # v22 (FIX-D): the tenant belongs on the COLUMN (per-tenant
                    # queries filter AnalyticsEvent.tenant_id), not inside
                    # metadata_json — W1-D9 F3: 2 prod rows landed t0 this way.
                    _track_event("webhook_comment_processed",
                                 {"comment_id": comment.get("id", "")},
                                 tenant_id=bs.tenant_id)
                    return
                log.warning(f"webhook comment for page {page_id}: tenant {bs.tenant_id} has no FB client — stored only")
                return
        log.warning(f"webhook comment for page {page_id or '(none)'} — skipped")
    except Exception as e:
        log.exception(f"Webhook comment processing error: {e}")


async def _process_webhook_post(value: dict, entry_page_id: str):
    """v19 Step 2 — persist one feed POST webhook event to fb_posts.

    Tenant resolution mirrors _process_webhook_comment (the PAGE that
    emitted the event → BotState.fb_page_id → tenant). Verbs:
      * add / edited → upsert message + FB-side created_time
      * remove       → delete the stored row
    Non-fatal by contract: a persist failure logs and moves on (the endpoint
    sync will re-fetch the post anyway).
    """
    try:
        post_id = str(value.get("post_id") or "")
        if not post_id or not entry_page_id:
            return
        async with AsyncSessionLocal() as db:
            row = await db.execute(
                select(BotState).where(
                    BotState.tenant_id.isnot(None),
                    BotState.key == "fb_page_id",
                    BotState.value == entry_page_id,
                )
            )
            bs = row.scalar_one_or_none()
        if not bs:
            log.warning(f"webhook post for unknown page {entry_page_id} — skipped")
            return
        verb = str(value.get("verb") or "add")
        from _utils import utcnow as _now
        from database import AsyncSessionLocal as _ASL
        from models import Post as PostRow
        from routers.facebook_routes import _parse_fb_time as _fb_time
        async with _ASL() as pdb:
            existing = (await pdb.execute(
                select(PostRow).where(
                    PostRow.tenant_id == bs.tenant_id,
                    PostRow.fb_post_id == post_id,
                )
            )).scalar_one_or_none()
            if verb == "remove":
                if existing is not None:
                    await pdb.delete(existing)
                    await pdb.commit()
                _track_event("webhook_post_removed", {"post_id": post_id}, tenant_id=bs.tenant_id)
                return
            created = _fb_time(value.get("created_time"))
            if existing is None:
                pdb.add(PostRow(
                    tenant_id=bs.tenant_id,
                    fb_post_id=post_id,
                    message=str(value.get("message", "") or ""),
                    created_time=created,
                    created_at=_now(),
                ))
            else:
                existing.message = str(value.get("message", "") or existing.message or "")
                if created is not None:
                    existing.created_time = created
            await pdb.commit()
        _track_event("webhook_post_processed", {"post_id": post_id}, tenant_id=bs.tenant_id)
    except Exception as e:
        log.exception(f"Webhook post processing error: {e}")
