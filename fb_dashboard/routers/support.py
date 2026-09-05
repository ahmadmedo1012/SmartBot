"""Support ticket system — create, list, reply, close (plan §4.3).

Frontend contract (dashboard/support/page.tsx):
  GET  /api/support/info           → {data: {email, phone, whatsapp, working_hours}}
  POST /api/support/ticket        ← {subject, message, email} → real ticket row
Full system (plan §4.3):
  GET  /api/support/tickets                → tenant-scoped list
  GET  /api/support/tickets/{id}           → ticket + replies
  POST /api/support/tickets/{id}/reply     → owner or admin replies
  POST /api/support/tickets/{id}/close     → admin closes (owner can too)
Priorities: low | medium | high | urgent.
"""
from __future__ import annotations
import asyncio
import logging
import os

from fastapi import APIRouter, Depends, Body, HTTPException, Query
from sqlalchemy import select, func, desc

from database import get_db
from models import User, SupportTicket, SupportTicketReply
from routers.auth import get_current_user, require_role
from routers.notifications import push_notification

log = logging.getLogger("fb-api")
router = APIRouter(prefix="/api/support", tags=["support"])

_PRIORITIES = {"low", "medium", "high", "urgent"}


@router.get("/info")
async def support_info():
    """Public support contact info — env overrides, sensible Libyan defaults."""
    return {"success": True, "data": {
        "email": os.getenv("SUPPORT_EMAIL", "support@smartbot.ly"),
        "phone": os.getenv("SUPPORT_PHONE", "0920000000"),
        "whatsapp": os.getenv("SUPPORT_WHATSAPP", os.getenv("SUPPORT_PHONE", "0920000000")),
        "working_hours": os.getenv("SUPPORT_WORKING_HOURS", "24/7"),
    }}


@router.post("/ticket")
@router.post("/tickets")
async def create_ticket(
    payload: dict = Body(...),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a support ticket (plan §4.3 step 1) — notifies Telegram admins."""
    subject = (payload.get("subject") or "بدون عنوان").strip()
    body = (payload.get("message") or payload.get("body") or "").strip()
    email = (payload.get("email") or current_user.email or "").strip()
    priority = (payload.get("priority") or "medium").strip().lower()

    if len(body) < 10:
        raise HTTPException(400, "الرسالة يجب أن تكون 10 أحرف على الأقل")
    if priority not in _PRIORITIES:
        raise HTTPException(400, f"الأولوية يجب أن تكون إحدى: {', '.join(sorted(_PRIORITIES))}")

    t = SupportTicket(
        tenant_id=current_user._tenant_id,
        user_id=current_user.id,
        email=email,
        subject=subject[:200],
        body=body,
        priority=priority,
        status="open",
    )
    db.add(t)
    await db.flush()

    # Telegram notify (non-blocking, best-effort)
    try:
        from telegram_bot import notify_admins_support_ticket
        asyncio.create_task(notify_admins_support_ticket(subject[:80], body[:500], email))
    except Exception:
        pass

    await db.commit()
    await db.refresh(t)
    return {"success": True, "data": {
        "id": t.id, "status": t.status, "priority": t.priority,
        "message": "تم إرسال طلبك بنجاح — سيتواصل معك فريق الدعم خلال 24 ساعة",
    }}


@router.get("/tickets")
async def list_tickets(
    limit: int = Query(20, ge=1, le=100),
    status: str = Query("all"),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the tenant's tickets (plan §4.3 — user sees own tickets in UI)."""
    q = select(SupportTicket).where(SupportTicket.tenant_id == current_user._tenant_id)
    if status != "all":
        q = q.where(SupportTicket.status == status)
    q = q.order_by(desc(SupportTicket.created_at)).limit(limit)
    rows = await db.execute(q)
    tickets = rows.scalars().all()
    total = await db.scalar(
        select(func.count(SupportTicket.id)).where(SupportTicket.tenant_id == current_user._tenant_id)
    ) or 0
    return {"success": True, "data": [
        {
            "id": t.id, "subject": t.subject, "priority": t.priority, "status": t.status,
            "email": t.email, "body": t.body,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        } for t in tickets
    ], "total": total}


@router.get("/tickets/{ticket_id}")
async def get_ticket(
    ticket_id: int,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ticket + thread of replies (tenant-scoped)."""
    t = await db.get(SupportTicket, ticket_id)
    if not t or t.tenant_id != current_user._tenant_id:
        raise HTTPException(404, "التذكرة غير موجودة")
    rows = await db.execute(
        select(SupportTicketReply)
        .where(SupportTicketReply.ticket_id == t.id)
        .order_by(SupportTicketReply.created_at)
    )
    replies = rows.scalars().all()
    return {"success": True, "data": {
        "id": t.id, "subject": t.subject, "body": t.body, "priority": t.priority,
        "status": t.status, "email": t.email,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "replies": [
            {
                "id": r.id, "message": r.message, "is_admin": r.is_admin,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            } for r in replies
        ],
    }}


@router.post("/tickets/{ticket_id}/reply")
async def reply_ticket(
    ticket_id: int,
    payload: dict = Body(...),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reply on a ticket (plan §4.3 steps 2-3): owner replies, admin replies too."""
    message = (payload.get("message") or "").strip()
    if len(message) < 2:
        raise HTTPException(400, "الرسالة مطلوبة")
    t = await db.get(SupportTicket, ticket_id)
    if not t or t.tenant_id != current_user._tenant_id:
        raise HTTPException(404, "التذكرة غير موجودة")

    is_admin = current_user.role == "admin" and (t.user_id != current_user.id)
    r = SupportTicketReply(ticket_id=t.id, user_id=current_user.id, is_admin=is_admin, message=message)
    db.add(r)
    t.status = "pending" if is_admin else "open"   # admin replied → awaiting user
    t.updated_at = __import__("datetime").datetime.utcnow()
    await db.commit()

    # in-app notification for the ticket owner
    if is_admin and t.user_id:
        await push_notification(
            db, t.tenant_id,
            title=f"رد الدعم على تذكرتك #{t.id}",
            body=message[:200], type_="support", link="/dashboard/support",
            user_id=t.user_id,
        )
        await db.commit()
    return {"success": True, "data": {"id": r.id, "is_admin": is_admin}}


@router.post("/tickets/{ticket_id}/close")
async def close_ticket(
    ticket_id: int,
    db=Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Admin closes a ticket."""
    t = await db.get(SupportTicket, ticket_id)
    if not t or t.tenant_id != current_user._tenant_id:
        raise HTTPException(404, "التذكرة غير موجودة")
    t.status = "closed"
    t.updated_at = __import__("datetime").datetime.utcnow()
    if t.user_id:
        await push_notification(
            db, t.tenant_id,
            title=f"تم إغلاق تذكرتك #{t.id}",
            body="تم حل المشكلة وإغلاق التذكرة. يمكنك فتح تذكرة جديدة عند الحاجة.",
            type_="support", link="/dashboard/support", user_id=t.user_id,
        )
    await db.commit()
    return {"success": True, "data": {"id": t.id, "status": t.status}}
