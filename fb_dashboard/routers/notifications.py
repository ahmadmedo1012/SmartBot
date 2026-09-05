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
from _utils import iso_z
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
    # v4 §2.2 — unread moved INSIDE data: unwrapApi() strips sibling keys, so the
    # frontend could never see the top-level "unread" (badge showed 0 forever)
    items = [
        {
            "id": n.id, "type": n.type, "title": n.title, "body": n.body,
            "link": n.link, "read": n.read,
            "created_at": iso_z(n.created_at),
        } for n in rows.scalars().all()
    ]
    return {"success": True, "data": {"items": items, "unread": unread}}


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


# ── Preferences ─────────────────────────────────────────────────────────────
# NOTE (2026-09-05): GET/PUT /api/notifications/settings previously existed
# here AND in alerts_routes.py. FastAPI first-registration-wins meant the
# alerts_routes copy (registered first in runner.py) always served — this copy
# was dead code with DIVERGENT semantics (merge + legacy keys vs. strict
# 6-key sanitisation). Removed; alerts_routes.py is the single source.
