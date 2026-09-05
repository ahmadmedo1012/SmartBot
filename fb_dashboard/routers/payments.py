"""Payment & subscription routes: topup, confirm, balance, history, subscriptions."""
import asyncio
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Query, HTTPException, Body, Request, UploadFile, File
from sqlalchemy import select, func, desc, update

from _utils import utcnow
from config import settings
from database import get_db, AsyncSessionLocal
from models import PaymentRequest, BotState, SubscriptionPlan, SubscriptionPayment, Tenant, User, SystemConfig
from routers.auth import get_current_user, require_role
from telegram_bot import notify_admins_new_payment, notify_admins_new_subscription

log = logging.getLogger("fb-api")
router = APIRouter(tags=["payments"])

# Receipt uploads — plan §2.1 (receipt upload)
# payments.py lives in fb_dashboard/routers/ → static/ is one level up
_UPLOAD_DIR = Path(__file__).resolve().parent.parent / "static" / "uploads" / "receipts"
_MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5MB
_ALLOWED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
_IS_VERCEL = bool(os.getenv("VERCEL"))


@router.post("/api/upload")
async def upload_receipt(request: Request, file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    """Upload a payment receipt image (plan §2.1).

    - Authenticated users only.
    - Rate-limited (10/min per IP — plan §7.1).
    - Content-type + magic-byte validation, 5MB cap, Pillow re-encode to
      cap dimensions (1600px) so storage/Telegram payloads stay sane.
    - Local disk: saved to static/uploads/receipts → returns /static/... URL.
    - Vercel (read-only FS): returns a data: URL so the receipt still
      reaches the admin review flow via extra_data.
    """
    await _payment_rate_limit(request, "upload")
    ctype = (file.content_type or "").lower()
    if ctype not in _ALLOWED_TYPES:
        raise HTTPException(400, "صيغة الصورة غير مدعومة — JPG أو PNG أو WEBP فقط")

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "الملف فارغ")
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(400, "حجم الصورة يتجاوز 5 ميغابايت")

    # Re-encode with Pillow: validates real image content AND caps dimensions
    try:
        import io
        from PIL import Image
        img = Image.open(io.BytesIO(raw))
        img.load()
        img = img.convert("RGB")
        if max(img.size) > 1600:
            img.thumbnail((1600, 1600))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        payload = buf.getvalue()
        ext = ".jpg"
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "الملف ليس صورة صالحة")

    if _IS_VERCEL:
        import base64
        url = f"data:image/jpeg;base64,{base64.b64encode(payload).decode()}"
        return {"success": True, "data": {"url": url}}

    try:
        _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        name = f"{secrets.token_hex(12)}{ext}"
        (_UPLOAD_DIR / name).write_bytes(payload)
        url = f"/static/uploads/receipts/{name}"
        return {"success": True, "data": {"url": url}}
    except Exception as e:
        log.error(f"receipt upload failed: {e}", exc_info=True)
        raise HTTPException(500, "تعذر حفظ الصورة — حاول مرة أخرى")


def _reject_wallet_above_cap(provider: str, amount: float) -> None:
    """Plan §2.2: amounts above MOBILE_WALLET_CAP (99 LYD) must go via bank transfer.

    Server-side enforcement — the frontend auto-switch is UX only and can be bypassed.
    """
    if provider in ("liyana", "madar") and float(amount) > float(settings.MOBILE_WALLET_CAP):
        raise HTTPException(
            400,
            f"المبالغ فوق {settings.MOBILE_WALLET_CAP} د.ل تتطلب تحويل بنكي — اختر مزود التحويل البنكي",
        )


async def _payment_rate_limit(request: Request, key: str, max_attempts: int = 10, window: int = 60) -> None:
    """Plan §7.1: rate limit every payment-adjacent POST.

    Same DB-backed limiter as /api/subscriptions; graceful degradation if
    the check itself fails (never blocks legitimate payments on limiter hiccups).
    """
    try:
        from _rate_limit import check_rate_limit
        async with AsyncSessionLocal() as rl_db:
            if not await check_rate_limit(rl_db, f"{key}:{request.client.host if request.client else 'unknown'}",
                                          max_attempts=max_attempts, window_seconds=window):
                raise HTTPException(429, "محاولات كثيرة — حاول بعد قليل")
    except HTTPException:
        raise
    except Exception:
        log.warning("payment rate-limit check failed — allowing through", exc_info=True)


@router.post("/api/payments/topup")
async def payment_topup(request: Request, body: dict = Body(...), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    await _payment_rate_limit(request, "topup")
    amount = body.get("amount", 0)
    provider = body.get("provider", "")
    phone = body.get("phone", "")
    if amount < 1 or amount > 10000:
        raise HTTPException(400, "المبلغ غير صالح (1-10000)")
    if provider not in ("liyana", "madar"):
        raise HTTPException(400, "مزود الدفع غير صالح")
    _reject_wallet_above_cap(provider, amount)
    if not phone or len(phone) < 7:
        raise HTTPException(400, "رقم الهاتف غير صالح")
    pr = PaymentRequest(
        tenant_id=current_user._tenant_id,
        username=current_user.username,
        amount=amount,
        provider=provider,
        phone=phone,
        status="pending",
    )
    db.add(pr)
    await db.commit()
    await db.refresh(pr)
    asyncio.create_task(
        notify_admins_new_payment(pr.id, current_user.username, amount, provider, phone)
    )
    instructions = (
        f"حوالة إلى {provider} على الرقم {phone} بمبلغ {amount} د.ل "
        f"— بعد الإرسال، انتظر موافقة الأدمن"
    )
    return {"success": True, "data": {"payment_id": pr.id, "instructions": instructions}}


@router.post("/api/payments/confirm")
async def payment_confirm(request: Request, body: dict = Body(...), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """User submits transfer reference — marks pending for admin approval."""
    await _payment_rate_limit(request, "confirm")
    pid = body.get("payment_id", 0)
    ref = body.get("reference", "")
    if not pid or not ref:
        raise HTTPException(400, "معرف الدفع ورقم الحوالة مطلوبان")
    pr = await db.get(PaymentRequest, int(pid))
    if not pr or pr.tenant_id != current_user._tenant_id:
        raise HTTPException(404, "الدفعة غير موجودة")
    if pr.status != "pending":
        raise HTTPException(400, "الدفعة تم تأكيدها مسبقاً")
    pr.reference = ref
    pr.note = "انتظار موافقة الأدمن"
    await db.commit()
    return {"success": True, "data": {"ok": True, "message": "تم استلام رقم الحوالة، في انتظار موافقة الأدمن"}}


@router.get("/api/payments/balance")
async def payment_balance(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = await db.execute(
        select(BotState).where(BotState.tenant_id == current_user._tenant_id, BotState.key == "balance")
    )
    bs = existing.scalar_one_or_none()
    balance = int(bs.value) if bs and bs.value else 0
    return {"success": True, "data": {"balance": balance, "currency": "LYD"}}


@router.get("/api/payments/history")
async def payment_history(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = await db.execute(
        select(PaymentRequest)
        .where(PaymentRequest.tenant_id == current_user._tenant_id)
        .order_by(desc(PaymentRequest.created_at))
    )
    return {"success": True, "data": [
        {"payment_id": r.id, "amount": float(r.amount) if r.amount is not None else 0, "provider": r.provider,
         "phone": r.phone, "reference": r.reference, "status": r.status,
         "note": r.note, "created_at": r.created_at.isoformat() if r.created_at else None}
        for r in rows.scalars().all()
    ]}


@router.post("/api/subscriptions/validate")
async def validate_subscription(body: dict = Body(...), db=Depends(get_db)):
    """Pre-flight: check username + slug uniqueness."""
    username = body.get("username", "")
    if len(username) < 3:
        raise HTTPException(400, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل")
    existing_user = await db.execute(select(User).where(User.username == username))
    if existing_user.scalar_one_or_none():
        return {"success": False, "data": {"valid": False, "error": "اسم المستخدم موجود مسبقاً"}}
    return {"success": True, "data": {"valid": True}}


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
    amount = body.get("amount", 0)
    provider = body.get("provider", "liyana")
    plan_id = body.get("plan_id", 0)

    if provider not in ("liyana", "madar", "bank"):
        raise HTTPException(400, "مزود الدفع غير صالح")
    plan = await db.get(SubscriptionPlan, plan_id)
    if not plan or not plan.is_active:
        raise HTTPException(400, "الباقة غير موجودة")
    if provider != "bank" and float(amount) != float(plan.price):
        raise HTTPException(400, "المبلغ غير مطابق لسعر الباقة")
    # غلاف المحافظ (فرض على الخادم — التحويل فوق 99 د.ل بنكي فقط)
    _reject_wallet_above_cap(provider, amount if provider != "bank" else 0)
    if provider != "bank" and (not phone or len(phone) < 7):
        raise HTTPException(400, "رقم الهاتف غير صالح")

    # Bank transfer: collect sender info into extra_data for admin review
    bank_extra: dict = {"username": current_user.username}
    if provider == "bank":
        bank_amount = float(body.get("amount") or plan.price)
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
        receipt_url = (body.get("receiptImageUrl") or "").strip()
        bank_extra.update({
            "sender_name": sender_name,
            "sender_account": sender_account,
            "receipt_url": receipt_url,
        })

    existing_pending = await db.execute(
        select(SubscriptionPayment).where(
            SubscriptionPayment.user_id == current_user.id,
            SubscriptionPayment.status == "pending"
        )
    )
    if existing_pending.scalar_one_or_none():
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
    await db.commit()
    await db.refresh(sp)

    asyncio.create_task(
        notify_admins_new_subscription(sp.id, current_user.username, float(amount), provider, phone or "-", plan.name_ar)
    )

    if provider == "bank":
        msg = "تم استلام طلب التحويل البنكي — سيتم التفعيل بعد موافقة الإدارة"
    else:
        msg = f"تحويل {amount} د.ل عبر {provider} إلى الرقم {phone} — انتظر تأكيد الأدمن"
    return {
        "success": True,
        "data": {
            "payment_id": sp.id,
            "status": "pending",
            "message": msg,
            "provider": provider,
        },
    }


@router.get("/api/subscriptions/status")
async def subscription_status(payment_id: int = Query(...), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Poll payment status — used by frontend instead of SSE."""
    sp = await db.get(SubscriptionPayment, payment_id)
    # Tenant isolation: same user OR same tenant can view (admins of the tenant
    # need to see payments submitted by other users in their tenant).
    if not sp or (sp.user_id != current_user.id and sp.tenant_id != (current_user._tenant_id or 0)):
        raise HTTPException(404, "الدفعة غير موجودة")
    return {"success": True, "data": {"id": sp.id, "status": sp.status, "plan_id": sp.plan_id, "plan_name": sp.plan_name}}


# ── SSE: instant activation push (latest_plan.md Track B.5) ──────────────────
# The admin's approval activates the subscription server-side immediately; this
# stream pushes the status change to the waiting browser the moment it happens
# (≤2s) instead of relying on 5s polling. Frontend uses EventSource with the
# poll endpoint as automatic fallback when SSE is unavailable.
_SSE_POLL_SECONDS = 2
_SSE_MAX_LIFETIME = 600  # 10 min cap — subscription approvals never take longer


@router.get("/api/subscriptions/status-stream")
async def subscription_status_stream(payment_id: int = Query(...), current_user: User = Depends(get_current_user)):
    """Server-Sent Events stream for a payment's status (Track B.5).

    Events:
      data: {"id", "status", "plan_id", "plan_name"}   — on connect and on change
      event: close                                      — terminal status or lifetime cap
    """
    import asyncio as _asyncio
    import json as _json
    import time as _time

    from fastapi.responses import StreamingResponse

    async def event_gen():
        deadline = _time.monotonic() + _SSE_MAX_LIFETIME
        last_status: str | None = None
        while _time.monotonic() < deadline:
            try:
                async with AsyncSessionLocal() as sdb:
                    sp = await sdb.get(SubscriptionPayment, payment_id)
                if not sp or (sp.user_id != current_user.id and sp.tenant_id != (current_user._tenant_id or 0)):
                    yield f"event: error\ndata: {_json.dumps({'error': 'الدفعة غير موجودة'})}\n\n"
                    return  # tenant-isolation identical to the poll endpoint
                if sp.status != last_status:
                    last_status = sp.status
                    payload = {"id": sp.id, "status": sp.status, "plan_id": sp.plan_id, "plan_name": sp.plan_name}
                    yield f"data: {_json.dumps(payload, ensure_ascii=False)}\n\n"
                    if sp.status in ("verified", "rejected", "EXPIRED_TRIAL"):
                        yield "event: close\ndata: {}\n\n"
                        return
            except Exception:
                log.warning("SSE poll failed for payment %s", payment_id, exc_info=True)
            await _asyncio.sleep(_SSE_POLL_SECONDS)
        yield "event: close\ndata: {}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/api/subscriptions/upgrade")
async def upgrade_subscription(body: dict = Body(...), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Upgrade existing subscription to higher plan. Supports liyana/madar/bank."""
    plan_id = body.get("plan_id", 0)
    phone = body.get("phone", "")
    provider = body.get("provider", "liyana")
    amount = body.get("amount", 0)
    sender_name = (body.get("senderAccountName") or "").strip()
    sender_account = (body.get("senderAccountNumber") or "").strip()
    receipt_url = (body.get("receiptImageUrl") or "").strip()

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
        if float(amount) != float(new_plan.price):
            raise HTTPException(400, "المبلغ غير مطابق لسعر الباقة")
        _reject_wallet_above_cap(provider, amount)
    else:
        amount = float(amount) if amount else float(new_plan.price)
        if amount < float(new_plan.price) * 0.5:
            raise HTTPException(400, "المبلغ المدخل أقل من الحد المقبول")
        if not sender_name:
            raise HTTPException(400, "اسم صاحب الحساب مطلوب")
        if not sender_account:
            raise HTTPException(400, "رقم الحساب مطلوب")

    existing_pending = await db.execute(
        select(SubscriptionPayment).where(
            SubscriptionPayment.user_id == current_user.id,
            SubscriptionPayment.status == "pending"
        )
    )
    if existing_pending.scalar_one_or_none():
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
    await db.commit()
    await db.refresh(sp)

    asyncio.create_task(
        notify_admins_new_subscription(sp.id, current_user.username, float(amount), provider, phone or "-", new_plan.name_ar)
    )

    return {"success": True, "data": {"payment_id": sp.id, "status": "pending"}}


@router.get("/api/admin/subscriptions")
async def admin_list_subscriptions(status: str = Query("pending"), page: int = Query(1, ge=1), db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    """Admin: list subscription payments with filtering. Tenant-scoped."""
    q = select(SubscriptionPayment).where(SubscriptionPayment.tenant_id == current_user._tenant_id)
    if status != "all":
        q = q.where(SubscriptionPayment.status == status)
    q = q.order_by(desc(SubscriptionPayment.created_at)).offset((page - 1) * 20).limit(20)
    rows = await db.execute(q)
    result = []
    for sp in rows.scalars().all():
        username = (sp.extra_data or {}).get("username", f"user_{sp.user_id}")
        result.append({
            "id": sp.id, "user_id": sp.user_id, "username": username,
            "tenant_id": sp.tenant_id,
            "phone": sp.phone, "amount": float(sp.amount), "provider": sp.provider,
            "plan_id": sp.plan_id, "plan": sp.plan_name, "status": sp.status,
            "metadata": sp.extra_data,
            "created_at": sp.created_at.isoformat() if sp.created_at else None,
        })
    return {"success": True, "data": result}


@router.post("/api/admin/subscriptions")
async def admin_resolve_subscription(body: dict = Body(...), db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    """Admin: approve or reject a subscription payment."""
    payment_id = body.get("id", 0)
    decision = body.get("status", "")  # "verified" or "cancelled"
    sp = await db.get(SubscriptionPayment, payment_id)
    if not sp or sp.status != "pending":
        raise HTTPException(400, "الدفعة غير موجودة أو تمت معالجتها")
    sp.status = decision
    if decision == "verified":
        tenant = await db.get(Tenant, sp.tenant_id)
        if tenant:
            plan = await db.get(SubscriptionPlan, sp.plan_id)
            if plan:
                tenant.plan_id = sp.plan_id
                tenant.subscription_status = "PAID"
                tenant.plan_start = utcnow()
                tenant.plan_end = utcnow() + timedelta(days=plan.period_days)
                tenant.plan = plan.name.lower()
        if sp.user_id:
            user = await db.get(User, sp.user_id)
            if user:
                user.subscription_status = "PAID"
    else:
        if sp.user_id:
            user = await db.get(User, sp.user_id)
            if user:
                user.subscription_status = "REJECTED"
    # In-app notification (plan §4.2 — payment alerts)
    try:
        from routers.notifications import push_notification
        if decision == "verified":
            await push_notification(
                db, sp.tenant_id,
                title="تم تأكيد الدفع وتفعيل الاشتراك",
                body=f"تمت الموافقة على دفعة بقيمة {float(sp.amount):.2f} د.ل — باقة {sp.plan_name}",
                type_="payment", link="/dashboard/billing", user_id=sp.user_id,
            )
        else:
            await push_notification(
                db, sp.tenant_id,
                title="تم رفض طلب الدفع",
                body=f"رُفضت دفعة بقيمة {float(sp.amount):.2f} د.ل — راجع تفاصيل الطلب أو تواصل مع الدعم",
                type_="payment", link="/dashboard/billing", user_id=sp.user_id,
            )
    except Exception:
        pass
    await db.commit()
    return {"success": True, "data": {"ok": True, "status": decision}}
