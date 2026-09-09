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

import logging

from _responses import ok
from _utils import iso_z
from database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query
from models import Notification, NotificationPreference, User
from sqlalchemy import desc, func, select, update

from routers.alerts_routes import DEFAULT_NOTIF_PREFS
from routers.auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
log = logging.getLogger("fb-api")


# ── v17-E-B3 (D5-F3): the preference consumer ───────────────────────────────
# push_notification is the ONLY writer of the persistent feed (rg "Notification("
# across fb_dashboard/ → this file alone), so the gate here IS the single
# delivery point. Mapping — notification type → the settings-page toggle
# (alerts_routes.DEFAULT_NOTIF_PREFS keys) that claims to control it:
#   payment   ↔ payment_alerts     «تنبيهات الدفع — عند تأكيد أو رفض طلب دفع»
#   marketing ↔ marketing_reports  «تقارير التسويق»
#   system    ↔ system_updates     «تحديثات النظام»
# Types with NO controlling toggle on the settings page (support / reply /
# mention) are delivered ungated — no switch promises to filter them.
_PREF_KEY_BY_TYPE = {
    "payment": "payment_alerts",
    "marketing": "marketing_reports",
    "system": "system_updates",
}


async def _preference_allows(db, user_id: int | None, type_: str) -> bool:
    """v17-E-B3: True unless THIS user turned this notification type off.

    Mirrors exactly what the settings page shows the user: a user with no
    saved row gets the DEFAULT_NOTIF_PREFS defaults (alerts_routes is the
    single source for both the key schema and the defaults).
    """
    key = _PREF_KEY_BY_TYPE.get(type_)
    if key is None or user_id is None:
        return True
    default = bool(DEFAULT_NOTIF_PREFS.get(key, True))
    row = await db.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == user_id)
    )
    pref = row.scalar_one_or_none()
    if pref is None:
        return default
    return bool((pref.preferences or {}).get(key, default))


async def push_notification(db, tenant_id: int, title: str, body: str = "",
                            type_: str = "system", link: str = "", user_id: int | None = None) -> Notification | None:
    """Create a notification row (tenant-scoped). Caller commits.

    Used by payment approval/rejection, support replies, campaign sends.
    Live delivery to connected dashboards happens via ws_manager.broadcast_to_tenant.

    v17-E-B3 (D5-F3): the recipient's saved preference gates delivery — a user
    who turned this notification type off receives NOTHING (returns None and a
    skip is logged; every existing caller already ignores the return value).
    The gate covers user-addressed notifications (user_id set — payment
    approvals/rejections, support replies). A tenant broadcast (user_id=None —
    campaign sends, expiry warnings) has no single recipient whose preference
    could honestly veto the SHARED tenant feed: per-user enforcement there
    needs row fan-out (model + read-path change) — the ceiling is documented
    with a concrete proposal in audit-reports/v17-E-B3-report.md §3.
    """
    if user_id is not None and not await _preference_allows(db, user_id, type_):
        log.info("notif skip (pref off): user=%s type=%s key=%s title=%r",
                 user_id, type_, _PREF_KEY_BY_TYPE.get(type_, "-"), (title or "")[:60])
        return None
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
    return ok({"items": items, "unread": unread})


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
    return ok()


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
    return ok()


# ── Preferences ─────────────────────────────────────────────────────────────
# NOTE (2026-09-05): GET/PUT /api/notifications/settings previously existed
# here AND in alerts_routes.py. FastAPI first-registration-wins meant the
# alerts_routes copy (registered first in runner.py) always served — this copy
# was dead code with DIVERGENT semantics (merge + legacy keys vs. strict
# 6-key sanitisation). Removed; alerts_routes.py is the single source.
