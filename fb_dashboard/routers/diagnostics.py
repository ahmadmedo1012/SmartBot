# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
from __future__ import annotations

"""Diagnostics & debug routes: status, cycle-stats, errors, logs, events, permissions, demo-test, fb-reply."""
import json
import logging

from _responses import ok
from config import settings
from fastapi import APIRouter, Depends, Form, HTTPException, Query

from routers.auth import get_current_user, require_platform_admin, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["diagnostics"])


@router.get("/api/debug")
async def debug(_=Depends(get_current_user)):
    return ok(
        {
        "has_secret_key": bool(settings.SECRET_KEY),
        "has_db_url": bool(settings.DATABASE_URL),
        "has_fb_token": bool(settings.FACEBOOK_ACCESS_TOKEN),
        "has_fb_page": bool(settings.FACEBOOK_PAGE_ID),
        "debug_mode": settings.DEBUG,
        "bot_interval": settings.BOT_INTERVAL_SECONDS,
        "start_bot": settings.START_BOT,
        "db_type": "sqlite" if not settings.DATABASE_URL else "postgres",
        "python_version": __import__("sys").version,
    }
    )


@router.post("/api/debug/fb-reply")
async def debug_fb_reply(
    conversation_id: str = Form(...), message: str = Form("اهلا"),
    _=Depends(require_platform_admin),
):
    """Debug endpoint for the FB reply pipeline — PLATFORM ADMIN ONLY.

    v9-A2 (P1 fix): previously ANY self-registered tenant admin could call
    this with an arbitrary conversation_id, and the response echoed the raw
    Graph bodies — including a FRESH page access_token from the
    /{page_id}?fields=access_token probe. Now:
      1. require_platform_admin — tenant admins get 403.
      2. conversation_id is strictly ^\\d+$ (was interpolated into the Graph
         URL path unchecked — path-injection surface).
      3. the client gets a SANITIZED summary (per-method status + error
         class) only — raw Graph payloads are logged server-side instead
         of being returned.
    """
    import re

    if not re.fullmatch(r"\d+", conversation_id or ""):
        raise HTTPException(400, "معرف المحادثة يجب أن يكون أرقاماً فقط")
    message = (message or "")[:500]

    import httpx

    def _classify(status_code: int) -> str:
        if status_code == 200:
            return "ok"
        if status_code in (400, 403):
            return "permission_or_params_error"
        if status_code == 404:
            return "not_found"
        return "api_error"

    async with httpx.AsyncClient(timeout=15) as client:
        page_id = settings.FACEBOOK_PAGE_ID
        tok = settings.FACEBOOK_ACCESS_TOKEN

        conv = await client.get(
            f"https://graph.facebook.com/v22.0/{conversation_id}",
            params={"access_token": tok, "fields": "senders{id,name},messages.limit(1){from{id,name}}"},
        )
        conv_data = conv.json() if conv.status_code == 200 else {}
        senders = (conv_data.get("senders", {}) or {}).get("data", [])
        user_id = None
        for s in senders:
            sid = str(s.get("id", ""))
            if sid != str(page_id):
                user_id = sid
                break

        methods: dict[str, dict] = {}

        async def _probe(key: str, coro):
            r = await coro
            entry = {"status": r.status_code, "result": _classify(r.status_code)}
            log.info("debug/fb-reply %s -> %s %s", key, r.status_code, r.text[:300])
            methods[key] = entry
            return r

        await _probe(
            "1_direct_conv",
            client.post(f"https://graph.facebook.com/v22.0/{conversation_id}/messages",
                        data={"access_token": tok, "message": message}),
        )
        await _probe(
            "2_response_with_uid",
            client.post(f"https://graph.facebook.com/v22.0/{page_id}/messages", data={
                "access_token": tok,
                "recipient": json.dumps({"id": user_id or conversation_id}),
                "message": json.dumps({"text": message}),
                "messaging_type": "RESPONSE",
            }),
        )
        await _probe(
            "3_update",
            client.post(f"https://graph.facebook.com/v22.0/{page_id}/messages", data={
                "access_token": tok,
                "recipient": json.dumps({"id": user_id or conversation_id}),
                "message": json.dumps({"text": message}),
                "messaging_type": "UPDATE",
            }),
        )

        msg_senders = (conv_data.get("messages", {}) or {}).get("data", [])
        if msg_senders:
            from_id = str((msg_senders[0].get("from", {}) or {}).get("id", ""))
            if from_id and from_id != str(page_id):
                await _probe(
                    "4_msg_sender_id",
                    client.post(f"https://graph.facebook.com/v22.0/{page_id}/messages", data={
                        "access_token": tok,
                        "recipient": json.dumps({"id": from_id}),
                        "message": json.dumps({"text": message}),
                        "messaging_type": "RESPONSE",
                    }),
                )
            else:
                methods["4_msg_sender_id"] = {"status": "skip", "result": "sender_is_page"}
        else:
            methods["4_msg_sender_id"] = {"status": "skip", "result": "no_messages"}

        r5 = await client.get(f"https://graph.facebook.com/v22.0/{page_id}", params={
            "access_token": tok,
            "fields": "access_token,id,name",
        })
        # SANITIZED: never return r5 raw body — it contains the page
        # access_token itself. Status + classification only.
        log.info("debug/fb-reply page probe -> %s", r5.status_code)

        return ok(
            {
            "conversation_lookup": {"status": conv.status_code, "result": _classify(conv.status_code),
                                    "found_user_id": bool(user_id)},
            "methods": methods,
            "page_id": page_id,
            "page_token_ok": r5.status_code == 200,
        }
        )


# v9-A6: the diagnostics system endpoints below read GLOBAL state (the
# StructuredLogger ring buffer / DiagnosticsEngine aggregates) whose entries
# carry no tenant marker — messages can embed other tenants' comment texts
# and usernames. They are therefore restricted to the platform admin.


@router.get("/api/diagnostics/status")
async def diagnostic_status(_=Depends(require_platform_admin)):
    from diagnostics import get_diagnostics
    from monitor import get_logger
    d = get_diagnostics()
    logger = get_logger()
    return ok(
        {"system": d.get_system_info(), "cycles": d.get_cycle_stats(),
            "errors": {"recent": d.get_recent_errors(10), "rate_pct": d.get_error_rate()},
            "logs": logger.get_stats()}
    )


@router.get("/api/diagnostics/cycle-stats")
async def diagnostic_cycles(_=Depends(require_platform_admin)):
    from diagnostics import get_diagnostics
    return ok(get_diagnostics().get_cycle_stats())


@router.get("/api/diagnostics/recent-errors")
async def diagnostic_errors(limit: int = Query(20), _=Depends(require_platform_admin)):
    from diagnostics import get_diagnostics
    return ok({"errors": get_diagnostics().get_recent_errors(limit)})


@router.get("/api/diagnostics/logs")
async def diagnostic_logs(level: str = Query(""), module: str = Query(""),
                          since: str = Query(""), limit: int = Query(50, ge=1, le=500),
                          _=Depends(require_platform_admin)):
    from monitor import get_logger
    return ok(
        {"logs": get_logger().get_buffer(level or None, module=module or None,
                                            since=since or None, limit=limit)}
    )


@router.get("/api/diagnostics/stats")
async def diagnostic_stats(_=Depends(require_platform_admin)):
    from monitor import get_logger
    return ok(get_logger().get_stats())


@router.get("/api/diagnostics/events")
async def diagnostic_events(limit: int = Query(100, ge=1, le=500), _=Depends(require_platform_admin)):
    from monitor import get_logger
    return ok({"events": get_logger().get_buffer(limit=limit)})


@router.get("/api/diagnostics/permissions")
async def diagnostic_permissions(_=Depends(require_platform_admin)):
    """v9-A6: platform-admin only — probes the GLOBAL page token's scopes."""
    from config import settings
    from fb_client import FBClient
    if not settings.FACEBOOK_ACCESS_TOKEN:
        return ok({"has_token": False})
    fb = FBClient(settings.FACEBOOK_ACCESS_TOKEN, settings.FACEBOOK_PAGE_ID)
    debug = await fb._get("debug_token", {"input_token": settings.FACEBOOK_ACCESS_TOKEN})
    perms = []
    if debug and "data" in debug:
        perms = (debug["data"].get("scopes", []) or debug["data"].get("granular_scopes", []))
    return ok({"has_token": True, "permissions": perms})


@router.post("/api/diagnostics/demo-test-comment")
async def diagnostic_demo_comment(comment_text: str = Form(...), _=Depends(require_role("admin"))):
    from bot import TextNormalizer
    from enhanced_intent import EnhancedIntentClassifier
    classification = EnhancedIntentClassifier.classify(comment_text)
    normalized = TextNormalizer.normalize_for_matching(comment_text)
    return ok({"original": comment_text, "normalized": normalized, "classification": classification})
