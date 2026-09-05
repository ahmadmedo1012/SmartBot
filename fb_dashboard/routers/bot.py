# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
from __future__ import annotations
"""Bot routes: status, restart, stop, interval, cron, trigger, logs, helper."""
import asyncio
import os
import json
import logging
import secrets
from datetime import timedelta
from _utils import utcnow, iso_z

from fastapi import APIRouter, Depends, Query, HTTPException, Form, Request
from sqlalchemy import select, func, desc

from config import settings
from database import get_db, AsyncSessionLocal
from models import BotLog, BotState, Tenant, User
from routers.auth import get_current_user, require_role

from ws_manager import ws_manager
from event_bus import event_bus
from _responses import ok, fail

log = logging.getLogger("fb-api")
router = APIRouter(tags=["bot"])

_IS_VERCEL = bool(os.getenv("VERCEL"))
_CRON_SHARDS = 10
_cron_lock = asyncio.Lock()


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
        log.error(f"Forced cycle error: {e}")


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
async def restart_bot(current_user: User = Depends(require_role("admin")), db=Depends(get_db)):
    _bt = _get_bot_task()
    if _bt:
        _bt.cancel()
    from runner import _run_bot_loop
    _set_bot_task(asyncio.create_task(_run_bot_loop()))
    asyncio.create_task(ws_manager.broadcast_to_tenant(current_user._tenant_id, "notification", {
        "type": "bot_started", "title": "تم تشغيل البوت",
        "message": "تم إعادة تشغيل البوت بنجاح", "link": "/settings",
    }))
    return ok({"ok": True})


@router.post("/api/bot/stop")
async def stop_bot(current_user: User = Depends(require_role("admin"))):
    _bt = _get_bot_task()
    if _bt and not _bt.done():
        _bt.cancel()
    _set_bot_task(None)
    asyncio.create_task(ws_manager.broadcast_to_tenant(current_user._tenant_id, "notification", {
        "type": "bot_stopped", "title": "تم إيقاف البوت",
        "message": "تم إيقاف البوت يدوياً", "link": "/settings",
    }))
    return ok({"ok": True})


@router.post("/api/bot/interval")
async def set_bot_interval(interval: int = Form(...), _=Depends(require_role("admin"))):
    if interval < 3 or interval > 3600:
        raise HTTPException(400, "Interval must be between 3 and 3600 seconds")
    settings.BOT_INTERVAL_SECONDS = interval
    return ok({"ok": True, "interval": interval})


@router.get("/api/cron/bot-cycle")
async def cron_bot_cycle(request: Request, token: str = Query("")):
    """Cron: runs one bot cycle per active, connected tenant. Auth via CRON_SECRET.

    v4 §6.22 (G8) — the old `balance` gate skipped every new tenant (balance
    was only credited via manual Telegram payment confirmation), so the bot
    NEVER ran for anyone on Vercel. Gate is now the subscription status +
    plan usage limits, same as the engine itself."""
    secret = os.getenv("CRON_SECRET", "")
    auth_header = request.headers.get("authorization", "")
    # Constant-time compare (timing-attack hygiene); empty secret never validates
    valid = bool(secret) and (
        secrets.compare_digest(auth_header, f"Bearer {secret}")
        or secrets.compare_digest(token, secret)
    )
    if not valid:
        raise HTTPException(403, "Unauthorized cron")
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
                continue
            from _services import get_bot_engine
            engine = get_bot_engine(fb_cli, tenant_id=tenant.id)
            try:
                await engine.cycle()
                results.append({"tenant_id": tenant.id, "status": "ok"})
            except Exception as e:
                log.error(f"Cron cycle err tenant {tenant.id}: {e}")
                results.append({"tenant_id": tenant.id, "status": "error"})
        return ok({"ok": True, "tenants_processed": len(results), "shard": shard})
    except Exception as e:
        log.error("Cron bot cycle error", exc_info=True)
        return fail(f"cron cycle failed: {str(e)[:120]}")


@router.get("/api/cron/heartbeat")
async def cron_heartbeat(request: Request, token: str = Query("")):
    """v4 §6.21 — the serverless heartbeat: everything that never ran on Vercel.

    One authenticated cron entrypoint that runs per invocation:
      1. publishes DUE scheduled posts (tenant-scoped, was never scheduled)
      2. refreshes fb_fan_count snapshots for connected tenants
      3. runs one bot comment cycle for connected tenants (same engine gate)
    Vercel Hobby note: if sub-daily crons are not available, schedule what the
    plan allows — the endpoint itself is idempotent and safe to call often.
    """
    secret = os.getenv("CRON_SECRET", "")
    auth_header = request.headers.get("authorization", "")
    valid = bool(secret) and (
        secrets.compare_digest(auth_header, f"Bearer {secret}")
        or secrets.compare_digest(token, secret)
    )
    if not valid:
        raise HTTPException(403, "Unauthorized cron")
    from _utils import utcnow as _now
    report = {"published_posts": 0, "fan_refreshed": 0, "cycles": 0, "errors": []}

    # ── 1. Publish due scheduled posts (tenant-scoped) ──
    try:
        from models import ScheduledPost
        async with AsyncSessionLocal() as db:
            due = (await db.execute(
                select(ScheduledPost).where(
                    ScheduledPost.status == "scheduled",
                    ScheduledPost.scheduled_at.isnot(None),
                    ScheduledPost.scheduled_at <= _now(),
                )
            )).scalars().all()
        for post in due:
            try:
                from _services import get_tenant_fb_client
                fb = await get_tenant_fb_client(post.tenant_id)
                if fb is None:
                    post.status = "failed"
                    continue
                result = (
                    await fb.post_to_page_with_image(post.message, post.image_url)
                    if post.image_url else await fb.post_to_page(post.message)
                )
                async with AsyncSessionLocal() as db:
                    fresh = await db.get(ScheduledPost, post.id)
                    if result and not result.get("_error"):
                        fresh.status = "published"
                        fresh.fb_post_id = str(result.get("id", ""))
                        fresh.published_at = _now()
                        report["published_posts"] += 1
                    else:
                        fresh.status = "failed"
                    await db.commit()
            except Exception as e:
                report["errors"].append(f"post {post.id}: {str(e)[:80]}")
    except Exception as e:
        report["errors"].append(f"publish sweep: {str(e)[:120]}")

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
        for tenant_id, page_id in pages:
            try:
                from _services import get_tenant_fb_client
                fb = await get_tenant_fb_client(tenant_id)
                if fb is None:
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

    # ── 3. One bot comment cycle for connected tenants (gated by engine) ──
    try:
        from _services import get_tenant_fb_client, get_bot_engine
        for tenant_id, _page in pages:
            try:
                fb = await get_tenant_fb_client(tenant_id)
                if fb is None:
                    continue
                engine = get_bot_engine(fb, tenant_id=tenant_id)
                await engine.cycle()
                report["cycles"] += 1
            except Exception as e:
                report["errors"].append(f"cycle {tenant_id}: {str(e)[:80]}")
    except Exception as e:
        report["errors"].append(f"cycle sweep: {str(e)[:120]}")

    return ok(report)


@router.get("/api/logs")
async def get_logs(limit: int = Query(50), db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = await db.execute(
        select(BotLog).where(BotLog.tenant_id == current_user._tenant_id).order_by(desc(BotLog.created_at)).limit(limit)
    )
    return ok(
        [{
        "level": r.level, "message": r.message,
        "created_at": iso_z(r.created_at),
    } for r in rows.scalars().all()]
    )


@router.post("/api/logs/clear")
async def clear_logs(payload: dict = None, db=Depends(get_db), current_user=Depends(require_role("admin"))):
    _tid = current_user._tenant_id
    days = (payload or {}).get("days", 30)
    cutoff = utcnow() - timedelta(days=days)
    result = await db.execute(select(func.count(BotLog.id)).where(BotLog.tenant_id == _tid, BotLog.created_at < cutoff))
    count = result.scalar() or 0
    await db.execute(BotLog.__table__.delete().where(BotLog.tenant_id == _tid, BotLog.created_at < cutoff))
    await db.commit()
    return ok({"deleted": count})


@router.post("/api/bot/trigger")
async def trigger_manual_reply(_=Depends(require_role("admin"))):
    """Force one bot cycle NOW — useful after commenting on Facebook."""
    asyncio.create_task(_run_single_cycle())
    return ok({"ok": True, "message": "Bot cycle triggered — replies will appear in /api/logs"})
