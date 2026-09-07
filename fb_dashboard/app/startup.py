from __future__ import annotations

"""Application lifespan + DB seeding extracted from runner.py (v11-A1).

Dependency direction: runner.py imports ``lifespan`` from HERE (no import-time
cycle). The one piece of runner-owned runtime state — the background bot task
handle ``runner._bot_task`` — is touched via a deferred (function-body)
``import runner``, the same idiom routers/bot.py, dashboard_stats.py and
health_alerts_routes.py already use: the canonical handle must stay on the
runner module because those routers read and write it there.
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path

from _async import spawn  # v9-A11: GC-safe background tasks
from _schema_reconcile import reconcile_schema as _reconcile_schema
from _utils import utcnow
from config import settings
from database import AsyncSessionLocal, engine
from event_bus import event_bus
from fastapi import FastAPI
from models import Base, Reply, Rule, SubscriptionPlan, Tenant
from sqlalchemy import func, select
from ws_manager import ws_manager

from app.telegram import _run_bot_loop

# Lazy AI import — single source of truth in _services.py
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("fb-api")

# ── Engine proxies: single source of truth in _services.py ──
from _services import content_calendar_engine, fb, sequence_engine

# ponytail: detect Vercel to skip long-running background tasks
_IS_VERCEL = bool(os.getenv("VERCEL"))


class SecurityConfigError(RuntimeError):
    """v12-E3.5 — fail-fast guard for unsafe production configuration.

    Raised by the lifespan's SECRET_KEY check. Subclasses RuntimeError (the
    guard's historical class) but is EXEMPT from the lifespan's catch-all
    "app continues" except: a default production SECRET_KEY must crash the
    process, not boot a forgeable-token server that only logs a warning.
    """


# fb_dashboard/ — this module lives one level deeper than the old runner.py
BASE_DIR = Path(__file__).resolve().parent.parent


async def seed_admin(db):
    # Deprecated shim — the canonical implementation moved to _bootstrap.py
    # (secure random default). Kept so old imports keep working; new code
    # imports from _bootstrap directly.
    from _bootstrap import seed_admin as _seed
    await _seed(db)


def _read_dm_json_rules() -> dict[str, str]:
    """Blocking file read for _seed_dm_templates — executed via
    asyncio.to_thread (v10-F1, ASYNC230/240): exists()/open()/json.load()
    must stay off the event loop inside the async startup path."""
    json_path = BASE_DIR / "facebook_automation.json"
    if not json_path.exists():
        return {}
    with open(json_path, encoding='utf-8') as f:
        data = json.load(f)
    return {r.get("name", ""): r.get("dm_template", "") for r in data.get("rules", [])}


async def _seed_dm_templates(db):
    """Copy dm_template from JSON to DB rows where DB dm_template is empty."""
    try:
        json_rules = await asyncio.to_thread(_read_dm_json_rules)
    except Exception:
        return
    if not json_rules:
        return
    # ponytail: local imports — already at module level, kept for clarity
    result = await db.execute(select(Rule))
    for rule in result.scalars().all():
        if not rule.dm_template and rule.name in json_rules:
            rule.dm_template = json_rules[rule.name]
    await db.commit()
    log.info("DM templates seeded from JSON")


async def _seed_subscription_plans(db):
    """Seed canonical subscription plans. Idempotent UPSERT by name.

    Legacy DBs (pre-rebuild era) already hold 5 rows with the OLD schema —
    after _schema_reconcile adds the missing columns those rows need the
    canonical values (name_ar, price, has_* flags, features, ...), otherwise
    /api/plans would serve half-empty plan cards. Upsert by name keeps ids
    stable (FKs from tenants.plan_id stay valid) and matches fresh installs.
    """
    canonical = [
        dict(
            name="Free", name_ar="مجاني", price=0, period_days=30,
            max_replies=100, max_pages=1, max_rules=5, max_team=0,
            has_dm=False, has_ai=False, has_broadcast=False,
            has_scheduling=False, has_reports=False, has_flows=False,
            has_offers=False, has_sequences=False, has_analytics_advanced=False,
            sort_order=1, is_active=True,
            features=["ردود تلقائية (100/شهر)", "صفحة فيسبوك واحدة", "5 قواعد رد", "إحصاءات أساسية"],
        ),
        dict(
            name="Basic", name_ar="أساسي", price=19, period_days=30,
            max_replies=2000, max_pages=1, max_rules=20, max_team=1,
            has_dm=True, has_ai=True, has_broadcast=False,
            has_scheduling=False, has_reports=True, has_flows=False,
            has_offers=False, has_sequences=False, has_analytics_advanced=False,
            sort_order=2, is_active=True,
            features=["2,000 رد/شهر", "صفحة فيسبوك واحدة", "20 قاعدة رد", "رد خاص على التعليقات",
                      "ردود ذكية بالذكاء الاصطناعي", "تقارير أسبوعية", "دعم فوري"],
        ),
        dict(
            name="Premium", name_ar="مميز", price=29, period_days=30,
            max_replies=10000, max_pages=2, max_rules=50, max_team=2,
            has_dm=True, has_ai=True, has_broadcast=True,
            has_scheduling=True, has_reports=True, has_flows=True,
            has_offers=True, has_sequences=False, has_analytics_advanced=True,
            sort_order=3, is_active=True,
            features=["10,000 رد/شهر", "صفحتين فيسبوك", "50 قاعدة رد", "رد خاص + ذكاء اصطناعي",
                      "بث جماعي للرسائل", "جدولة المنشورات", "تقارير PDF",
                      "محرك العروض الترويجية", "تحليلات متقدمة", "فريق حتى 2"],
        ),
        dict(
            name="Pro", name_ar="احترافي", price=129, period_days=30,
            max_replies=50000, max_pages=5, max_rules=100, max_team=5,
            has_dm=True, has_ai=True, has_broadcast=True,
            has_scheduling=True, has_reports=True, has_flows=True,
            has_offers=True, has_sequences=True, has_analytics_advanced=True,
            sort_order=4, is_active=True,
            features=["50,000 رد/شهر", "5 صفحات فيسبوك", "100 قاعدة رد", "جميع الميزات المتقدمة",
                      "حملات تسلسلية", "فريق حتى 5 أعضاء", "دعم فني ممتاز"],
        ),
        dict(
            name="Enterprise", name_ar="مؤسسي", price=299, period_days=30,
            max_replies=999999, max_pages=999, max_rules=999, max_team=999,
            has_dm=True, has_ai=True, has_broadcast=True,
            has_scheduling=True, has_reports=True, has_flows=True,
            has_offers=True, has_sequences=True, has_analytics_advanced=True,
            sort_order=5, is_active=True,
            features=["ردود غير محدودة", "صفحات غير محدودة", "قواعد غير محدودة",
                      "جميع الميزات بدون استثناء", "فريق غير محدود", "دعم 24/7"],
        ),
    ]
    for p in canonical:
        row = (await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.name == p["name"])
        )).scalar_one_or_none()
        if row is None:
            db.add(SubscriptionPlan(**p))
        else:
            for k, v in p.items():
                if k != "name":
                    setattr(row, k, v)
    await db.commit()
    log.info(f"Canonical subscription plans ensured ({len(canonical)})")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # v6 §C — Sentry/GlitchTip: committed DEFAULT_SENTRY_DSN (public
    # send-only key) → active by default; SENTRY_DSN=off disables; env
    # override points at Sentry or self-hosted GlitchTip.
    from _observability import init_sentry
    init_sentry()
    try:
        # ponytail: fail-fast if default SECRET_KEY in production (belt-and-suspenders with config.py)
        if settings.SECRET_KEY == "smartbot-fallback-dev-key-change-in-production" and not settings.DEBUG:
            raise SecurityConfigError(
                "SECRET_KEY is default — set SECRET_KEY env var for production"
            )
        async with engine.connect() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # ponytail: self-heal legacy (pre-rebuild) tables — add missing model
            # columns BEFORE Alembic, so production heals even if the Alembic
            # step is skipped (root cause of the live /api/plans 500 — see
            # scripts/repro_plans_500.py and alembic 007).
            _added_cols = await conn.run_sync(_reconcile_schema)
            await conn.commit()
        log.info("DB tables ready%s", f" — reconciled {len(_added_cols)} columns" if _added_cols else "")
        if _added_cols:
            log.info("DB schema reconciled: %s", ", ".join(_added_cols))
        # Run pending Alembic migrations via to_thread (no subprocess)
        try:
            # v10-F1 (ASYNC240): Path.resolve() touches the filesystem — run it
            # off the event loop; the alembic upgrade below already runs in to_thread.
            _alembic_root = await asyncio.to_thread(
                lambda: Path(__file__).resolve().parent.parent.parent
            )
            _cfg = __import__("alembic.config", fromlist=["Config"]).Config(
                str(_alembic_root / "alembic.ini")
            )
            _cfg.set_main_option("script_location", str(_alembic_root / "alembic"))
            # command.upgrade calls env.py which uses asyncio.run() internally —
            # safe in non-main thread (Python 3.12+), avoids subprocess spawn.
            # v10-B2: __import__ without fromlist returns the ROOT alembic
            # package (no .upgrade attribute) → AttributeError was silently
            # swallowed below and migrations NEVER ran (G7 §2.3). fromlist=["upgrade"]
            # mirrors the correct adjacent Config import (line ~297 pre-v10).
            await asyncio.to_thread(
                __import__("alembic.command", fromlist=["upgrade"]).upgrade, _cfg, "head"
            )
            log.info("Alembic migrations applied")
        except Exception as e:
            log.warning(f"Alembic upgrade skipped: {e}")

        async with AsyncSessionLocal() as session:
            await seed_admin(session)
            await _seed_dm_templates(session)
            await _seed_subscription_plans(session)
            # Purge expired blacklisted JWTs (table otherwise grows unboundedly)
            try:
                from _bootstrap import purge_expired_blacklist
                purged = await purge_expired_blacklist(session)
                if purged:
                    log.info("Purged %d expired blacklisted tokens", purged)
            except Exception:
                log.warning("Blacklist purge failed", exc_info=True)
            # Migrate existing tenants: set FREE plan if no plan_id assigned
            result = await session.execute(select(Tenant).where(Tenant.plan_id.is_(None)))
            for t in result.scalars().all():
                t.plan_id = 1  # Free plan
                t.subscription_status = "FREE"
            if result:
                await session.commit()

        # Bot runs via background loop locally, Vercel Cron on serverless
        if settings.START_BOT and not _IS_VERCEL:
            # v11-A1: canonical task handle stays on the runner module —
            # routers/bot.py (start/stop), dashboard_stats.py and
            # health_alerts_routes.py all read/write runner._bot_task.
            import runner
            runner._bot_task = asyncio.create_task(_run_bot_loop())
            log.info("Bot started in background")
        if not _IS_VERCEL:
            from sequence_engine import SequenceScheduler
            _seq_scheduler = SequenceScheduler(sequence_engine)
            spawn(_seq_scheduler.start())
            from content_calendar import CalendarScheduler
            _calendar_scheduler = CalendarScheduler(content_calendar_engine)
            spawn(_calendar_scheduler.start())

        # Bridge event bus → WebSocket (tenant-scoped)
        async def _ws_bridge(data, tenant_id: int | None = None):
            if tenant_id is not None:
                await ws_manager.broadcast_to_tenant(tenant_id, "stats_update", data)
        event_bus.subscribe("stats_update", _ws_bridge)

        # Bridge bot_health to WS clients. v12-E3.5 — tenant-scoped emits now
        # go ONLY to that tenant's connections (the old bridge fanned EVERY
        # emit out to ALL connections, which is exactly why the health push
        # below had to stay global — and why its cross-tenant reply count
        # leaked to every dashboard). tenant_id=None keeps the legacy
        # every-connection broadcast for genuine platform-wide emits.
        async def _ws_bridge_global(data, tenant_id: int | None = None):
            if tenant_id is not None:
                await ws_manager.broadcast_to_tenant(tenant_id, "bot_health", data)
                return
            # tenant_id is None for global emit — broadcast to every connected tenant
            for conn in ws_manager._connections:
                try:
                    import json as _json
                    await conn.websocket.send_text(_json.dumps(
                        {"event": "bot_health", "data": data}, ensure_ascii=False, default=str
                    ))
                except Exception:
                    pass
        event_bus.subscribe("bot_health", _ws_bridge_global)

        # Health push background task (every 30s)
        async def _health_push():
            while True:
                try:
                    async with AsyncSessionLocal() as db:
                        hour_ago = utcnow() - timedelta(hours=1)
                        # v12-E3.5 — PER-TENANT reply counts (was: one GLOBAL
                        # count broadcast to every tenant's dashboard — a
                        # cross-tenant info leak). Only tenants holding a live
                        # subscriber (WS connection or SSE filter) get an emit,
                        # each carrying that tenant's own count.
                        subscribed_tenants: set[int] = {
                            c.tenant_id for c in ws_manager._connections
                        }
                        # SSE-only subscribers have no WS connection — their
                        # tenant filters live on the bus's bot_health entry.
                        for _cb, sub_tid in event_bus._subscribers.get("bot_health", []):
                            if sub_tid is not None:
                                subscribed_tenants.add(sub_tid)
                        counts: dict[int, int] = {}
                        if subscribed_tenants:
                            rows = (await db.execute(
                                select(Reply.tenant_id, func.count(Reply.id))
                                .where(
                                    Reply.created_at >= hour_ago,
                                    Reply.tenant_id.in_(subscribed_tenants),
                                )
                                .group_by(Reply.tenant_id)
                            )).all()
                            counts = {tid: cnt for tid, cnt in rows}
                        import runner  # deferred — canonical _bot_task handle
                        _bt = runner._bot_task
                        running = _bt is not None and not _bt.done() if _bt else False
                        stamp = utcnow().isoformat() + "Z"
                        for tid in subscribed_tenants:
                            await event_bus.emit(
                                "bot_health",
                                {"replies_last_hour": counts.get(tid, 0), "running": running,
                                 "timestamp": stamp},
                                tenant_id=tid,
                            )
                except Exception:
                    # v12-E3.5 — was a bare `pass`: DB outages made every 30s
                    # push die silently forever. One warning per failure keeps
                    # the loop alive but visible in the logs.
                    log.warning("bot_health push failed", exc_info=True)
                await asyncio.sleep(30)
        if not _IS_VERCEL:
            spawn(_health_push())
    except Exception as e:
        # v12-E3.5 — capture startup failures to Sentry (previously a local
        # log line only — invisible in production) and re-raise ONLY the
        # fail-fast security guard: the SecurityConfigError raised above used
        # to be swallowed by this very handler, defeating the guard. Every
        # other startup error keeps the degraded "app continues" behavior.
        from _observability import capture_exception
        capture_exception(e)
        if isinstance(e, SecurityConfigError):
            raise
        log.exception(f"Startup error (app continues): {e}")

    yield

    if not _IS_VERCEL:
        import runner  # deferred — canonical _bot_task handle
        if runner._bot_task:
            runner._bot_task.cancel()
        # fb is lazy — only close if actually initialized
        r = object.__getattribute__(fb, '_v')
        if r is not None:
            await r.close()
        from redis_cache import disconnect as rdisconnect
        await rdisconnect()
        await engine.dispose()
