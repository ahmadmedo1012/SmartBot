from __future__ import annotations
"""Diagnostics & debug routes: status, cycle-stats, errors, logs, events, permissions, demo-test, fb-reply."""
import json
import logging

from fastapi import APIRouter, Depends, Query, HTTPException, Form
from sqlalchemy import select, func, desc

from config import settings
from database import get_db
from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["diagnostics"])


@router.get("/api/debug")
async def debug(_=Depends(get_current_user)):
    return {
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


@router.post("/api/debug/fb-reply")
async def debug_fb_reply(
    conversation_id: str = Form(...), message: str = Form("اهلا"),
    _=Depends(require_role("admin")),
):
    """Debug endpoint that shows raw Facebook API response."""
    import httpx
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

        r1 = await client.post(f"https://graph.facebook.com/v22.0/{conversation_id}/messages", data={"access_token": tok, "message": message})
        m1 = {"status": r1.status_code, "body": r1.text[:500]}

        r2 = await client.post(f"https://graph.facebook.com/v22.0/{page_id}/messages", data={
            "access_token": tok,
            "recipient": json.dumps({"id": user_id or conversation_id.replace("t_", "")}),
            "message": json.dumps({"text": message}),
            "messaging_type": "RESPONSE",
        })
        m2 = {"status": r2.status_code, "body": r2.text[:500]}

        r3 = await client.post(f"https://graph.facebook.com/v22.0/{page_id}/messages", data={
            "access_token": tok,
            "recipient": json.dumps({"id": user_id or conversation_id.replace("t_", "")}),
            "message": json.dumps({"text": message}),
            "messaging_type": "UPDATE",
        })
        m3 = {"status": r3.status_code, "body": r3.text[:500]}

        r4 = None
        msg_senders = (conv_data.get("messages", {}) or {}).get("data", [])
        if msg_senders:
            from_id = str((msg_senders[0].get("from", {}) or {}).get("id", ""))
            if from_id and from_id != str(page_id):
                r4 = await client.post(f"https://graph.facebook.com/v22.0/{page_id}/messages", data={
                    "access_token": tok,
                    "recipient": json.dumps({"id": from_id}),
                    "message": json.dumps({"text": message}),
                    "messaging_type": "RESPONSE",
                })
                r4 = {"status": r4.status_code, "body": r4.text[:500]}
        else:
            r4 = {"status": "skip", "body": "no messages found"}

        r5 = await client.get(f"https://graph.facebook.com/v22.0/{page_id}", params={
            "access_token": tok,
            "fields": "access_token,id,name",
        })

        return {
            "found_user_id": user_id,
            "conv_data": {"status": conv.status_code, "data": conv_data},
            "methods": {
                "1_direct_conv": m1,
                "2_response_with_uid": m2,
                "3_update": m3,
                "4_msg_sender_id": r4,
            },
            "page_id": page_id,
            "page_info": {"status": r5.status_code, "body": r5.text[:500]},
        }


@router.get("/api/diagnostics/status")
async def diagnostic_status(_=Depends(get_current_user)):
    from diagnostics import get_diagnostics
    from monitor import get_logger
    d = get_diagnostics()
    l = get_logger()
    return {"system": d.get_system_info(), "cycles": d.get_cycle_stats(),
            "errors": {"recent": d.get_recent_errors(10), "rate_pct": d.get_error_rate()},
            "logs": l.get_stats()}


@router.get("/api/diagnostics/cycle-stats")
async def diagnostic_cycles(_=Depends(get_current_user)):
    from diagnostics import get_diagnostics
    return get_diagnostics().get_cycle_stats()


@router.get("/api/diagnostics/recent-errors")
async def diagnostic_errors(limit: int = Query(20), _=Depends(get_current_user)):
    from diagnostics import get_diagnostics
    return {"errors": get_diagnostics().get_recent_errors(limit)}


@router.get("/api/diagnostics/logs")
async def diagnostic_logs(level: str = Query(""), module: str = Query(""),
                          since: str = Query(""), limit: int = Query(50),
                          _=Depends(get_current_user)):
    from monitor import get_logger
    return {"logs": get_logger().get_buffer(level or None, module=module or None,
                                            since=since or None, limit=limit)}


@router.get("/api/diagnostics/stats")
async def diagnostic_stats(_=Depends(get_current_user)):
    from monitor import get_logger
    return get_logger().get_stats()


@router.get("/api/diagnostics/events")
async def diagnostic_events(limit: int = Query(100), _=Depends(get_current_user)):
    from monitor import get_logger
    return {"events": get_logger().get_buffer(limit=limit)}


@router.get("/api/diagnostics/permissions")
async def diagnostic_permissions(_=Depends(get_current_user)):
    from fb_client import FBClient
    from config import settings
    if not settings.FACEBOOK_ACCESS_TOKEN:
        return {"has_token": False}
    fb = FBClient(settings.FACEBOOK_ACCESS_TOKEN, settings.FACEBOOK_PAGE_ID)
    debug = await fb._get("debug_token", {"input_token": settings.FACEBOOK_ACCESS_TOKEN})
    perms = []
    if debug and "data" in debug:
        perms = (debug["data"].get("scopes", []) or debug["data"].get("granular_scopes", []))
    return {"has_token": True, "permissions": perms}


@router.post("/api/diagnostics/demo-test-comment")
async def diagnostic_demo_comment(comment_text: str = Form(...), _=Depends(require_role("admin"))):
    from enhanced_intent import EnhancedIntentClassifier
    from bot import TextNormalizer
    classification = EnhancedIntentClassifier.classify(comment_text)
    normalized = TextNormalizer.normalize_for_matching(comment_text)
    return {"original": comment_text, "normalized": normalized, "classification": classification}
