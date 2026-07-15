"""Facebook Webhook endpoints: verification + event ingestion."""
from __future__ import annotations
import hashlib
import hmac
import json
import logging
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import select

from config import settings
from database import get_db, AsyncSessionLocal
from models import BotLog
from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-webhook")

router = APIRouter(tags=["webhooks"])

# Facebook webhook credentials (loaded from env)
VERIFY_TOKEN = os.getenv("FB_WEBHOOK_VERIFY_TOKEN", "smartbot_verify_123")
APP_SECRET = os.getenv("FACEBOOK_APP_SECRET", "")


def verify_signature(payload: bytes, signature_header: str) -> bool:
    """HMAC-SHA256 verification of webhook payload."""
    if not APP_SECRET or not signature_header:
        return True  # ponytail: skip verify when no secret configured
    expected = "sha256=" + hmac.new(
        APP_SECRET.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


@router.get("/webhook")
async def webhook_verify(
    hub_mode: str = "",
    hub_verify_token: str = "",
    hub_challenge: str = "",
):
    """Facebook webhook verification (GET)."""
    if hub_mode == "subscribe" and hub_verify_token == VERIFY_TOKEN:
        return PlainTextResponse(hub_challenge)
    log.warning(f"Webhook verify failed: mode={hub_mode} token_match={hub_verify_token == VERIFY_TOKEN}")
    raise HTTPException(403, "Verification failed")


@router.post("/webhook")
async def webhook_receive(request: Request):
    """Receive Facebook webhook events (POST)."""
    body = await request.body()
    sig = request.headers.get("x-hub-signature-256", "")
    if not verify_signature(body, sig):
        log.error("Webhook HMAC verification failed")
        raise HTTPException(403, "Invalid signature")

    data = json.loads(body)
    entry = (data or {}).get("entry", [])
    if not entry:
        return {"ok": True}

    # Enqueue bot cycle for each entry's page (triggers per-tenant processing)
    triggered = 0
    async with AsyncSessionLocal() as db:
        for e in entry:
            page_id = e.get("id", "")
            changes = e.get("changes", [])
            for change in changes:
                field = change.get("field", "")
                value = change.get("value", {})
                if field in ("feed", "messages"):
                    comment_id = value.get("comment_id", "")
                    item = value.get("item", "")
                    verb = value.get("verb", "")
                    # Log the webhook event
                    db.add(BotLog(
                        level="INFO",
                        message=f"webhook: {field}/{item}/{verb} comment={comment_id} page={page_id}",
                    ))
                    triggered += 1
        await db.commit()

    # Trigger bot cycle as background task (processes new comments)
    if triggered:
        from runner import _run_single_cycle  # lazy import to avoid circular
        import asyncio
        asyncio.create_task(_run_single_cycle())

    return {"ok": True, "events_logged": triggered}


@router.get("/api/webhook/events")
async def get_webhook_events(
    limit: int = 20,
    db=Depends(get_db),
    current_user: Any = Depends(get_current_user),
):
    """Return recent webhook events."""
    rows = await db.execute(
        select(BotLog).where(
            BotLog.tenant_id == current_user._tenant_id,
            BotLog.message.contains("webhook"),
        ).order_by(BotLog.id.desc()).limit(limit)
    )
    return [{
        "id": r.id, "level": r.level, "message": r.message,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows.scalars().all()]


@router.get("/api/webhook/check")
async def check_webhook(_=Depends(get_current_user)):
    """Check if webhook is properly configured."""
    webhook_url = os.getenv("RENDER_EXTERNAL_URL") or os.getenv("VERCEL_URL") or ""
    if webhook_url and not webhook_url.startswith("http"):
        webhook_url = "https://" + webhook_url
    webhook_url += "/webhook"
    if not webhook_url.startswith("http"):
        webhook_url = "https://smartbot-6lxo.onrender.com/webhook"
    return {
        "configured": bool(APP_SECRET),
        "verify_token": "***" if VERIFY_TOKEN else "",
        "webhook_url": webhook_url,
        "instructions": [
            "1. Go to https://developers.facebook.com/apps",
            "2. Select your app -> Webhooks -> Page",
            "3. Set Callback URL to: " + webhook_url,
            "4. Set Verify Token in your Facebook app settings",
            "5. Subscribe to 'feed' and 'messages' fields",
            "6. After setup, post a test comment or use POST /api/webhook/test",
        ],
    }
