# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
from __future__ import annotations

"""Bot routes: status, restart, stop, interval, cron, trigger, logs, helper."""
import asyncio
import logging
import os
import secrets
from datetime import timedelta

from _async import spawn  # v9-A11: GC-safe background tasks
from _responses import fail, ok
from _utils import iso_z, utcnow
from config import settings
from database import AsyncSessionLocal, get_db
from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from models import BotLog, BotState, Tenant, User
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from ws_manager import ws_manager

from routers.auth import get_current_user, require_platform_admin, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["bot"])

_IS_VERCEL = bool(os.getenv("VERCEL"))
_CRON_SHARDS = 10

# v15-E4 (D12-M4): a forced cycle must COMPLETE inside the request (no
# spawn-after-reply — it dies silently on Vercel serverless). Vercel's
# maxDuration for api/* is 30s (vercel.json) — the budget stays under it and
# leaves room for the response itself.
_TRIGGER_CYCLE_BUDGET_S = 25.0


def _cron_authorized(request: Request) -> bool:
    """v12-E2.5 / v15-E4 / v16-E2 (D2-LEAD B): the CRON_SECRET gate, single
    source for BOTH cron routes in this file.

    Authorization: Bearer only (constant-time compare — what Vercel Cron and
    every modern provider sends). The legacy ``?token=`` query fallback was
    REMOVED in v16-E2: query strings leak CRON_SECRET into access/proxy
    logs, and the only consumer that ever used it (the cron-job.org channel)
    is mathematically DEAD (dec-cron-restore: ~288 err/day expected with a
    dead token, 2 observed — it never beats). The POST form-token path in
    plans_config.py stays (a body is never logged). An empty secret never
    validates.
    """
    secret = os.getenv("CRON_SECRET", "")
    auth_header = request.headers.get("authorization", "")
    return bool(secret) and secrets.compare_digest(auth_header, f"Bearer {secret}")


def _get_bot_task() -> asyncio.Task | None:
    """Single source of truth: the bot loop task lives on runner._bot_task.

    BUGFIX (2026-09-05): bot.py kept its OWN _bot_task (never set by lifespan)
    while runner's lifespan ran the real loop on runner._bot_task — so
    /api/bot/status always reported stopped and /api/bot/stop cancelled a
    task that was None (the real loop kept running).
    """
    import runner
    return runner._bot_task


def _set_bot_task(task: asyncio.Task | None) -> None:
    import runner
    runner._bot_task = task


async def _run_single_cycle():
    try:
        from _services import get_bot_engine
        await get_bot_engine().cycle()
    except Exception as e:
        log.error(f"Forced cycle error: {e}", exc_info=True)


async def _publish_due_scheduled_posts(report: dict, sf=None) -> int:
    """v15-E4 (D12-H1) — heartbeat step 1: publish DUE scheduled posts with an
    ATOMIC CLAIM before every Graph call (approvals.py v9-A8 pattern, verbatim).

    Before: SELECT due → ``post_to_page`` (slow Graph) → THEN flip the row →
    published. Two overlapping beats (cron-job.org 5-min + Vercel daily 04:00,
    or a beat that overruns its own next tick) both saw the row ``scheduled``
    → the SAME public post went out twice. Now each post is claimed first:

    ``UPDATE scheduled_posts SET status='publishing' WHERE id=:id AND
    status='scheduled' RETURNING id`` — zero rows means another publisher
    (heartbeat beat, calendar scheduler, manual route) already owns the post
    → skip cleanly. Stale claims from a frozen publisher are recovered via
    ``recover_stale_publishing`` (claim-marker timestamps in bot_state).

    ``sf`` (session factory) is injectable so tests drive the sweep against
    their own engine; the route passes nothing and gets AsyncSessionLocal.
    Returns the number of posts published by THIS sweep.
    """
    from content_calendar import (
        claim_scheduled_post,
        clear_claim_marker,
        recover_stale_publishing,
        release_scheduled_post,
    )
    from models import ScheduledPost
    if sf is None:
        sf = AsyncSessionLocal
    try:
        async with sf() as db:
            await recover_stale_publishing(db)
            due = (await db.execute(
                select(ScheduledPost).where(
                    ScheduledPost.status == "scheduled",
                    ScheduledPost.scheduled_at.isnot(None),
                    ScheduledPost.scheduled_at <= utcnow(),
                )
            )).scalars().all()
            due_posts = [(p.id, p.tenant_id or 0, p.message, p.image_url or "") for p in due]
    except Exception as e:
        report["errors"].append(f"publish sweep: {str(e)[:120]}")
        return 0
    published = 0
    for post_id, tenant_id, message, image_url in due_posts:
        try:
            # ── claim BEFORE Graph (D12-H1) ──
            async with sf() as db:
                if not await claim_scheduled_post(db, post_id, tenant_id,
                                                  claimable=("scheduled",)):
                    continue  # another publisher won the race — skip cleanly
            from _services import get_tenant_fb_client
            fb = await get_tenant_fb_client(tenant_id)
            if fb is None:
                # No connected page → release the claim and keep the post
                # scheduled (v14-E2 policy: publishes once the page is bound;
                # the old detached-object "failed" write never persisted).
                async with sf() as db:
                    await release_scheduled_post(db, post_id, "scheduled")
                continue
            result = (
                await fb.post_to_page_with_image(message, image_url)
                if image_url else await fb.post_to_page(message)
            )
            async with sf() as db:
                fresh = await db.get(ScheduledPost, post_id)
                if fresh is None:
                    continue
                if result and not result.get("_error"):
                    fresh.status = "published"
                    fresh.fb_post_id = str(result.get("id", ""))
                    fresh.published_at = utcnow()
                    published += 1
                    report["published_posts"] += 1
                else:
                    fresh.status = "failed"
                await clear_claim_marker(db, post_id, tenant_id)
                await db.commit()
        except Exception as e:
            # The Graph call itself crashed — release the claim so the next
            # beat retries (pre-fix semantics: the row stayed scheduled).
            try:
                async with sf() as db:
                    await release_scheduled_post(db, post_id, "scheduled")
            except Exception:
                log.exception("could not release claim for post %s", post_id)
            report["errors"].append(f"post {post_id}: {str(e)[:80]}")
    return published


async def _automation_sweep(report: dict) -> int:
    """v21 (T4-a) — heartbeat steps 1-3 as ONE reusable automation sweep.

    Extracted VERBATIM from ``cron_heartbeat`` (byte-identical behavior — the
    route below now calls this) so the authenticated cron route and the v21
    piggyback beat (app/piggyback.py — opportunistic advance on warm
    serverless traffic) drive the SAME work per beat:

      1. publish DUE scheduled posts (claim-guarded — see
         ``_publish_due_scheduled_posts``)
      2. refresh fb_fan_count snapshots for connected tenants
      3. run one bot comment cycle for connected tenants (same engine gate;
         the cycle's finally-drain also fires sequence drips + broadcast/
         campaign outboxes — v16-E2 D4)

    Idempotency (why a piggyback beat racing the cron beat can never
    double-do work):
      - posts: atomic claim ``scheduled→publishing`` BEFORE any Graph call;
      - replies: per-tenant BotEngine instances come from the _services
        registry (get_bot_engine) — the SAME instance shares its dedup
        caches with the webhook path, and the 48h DB replied-ids window
        covers cross-instance races (bot_engine/engine.py:279);
      - fan_count: a snapshot overwrite, not an append.

    Returns the count of sweep-LEVEL failures (per-post/per-tenant errors
    land in ``report["errors"]`` and do not count — the same contract the
    v12-E3.6 route answer is built on).
    """
    core_failures = 0

    # ── 1. Publish due scheduled posts (tenant-scoped, claim-guarded) ──
    try:
        await _publish_due_scheduled_posts(report)
    except Exception as e:
        report["errors"].append(f"publish sweep: {str(e)[:120]}")
        core_failures += 1

    # ── 2. Refresh fan_count snapshots for connected tenants ──
    try:
        from models import BotState
        async with AsyncSessionLocal() as db:
            rows = await db.execute(
                select(BotState).where(
                    BotState.key == "fb_page_id", BotState.tenant_id.isnot(None)
                )
            )
            pages = [(bs.tenant_id, bs.value) for bs in rows.scalars().all() if bs.value]
        for tenant_id, _page in pages:
            try:
                from _services import get_tenant_fb_client
                fb = await get_tenant_fb_client(tenant_id)
                if fb is None:
                    # v20: was a silent skip — fan refresh silently did
                    # nothing for exactly the tenants whose token was broken
                    log.warning("fan sweep: tenant %s connected but client "
                                "resolution failed — skipped", tenant_id)
                    continue
                fans = await fb.get_page_fan_count()
                if fans is None:
                    continue
                async with AsyncSessionLocal() as db:
                    snap = (await db.execute(
                        select(BotState).where(
                            BotState.tenant_id == tenant_id,
                            BotState.key == "fb_fan_count",
                        )
                    )).scalar_one_or_none()
                    if snap is None:
                        db.add(BotState(tenant_id=tenant_id, key="fb_fan_count", value=str(fans)))
                    else:
                        snap.value = str(fans)
                    await db.commit()
                report["fan_refreshed"] += 1
            except Exception as e:
                report["errors"].append(f"fan {tenant_id}: {str(e)[:80]}")
    except Exception as e:
        report["errors"].append(f"fan sweep: {str(e)[:120]}")
        core_failures += 1

    # ── 3. One bot comment cycle for connected tenants (gated by engine) ──
    try:
        from _services import get_bot_engine, get_tenant_fb_client
        for tenant_id, _page in pages:
            try:
                fb = await get_tenant_fb_client(tenant_id)
                if fb is None:
                    # v20: was a silent skip — the auto-reply engine quietly
                    # did NOTHING for tenants whose stored token was broken
                    # (e.g. a USER token failing every Graph call)
                    log.warning("bot cycle: tenant %s connected but client "
                                "resolution failed — no replies will run",
                                tenant_id)
                    continue
                engine = get_bot_engine(fb, tenant_id=tenant_id)
                await engine.cycle()
                report["cycles"] += 1
            except Exception as e:
                report["errors"].append(f"cycle {tenant_id}: {str(e)[:80]}")
    except Exception as e:
        report["errors"].append(f"cycle sweep: {str(e)[:120]}")
        core_failures += 1

    return core_failures


@router.get("/api/bot/status")
async def bot_status(_=Depends(get_current_user)):
    _bt = _get_bot_task()
    return ok(
        {
        "running": _IS_VERCEL or (_bt is not None and not _bt.done()),
        "interval": settings.BOT_INTERVAL_SECONDS,
        "mode": "vercel-on-demand" if _IS_VERCEL else "background-loop",
    }
    )


@router.post("/api/bot/restart")
async def restart_bot(current_user: User = Depends(require_platform_admin), db=Depends(get_db)):
    # v12-E2.1: platform-admin only — restart kills the GLOBAL bot loop that
    # serves every tenant; a tenant admin must not be able to stop the
    # platform for everyone.
    _bt = _get_bot_task()
    if _bt:
        _bt.cancel()
    from runner import _run_bot_loop
    _set_bot_task(asyncio.create_task(_run_bot_loop()))
    spawn(ws_manager.broadcast_to_tenant(current_user._tenant_id, "notification", {
        "type": "bot_started", "title": "تم تشغيل البوت",
        "message": "تم إعادة تشغيل البوت بنجاح", "link": "/settings",
    }))
    return ok({"ok": True})


@router.post("/api/bot/stop")
async def stop_bot(current_user: User = Depends(require_platform_admin)):
    # v12-E2.1: platform-admin only — stop halts the GLOBAL loop (all tenants).
    _bt = _get_bot_task()
    if _bt and not _bt.done():
        _bt.cancel()
    _set_bot_task(None)
    spawn(ws_manager.broadcast_to_tenant(current_user._tenant_id, "notification", {
        "type": "bot_stopped", "title": "تم إيقاف البوت",
        "message": "تم إيقاف البوت يدوياً", "link": "/settings",
    }))
    return ok({"ok": True})


@router.post("/api/bot/interval")
async def set_bot_interval(interval: int = Form(...), _=Depends(require_platform_admin)):
    # v12-E2.1: platform-admin only — the interval is a GLOBAL engine setting.
    if interval < 3 or interval > 3600:
        raise HTTPException(400, "الفاصل الزمني يجب أن يكون بين 3 و 3600 ثانية")
    settings.BOT_INTERVAL_SECONDS = interval
    return ok({"ok": True, "interval": interval})


@router.get("/api/cron/bot-cycle")
async def cron_bot_cycle(request: Request, token: str = Query("")):
    """Cron: runs one bot cycle per active, connected tenant. Auth via CRON_SECRET.

    v4 §6.22 (G8) — the old `balance` gate skipped every new tenant (balance
    was only credited via manual Telegram payment confirmation), so the bot
    NEVER ran for anyone on Vercel. Gate is now the subscription status +
    plan usage limits, same as the engine itself.

    v16-E2: ``token`` is NO LONGER an auth channel (see _cron_authorized) —
    it survives ONLY as the legacy numeric shard carrier (``?token=3`` =
    shard 3); authentication is the Bearer header alone.
    """
    if not _cron_authorized(request):
        raise HTTPException(403, "وصول غير مصرح به لمهام الجدولة")
    raw_shard = request.headers.get("x-vercel-cron-shard", "0") if not token.isdigit() else token
    shard = int(raw_shard) % _CRON_SHARDS
    try:
        async with AsyncSessionLocal() as db:
            # v4 §6.22 — connected tenants = has fb_page_id; active by flag.
            # UNPAID tenants are skipped by the engine's own gate anyway.
            page_rows = await db.execute(
                select(BotState.tenant_id).where(
                    BotState.key == "fb_page_id", BotState.tenant_id.isnot(None)
                )
            )
            connected_tids = {row[0] for row in page_rows.all() if row[0]}
            tenants = await db.execute(
                select(Tenant).where(Tenant.is_active == True, Tenant.id.in_(list(connected_tids) or [0]))
            )
            all_tenants = list(tenants.scalars().all())
        results = []
        for tenant in all_tenants:
            if (tenant.id % _CRON_SHARDS) != shard % _CRON_SHARDS:
                continue
            from _services import get_tenant_fb_client
            fb_cli = await get_tenant_fb_client(tenant.id)
            if not fb_cli:
                # v20: this used to be a bare ``continue`` — a tenant with a
                # stored page+token that fails client resolution (decrypt
                # failure / missing row) was skipped with zero evidence.
                log.warning("cron cycle: tenant %s has fb_page_id stored but FB "
                            "client resolution failed — skipping (see "
                            "get_tenant_fb_client logs)", tenant.id)
                continue
            from _services import get_bot_engine
            engine = get_bot_engine(fb_cli, tenant_id=tenant.id)
            try:
                await engine.cycle()
                results.append({"tenant_id": tenant.id, "status": "ok"})
            except Exception as e:
                log.error(f"Cron cycle err tenant {tenant.id}: {e}", exc_info=True)
                results.append({"tenant_id": tenant.id, "status": "error"})
        return ok({"ok": True, "tenants_processed": len(results), "shard": shard})
    except Exception as e:
        log.exception("Cron bot cycle error")
        return fail(f"فشل دورة الجدولة: {str(e)[:120]}")


@router.get("/api/cron/heartbeat")
async def cron_heartbeat(request: Request):
    """v4 §6.21 — the serverless heartbeat: everything that never ran on Vercel.

    One authenticated cron entrypoint (v16-E2: Bearer header ONLY — the
    ?token= fallback is gone) that runs per invocation:
      0. detects a stalled beat BEFORE this run (v6 §E — telegram alert
         when the previous beat is >15 min old)
      1. publishes DUE scheduled posts (tenant-scoped, was never scheduled)
      2. refreshes fb_fan_count snapshots for connected tenants
      3. runs one bot comment cycle for connected tenants (same engine gate)
      4. records this beat in the SystemConfig ledger (v6 §E)
    Steps 1-3 live in ``_automation_sweep`` above — v21 (T4-a) also drives
    that sweep opportunistically on warm traffic (app/piggyback.py), while
    THIS authenticated route stays the cron channel: re-arm cron-job.org
    with the current production secret (docs/cron-setup.md) and it keeps
    working unchanged.
    Vercel Hobby note: if sub-daily crons are not available, schedule what the
    plan allows — the endpoint itself is idempotent and safe to call often.
    """
    if not _cron_authorized(request):
        raise HTTPException(403, "وصول غير مصرح به لمهام الجدولة")
    from _utils import utcnow as _now
    report = {"published_posts": 0, "fan_refreshed": 0, "cycles": 0, "errors": []}
    # v12-E3.6 (handed to E2 — this router is E2-owned): core failures are
    # SWEEP-level crashes (not per-post/per-tenant errors, which are recorded
    # in report["errors"] and do not fail the beat). A beat that cannot do
    # its job answers 503 so cron-job.org alerts instead of seeing green.
    core_failures = 0

    # v6 §E — staleness detection BEFORE this beat is recorded: reads the
    # PREVIOUS beat. The daily Vercel-native cron (vercel.json 04:00) is the
    # independent second channel: if cron-job.org (5-min beats) dies, this
    # daily run sees a >15-min gap and alerts the admin on Telegram.
    from _observability import check_cron_staleness_and_alert, record_heartbeat
    try:
        stall = await check_cron_staleness_and_alert()
        report["previous_beat"] = stall
    except Exception as e:
        report["errors"].append(f"staleness check: {str(e)[:120]}")
        core_failures += 1

    # ── steps 1-3: the shared automation sweep (v21 T4-a — verbatim
    # extraction; the piggyback beat in app/piggyback.py drives the SAME
    # sweep on warm traffic, so this route's behavior is unchanged) ──
    core_failures += await _automation_sweep(report)

    # v6 §E — ledger: every authenticated beat is persisted (timestamp +
    # report) so staleness checks and the admin console can see the truth.
    # v12-E3.6: record_heartbeat swallows its own DB errors (log-only), so
    # VERIFY the write by reading the ledger back — the stored timestamp must
    # match THIS beat (within a small window). A missing/stale ledger row
    # means the DB is down → 503 (cron-job.org alerts; the old 200 made the
    # outage invisible).
    beat_at = _now()
    try:
        await record_heartbeat(report)
    except Exception as e:
        log.error(f"record_heartbeat raised: {e}", exc_info=True)
        report["errors"].append(f"heartbeat ledger: {str(e)[:120]}")
    from _observability import get_last_heartbeat
    last_beat = await get_last_heartbeat()
    ledger_ok = (
        last_beat is not None
        and abs((last_beat - beat_at).total_seconds()) < 30
    )
    if ledger_ok and core_failures == 0:
        return ok(report)
    log.error("cron heartbeat FAILED (ledger_ok=%s core_failures=%d) — answering 503",
              ledger_ok, core_failures)
    return JSONResponse(status_code=503, content=fail(
        "فشل نبض الجدولة — راجع سجلات الخادم", data=report))


@router.get("/api/logs")
async def get_logs(limit: int = Query(50, ge=1, le=500), db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = await db.execute(
        select(BotLog).where(BotLog.tenant_id == current_user._tenant_id).order_by(desc(BotLog.created_at)).limit(limit)
    )
    return ok(
        [{
        "level": r.level, "message": r.message,
        "created_at": iso_z(r.created_at),
    } for r in rows.scalars().all()]
    )


class ClearLogsBody(BaseModel):
    """v14-E1 #6 (D5-H2): bounded ``days``.

    A negative/absurd value used to push the cutoff into the FUTURE and wipe
    the tenant's ENTIRE log table in one call (days=-1 → delete everything
    "older than tomorrow"), and a non-int value crashed with a raw 500
    (timedelta(days="abc") TypeError). Both are now clean 422s.
    """

    days: int = Field(default=30, ge=0, le=365)


@router.post("/api/logs/clear")
async def clear_logs(payload: ClearLogsBody | None = None, db=Depends(get_db), current_user=Depends(require_role("admin"))):
    """Delete the tenant's logs older than ``days`` days (0..365, default 30).

    An omitted body keeps the historical default (30 days).
    """
    _tid = current_user._tenant_id
    days = payload.days if payload else 30
    cutoff = utcnow() - timedelta(days=days)
    result = await db.execute(select(func.count(BotLog.id)).where(BotLog.tenant_id == _tid, BotLog.created_at < cutoff))
    count = result.scalar() or 0
    await db.execute(BotLog.__table__.delete().where(BotLog.tenant_id == _tid, BotLog.created_at < cutoff))
    await db.commit()
    return ok({"deleted": count})


@router.post("/api/bot/trigger")
async def trigger_manual_reply(_=Depends(require_platform_admin)):
    """Force one bot cycle NOW — platform admin only (v12-E2.1: the forced
    cycle runs the GLOBAL engine loop, not a single tenant's).

    v15-E4 (D12-M4): HONEST trigger. The old version spawned the cycle after
    replying «تم تشغيل الدورة» — on Vercel serverless the spawned task died
    with the response (same root as D1-C1), so the button claimed success
    while nothing ran. The cycle now executes INLINE under a bounded budget
    (Vercel maxDuration is 30s) and the response reports what ACTUALLY
    happened: completed, still-running (cut by the budget — the next cron
    beat finishes the remainder), or failed.
    """
    try:
        await asyncio.wait_for(_run_single_cycle(), timeout=_TRIGGER_CYCLE_BUDGET_S)
        return ok({
            "ok": True, "completed": True,
            "message": "اكتملت دورة البوت الآن — راجع الردود في سجل النشاط /api/logs",
        })
    except TimeoutError:
        return ok({
            "ok": True, "completed": False,
            "message": (
                "الدورة ما تزال جارية وتجاوزت الحد الزمني لهذا الطلب — "
                "سيكملها نبض الجدولة التالي؛ راقب /api/logs"
            ),
        })
    except Exception as e:
        log.exception("trigger cycle failed")
        return fail(f"فشل تشغيل دورة البوت: {str(e)[:120]}")
