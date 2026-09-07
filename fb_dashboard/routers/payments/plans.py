"""Subscription payment routes: create, status poll, upgrade.

v13-L4: split out of the former 594-line ``routers/payments.py`` monolith —
endpoint bodies moved VERBATIM. This module exclusively owns the in-process
pending-submission lock registry (``_SUB_PENDING_LOCKS`` / ``_pending_lock``)
and the receipt-reference validation (``_validated_receipt_url``).
"""
import asyncio
import logging

from _responses import ok
from database import AsyncSessionLocal, get_db
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from models import SubscriptionPayment, SubscriptionPlan, Tenant, User
from sqlalchemy import select
from telegram_bot import notify_admins_new_subscription

from routers.auth import get_current_user
from routers.payments.wallet import (
    _as_float,
    _as_int,
    _notify_admins_inline,
    _payment_rate_limit,
    _reject_wallet_above_cap,
)

log = logging.getLogger("fb-api")
router = APIRouter(tags=["payments"])

# v9-A8: app-level double-submit guard for pending subscription rows.
# Durable fix would be a partial UNIQUE index (user_id WHERE status='pending')
# but that needs a migration — explicitly out of scope for v9 §A8 (no schema
# churn). This in-process lock serializes the check-then-insert critical
# section within one app instance (single-worker uvicorn / one Vercel
# invocation), so a double-click can no longer create two pending rows.
# Multi-instance deployments should add the partial index at the next
# schema reset.
_SUB_PENDING_LOCKS: dict[int, asyncio.Lock] = {}


def _pending_lock(user_id: int) -> asyncio.Lock:
    lock = _SUB_PENDING_LOCKS.get(user_id)
    if lock is None:
        if len(_SUB_PENDING_LOCKS) > 1024:  # bound the registry (old users churn)
            _SUB_PENDING_LOCKS.clear()
        lock = asyncio.Lock()
        _SUB_PENDING_LOCKS[user_id] = lock
    return lock


# NOTE (2026-09-05): POST /api/subscriptions/validate was REMOVED — it had no
# frontend/test consumers and served as an unauthenticated username-enumeration
# oracle (check availability of any username without a session). Username
# availability is validated by /api/register's existing-duplicate check.


# v14-E1 #4: receipt references are validated BEFORE they land in extra_data.
# The /api/upload path re-encodes with Pillow (≤1600px q85 → a few hundred KB
# base64), so anything bigger is a client bypassing upload and stuffing
# megabytes straight into the request body (unbounded DB row), and any other
# scheme is a value our own upload flow never produces.
_RECEIPT_URL_MAX_CHARS = 2_000_000
_RECEIPT_URL_PREFIXES = ("data:image/", "/static/uploads/receipts/", "https://")


def _validated_receipt_url(raw) -> str:
    value = (raw or "").strip() if isinstance(raw, str) else ""
    if not value:
        return ""
    if not value.startswith(_RECEIPT_URL_PREFIXES):
        raise HTTPException(400, "رابط صورة التحويل غير صالح")
    if len(value) > _RECEIPT_URL_MAX_CHARS:
        raise HTTPException(400, "صورة التحويل كبيرة جداً — أعد رفعها بصورة أصغر")
    return value


@router.post("/api/subscriptions")
async def create_subscription(request: Request, body: dict = Body(...), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Create payment request for new subscription. Notifies Telegram admins.

    Supports three providers:
      - liyana / madar → mobile wallet (amount must equal plan price; user phone required)
      - bank → bank transfer (amount can equal plan price; sender account info required)

    Rate-limited to 5 attempts/min per IP to prevent Telegram-bot flooding.
    """
    # Rate limit: 5 attempts/min per IP (graceful degradation if DB unavailable)
    ip = request.client.host if request.client else "unknown"
    try:
        from _rate_limit import check_rate_limit
        async with AsyncSessionLocal() as rl_db:
            if not await check_rate_limit(rl_db, f"sub:{ip}", max_attempts=5, window_seconds=60):
                raise HTTPException(429, "محاولات كثيرة — حاول بعد 60 ثانية")
    except HTTPException:
        raise
    except Exception:
        import logging
        logging.getLogger("fb-payments").warning("Rate-limit check failed — allowing subscription through", exc_info=True)

    phone = body.get("phone", "")
    # v15-E3 (D1-H1): raw float()/int() conversions on body values were a
    # 500 (+ critical Sentry/Telegram alert) on a client typo; now 422 Arabic.
    # Numeric strings ("50") still coerce — same leniency as before.
    amount = _as_float(body.get("amount", 0), "المبلغ")
    provider = body.get("provider", "liyana")
    plan_id = _as_int(body.get("plan_id", 0) or 0, "معرف الباقة")

    if provider not in ("liyana", "madar", "bank"):
        raise HTTPException(400, "مزود الدفع غير صالح")
    plan = await db.get(SubscriptionPlan, plan_id)
    if not plan or not plan.is_active:
        raise HTTPException(400, "الباقة غير موجودة")
    if provider != "bank" and amount != float(plan.price):
        raise HTTPException(400, "المبلغ غير مطابق لسعر الباقة")
    # غلاف المحافظ (فرض على الخادم — التحويل فوق السقف بنكي فقط؛ v10-D1: القيمة من DB)
    await _reject_wallet_above_cap(provider, amount if provider != "bank" else 0, db)
    if provider != "bank" and (not phone or len(phone) < 7):
        raise HTTPException(400, "رقم الهاتف غير صالح")

    # Bank transfer: collect sender info into extra_data for admin review
    bank_extra: dict = {"username": current_user.username}
    if provider == "bank":
        # v15-E3 (D1-H1): was float(body.get("amount") or plan.price) — a
        # non-numeric amount was a raw 500 here too; amount is already a
        # validated float now.
        bank_amount = amount if amount else float(plan.price)
        if bank_amount < float(plan.price) * 0.5:
            # sanity: reject obviously wrong amounts (server is final authority on plan price)
            raise HTTPException(400, "المبلغ المدخل أقل من الحد المقبول")
        amount = bank_amount
        sender_name = (body.get("senderAccountName") or "").strip()
        sender_account = (body.get("senderAccountNumber") or "").strip()
        if not sender_name:
            raise HTTPException(400, "اسم صاحب الحساب المُرسِل مطلوب")
        if not sender_account:
            raise HTTPException(400, "رقم حساب المُرسِل مطلوب")
        receipt_url = _validated_receipt_url(body.get("receiptImageUrl"))
        bank_extra.update({
            "sender_name": sender_name,
            "sender_account": sender_account,
            "receipt_url": receipt_url,
        })

    async with _pending_lock(current_user.id):
        existing_pending = await db.execute(
            select(SubscriptionPayment.id).where(
                SubscriptionPayment.user_id == current_user.id,
                SubscriptionPayment.status == "pending"
            ).limit(1)
        )
        if existing_pending.scalars().first():
            raise HTTPException(400, "لديك طلب دفع معلق — انتظر الموافقة أو ألغِه")

        sp = SubscriptionPayment(
            user_id=current_user.id,
            tenant_id=current_user._tenant_id,
            phone=phone or "-",  # bank transfers don't require a phone
            amount=amount,
            provider=provider,
            plan_id=plan_id,
            plan_name=plan.name_ar,
            status="pending",
            extra_data=bank_extra,
        )
        db.add(sp)
        await db.commit()  # inside the lock — the pending check stays atomic
        await db.refresh(sp)

    # v14-E1 #3: inline (was spawn) — Vercel kills post-response tasks; the
    # subscription alert must leave BEFORE this response does.
    await _notify_admins_inline(
        notify_admins_new_subscription(sp.id, current_user.username, float(amount), provider, phone or "-", plan.name_ar)
    )

    if provider == "bank":
        msg = "تم استلام طلب التحويل البنكي — سيتم التفعيل بعد موافقة الإدارة"
    else:
        msg = f"تحويل {amount} د.ل عبر {provider} إلى الرقم {phone} — انتظر تأكيد الإدارة"
    return ok({
        "payment_id": sp.id,
        "status": "pending",
        "message": msg,
        "provider": provider,
    })


@router.get("/api/subscriptions/status")
async def subscription_status(payment_id: int = Query(...), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Poll payment status — used by frontend instead of SSE."""
    sp = await db.get(SubscriptionPayment, payment_id)
    # Tenant isolation: same user OR same tenant can view (admins of the tenant
    # need to see payments submitted by other users in their tenant).
    if not sp or (sp.user_id != current_user.id and sp.tenant_id != (current_user._tenant_id or 0)):
        raise HTTPException(404, "الدفعة غير موجودة")
    return ok({"id": sp.id, "status": sp.status, "plan_id": sp.plan_id, "plan_name": sp.plan_name})


@router.post("/api/subscriptions/upgrade")
async def upgrade_subscription(request: Request, body: dict = Body(...), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Upgrade existing subscription to higher plan. Supports liyana/madar/bank."""
    # Same 5/min limit as create — this fan-outs Telegram admin notifications too
    await _payment_rate_limit(request, "sub-upgrade", max_attempts=5, window=300)
    plan_id = _as_int(body.get("plan_id", 0) or 0, "معرف الباقة")
    phone = body.get("phone", "")
    provider = body.get("provider", "liyana")
    # v15-E3 (D1-H1): was a raw float(amount) at the compare sites — the
    # conversion now happens once, with a 422 Arabic on garbage input.
    amount = _as_float(body.get("amount", 0), "المبلغ")
    sender_name = (body.get("senderAccountName") or "").strip()
    sender_account = (body.get("senderAccountNumber") or "").strip()
    receipt_url = _validated_receipt_url(body.get("receiptImageUrl"))

    if provider not in ("liyana", "madar", "bank"):
        raise HTTPException(400, "مزود الدفع غير صالح")
    new_plan = await db.get(SubscriptionPlan, plan_id)
    if not new_plan or not new_plan.is_active:
        raise HTTPException(400, "الباقة غير موجودة")

    tenant = await db.get(Tenant, current_user._tenant_id)
    if not tenant:
        raise HTTPException(400, "الحساب غير موجود")
    if tenant.plan_id and tenant.plan_id >= plan_id:
        raise HTTPException(400, "هذه الباقة أقل أو تساوي باقتك الحالية")

    if provider != "bank":
        if not phone or len(phone) < 7:
            raise HTTPException(400, "رقم الهاتف غير صالح")
        if amount != float(new_plan.price):
            raise HTTPException(400, "المبلغ غير مطابق لسعر الباقة")
        await _reject_wallet_above_cap(provider, amount, db)
    else:
        amount = amount if amount else float(new_plan.price)
        if amount < float(new_plan.price) * 0.5:
            raise HTTPException(400, "المبلغ المدخل أقل من الحد المقبول")
        if not sender_name:
            raise HTTPException(400, "اسم صاحب الحساب مطلوب")
        if not sender_account:
            raise HTTPException(400, "رقم الحساب مطلوب")

    async with _pending_lock(current_user.id):
        existing_pending = await db.execute(
            select(SubscriptionPayment.id).where(
                SubscriptionPayment.user_id == current_user.id,
                SubscriptionPayment.status == "pending"
            ).limit(1)
        )
        if existing_pending.scalars().first():
            raise HTTPException(400, "لديك طلب ترقية معلق")

        extra: dict = {"username": current_user.username, "upgrade": True}
        if provider == "bank":
            extra.update({"sender_name": sender_name, "sender_account": sender_account, "receipt_url": receipt_url})

        sp = SubscriptionPayment(
            user_id=current_user.id,
            tenant_id=current_user._tenant_id,
            phone=phone or "-",
            amount=amount,
            provider=provider,
            plan_id=plan_id,
            plan_name=new_plan.name_ar,
            status="pending",
            extra_data=extra,
            upgraded_from=tenant.plan_id,
        )
        db.add(sp)
        await db.commit()  # inside the lock — the pending check stays atomic
        await db.refresh(sp)

    # v14-E1 #3: inline (was spawn) — same Vercel rationale as create.
    await _notify_admins_inline(
        notify_admins_new_subscription(sp.id, current_user.username, float(amount), provider, phone or "-", new_plan.name_ar)
    )

    return ok({"payment_id": sp.id, "status": "pending"})
