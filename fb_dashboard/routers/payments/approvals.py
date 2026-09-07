"""Admin subscription approvals: list + resolve (verify/cancel).

v13-L4: split out of the former 594-line ``routers/payments.py`` monolith —
endpoint bodies moved VERBATIM.
"""
import logging
from datetime import timedelta

from _responses import ok
from _utils import iso_z, utcnow
from database import get_db
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from models import SubscriptionPayment, SubscriptionPlan, Tenant, User
from sqlalchemy import desc, select, update

from routers.auth import is_platform_admin, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["payments"])


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
            "created_at": iso_z(sp.created_at),
        })
    return ok(result)


@router.post("/api/admin/subscriptions")
async def admin_resolve_subscription(body: dict = Body(...), db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    """Admin: approve or reject a subscription payment.

    SECURITY (2026-09-05): scoped exactly like the list endpoint — tenant admins
    can only resolve payments belonging to their own tenant; the platform admin
    can resolve any. `decision` is whitelisted (was accepting arbitrary strings).
    """
    payment_id = body.get("id", 0)
    decision = body.get("status", "")
    if decision not in ("verified", "cancelled"):
        raise HTTPException(400, "القرار يجب أن يكون verified أو cancelled")
    # v9-A8: atomic claim — UPDATE ... WHERE status='pending' RETURNING
    # (generalized from the telegram pay_ path). Two admins clicking approve
    # at once: only the first UPDATE matches; the loser gets a clean 400
    # instead of double-activating the tenant plan.
    claim_conds = [SubscriptionPayment.id == int(payment_id or 0),
                   SubscriptionPayment.status == "pending"]
    if not is_platform_admin(current_user):
        claim_conds.append(SubscriptionPayment.tenant_id == current_user._tenant_id)
    result = await db.execute(
        update(SubscriptionPayment)
        .where(*claim_conds)
        .values(status=decision)
        .returning(SubscriptionPayment)
    )
    sp = result.scalar_one_or_none()
    if not sp:
        raise HTTPException(400, "الدفعة غير موجودة أو تمت معالجتها")
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
    return ok({"ok": True, "status": decision})
