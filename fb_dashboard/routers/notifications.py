"""Notification routes — per-tenant notification preferences (JSON-stored)."""
from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy import select

from database import get_db
from models import User, NotificationPreference
from routers.auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/preferences")
async def get_preferences(
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get notification preferences for the current user."""
    row = await db.execute(
        select(NotificationPreference).where(
            NotificationPreference.user_id == current_user.id
        )
    )
    pref = row.scalar_one_or_none()

    # Defaults: all notifications ON
    defaults = {
        "new_comments": True,
        "new_messages": True,
        "payment_approved": True,
        "payment_rejected": True,
        "trial_expiry_warning": True,
        "trial_expired": True,
        "system_alert": True,
    }

    if pref and pref.preferences:
        defaults.update(pref.preferences)
    return {"success": True, "data": defaults}


@router.put("/preferences")
async def update_preferences(
    payload: dict,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-update notification preferences (merged with existing)."""
    row = await db.execute(
        select(NotificationPreference).where(
            NotificationPreference.user_id == current_user.id
        )
    )
    pref = row.scalar_one_or_none()

    if pref is None:
        pref = NotificationPreference(
            user_id=current_user.id,
            tenant_id=current_user._tenant_id,
            preferences={k: bool(v) for k, v in payload.items()},
        )
        db.add(pref)
    else:
        existing = dict(pref.preferences or {})
        existing.update({k: bool(v) for k, v in payload.items()})
        pref.preferences = existing

    await db.commit()
    return {"success": True}
