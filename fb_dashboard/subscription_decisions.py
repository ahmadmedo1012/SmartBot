from __future__ import annotations
"""Subscription payment resolution — plan activation and tenant update."""
from _utils import utcnow
from datetime import timedelta


async def resolve_subscription_payment(db, payment_id: int, decision: str):
    """Verify or cancel a subscription payment. Handles plan activation."""
    from models import SubscriptionPayment, SubscriptionPlan, Tenant, User
    from sqlalchemy import select

    sp = await db.get(SubscriptionPayment, payment_id)
    if not sp or sp.status != "pending":
        return False, "الدفعة غير موجودة أو تمت معالجتها"

    sp.status = decision
    if decision == "verified":
        plan = await db.get(SubscriptionPlan, sp.plan_id)
        if plan and sp.tenant_id:
            tenant = await db.get(Tenant, sp.tenant_id)
            if tenant:
                tenant.plan_id = sp.plan_id
                tenant.subscription_status = "PAID"
                tenant.plan_start = utcnow()
                tenant.plan_end = utcnow() + timedelta(days=plan.period_days)
                tenant.plan = plan.name.lower()
        if sp.user_id:
            user = await db.get(User, sp.user_id)
            if user:
                user.subscription_status = "PAID"
                user.plan_id = sp.plan_id
        await db.commit()
        return True, "تم تفعيل الاشتراك"

    if sp.user_id:
        user = await db.get(User, sp.user_id)
        if user:
            user.subscription_status = "REJECTED"
    await db.commit()
    return True, "تم رفض طلب الاشتراك"
