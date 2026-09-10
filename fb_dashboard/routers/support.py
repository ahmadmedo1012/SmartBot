"""Support ticket system — create, list, reply, close (plan §4.3).

Frontend contract (dashboard/support/page.tsx):
  GET  /api/support/info           → {data: {email, phone, whatsapp, working_hours}}
  POST /api/support/ticket        ← {subject, message, email} → real ticket row
Full system (plan §4.3):
  GET  /api/support/tickets                → tenant-scoped list
  GET  /api/support/tickets/{id}           → ticket + replies
  POST /api/support/tickets/{id}/reply     → owner or admin replies
  POST /api/support/tickets/{id}/close     → admin closes (owner can too)
  GET  /api/admin/support/tickets          → v16-E2: platform-admin cross-tenant queue
  POST /api/admin/support/tickets/{id}/close  → v17-E-F8: platform close + notify
  POST /api/admin/support/tickets/{id}/reply  → v22-D10: platform reply + notify
Priorities: low | medium | high | urgent.
Statuses: open | pending (admin replied, awaiting customer) | closed.
"""
from __future__ import annotations

import logging
import os

from _responses import ok
from _utils import iso_z, utcnow
from database import get_db
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from models import SupportTicket, SupportTicketReply, Tenant, User
from sqlalchemy import desc, func, select

from routers.auth import get_current_user, require_platform_admin, require_role
from routers.notifications import push_notification
from routers.payments.wallet import _notify_admins_inline

log = logging.getLogger("fb-api")
router = APIRouter(prefix="/api/support", tags=["support"])

_PRIORITIES = {"low", "medium", "high", "urgent"}

# ── v22-D10 (W1-D10 BUG-3/BUG-5): حدود صحّة التذاكر ──────────────────────────
# السقوف مطابقة لأعمدة النموذج (subject String(200))؛ الردود نص Text بلا سقف
# DB-side فالحد مطبّق في المسار. 422 (لا 400) لأنها أخطاء حجم حمولة صريحة
# قبل أي معالجة — عقد واضح بدل القصّ الصامت للموضوع (200 حرفاً مخزّنة
# بلا علم المستخدم) والتخزين غير المحدود للنص (جسم 800 حرف خُزّن كاملاً).
_SUBJECT_MAX_CHARS = 200    # models.SupportTicket.subject String(200)
_BODY_MAX_CHARS = 2000
_REPLY_MAX_CHARS = 2000
_TICKET_RATE_MAX = 10       # per user per hour (BUG-3: كان بلا أي حد)
_TICKET_RATE_WINDOW = 3600

# v10-A3: PUBLIC route with NO auth — an explicit allowlist (same pattern as
# /api/config, v8-A1) is the only safe read. The previous "every non-secret
# SystemConfig row" scan leaked heartbeat keys / telegram_chat_id and would
# leak any future key added to the table. New keys can never appear here
# by default.
_SUPPORT_INFO_CONFIG_KEYS = frozenset({
    "support_email",
    "support_phone",
    "support_whatsapp",
    "support_working_hours",
})


@router.get("/info")
async def support_info(db=Depends(get_db)):
    """Public support contact info.

    Merge order (same pattern as GET /api/config): SystemConfig rows (set by
    admin via POST /api/admin/config) WIN; env vars fallback so the owner can
    set real values in Vercel without a redeploy. Values shown until the owner
    configures real ones are the page's existing defaults — nothing invented.

    NOTE for future audits: this route is registered as prefix="/api/support"
    + @router.get("/info") — grepping for the literal "/api/support/info"
    only matches the docstring, NOT the route. That grep pitfall produced the
    false "missing endpoint" claim in parity plan v2 §3.1.
    """
    from models import SystemConfig
    config: dict = {}
    try:
        rows = await db.execute(
            select(SystemConfig).where(SystemConfig.key.in_(_SUPPORT_INFO_CONFIG_KEYS))
        )
        for r in rows.scalars().all():
            if not r.is_secret:
                config[r.key] = r.value
    except Exception:
        log.warning("support/info: SystemConfig read failed — env fallback", exc_info=True)

    def merged(key: str, env: str, default: str) -> str:
        return config.get(key) or os.getenv(env) or default

    return ok({
        "email": merged("support_email", "SUPPORT_EMAIL", "support@smartbot.ly"),
        "phone": merged("support_phone", "SUPPORT_PHONE", "0920000000"),
        "whatsapp": merged("support_whatsapp", "SUPPORT_WHATSAPP",
                           os.getenv("SUPPORT_PHONE", "0920000000")),
        "working_hours": merged("support_working_hours", "SUPPORT_WORKING_HOURS", "24/7"),
    })


@router.post("/ticket")
@router.post("/tickets")
async def create_ticket(
    payload: dict = Body(...),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a support ticket (plan §4.3 step 1) — notifies Telegram admins.

    v22-D10 (W1-D10 BUG-3/BUG-5): rate-limited per user (10/hour — a script
    could previously flood the table AND the owner's single Telegram
    recipient, one message per ticket) with an Arabic 429, and length caps
    (subject ≤ 200, body ≤ 2000) answer honest 422s instead of silently
    truncating the subject. The rate check runs BEFORE validation on
    purpose (same order as register/login): invalid payloads still count
    toward the window, so a flood of garbage can't bypass the limit.
    """
    from _rate_limit import check_rate_limit
    if not await check_rate_limit(db, f"support:{current_user.id}",
                                  max_attempts=_TICKET_RATE_MAX,
                                  window_seconds=_TICKET_RATE_WINDOW):
        raise HTTPException(429, "أنشأت عددًا كبيرًا من التذاكر — حاول بعد ساعة")

    subject = (payload.get("subject") or "بدون عنوان").strip()
    body = (payload.get("message") or payload.get("body") or "").strip()
    email = (payload.get("email") or current_user.email or "").strip()
    priority = (payload.get("priority") or "medium").strip().lower()

    if len(body) < 10:
        raise HTTPException(400, "الرسالة يجب أن تكون 10 أحرف على الأقل")
    if len(body) > _BODY_MAX_CHARS:
        raise HTTPException(422, f"الرسالة يجب ألا تتجاوز {_BODY_MAX_CHARS} حرفاً")
    if len(subject) > _SUBJECT_MAX_CHARS:
        raise HTTPException(422, f"الموضوع يجب ألا يتجاوز {_SUBJECT_MAX_CHARS} حرفاً")
    if priority not in _PRIORITIES:
        raise HTTPException(400, f"الأولوية يجب أن تكون إحدى: {', '.join(sorted(_PRIORITIES))}")

    t = SupportTicket(
        tenant_id=current_user._tenant_id,
        user_id=current_user.id,
        email=email,
        subject=subject,
        body=body,
        priority=priority,
        status="open",
    )
    db.add(t)
    await db.flush()
    # v16-E2 (D4-H1): the commit now happens BEFORE the Telegram notify — the
    # ticket row is durable first; a frozen or failing Telegram can never
    # block or fail the user's request (the old order also left a bare
    # ``except: pass`` around a spawn()ed task, which dies silently on Vercel
    # serverless once the response returns — tickets existed while NOBODY was
    # ever notified, and the owner had no queue to see them: see the
    # /api/admin/support/tickets route below, the second half of this fix).
    await db.commit()
    await db.refresh(t)

    # v16-E2 (D4-H1): inline guarded notify — the wallet.py v14-E1 pattern
    # (asyncio.wait_for timeout=8s; timeout/failure logged only, never fails
    # the request). Runs before the response leaves, so on Vercel the send
    # actually happens instead of dying with the function.
    try:
        from telegram_bot import notify_admins_support_ticket
    except Exception:
        log.warning("telegram notify unavailable — ticket stored only", exc_info=True)
    else:
        await _notify_admins_inline(
            notify_admins_support_ticket(subject[:80], body[:500], email))

    return ok({
        "id": t.id, "status": t.status, "priority": t.priority,
        "message": "تم إرسال طلبك بنجاح — سيتواصل معك فريق الدعم خلال 24 ساعة",
    })


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
    # v10-D2: total moves INSIDE the envelope's data (was a sibling key —
    # the only endpoint breaking the unwrapApi structural contract). Shape
    # matches the platform's Paginated<T> ({items, total}).
    # FRONTEND NOTE: dashboard/support/page.tsx must read data.items now.
    return ok({
        "items": [
            {
                "id": t.id, "subject": t.subject, "priority": t.priority, "status": t.status,
                "email": t.email, "body": t.body,
                "created_at": iso_z(t.created_at),
                "updated_at": iso_z(t.updated_at),
            } for t in tickets
        ],
        "total": total,
    })


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
    return ok({
        "id": t.id, "subject": t.subject, "body": t.body, "priority": t.priority,
        "status": t.status, "email": t.email,
        "created_at": iso_z(t.created_at),
        "replies": [
            {
                "id": r.id, "message": r.message, "is_admin": r.is_admin,
                "created_at": iso_z(r.created_at),
            } for r in replies
        ],
    })


@router.post("/tickets/{ticket_id}/reply")
async def reply_ticket(
    ticket_id: int,
    payload: dict = Body(...),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reply on a ticket (plan §4.3 steps 2-3): owner replies, admin replies too.

    v22-D10 (W1-D10 BUG-4): الرد على تذكرة مغلقة = 400 صريح. الكود القديم
    كان يعيد فتح التذكرة بصمت (closed → open) بينما الواجهة تخفي مربع
    الرد وتعد المستخدم بـ«أرسل طلباً جديداً» — الآن الـ API يقول نفس
    الحقيقة. العقد: المغلقة غير قابلة للتعديل؛ التذكرة الجديدة هي مسار
    العودة (لا توجد حالة «إعادة فتح»). حدود الرد كحدود الإنشاء (BUG-5).
    """
    message = (payload.get("message") or "").strip()
    if len(message) < 2:
        raise HTTPException(400, "الرسالة مطلوبة")
    if len(message) > _REPLY_MAX_CHARS:
        raise HTTPException(422, f"رسالة الرد يجب ألا تتجاوز {_REPLY_MAX_CHARS} حرفاً")
    t = await db.get(SupportTicket, ticket_id)
    if not t or t.tenant_id != current_user._tenant_id:
        raise HTTPException(404, "التذكرة غير موجودة")
    if t.status == "closed":
        raise HTTPException(400, "التذكرة مغلقة — افتح تذكرة جديدة")

    is_admin = current_user.role == "admin" and (t.user_id != current_user.id)
    r = SupportTicketReply(ticket_id=t.id, user_id=current_user.id, is_admin=is_admin, message=message)
    db.add(r)
    t.status = "pending" if is_admin else "open"   # admin replied → awaiting user
    t.updated_at = utcnow()
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
    return ok({"id": r.id, "is_admin": is_admin})


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
    t.updated_at = utcnow()
    if t.user_id:
        await push_notification(
            db, t.tenant_id,
            title=f"تم إغلاق تذكرتك #{t.id}",
            body="تم حل المشكلة وإغلاق التذكرة. يمكنك فتح تذكرة جديدة عند الحاجة.",
            type_="support", link="/dashboard/support", user_id=t.user_id,
        )
    await db.commit()
    return ok({"id": t.id, "status": t.status})


# ── v16-E2 (D4-H1): the platform admin's ticket queue ────────────────────────
# The tenant-scoped routes above 404 for the platform admin (t.tenant_id is
# never 0), so before this route the OWNER had ZERO channels to ever see a
# ticket: the Telegram notify was spawn'd (died on Vercel) and the dashboard
# route answered 404 — while the user is promised a 24h response. This is a
# PLATFORM endpoint under /api/admin/…, so it lives OUTSIDE this router's
# /api/support prefix: a separate full-path router merged into ``router``
# (same aggregation idea as routers/payments/__init__.py) so the single
# registration in runner.py (app.include_router(support_router.router))
# serves both.
platform_admin_router = APIRouter(tags=["support"])

_TICKET_STATUSES = ("all", "open", "pending", "closed")


@platform_admin_router.get("/api/admin/support/tickets")
async def admin_queue_support_tickets(
    status: str = Query("all"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db=Depends(get_db),
    current_user: User = Depends(require_platform_admin),
):
    """Platform admin: cross-tenant support ticket queue.

    Optional ``status`` filter (open | pending | closed | all), newest first,
    paginated (``page`` × ``limit``, default 20). Every ticket field is
    returned plus the owning tenant's name — the owner finally has a live
    channel to the tickets users were promised a 24h response on.
    Contract (plan §2 E2→E3): ok({items, total, page}).
    """
    if status not in _TICKET_STATUSES:
        raise HTTPException(400, f"حالة التذكرة يجب أن تكون إحدى: {', '.join(_TICKET_STATUSES)}")

    count_q = select(func.count(SupportTicket.id))
    list_q = select(SupportTicket, Tenant.name).outerjoin(
        Tenant, Tenant.id == SupportTicket.tenant_id)
    if status != "all":
        count_q = count_q.where(SupportTicket.status == status)
        list_q = list_q.where(SupportTicket.status == status)
    total = await db.scalar(count_q) or 0
    rows = await db.execute(
        list_q.order_by(desc(SupportTicket.created_at))
        .offset((page - 1) * limit).limit(limit)
    )
    page_rows = rows.all()
    # v22-D10 (W1-D10 BUG-1/BUG-6): the thread rides on every queue row —
    # the admin console renders the full conversation (the customer's
    # replies included) instead of answering blind from the subject alone.
    # One IN() query for the whole page, ordered by created_at within each
    # ticket — additive to the contract (existing keys untouched).
    replies_by_ticket: dict[int, list[dict]] = {}
    ticket_ids = [t.id for t, _name in page_rows]
    if ticket_ids:
        reply_rows = await db.execute(
            select(SupportTicketReply)
            .where(SupportTicketReply.ticket_id.in_(ticket_ids))
            .order_by(SupportTicketReply.created_at, SupportTicketReply.id)
        )
        for rep in reply_rows.scalars().all():
            replies_by_ticket.setdefault(rep.ticket_id, []).append({
                "id": rep.id, "message": rep.message, "is_admin": rep.is_admin,
                "created_at": iso_z(rep.created_at),
            })
    items = [{
        "id": t.id,
        "tenant_id": t.tenant_id,
        "tenant_name": tenant_name or "",
        "user_id": t.user_id,
        "email": t.email,
        "subject": t.subject,
        "body": t.body,
        "priority": t.priority,
        "status": t.status,
        "created_at": iso_z(t.created_at),
        "updated_at": iso_z(t.updated_at),
        "replies": replies_by_ticket.get(t.id, []),
    } for t, tenant_name in page_rows]
    return ok({"items": items, "total": total, "page": page})


# ── v17-E-F8 (D6 #5): إغلاق التذكرة من طابور المنصة ──────────────────────────
# مسار /api/support/tickets/{id}/close أعلاه محصور بالمستأجر (require_role
# «admin» + فحص t.tenant_id == current_user._tenant_id) — لمدير المنصة
# (tenant_id=0) يرد 404 على تذاكر كل المستأجرين، فكان زر الإغلاق في
# /admin/support بلا أي endpoint يخدمه. هذا مسار منصة عابر للمستأجرين
# بنفس سلوك مسار المستأجر: إغلاق + إشعار داخل التطبيق لصاحب التذكرة.
# Idempotent: إغلاق تذكرة مغلقة يعيد الحالة الحالية دون إشعار مكرر.
@platform_admin_router.post("/api/admin/support/tickets/{ticket_id}/close")
async def admin_close_support_ticket(
    ticket_id: int,
    db=Depends(get_db),
    current_user: User = Depends(require_platform_admin),
):
    t = await db.get(SupportTicket, ticket_id)
    if not t:
        raise HTTPException(404, "التذكرة غير موجودة")
    if t.status == "closed":
        return ok({"id": t.id, "status": t.status})
    t.status = "closed"
    t.updated_at = utcnow()
    if t.user_id:
        await push_notification(
            db, t.tenant_id,
            title=f"تم إغلاق تذكرتك #{t.id}",
            body="تم حل المشكلة وإغلاق التذكرة. يمكنك فتح تذكرة جديدة عند الحاجة.",
            type_="support", link="/dashboard/support", user_id=t.user_id,
        )
    await db.commit()
    return ok({"id": t.id, "status": t.status})


# ── v22-D10 (W1-D10 BUG-1): رد فريق الدعم من طابور المنصة ────────────────────
# الحلقة كانت باتجاه واحد في الإنتاج: مسار الرد الوحيد محصور بالمستأجر
# (لمدير المنصة 404 — مثبت في v17-E-F8)، ولا مربع رد في /admin/support —
# فالوعد «سيتواصل معك فريق الدعم خلال 24 ساعة» كان مساراً ميتاً. هذا
# المسار يكمل الصورة بنفس نمط الإغلاق v17-E-F8 (require_platform_admin
# عابر للمستأجرين): رد is_admin=true + حالة pending «بانتظار العميل» +
# إشعار داخل التطبيق لصاحب التذكرة (نفس عقد مسار المستأجر: المرآة
# الكاملة لـ approvals.py push_notification).
# CSRF يسري عليه (مسار تحوّل عادي — ليس في قائمة الإعفاء) — الواجهة
# ترسل عبر apiFetch الذي يرفع X-CSRF-Token تلقائياً.
# العقد المعلن للتذكرة المغلقة: 400 (مثل مسار المستأجر — المغلقة غير
# قابلة للرد؛ التذكرة الجديدة هي مسار العودة).
@platform_admin_router.post("/api/admin/support/tickets/{ticket_id}/reply")
async def admin_reply_support_ticket(
    ticket_id: int,
    payload: dict = Body(...),
    db=Depends(get_db),
    current_user: User = Depends(require_platform_admin),
):
    message = (payload.get("message") or "").strip()
    if len(message) < 2:
        raise HTTPException(400, "الرسالة مطلوبة")
    if len(message) > _REPLY_MAX_CHARS:
        raise HTTPException(422, f"رسالة الرد يجب ألا تتجاوز {_REPLY_MAX_CHARS} حرفاً")
    t = await db.get(SupportTicket, ticket_id)
    if not t:
        raise HTTPException(404, "التذكرة غير موجودة")
    if t.status == "closed":
        raise HTTPException(400, "التذكرة مغلقة — افتح تذكرة جديدة")

    r = SupportTicketReply(ticket_id=t.id, user_id=current_user.id,
                           is_admin=True, message=message)
    db.add(r)
    t.status = "pending"   # support replied → awaiting the customer
    t.updated_at = utcnow()
    await db.commit()

    # in-app notification for the ticket owner (mirror of the tenant route's
    # is_admin branch: push AFTER the reply is durable, then commit again)
    if t.user_id:
        await push_notification(
            db, t.tenant_id,
            title=f"رد الدعم على تذكرتك #{t.id}",
            body=message[:200], type_="support", link="/dashboard/support",
            user_id=t.user_id,
        )
        await db.commit()
    return ok({
        "id": r.id, "is_admin": True, "status": t.status,
        "message": r.message, "created_at": iso_z(r.created_at),
    })


router.routes.extend(platform_admin_router.routes)
