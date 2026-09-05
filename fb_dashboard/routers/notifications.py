"""Notification routes — in-app feed + per-user preferences (plan §4.2).

Frontend contract (dashboard/notifications/page.tsx):
  GET  /api/notifications/settings  → {data: {preferences: {...}}}
  PUT  /api/notifications/settings  ← {preferences: {...}}
Feed (plan §4.2):
  GET  /api/notifications           → tenant-scoped list + unread count
  POST /api/notifications/{id}/read
  POST /api/notifications/read-all
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc, update

from database import get_db
from models import User, NotificationPreference, Notification
from routers.auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


async def push_notification(db, tenant_id: int, title: str, body: str = "",
                            type_: str = "system", link: str = "", user_id: int | None = None) -> Notification:
    """Create a notification row (tenant-scoped). Caller commits.

    Used by payment approval/rejection, support replies, campaign sends.
    Live delivery to connected dashboards happens via ws_manager.broadcast_to_tenant.
    """
    n = Notification(tenant_id=tenant_id, user_id=user_id, type=type_,
                     title=title, body=body, link=link)
    db.add(n)
    return n


# ── Feed ─────────────────────────────────────────────────────────────────────

@router.get("")
@router.get("/")
async def list_notifications(
    limit: int = Query(50, ge=1, le=200),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tenant-scoped notification feed + unread count (plan §4.2)."""
    _tid = current_user._tenant_id
    rows = await db.execute(
        select(Notification)
        .where(Notification.tenant_id == _tid)
        .order_by(desc(Notification.created_at))
        .limit(limit)
    )
    unread = await db.scalar(
        select(func.count(Notification.id)).where(
            Notification.tenant_id == _tid, Notification.read == False
        )
    ) or 0
    return {"success": True, "data": [
        {
            "id": n.id, "type": n.type, "title": n.title, "body": n.body,
            "link": n.link, "read": n.read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        } for n in rows.scalars().all()
    ], "unread": unread}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: int,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    n = await db.get(Notification, notification_id)
    if not n or n.tenant_id != current_user._tenant_id:
        raise HTTPException(404, "الإشعار غير موجود")
    n.read = True
    await db.commit()
    return {"success": True}


@router.post("/read-all")
async def mark_all_read(
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        update(Notification)
        .where(Notification.tenant_id == current_user._tenant_id, Notification.read == False)
        .values(read=True)
    )
    await db.commit()
    return {"success": True}


# ── Preferences (settings — matches frontend contract) ──────────────────────

def _default_prefs() -> dict:
    return {
        "new_comments": True,
        "new_messages": True,
        "new_leads": True,
        "payment_alerts": True,
        "system_updates": True,
        "marketing_reports": True,
        # legacy keys kept for backward compat
        "payment_approved": True,
        "payment_rejected": True,
        "trial_expiry_warning": True,
        "trial_expired": True,
        "system_alert": True,
    }


async def _get_pref_row(db, user_id: int) -> NotificationPreference | None:
    row = await db.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == user_id)
    )
    return row.scalar_one_or_none()


@router.get("/settings")
@router.get("/preferences")
async def get_preferences(
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get notification preferences (defaults merged with stored overrides)."""
    pref = await _get_pref_row(db, current_user.id)
    defaults = _default_prefs()
    if pref and pref.preferences:
        defaults.update(pref.preferences)
    return {"success": True, "data": {"preferences": defaults}}


@router.put("/settings")
@router.put("/preferences")
async def update_preferences(
    payload: dict,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-update notification preferences (merged with existing)."""
    incoming = payload.get("preferences", payload)
    if not isinstance(incoming, dict) or not incoming:
        raise HTTPException(400, "preferences مطلوبة")
    clean = {k: bool(v) for k, v in incoming.items() if isinstance(k, str)}
    pref = await _get_pref_row(db, current_user.id)
    if pref is None:
        pref = NotificationPreference(
            user_id=current_user.id,
            tenant_id=current_user._tenant_id,
            preferences=clean,
        )
        db.add(pref)
    else:
        existing = dict(pref.preferences or {})
        existing.update(clean)
        pref.preferences = existing
    await db.commit()
    return {"success": True, "data": {"preferences": clean}}
