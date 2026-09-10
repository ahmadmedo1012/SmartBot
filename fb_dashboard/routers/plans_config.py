from __future__ import annotations

import logging
import os
import secrets
from datetime import timedelta
from pathlib import Path

from _responses import ok
from _services import api_cache
from _utils import app_version, iso_z, utcnow
from config import settings
from database import AsyncSessionLocal, engine, get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from models import (
    AnalyticsEvent,
    BlacklistedToken,
    BotLog,
    Notification,
    RateLimitEntry,
    Reply,
    SubscriptionPayment,
    SubscriptionPlan,
    SystemConfig,
)
from sqlalchemy import delete, func, select, text, update

BASE_DIR = Path(__file__).resolve().parent.parent  # ponytail: match runner.py's BASE_DIR (fb_dashboard/)

log = logging.getLogger("fb-api")
router = APIRouter(prefix="", tags=["plans"])


@router.get("/api/plans")
@api_cache.cached(ttl=3600)  # BELOW router.get — so the cached wrapper is what gets registered
async def list_plans(db=Depends(get_db)):
    """List active subscription plans. Public—no auth required."""
    result = await db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.is_active == True).order_by(SubscriptionPlan.sort_order)
    )
    plans = result.scalars().all()
    return ok([{
        "id": p.id,
        "name": p.name,
        "name_ar": p.name_ar,
        "price": float(p.price),
        "period_days": p.period_days,
        "max_replies": p.max_replies,
        "max_pages": p.max_pages,
        "max_rules": p.max_rules,
        "max_team": p.max_team,
        "has_dm": p.has_dm,
        "has_ai": p.has_ai,
        "has_broadcast": p.has_broadcast,
        "has_scheduling": p.has_scheduling,
        "has_reports": p.has_reports,
        "has_flows": p.has_flows,
        "has_offers": p.has_offers,
        "has_sequences": p.has_sequences,
        "has_analytics_advanced": p.has_analytics_advanced,
        "features": p.features,
        "sort_order": p.sort_order,
        "is_active": p.is_active,
    } for p in plans])


# v8-A1 SECURITY allowlist: /api/config is PUBLIC (no auth) — it may only
# ever expose payment-instruction + support-contact keys. Reading "all
# non-secret rows" leaked openai/gemini API keys that were stored with
# is_secret=False before the fix in admin_routes. An explicit allowlist is
# immune to future key additions (a new SystemConfig row can never leak by
# default). Consumers: useConfig.ts → PaymentDialog / Footer /
# FloatingWhatsApp.
_PUBLIC_CONFIG_KEYS = frozenset({
    # payment instructions (/subscribe + PaymentDialog)
    # v22 (FIX-C verified ground truth — DO NOT "swap" these): the key→network
    # mapping below is CORRECT per Libya's official operator assignments
    # (Libyana prefixes 092/094 — libyana.ly transfer example `*122*092/94…`;
    # Al Madar prefixes 091/093 — wazi.almadar.ly "091/093"; en.wikipedia
    # "Telephone numbers in Libya"). Production rows (SELECT-verified
    # 2026-09-10): phone_1='0910089975' → Al Madar number under مدار ✓;
    # phone_2='0942119637' → Libyana number under ليبيانا ✓. The W1-D5
    # "swapped numbers" finding rested on the inverted prefix assumption
    # (091=Libyana) — false positive; see docs/reports/v22-rules.md §2.
    "balance_transfer_phone_1",       # مدار (أرقام المدار 091/093)
    "balance_transfer_phone_2",       # ليبيانا (أرقام ليبيانا 092/094)
    "bank_transfer_bank_name",
    "bank_transfer_account_number",
    "bank_transfer_iban",
    "mobile_wallet_cap",
    # support contact (Footer + FloatingWhatsApp)
    "support_email",
    "support_phone",
    "support_whatsapp",
    "support_working_hours",
    "whatsapp_number",
})


@router.get("/api/config")
@api_cache.cached(ttl=300)  # 5min cache — payment phones change rarely
async def public_config(db=Depends(get_db)):
    """Public platform config — payment provider phone numbers, bank details.

    Merge order (plan §2.4): SystemConfig rows (set by admin via
    POST /api/admin/config) WIN; env vars (LIBYANA_WALLET_PHONE, …) act as
    fallbacks so a fresh deployment shows working payment instructions.

    SECURITY (v8-A1): explicit allowlist only — never a "everything not
    flagged secret" read. Credential-shaped rows (AI keys, telegram token,
    FB app secret) can never appear here even if flagged non-secret by
    mistake elsewhere.
    """
    rows = await db.execute(select(SystemConfig).where(SystemConfig.key.in_(_PUBLIC_CONFIG_KEYS)))
    config: dict = {}
    for r in rows.scalars().all():
        if not r.is_secret:
            config[r.key] = r.value
    # env fallbacks — only for keys the admin hasn't set in DB
    # (same verified key→network mapping as the allowlist above: phone_2 is
    # the ليبيانا key → LIBYANA_WALLET_PHONE; phone_1 is the مدار key →
    # MADAR_WALLET_PHONE — 092/094 vs 091/093 prefixes respectively)
    env_fallbacks = {
        "balance_transfer_phone_2": settings.LIBYANA_WALLET_PHONE,   # ليبيانا
        "balance_transfer_phone_1": settings.MADAR_WALLET_PHONE,     # مدار
        "bank_transfer_bank_name": settings.BANK_TRANSFER_BANK_NAME,
        "bank_transfer_account_number": settings.BANK_TRANSFER_ACCOUNT_NUMBER,
        "bank_transfer_iban": settings.BANK_TRANSFER_IBAN,
        "mobile_wallet_cap": str(settings.MOBILE_WALLET_CAP),
    }
    for k, v in env_fallbacks.items():
        if v and not config.get(k):
            config[k] = v
    return ok(config)


@router.get("/api/public/stats")
# v14-E3 (D10 §8): كان كل تحميل لصفحة الهبوط ينفّذ COUNT تجميعيًا على كامل
# جدولي tenants/Reply (أحدها عبر كل المستأجرين) على Neon — أكثر نقطة عامة
# تعرضًا للزيارة والانطلاق البارد. المجاميع تتغير نادرًا → كاش 5 دقائق
# (نفس نمط /api/config العام أعلاه).
# أمان المفتاح: النقطة عامة بلا مصادقة ولا تخصيص مستأجر — الاستجابة
# (مجاميع منصة فقط) مطابقة لكل المستدعين، فسقوط مفتاح الكاش إلى
# "module.qualname" (بلا Request) لا يسرّب شيئًا بين مستأجرين. لا تصلح
# هذه البنية لنقاط tenant-scoped (تحذير D10 §8) — تلك تحتاج key_fn
# يضمّن هوية المستأجر.
@api_cache.cached(ttl=300)  # BELOW router.get — so the cached wrapper is what gets registered
async def public_stats(db=Depends(get_db)):
    """Public platform statistics. Aggregates only — never exposes tenant data.

    Returns:
        activeTenants — count of tenants with paid or trial subscriptions
        totalReplies — count of all bot replies ever
        activeUsers30d — count of users who logged in within the past 30 days (best-effort)
        uptimePercent — fixed 99.9 (status page assumed; replace with real probe later)
    """
    from models import Tenant
    try:
        active_tenants = await db.scalar(
            select(func.count(Tenant.id)).where(
                # v16-E2 (D4): "active" was never written by ANY code path
                # (writers use PAID/TRIAL/UNPAID/EXPIRED_TRIAL/REJECTED) — a
                # literal-only filter. Terminal set kept as PAID/TRIAL.
                Tenant.subscription_status.in_(["PAID", "TRIAL"])
            )
        ) or 0
        total_replies = await db.scalar(select(func.count(Reply.id))) or 0
    except Exception:
        # Fall back to 0 if tables missing (cold-start)
        active_tenants = 0
        total_replies = 0
    return ok({
        "activeTenants": active_tenants,
        "totalReplies": total_replies,
        "activeUsers30d": 0,
        "uptimePercent": 99.9,
    })


@router.get("/api/public/testimonials")
async def public_testimonials():
    """Public testimonials. Returns an empty list until real customer quotes are collected.

    The landing page hides the section if this returns [] — never shows fake reviews.
    """
    return ok([])


@router.get("/healthz")
async def healthz():
    checks = {"ok": True}
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
        async with AsyncSessionLocal() as session:
            plan_count = await session.scalar(select(func.count(SubscriptionPlan.id))) or 0
            checks["plans"] = plan_count
    except Exception as e:
        # 503 (was: 200 with ok=false) — uptime monitors now actually see outages.
        # v12-E2.5: root cause goes to SERVER LOGS only — the old
        # checks["error"] = str(e) leaked internal exception text (table names,
        # driver paths) to an unauthenticated public endpoint.
        # v12-E3.7(b) (handed to E2 — the healthz check is router-local):
        # capture to Sentry (never raises, no-op when SENTRY_DSN is off) so
        # the outage is visible in the error tracker, not just the logs.
        log.exception("healthz database check failed")
        from _observability import capture_exception
        capture_exception(e)
        checks["database"] = "unreachable"
        checks["ok"] = False
    checks["version"] = app_version()
    checks["timestamp"] = iso_z(utcnow())
    checks["uptime"] = None
    checks["env"] = "production" if not settings.DEBUG else "development"
    status_code = 200 if checks["ok"] else 503
    # v12-E2.13: PERMANENT infra exemption (documented in _responses.py) —
    # uptime monitors need a stable 200/503 + {success, data: checks} body;
    # this is NOT part of the ok() unification (D4 decision).
    return JSONResponse(status_code=status_code, content={"success": checks["ok"], "data": checks})


# v12-E2.8: GET /api/env REMOVED — dead route (zero consumers in src/tests/
# vercel.json; env facts are served by /api/diagnostics/status for the
# platform admin). v13-E8 (S2): the stale "/api/env" entry was dropped from
# app/middleware.py _CACHEABLE_API_PREFIXES too — the prefix no longer
# matches anything, so both sides are clean now.


# NOTE (phase D cleanup): the duplicate /api/system/stats and second
# /api/public/stats that used to live here were DEAD ROUTES — shadowed by
# routers/dashboard_stats.py which registers first. Removed to avoid the
# exact class of first-registration-wins confusion that hid the real
# /api/support/ticket behind a plans_config stub.


# ── v22 §0.3 — deployment verification gate ──────────────────────────────────


def _deploy_commit_sha() -> str:
    """The exact code identity this serverless instance is running.

    Two sources, tried in order:
      1. ``VERCEL_GIT_COMMIT_SHA`` — injected into the function runtime for
         git-connected deployments (the normal case: push to main).
      2. ``fb_dashboard/COMMIT_SHA`` — baked at BUILD time by vercel.json's
         buildCommand (``printf %s $VERCEL_GIT_COMMIT_SHA > COMMIT_SHA``).
         Belt-and-suspenders for CLI/``--prebuilt`` deployments where the
         runtime env var may be absent but the build saw it.
    Empty string means "not a git deployment" (local dev, tests) — callers
    render ``unknown`` rather than inventing a value.
    """
    sha = os.getenv("VERCEL_GIT_COMMIT_SHA", "").strip()
    if sha:
        return sha
    try:
        return (BASE_DIR / "COMMIT_SHA").read_text(encoding="utf-8").strip()
    except Exception:
        return ""


@router.get("/api/version")
async def api_version():
    """v22 §0.3 — PUBLIC deployment verification gate (same trust level as
    /healthz: no credentials, no tenant data — only code identity).

    Post-deploy gate contract (docs/deployment.md v22): after every deploy,
    curl this on the production domain and compare ``commit_sha`` to the
    local ``git rev-parse HEAD``. A mismatch (or ``unknown``) means the
    newest deployment was never promoted to the production alias — the
    exact class of the 2026-09-10 403 incident ("Ready" previews while an
    older deployment kept serving the domain). No deploy may be called
    successful until this check passes.

    Deliberately NOT in the cacheable API prefixes (app/middleware.py): the
    CDN holding a previous deployment's answer for s-maxage seconds would
    defeat the gate right after an alias switch.
    """
    sha = _deploy_commit_sha()
    return ok(
        {
            "version": app_version(),
            "commit_sha": sha or "unknown",
            "commit_sha_short": sha[:8] if sha else "unknown",
            "git_ref": os.getenv("VERCEL_GIT_COMMIT_REF", "").strip() or None,
            "deployment_env": os.getenv("VERCEL_ENV", "").strip() or None,
            "region": os.getenv("VERCEL_REGION", "").strip() or None,
            "timestamp": iso_z(utcnow()),
        }
    )


# ── Internal cron endpoints (protected by CRON_SECRET) ──────────────────────────

CRON_SECRET = os.getenv("CRON_SECRET", "")


@router.api_route("/api/cron/cleanup-logs", methods=["GET", "POST"])
async def cleanup_old_logs(request: Request):
    """Delete BotLog entries older than 30 days, expired RateLimitEntry rows,
    expired blacklisted JWTs, analytics events older than 90 days, READ
    notifications older than 90 days, and receipt ``data:`` URLs on payments
    that reached a terminal status more than 30 days ago. Vercel Cron calls
    this daily at 03:00 UTC via vercel.json config.

    v15-E3 (D9-H1): the route was POST-only while Vercel Cron issues a GET —
    every daily cleanup answered 405 and the log tables grew unbounded. Both
    methods are now served.

    SECURITY (2026-09-05): the old `token != CRON_SECRET` with an unset secret
    failed OPEN ("" != "" is False → unauthenticated deletes). Now an empty
    secret never validates, comparison is constant-time, and the
    Authorization: Bearer header (what Vercel Cron actually sends) is the
    primary gate.

    v16-E2 (D2-LEAD B): the ``?token=`` query-param fallback is REMOVED — it
    leaked CRON_SECRET into access/proxy logs and the only consumer that ever
    used it (the cron-job.org channel) is documented DEAD (dec-cron-restore).
    The POST form-token path stays (a request body is never logged).

    v16-E2 (D6 receipt retention / E2-م7): every step is idempotent — rows
    that were already cleaned no longer match their WHERE clause, so the
    daily cron can crash and re-run any number of times safely.
    """
    auth_header = request.headers.get("authorization", "")
    # POST keeps accepting the legacy form body token (test_schema_reconcile
    # + any scripted caller); GET never carries a form.
    token = ""
    if request.method == "POST":
        try:
            form = await request.form()
            token = str(form.get("token") or "")
        except Exception:
            token = ""

    valid = bool(CRON_SECRET) and secrets.compare_digest(auth_header, f"Bearer {CRON_SECRET}")
    if not valid and CRON_SECRET and token and secrets.compare_digest(token, CRON_SECRET):
        valid = True
    if not valid:
        raise HTTPException(403, "وصول غير مصرح به لمهام الجدولة")
    async with AsyncSessionLocal() as db:
        cutoff = utcnow() - timedelta(days=30)
        deleted_logs = await db.execute(
            delete(BotLog).where(BotLog.created_at < cutoff)
        )
        deleted_rates = await db.execute(
            delete(RateLimitEntry).where(RateLimitEntry.window_end < utcnow())
        )
        deleted_blacklist = await db.execute(
            delete(BlacklistedToken).where(BlacklistedToken.expires_at < utcnow())
        )
        # ── v16-E2 (E2-م7) retention steps ─────────────────────────────────
        # Raw analytics events are INPUT to aggregates, not user-revisitable
        # records; dashboard trends read a 30-day window, so 90d is safely
        # past anything ever served.
        cutoff_90d = utcnow() - timedelta(days=90)
        deleted_analytics = await db.execute(
            delete(AnalyticsEvent).where(AnalyticsEvent.created_at < cutoff_90d)
        )
        # READ notifications older than 90d are dead feed weight; UNREAD ones
        # stay (the badge contract — a user must still see what they missed).
        deleted_read_notifs = await db.execute(
            delete(Notification).where(
                Notification.read == True,  # noqa: E712 — SQLAlchemy filter idiom
                Notification.created_at < cutoff_90d,
            )
        )
        # Receipt ``data:`` URLs (base64 payloads, sometimes hundreds of KB per
        # row on Vercel uploads) on payments that reached a TERMINAL status
        # (verified/cancelled — the only writers) more than 30d ago: the admin
        # review that needed the receipt is long over. Surgical JSON edit —
        # ONLY the receipt_url key is dropped and only when it is a data: URL
        # (https receipts live in external storage; /static ones on disk);
        # every other extra_data field (username, sender info) survives.
        # SubscriptionPayment has no updated_at column, so "terminal for >30d"
        # is bounded by created_at — terminal status is always reached AFTER
        # creation, so this never strips early, only possibly late
        # (conservative in the right direction).
        stripped_receipts = 0
        pay_rows = await db.execute(
            select(SubscriptionPayment.id, SubscriptionPayment.extra_data).where(
                SubscriptionPayment.status.in_(("verified", "cancelled")),
                SubscriptionPayment.created_at < cutoff,
            )
        )
        for pay_id, extra in pay_rows.all():
            if not isinstance(extra, dict):
                continue
            receipt = extra.get("receipt_url")
            if not isinstance(receipt, str) or not receipt.startswith("data:"):
                continue
            try:
                cleaned = dict(extra)
                cleaned.pop("receipt_url", None)
                await db.execute(
                    update(SubscriptionPayment)
                    .where(SubscriptionPayment.id == pay_id)
                    .values(extra_data=cleaned)
                )
                stripped_receipts += 1
            except Exception:
                log.warning("receipt strip failed for payment %s (non-fatal)",
                            pay_id, exc_info=True)
        await db.commit()
        return ok({
            "deleted_bot_logs": deleted_logs.rowcount,
            "deleted_rate_limits": deleted_rates.rowcount,
            "deleted_blacklisted_tokens": deleted_blacklist.rowcount,
            "deleted_analytics_events": deleted_analytics.rowcount,
            "deleted_read_notifications": deleted_read_notifs.rowcount,
            "stripped_receipt_urls": stripped_receipts,
        })
