from fastapi import APIRouter, Depends, HTTPException, Form, Query, Body
from sqlalchemy import select, desc, or_
from datetime import datetime
from database import get_db
from models import Offer, BrandConfig, Customer, BotAlert, User, NotificationPreference
from routers.auth import get_current_user, require_role
from ws_manager import ws_manager
from _utils import utcnow
import asyncio

router = APIRouter(prefix="", tags=["alerts"])


@router.get("/api/alerts")
async def list_alerts(resolved: bool = Query(False), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    # ponytail: BotAlert at module level
    stmt = select(BotAlert).where(BotAlert.tenant_id == current_user._tenant_id, BotAlert.resolved == resolved).order_by(desc(BotAlert.created_at)).limit(20)
    rows = await db.execute(stmt)
    return [{
        "id": a.id, "type": a.alert_type, "severity": a.severity,
        "message": a.message, "resolved": a.resolved,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    } for a in rows.scalars().all()]


@router.post("/api/alerts")
async def create_alert(
    alert_type: str = Form(...), severity: str = Form("info"),
    message: str = Form(...), db=Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    # ponytail: BotAlert at module level
    alert = BotAlert(alert_type=alert_type, severity=severity, message=message, tenant_id=current_user._tenant_id)
    db.add(alert)
    await db.commit()
    # Broadcast via WebSocket (tenant-scoped)
    try:
        asyncio.create_task(ws_manager.broadcast_to_tenant(current_user._tenant_id, "alert", {
            "type": alert_type, "severity": severity, "message": message,
        }))
    except Exception:
        pass
    return {"id": alert.id}


@router.post("/api/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    # ponytail: BotAlert at module level
    a = (await db.execute(
        select(BotAlert).where(BotAlert.id == alert_id, BotAlert.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not a:
        raise HTTPException(404, "التنبيه غير موجود")
    a.resolved = True
    a.resolved_at = utcnow()
    await db.commit()
    return {"ok": True}


@router.post("/api/notifications/broadcast")
async def broadcast_notification(
    notif_type: str = Form("info"), title: str = Form(...),
    message: str = Form(""), link: str = Form(""),
    current_user: User = Depends(require_role("admin")),
):
    """Broadcast a notification to all connected dashboard clients (tenant-scoped)."""
    asyncio.create_task(ws_manager.broadcast_to_tenant(current_user._tenant_id, "notification", {
        "type": notif_type, "title": title, "message": message, "link": link or None,
    }))
    return {"ok": True}


# ── Notification preferences ────────────────────────────────────────────────

# Default notification preferences — keys map to UI toggles
DEFAULT_NOTIF_PREFS = {
    "new_comments": True,
    "new_messages": True,
    "new_leads": True,
    "payment_alerts": True,
    "system_updates": True,
    "marketing_reports": False,
}


@router.get("/api/notifications/settings")
async def get_notification_preferences(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Fetch the user's notification preferences, falling back to defaults."""
    row = await db.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == current_user.id)
    )
    pref = row.scalar_one_or_none()
    if not pref:
        return {"success": True, "data": {"preferences": dict(DEFAULT_NOTIF_PREFS)}}
    # Merge saved prefs with defaults so new keys get default values
    return {
        "success": True,
        "data": {
            "preferences": {**DEFAULT_NOTIF_PREFS, **(pref.preferences or {})}
        },
    }


@router.put("/api/notifications/settings")
async def update_notification_preferences(
    body: dict = Body(...),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save notification preferences (partial update accepted)."""
    prefs_in = body.get("preferences", {})
    if not isinstance(prefs_in, dict):
        raise HTTPException(400, "preferences must be an object")
    # Sanitise: only allow known keys
    clean: dict = {}
    for key in DEFAULT_NOTIF_PREFS:
        clean[key] = bool(prefs_in.get(key, DEFAULT_NOTIF_PREFS[key]))

    row = await db.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == current_user.id)
    )
    pref = row.scalar_one_or_none()
    if pref:
        pref.preferences = clean
    else:
        pref = NotificationPreference(
            user_id=current_user.id,
            tenant_id=current_user._tenant_id,
            preferences=clean,
        )
        db.add(pref)
    await db.commit()
    return {"success": True, "data": {"preferences": clean}}
