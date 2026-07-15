"""Facebook Webhook endpoints: events list + status check."""
from __future__ import annotations
import hashlib
import hmac
import json
import logging
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import select

from config import settings
from database import get_db
from models import BotLog
from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-webhook")

router = APIRouter(tags=["webhooks"])

VERIFY_TOKEN = os.getenv("FB_WEBHOOK_VERIFY_TOKEN", "smartbot_verify_123")
APP_SECRET = os.getenv("FACEBOOK_APP_SECRET", "")


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
