# Response contract (Track A): private plumbing — never re-export as public API.
"""_subscription — v19 Step 1: the ONE central subscription-status source.

The v19 live-bug round proved the platform answered the question «is this
tenant already subscribed?» differently in every place that asked (or never
asked at all):

  * POST /api/subscriptions checked only for a PENDING payment — a PAID/TRIAL
    tenant could submit a brand-new subscription for the same plan (the
    «duplicate subscription» complaint);
  * POST /api/payments/topup checked nothing at all;
  * /api/me + /api/login returned the tenant *plan name* under
    ``subscriptionStatus`` (v16-E2 honest-login) but NOTHING consumed it —
    the sidebar «اشتراك» CTA rendered unconditionally and the frontend never
    persisted the state.

This module is the single derivation everyone shares. Semantics follow the
bot engine exactly (bot_engine/engine.py ``_expire_tenant_if_due``):

  * PAID / TRIAL with a future (or absent) ``plan_end`` → ACTIVE
  * PAID / TRIAL with a passed ``plan_end`` → NOT active (the engine itself
    converts those to UNPAID / EXPIRED_TRIAL at first use — the guard here
    must not let a lapsed-but-not-yet-converted row re-subscribe silently
    through a *renewal*, but a lapsed tenant IS allowed to pay again);
  * FREE / UNPAID / REJECTED / EXPIRED_TRIAL → NOT active.

Readers (auth.py login + /api/me, payments/plans.py, payments/wallet.py)
consume ``subscription_snapshot()`` / ``is_subscription_active()`` so the
six answers can never drift apart again.
"""
from __future__ import annotations

import logging
from typing import Any

from _utils import utcnow
from models import SubscriptionPayment, Tenant, User
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger("fb-subscription")

# Mirror of the engine's closed set (v16-E2 #5) — statuses that mean "this
# tenant currently enjoys a paid/trial entitlement". Deliberately NOT stored
# anywhere; this is a read-only derivation over Tenant.subscription_status.
_ACTIVE_STATUSES = frozenset({"PAID", "TRIAL"})

# The derived states exposed to the frontend (closed set, documented):
#   "active"   → paid or trial entitlement currently in force
#   "inactive" → everything else (free, unpaid, rejected, expired…)
_STATE_ACTIVE = "active"
_STATE_INACTIVE = "inactive"


def is_subscription_active(tenant: Tenant | None) -> bool:
    """True when the tenant holds a currently-valid paid/trial entitlement.

    Mirrors ``BotEngine._expire_tenant_if_due`` without its side effects: a
    passed ``plan_end`` counts as expired even before the engine has had a
    chance to convert the status (first-use conversion) — re-subscribing at
    that point is a renewal and must be allowed, which is why this function
    returns False (not active) rather than True.
    """
    if tenant is None:
        return False
    status = (tenant.subscription_status or "").upper()
    if status not in _ACTIVE_STATUSES:
        return False
    if tenant.plan_end is not None and utcnow() > tenant.plan_end:
        return False
    return True


async def get_tenant_for_user(db: AsyncSession, user: User) -> Tenant | None:
    """Load the caller's tenant row (None for platform/orphan accounts)."""
    if not user.tenant_id:
        return None
    return await db.get(Tenant, user.tenant_id)


async def subscription_snapshot(db: AsyncSession, user: User) -> dict[str, Any]:
    """The complete, serializable subscription block for a user.

    Returned fields (added to /api/me and /api/login under ``user``):
      * ``subscriptionState``   — derived closed set: "active" | "inactive"
      * ``hasActiveSubscription`` — bool twin of the above (defensive UI checks)
      * ``hasPendingSubscription`` — the user's own pending payment exists
      * ``subscriptionPlanEnd``  — ISO string or null (frontend countdowns)
    Existing ``subscriptionStatus`` (the tenant plan NAME — v16-E2) is kept
    untouched by the callers; this snapshot adds state, it does not replace
    the plan name.
    """
    tenant = await get_tenant_for_user(db, user)
    active = is_subscription_active(tenant)
    pending = False
    plan_end: str | None = None
    if tenant is not None:
        if tenant.plan_end is not None:
            plan_end = tenant.plan_end.isoformat()
        try:
            row = await db.execute(
                select(SubscriptionPayment.id).where(
                    SubscriptionPayment.user_id == user.id,
                    SubscriptionPayment.status == "pending",
                ).limit(1)
            )
            pending = row.scalars().first() is not None
        except Exception:  # pragma: no cover — snapshot must never hard-fail
            log.warning("pending-subscription probe failed (user=%s)", user.id, exc_info=True)
    return {
        "subscriptionState": _STATE_ACTIVE if active else _STATE_INACTIVE,
        "hasActiveSubscription": active,
        "hasPendingSubscription": pending,
        "subscriptionPlanEnd": plan_end,
    }


__all__ = ["is_subscription_active", "get_tenant_for_user", "subscription_snapshot"]
