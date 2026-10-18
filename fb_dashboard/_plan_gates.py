"""P21-W3-B — THE shared router-level plan-feature gate (the four open gates).

Why this module exists
----------------------
The v17-D6 surface audit (docs/audit/v17-D6-surface-gap.md §3, line 443)
inventoried the plan feature flags that were **decorative — advertised by
/api/plans and sold in the tier feature lists, but enforced nowhere**:

    has_scheduling · has_flows · has_offers · has_reports · has_analytics_advanced

Since that audit the repo closed them one at a time (max_rules v22-D3,
has_sequences v22-D4, max_team v17-E-B2, max_pages P14-P0A truth fix), each
time citing CLAUDE.md v15 Convention #5:

    «Plan limits are enforced at the point of use … a paid feature with no
     gate is a bug, not a TODO.»

P21 Wave 3 closes the four gates that still have a LIVE, sold surface:
``has_scheduling``, ``has_reports``, ``has_offers`` and
``has_analytics_advanced``. (``has_flows`` stays ungated on purpose: it is
not sold by name in any tier's feature list and has no frontend surface —
documented honestly here so it cannot silently masquerade as enforced.)

Doctrine (identical to the v22-D4 ``_enforce_has_sequences`` precedent)
-----------------------------------------------------------------------
* **ONE read point** — the tenant's entitlement is resolved through
  ``bot_engine.pipeline.get_plan_limits`` (the single plan-limits read
  point, D2-H1): ``tenant.plan_id`` → that plan; planless tenant → the
  seeded ``Free`` row; lapsed (EXPIRED_TRIAL / lapsed-UNPAID) → degraded
  to the Free row's limits; no plan rows at all → ``None``.
* **Fail-open** — a missing plan row or a NULL flag never blocks the user
  (the documented money-core doctrine: never lose a reply / a feature over
  a missing seed row or a DB hiccup).
* **403, Arabic, upgrade-shaped** — the refusal message matches the v22-D4
  sequences wording («…متاحة في خطة X أو أعلى — رقِّ خطتك») so every gated
  feature reads identically in the UI toasts and the frontend's honest
  PremiumLock state (the analytics page already ships that 403 branch —
  v17-E-F10 built it "for future honesty"; this module makes it reachable).
* **Creation-time gating only** — existing rows keep running after a
  downgrade (the "basic auto-replies stay on" doctrine, D10-H1): the
  scheduler still dispatches already-scheduled posts, publishing/ deleting/
  toggling existing resources is NOT gated — only creating NEW ones and the
  advanced-analytics READS (which are the sold surface itself).
* **No BotLog telemetry** — the router 403 answers the caller directly
  (same choice as the sequences and max_rules gates; the throttled
  money_gate_log rows are the ENGINE-side gates' doctrine, where no HTTP
  response exists to explain the refusal).

Configuration
-------------
The flags are per-PLAN database columns (``subscription_plans.has_*``),
seeded/rewritten on every boot by ``app/startup.py::_seed_subscription_plans``
(canonical values: scheduling Premium+, reports Basic+, offers Premium+,
advanced analytics Premium+). The plan a tenant is on is the configuration;
there is deliberately NO env-var override — entitlement truth must not be
forkable per-process.
"""
from __future__ import annotations

from fastapi import HTTPException

#: The ONLY flags this module may gate. An unknown flag name is a programmer
#: error and must fail LOUDLY at call time (ValueError) — never a silent
#: fail-open that would quietly re-open the gate it was supposed to close.
GATED_FLAGS = frozenset({
    "has_scheduling",
    "has_reports",
    "has_offers",
    "has_analytics_advanced",
})

#: Arabic 403 messages — same shape as the v22-D4 sequences gate message
#: («…متاحة في خطة X أو أعلى — رقِّ خطتك») so every gated surface reads the
#: same way in the error toasts. Plan names match the canonical seed
#: (startup.py: Premium = «مميز», Basic = «أساسي»).
GATE_MESSAGES: dict[str, str] = {
    "has_scheduling": "جدولة المنشورات متاحة في خطة مميز أو أعلى — رقِّ خطتك",
    "has_reports": "تقارير PDF متاحة في خطة أساسي أو أعلى — رقِّ خطتك",
    "has_offers": "العروض الترويجية متاحة في خطة مميز أو أعلى — رقِّ خطتك",
    "has_analytics_advanced": "التحليلات المتقدمة متاحة في خطة مميز أو أعلى — رقِّ خطتك",
}

#: The advanced-analytics surface per the v17-D6 definition (§3 row 8 —
#: daily-trend / heatmap / peak-hour / top-rules / period-comparison;
#: sentiment-trend and top-commenters are consumed by the BASIC mobile
#: surfaces (analytics tab + audience page) and stay open). Kept here as
#: documentation of exactly which reads the has_analytics_advanced gate covers.
ADVANCED_ANALYTICS_PATHS = (
    "/api/analytics/daily-trend",
    "/api/analytics/hourly-heatmap",
    "/api/analytics/peak-hour",
    "/api/analytics/top-rules",
    "/api/analytics/period-comparison",
)


async def enforce_plan_feature(db, tenant_id: int, flag: str) -> None:
    """Raise 403 (Arabic, upgrade-shaped) when the tenant's plan lacks ``flag``.

    The v22-D4 ``_enforce_has_sequences`` precedent, generalized so all four
    P21-W3-B gates share ONE implementation (one doctrine, one fail-open
    rule, one message shape — no silent divergence between features).

    Resolution (via get_plan_limits — the ONE plan-limits read point):
      * plan row with ``flag=False`` → 403;
      * plan row with ``flag`` NULL/missing-column or True → allowed;
      * no plan rows at all (``limits is None``) → allowed (fail-open);
      * lapsed tenant → degraded to the Free row's flags (money-core).
    """
    if flag not in GATED_FLAGS:
        raise ValueError(
            f"unknown plan-feature flag {flag!r} — gate it explicitly in "
            f"_plan_gates.GATED_FLAGS (a typo must fail loudly, never "
            f"fail-open silently)"
        )
    from bot_engine.pipeline import get_plan_limits
    from models import SubscriptionPlan

    limits = await get_plan_limits(db, tenant_id)
    if limits is None:
        return  # fail-open (no plan rows seeded) — money-core doctrine
    plan = await db.get(SubscriptionPlan, limits["plan_id"])
    has = getattr(plan, flag, None) if plan is not None else None
    if has is None or has:
        return  # flag True, or legacy NULL column — allowed
    raise HTTPException(403, GATE_MESSAGES[flag])
