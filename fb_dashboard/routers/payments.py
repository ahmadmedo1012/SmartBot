"""Payment & subscription routes: topup, confirm, balance, history, subscriptions."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, HTTPException, Body
from sqlalchemy import select, func, desc, update

from _utils import utcnow
from config import settings
from database import get_db
from models import PaymentRequest, BotState, SubscriptionPlan, SubscriptionPayment, Tenant, User, SystemConfig
from routers.auth import get_current_user, require_role
from telegram_bot import notify_admins_new_payment, notify_admins_new_subscription

log = logging.getLogger("fb-api")
router = APIRouter(tags=["payments"])


@router.post("/api/payments/topup")
async def payment_topup(body: dict = Body(...), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    amount = body.get("amount", 0)
    provider = body.get("provider", "")
    phone = body.get("phone", "")
    if amount < 1 or amount > 10000:
        raise HTTPException(400, "المبلغ غير صالح (1-10000)")
    if provider not in ("liyana", "madar"):
        raise HTTPException(400, "مزود الدفع غير صالح")
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
    return {"payment_id": pr.id, "instructions": instructions}


@router.post("/api/payments/confirm")
async def payment_confirm(body: dict = Body(...), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """User submits transfer reference — marks pending for admin approval."""
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
    return {"ok": True, "message": "تم استلام رقم الحوالة، في انتظار موافقة الأدمن"}


@router.get("/api/payments/balance")
async def payment_balance(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = await db.execute(
        select(BotState).where(BotState.tenant_id == current_user._tenant_id, BotState.key == "balance")
    )
    bs = existing.scalar_one_or_none()
    balance = int(bs.value) if bs and bs.value else 0
    return {"balance": balance, "currency": "LYD"}


@router.get("/api/payments/history")
async def payment_history(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = await db.execute(
        select(PaymentRequest)
        .where(PaymentRequest.tenant_id == current_user._tenant_id)
        .order_by(desc(PaymentRequest.created_at))
    )
    return [
        {"payment_id": r.id, "amount": float(r.amount) if r.amount is not None else 0, "provider": r.provider,
         "phone": r.phone, "reference": r.reference, "status": r.status,
         "note": r.note, "created_at": r.created_at.isoformat() if r.created_at else None}
        for r in rows.scalars().all()
    ]


@router.post("/api/subscriptions/validate")
async def validate_subscription(body: dict = Body(...), db=Depends(get_db)):
    """Pre-flight: check username + slug uniqueness."""
    username = body.get("username", "")
    if len(username) < 3:
        raise HTTPException(400, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل")
    existing_user = await db.execute(select(User).where(User.username == username))
    if existing_user.scalar_one_or_none():
        return {"valid": False, "error": "اسم المستخدم موجود مسبقاً"}
    return {"valid": True}


@router.post("/api/subscriptions")
async def create_subscription(body: dict = Body(...), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Create payment request for new subscription. Notifies Telegram admins."""
    phone = body.get("phone", "")
    amount = body.get("amount", 0)
    provider = body.get("provider", "libyana")
    plan_id = body.get("plan_id", 0)

    if not phone or len(phone) < 7:
        raise HTTPException(400, "رقم الهاتف غير صالح")
    plan = await db.get(SubscriptionPlan, plan_id)
    if not plan or not plan.is_active:
        raise HTTPException(400, "الباقة غير موجودة")
    if float(amount) != float(plan.price):
        raise HTTPException(400, "المبلغ غير مطابق لسعر الباقة")
    if provider not in ("libyana", "madar"):
        raise HTTPException(400, "مزود الدفع غير صالح")

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
        phone=phone,
        amount=amount,
        provider=provider,
        plan_id=plan_id,
        plan_name=plan.name_ar,
        status="pending",
        extra_data={"username": current_user.username},
    )
    db.add(sp)
    await db.commit()
    await db.refresh(sp)

    asyncio.create_task(
        notify_admins_new_subscription(sp.id, current_user.username, float(amount), provider, phone, plan.name_ar)
    )

    return {"payment_id": sp.id, "status": "pending", "message": "تم إنشاء طلب الدفع"}


@router.get("/api/subscriptions/status")
async def subscription_status(payment_id: int = Query(...), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Poll payment status — used by frontend instead of SSE."""
    sp = await db.get(SubscriptionPayment, payment_id)
    if not sp or sp.user_id != current_user.id:
        raise HTTPException(404, "الدفعة غير موجودة")
    return {"id": sp.id, "status": sp.status, "plan_id": sp.plan_id, "plan_name": sp.plan_name}


@router.post("/api/subscriptions/upgrade")
async def upgrade_subscription(body: dict = Body(...), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Upgrade existing subscription to higher plan."""
    plan_id = body.get("plan_id", 0)
    phone = body.get("phone", "")
    provider = body.get("provider", "libyana")

    new_plan = await db.get(SubscriptionPlan, plan_id)
    if not new_plan or not new_plan.is_active:
        raise HTTPException(400, "الباقة غير موجودة")

    tenant = await db.get(Tenant, current_user._tenant_id)
    if not tenant:
        raise HTTPException(400, "الحساب غير موجود")
    if tenant.plan_id and tenant.plan_id >= plan_id:
        raise HTTPException(400, "هذه الباقة أقل أو تساوي باقتك الحالية")

    existing_pending = await db.execute(
        select(SubscriptionPayment).where(
            SubscriptionPayment.user_id == current_user.id,
            SubscriptionPayment.status == "pending"
        )
    )
    if existing_pending.scalar_one_or_none():
        raise HTTPException(400, "لديك طلب ترقية معلق")

    sp = SubscriptionPayment(
        user_id=current_user.id,
        tenant_id=current_user._tenant_id,
        phone=phone,
        amount=float(new_plan.price),
        provider=provider,
        plan_id=plan_id,
        plan_name=new_plan.name_ar,
        status="pending",
        extra_data={"username": current_user.username, "upgrade": True},
        upgraded_from=tenant.plan_id,
    )
    db.add(sp)
    await db.commit()
    await db.refresh(sp)

    asyncio.create_task(
        notify_admins_new_subscription(sp.id, current_user.username, float(new_plan.price), provider, phone, new_plan.name_ar)
    )

    return {"payment_id": sp.id, "status": "pending"}


@router.get("/api/admin/subscriptions")
async def admin_list_subscriptions(status: str = Query("pending"), page: int = Query(1, ge=1), db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    """Admin: list subscription payments with filtering."""
    q = select(SubscriptionPayment)
    if status != "all":
        q = q.where(SubscriptionPayment.status == status)
    q = q.order_by(desc(SubscriptionPayment.created_at)).offset((page - 1) * 20).limit(20)
    rows = await db.execute(q)
    return [{
        "id": sp.id, "user_id": sp.user_id, "tenant_id": sp.tenant_id,
        "phone": sp.phone, "amount": float(sp.amount), "provider": sp.provider,
        "plan_id": sp.plan_id, "plan_name": sp.plan_name, "status": sp.status,
        "metadata": sp.extra_data,
        "created_at": sp.created_at.isoformat() if sp.created_at else None,
    } for sp in rows.scalars().all()]


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
    await db.commit()
    return {"ok": True, "status": decision}
