"""Shared state & helpers extracted from runner.py for router modules."""
from __future__ import annotations

import json
import logging
import os
from contextvars import ContextVar
from datetime import datetime, timedelta

from _async import spawn  # v9-A11: GC-safe background tasks
from _crypto import decrypt_token  # re-export: routers import it from here
from _crypto import encrypt_token as encrypt_token
from _lazy import lazy
from _utils import utcnow
from bot import BotEngine
from config import settings
from database import AsyncSessionLocal
from sqlalchemy import func, select

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("fb-api")

_post_cursors: dict[int, str] = {}

# Lazy engine proxies
fb = lazy(lambda: __import__('fb_client', fromlist=['FBClient']).FBClient(
    settings.FACEBOOK_ACCESS_TOKEN, settings.FACEBOOK_PAGE_ID))


def has_global_fb_credentials() -> bool:
    """v10-B3 — True when the legacy single-tenant env credentials exist.

    Callers must check this BEFORE any Graph call through the global ``fb``
    client (constructed above): in multi-tenant production both env values
    are empty, and every call through the tokenless client was a wasted
    100-600ms round-trip + ERROR log line per dashboard load (G7 §2.4).
    Stats routes answer null fan_count instead — zero network. A page id of
    "0" is the canonical "no page" marker (tests/seed conventions), so it
    counts as unconfigured too."""
    token = (settings.FACEBOOK_ACCESS_TOKEN or "").strip()
    page = str(settings.FACEBOOK_PAGE_ID or "").strip()
    return bool(token) and bool(page) and page != "0"


broadcast_engine = lazy(lambda: __import__('broadcast_engine', fromlist=['BroadcastEngine']).BroadcastEngine(fb))
subscriber_engine = lazy(lambda: __import__('subscriber_engine', fromlist=['SubscriberEngine']).SubscriberEngine())
tag_engine = lazy(lambda: __import__('subscriber_engine', fromlist=['TagEngine']).TagEngine())
analytics_engine = lazy(lambda: __import__('analytics_engine', fromlist=['AnalyticsEngine']).AnalyticsEngine())
pdf_engine = lazy(lambda: __import__('pdf_reports_engine', fromlist=['PdfReportsEngine']).PdfReportsEngine())
content_calendar_engine = lazy(lambda: __import__('content_calendar', fromlist=['ContentCalendarEngine']).ContentCalendarEngine(fb))
team_engine = lazy(lambda: __import__('team_engine', fromlist=['TeamEngine']).TeamEngine())
commerce_engine = lazy(lambda: __import__('commerce_engine', fromlist=['CommerceEngine']).CommerceEngine())
api_cache = lazy(lambda: __import__('api_cache', fromlist=['APICache']).APICache())


# ── v14-E2 (C-ENG1 / D06 #1): per-request publisher engines ────────────────────

def get_publisher_engine():
    """Fresh, request-scoped PublisherEngine (v14-E2 C-ENG1).

    The old module-level ``_publisher`` lazy singleton was ONE mutable object
    shared by every tenant: ``load_credentials`` replaced ``self.x``/
    ``self.linkedin`` with the LAST tenant to load, then ``publish`` awaited
    after that — a concurrent tenant-B load between tenant-A's load and
    publish made A's post go out with B's account credentials. Every caller
    now builds its own engine and loads ITS tenant's credentials inside the
    same request (the same per-tenant shape broadcast_engine adopted in
    v4 §3.8): instance state is request-local by construction, so there is
    nothing left to leak across tenants.
    """
    from publisher_engine import PublisherEngine
    return PublisherEngine()


class _TenantPublisherProxy:
    """Legacy ``_publisher`` shim (v14-E2 C-ENG1).

    ``routers/analytics.py`` (outside E2 ownership) still drives the shared
    ``_publisher`` symbol with the historical two-step shape:
    ``load_credentials(db, tenant_id)`` → ``publish_to_platform(...)``. A plain
    singleton would keep the cross-tenant window open there, so the shim keeps
    the call shape while scoping the loaded engine to the CURRENT async task
    via ContextVar: each request/task sees only the engine it loaded itself.
    New code must use :func:`get_publisher_engine` (fresh per request).
    """

    def __init__(self):
        self._ctx: ContextVar = ContextVar("smartbot_publisher_engine", default=None)

    async def load_credentials(self, db_session, tenant_id: int = 0):
        engine = get_publisher_engine()
        await engine.load_credentials(db_session, tenant_id=tenant_id)
        self._ctx.set(engine)

    def __getattr__(self, name):
        engine = self._ctx.get()
        if engine is None:
            # No load_credentials in this task → unconfigured fresh engine
            # (publish_to_platform then refuses per its own guard).
            engine = get_publisher_engine()
        return getattr(engine, name)


_publisher = _TenantPublisherProxy()


# ── v14-E2 (D06 #4): tenant-scoped SequenceScheduler engine ────────────────────

class _TenantSequenceEngineProxy:
    """Per-tenant dispatcher for the sequence scheduler loop (v14-E2, D06 #4).

    The background ``SequenceScheduler`` (started in app/startup.py outside
    Vercel) used to run on the platform-wide engine: ``self.fb`` was the env
    client (empty in multi-tenant production → every send failed) and a
    failing step was retried every 60s forever. The proxy keeps the engine
    surface the scheduler already calls but:

    - ``get_due_subscriptions`` annotates each due dict with its
      ``tenant_id`` (from the SequenceSubscription row — same session);
    - ``process_due_step`` resolves the tenant's own FB client via
      ``get_tenant_fb_client`` (BotState) and runs a FRESH SequenceEngine for
      the call — no shared mutable state;
    - tenants without connected credentials are SKIPPED (no send attempt,
      subscription stays active — it publishes once the page is connected);
    - send failures are capped (MAX_SEND_ATTEMPTS): after the cap the
      subscription is marked ``failed`` so the loop stops retrying it.

    CRUD methods (list/get/create/subscribe/…) are forwarded untouched to a
    lazily-built base engine — routes never touch the send path.
    """

    MAX_SEND_ATTEMPTS = 3

    def __init__(self):
        self._base = None
        self._attempts: dict[int, int] = {}  # sub_id → consecutive send failures

    def _engine(self):
        if self._base is None:
            from sequence_engine import SequenceEngine
            self._base = SequenceEngine(fb)
        return self._base

    def __getattr__(self, name):
        return getattr(self._engine(), name)

    async def get_due_subscriptions(self, session) -> list[dict]:
        due = await self._engine().get_due_subscriptions(session)
        if not due:
            return due
        from models import SequenceSubscription
        rows = await session.execute(
            select(SequenceSubscription.id, SequenceSubscription.tenant_id).where(
                SequenceSubscription.id.in_([d["sub_id"] for d in due])
            )
        )
        tenant_map = dict(rows.all())
        for item in due:
            item["tenant_id"] = tenant_map.get(item["sub_id"]) or 0
        return due

    async def process_due_step(self, due: dict, session) -> bool:
        tid = int(due.get("tenant_id") or 0)
        client = await get_tenant_fb_client(tid)
        if client is None:
            # No connected page for this tenant: skip (cheap DB check, no
            # Graph call, no state change) — never an infinite send loop.
            log.debug("Sequence step skipped: tenant %s has no FB credentials", tid)
            return False
        from sequence_engine import SequenceEngine
        engine = SequenceEngine(client)  # fresh — no shared mutable state
        sent = await engine.process_due_step(due, session)
        if sent:
            self._attempts.pop(due["sub_id"], None)
            return True
        failures = self._attempts.get(due["sub_id"], 0) + 1
        self._attempts[due["sub_id"]] = failures
        if failures >= self.MAX_SEND_ATTEMPTS:
            await self._fail_subscription(session, due, tid,
                                          reason=f"فشل إرسال الخطوة بعد {self.MAX_SEND_ATTEMPTS} محاولات")
        return False

    async def _fail_subscription(self, session, due: dict, tid: int, reason: str) -> None:
        from models import SequenceSubscription
        sub = await session.get(SequenceSubscription, due["sub_id"])
        if sub is not None:
            sub.status = "failed"
            sub.completed_at = utcnow()
        self._attempts.pop(due["sub_id"], None)
        log.warning(
            "Sequence subscription %s (tenant %s) marked failed: %s",
            due.get("sub_id"), tid, reason,
        )
        try:
            await session.commit()
        except Exception:
            await session.rollback()
            log.exception("Failed to persist sequence failure for sub %s", due.get("sub_id"))


sequence_engine = _TenantSequenceEngineProxy()


# ── v14-E2 (D06 #3): per-tenant FlowEngine dispatch ────────────────────────────

class _PerTenantFlowEngineProxy:
    """Tenant-correct FlowEngine dispatcher (v14-E2, D06 #3).

    ``routers/flows.py`` calls ``flow_engine.execute(flow_id, ctx, db)`` after
    its own tenant-scoped 404 check. The old module-level engine was built
    with ``tenant_id=0`` → ``load_flow`` filtered ``Flow.tenant_id == 0`` and
    EVERY tenant's ``POST /api/flows/{id}/test`` answered ``flow_not_found``
    (dead journey). The proxy infers the flow's owning tenant from the row
    itself (same session), then executes on a fresh FlowEngine scoped to that
    tenant with the tenant's own FB client (legacy env client as fallback).
    """

    async def execute(self, flow_id: int, ctx, session) -> dict:
        from models import Flow
        tenant_id = await session.scalar(
            select(Flow.tenant_id).where(Flow.id == flow_id)
        )
        if tenant_id is None:
            # Unknown/foreign id — the route already 404'd scoped rows, so
            # reaching here means the id exists for nobody: keep the engine's
            # historical action contract.
            return {"action": "flow_not_found", "flow_id": flow_id}
        client = await get_tenant_fb_client(tenant_id)
        if client is None:
            # Legacy fallback: platform-wide env client (empty token in
            # multi-tenant prod — MESSAGE node sends then fail visibly in the
            # trace instead of a silent dead path).
            client = fb
        from flow_engine import FlowEngine
        engine = FlowEngine(client, tenant_id=tenant_id)
        return await engine.execute(flow_id, ctx, session)

    def __getattr__(self, name):
        # Forward any future engine surface to a tenant-0 base engine.
        from flow_engine import FlowEngine
        return getattr(FlowEngine(fb), name)


flow_engine = _PerTenantFlowEngineProxy()

# AI service
_ai_service = None

def get_ai():
    global _ai_service
    if _ai_service is None:
        from ai_service import AIService
        _ai_service = AIService()
        if not _ai_service.available:
            log.info("AI Service: no provider configured (set OPENAI_API_KEY or GEMINI_API_KEY)")
    return _ai_service

async def refresh_ai_from_db() -> None:
    """v4 §5.20 — AI keys from SystemConfig (DB-first, env fallback).

    The owner sets openai_api_key/gemini_api_key/openai_base_url/ai_model in
    /admin/settings; AI endpoints call this before use so a saved key takes
    effect on the next request without a redeploy."""
    global _ai_service
    try:
        from database import AsyncSessionLocal
        from models import SystemConfig
        from sqlalchemy import select as _select
        keys = {}
        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                _select(SystemConfig).where(SystemConfig.key.in_([
                    "openai_api_key", "openai_base_url", "gemini_api_key", "ai_model",
                ])))
            for r in rows.scalars().all():
                if r.value:
                    keys[r.key] = r.value
    except Exception:
        return
    import os as _os
    changed = False
    env_map = {
        "openai_api_key": "OPENAI_API_KEY",
        "openai_base_url": "OPENAI_BASE_URL",
        "gemini_api_key": "GEMINI_API_KEY",
        "ai_model": "AI_MODEL",
    }
    for cfg_key, env_key in env_map.items():
        val = keys.get(cfg_key)
        if val and val != _os.getenv(env_key):
            _os.environ[env_key] = val
            changed = True
    if changed:
        import ai_service as _mod
        _mod._openai = None   # reset lazy providers
        _mod._google = None
        _ai_service = None    # rebuilt by the next get_ai()

# Bot engine — per-tenant dict registry (same pattern as _get_ctx/_get_offer)
_bot_engines: dict[int, BotEngine] = {}
_bot_engine_lock = __import__('threading').RLock()

def get_bot_engine(fb_client=None, tenant_id: int = 0) -> BotEngine:
    """Per-tenant BotEngine registry (plan §1.3 — webhook tenant routing).

    - Same tenant → SAME engine instance, so dedup cache, cooldown and rule
      cache are shared between the background loop and the webhook handler.
      (A new instance per call loses dedup state → duplicate replies.)
    - A different fb_client (e.g. refreshed token) is swapped onto the existing
      engine so per-tenant state survives token/page rotation.
    """
    global _bot_engines
    with _bot_engine_lock:
        engine = _bot_engines.get(tenant_id)
        if engine is None:
            engine = BotEngine(fb_client, tenant_id=tenant_id)
            _bot_engines[tenant_id] = engine
        elif fb_client is not None and engine.fb is not fb_client:
            engine.fb = fb_client  # token/page rotation — keep engine state
        return engine

def reset_bot_engines():
    """Reset all BotEngine instances (used during test teardown / tenant deactivation)."""
    global _bot_engines
    with _bot_engine_lock:
        _bot_engines.clear()

async def get_tenant_fb_client(tenant_id: int):
    """Resolve the tenant's own FB client from BotState (v4 §3.8 pattern).

    v14-E2: DB failures return None (with a warning) instead of raising —
    callers treat None as "tenant not connected" (400/حذف تخطٍّ) rather than
    a 500, and the schedulers' per-cycle resolution can't crash the loop.
    """
    try:
        async with AsyncSessionLocal() as db:
            row = await db.execute(
                select(BotState).where(BotState.tenant_id == tenant_id, BotState.key == "fb_page_id")
            )
            page_id_bs = row.scalar_one_or_none()
            row = await db.execute(
                select(BotState).where(BotState.tenant_id == tenant_id, BotState.key == "fb_access_token")
            )
            token_bs = row.scalar_one_or_none()
    except Exception as exc:
        log.warning("get_tenant_fb_client: DB lookup failed for tenant %s: %s", tenant_id, exc)
        return None
    if not page_id_bs or not token_bs or not token_bs.value:
        return None
    try:
        token = decrypt_token(token_bs.value)
    except Exception:
        return None
    return __import__('fb_client', fromlist=['FBClient']).FBClient(token, page_id_bs.value or "")

# Trend helper
async def _get_trend_data(db, tenant_id: int) -> dict:
    now = utcnow()
    today_start = datetime(now.year, now.month, now.day, tzinfo=now.tzinfo)
    yesterday_start = today_start - timedelta(days=1)
    week_start = now - timedelta(days=7)
    prior_week_start = now - timedelta(days=14)
    today_replies = await db.scalar(select(func.count(Reply.id)).where(
        Reply.tenant_id == tenant_id, Reply.created_at >= today_start,
    )) or 0
    yesterday_replies = await db.scalar(select(func.count(Reply.id)).where(
        Reply.tenant_id == tenant_id,
        Reply.created_at >= yesterday_start, Reply.created_at < today_start,
    )) or 0
    week_replies = await db.scalar(select(func.count(Reply.id)).where(
        Reply.tenant_id == tenant_id, Reply.created_at >= week_start,
    )) or 0
    prior_week_replies = await db.scalar(select(func.count(Reply.id)).where(
        Reply.tenant_id == tenant_id,
        Reply.created_at >= prior_week_start, Reply.created_at < week_start,
    )) or 0
    return {
        "today": round((today_replies - yesterday_replies) / yesterday_replies * 100, 1)
        if yesterday_replies else (100 if today_replies else 0),
        "week": round((week_replies - prior_week_replies) / prior_week_replies * 100, 1)
        if prior_week_replies else (100 if week_replies else 0),
    }

# Prevent circular import — Reply model imported lazily
from models import BotState, Reply


# Event tracking
def _track_event(event_type: str, metadata: dict | None = None, tenant_id: int = 0):
    from models import AnalyticsEvent
    async def _write():
        try:
            async with AsyncSessionLocal() as s:
                ev = AnalyticsEvent(event_type=event_type, metadata_json=json.dumps(metadata or {}, ensure_ascii=False))
                if tenant_id:
                    ev.tenant_id = tenant_id
                s.add(ev)
                await s.commit()
        except Exception:
            pass
    spawn(_write())
    return

# Webhook constants
WEBHOOK_VERIFY_TOKEN = os.getenv("FB_WEBHOOK_VERIFY_TOKEN", "")
WEBHOOK_APP_SECRET = os.getenv("FACEBOOK_APP_SECRET", "")
