"""Facebook Webhook endpoints: events list + status check."""
# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
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
from _utils import iso_z
from models import BotLog
from routers.auth import get_current_user, require_role
from _responses import ok

log = logging.getLogger("fb-webhook")

router = APIRouter(tags=["webhooks"])

# FB_WEBHOOK_VERIFY_TOKEN is required — no fallback. If not set, reject requests.
VERIFY_TOKEN = os.getenv("FB_WEBHOOK_VERIFY_TOKEN") or ""
if not VERIFY_TOKEN:
    log.warning("FB_WEBHOOK_VERIFY_TOKEN not set — webhook verification DISABLED. Set it in production.")
    _webhook_verify_enabled = False
else:
    _webhook_verify_enabled = True

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
    return ok(
        [{
        "id": r.id, "level": r.level, "message": r.message,
        "created_at": iso_z(r.created_at),
    } for r in rows.scalars().all()]
    )


@router.get("/api/webhook/check")
async def check_webhook(db=Depends(get_db), current_user: Any = Depends(get_current_user)):
    """Real webhook health: endpoint, app-secret config AND the fields the
    page is actually subscribed to via Graph API (plan v3 §4.6)."""
    webhook_url = os.getenv("RENDER_EXTERNAL_URL") or os.getenv("VERCEL_URL") or ""
    if webhook_url and not webhook_url.startswith("http"):
        webhook_url = "https://" + webhook_url
    webhook_url += "/webhook"
    if not webhook_url.startswith("http"):
        webhook_url = "https://api.smart-link.ly/webhook"

    subscribed_fields: list[str] = []
    subscribe_error = ""
    try:
        from _services import get_tenant_fb_client
        tenant_fb = await get_tenant_fb_client(current_user._tenant_id or 0)
        if tenant_fb is not None:
            r = await tenant_fb._get(f"{tenant_fb.page_id}/subscribed_apps", {"fields": "subscribed_fields"})
            data = (r or {}).get("data") or []
            for app in data:
                subscribed_fields.extend(app.get("subscribed_fields", []) or [])
    except Exception as e:
        subscribe_error = str(e)[:160]

    return ok(
        {
        "configured": bool(APP_SECRET),
        "verify_token": "***" if VERIFY_TOKEN else "",
        "webhook_url": webhook_url,
        "subscribed_fields": sorted(set(subscribed_fields)),
        "subscribed": bool(subscribed_fields),
        "subscribe_error": subscribe_error,
        "messages_field_subscribed": "messages" in subscribed_fields,
        "feed_field_subscribed": "feed" in subscribed_fields,
        "instructions": [
            "1. Go to https://developers.facebook.com/apps",
            "2. Select your app -> Webhooks -> Page",
            "3. Set Callback URL to: " + webhook_url,
            "4. Set Verify Token in your Facebook app settings",
            "5. Subscribe to 'feed' and 'messages' fields",
            "6. After setup, post a test comment or use POST /api/webhook/test",
        ],
    }
    )
