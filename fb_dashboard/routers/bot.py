from __future__ import annotations
"""Bot routes: status, restart, stop, interval, cron, trigger, logs, helper."""
import asyncio
import os
import json
import logging
from datetime import timedelta
from _utils import utcnow

from fastapi import APIRouter, Depends, Query, HTTPException, Form, Request
from sqlalchemy import select, func, desc

from config import settings
from database import get_db, AsyncSessionLocal
from models import BotLog, BotState, Tenant
from routers.auth import get_current_user, require_role

from ws_manager import ws_manager
from event_bus import event_bus

log = logging.getLogger("fb-api")
router = APIRouter(tags=["bot"])

_IS_VERCEL = bool(os.getenv("VERCEL"))
_bot_task: asyncio.Task | None = None
_CRON_SHARDS = 10
_cron_lock = asyncio.Lock()


async def _run_single_cycle():
    try:
        from _services import get_bot_engine
        await get_bot_engine().cycle()
    except Exception as e:
        log.error(f"Forced cycle error: {e}")


@router.get("/api/bot/status")
async def bot_status(_=Depends(get_current_user)):
    return {
        "running": _IS_VERCEL or (_bot_task is not None and not _bot_task.done()),
        "interval": settings.BOT_INTERVAL_SECONDS,
        "mode": "vercel-on-demand" if _IS_VERCEL else "background-loop",
    }


@router.post("/api/bot/restart")
async def restart_bot(_=Depends(require_role("admin"))):
    global _bot_task
    if _bot_task:
        _bot_task.cancel()
    from runner import _run_bot_loop
    _bot_task = asyncio.create_task(_run_bot_loop())
    asyncio.create_task(ws_manager.broadcast("notification", {
        "type": "bot_started", "title": "تم تشغيل البوت",
        "message": "تم إعادة تشغيل البوت بنجاح", "link": "/settings",
    }))
    return {"ok": True}


@router.post("/api/bot/stop")
async def stop_bot(_=Depends(require_role("admin"))):
    global _bot_task
    if _bot_task and not _bot_task.done():
        _bot_task.cancel()
        _bot_task = None
    asyncio.create_task(ws_manager.broadcast("notification", {
        "type": "bot_stopped", "title": "تم إيقاف البوت",
        "message": "تم إيقاف البوت يدوياً", "link": "/settings",
    }))
    return {"ok": True}


@router.post("/api/bot/interval")
async def set_bot_interval(interval: int = Form(...), _=Depends(require_role("admin"))):
    if interval < 3 or interval > 3600:
        raise HTTPException(400, "Interval must be between 3 and 3600 seconds")
    settings.BOT_INTERVAL_SECONDS = interval
    return {"ok": True, "interval": interval}


@router.get("/api/cron/bot-cycle")
async def cron_bot_cycle(request: Request, token: str = Query("")):
    """Cron-job.org: runs one bot cycle per active tenant. Auth via CRON_SECRET."""
    secret = os.getenv("CRON_SECRET")
    auth_header = request.headers.get("authorization", "")
    valid = bool(secret) and (auth_header == f"Bearer {secret}" or token == secret)
    if not valid:
        raise HTTPException(403, "Unauthorized cron")
    raw_shard = request.headers.get("x-vercel-cron-shard", "0") if not token.isdigit() else token
    shard = int(raw_shard) % _CRON_SHARDS
    try:
        async with AsyncSessionLocal() as db:
            tenants = await db.execute(select(Tenant).where(Tenant.is_active == True))
            all_tenants = list(tenants.scalars().all())
            tids = [t.id for t in all_tenants]
            bs_rows = await db.execute(
                select(BotState).where(
                    BotState.key == "balance",
                    BotState.tenant_id.in_(tids),
                )
            )
            balances = {bs.tenant_id: int(bs.value) for bs in bs_rows.scalars().all() if bs and bs.value}
        results = []
        for tenant in all_tenants:
            if (tenant.id % _CRON_SHARDS) != shard % _CRON_SHARDS:
                continue
            if balances.get(tenant.id, 0) <= 0:
                results.append({"tenant_id": tenant.id, "status": "skipped", "reason": "no_balance"})
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
        return {"ok": True, "tenants_processed": len(results), "shard": shard}
    except Exception as e:
        log.error(f"Cron bot cycle error: {e}")
        return {"ok": False, "error": str(e)[:200]}


@router.get("/api/logs")
async def get_logs(limit: int = Query(50), db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = await db.execute(
        select(BotLog).where(BotLog.tenant_id == current_user._tenant_id).order_by(desc(BotLog.created_at)).limit(limit)
    )
    return [{
        "level": r.level, "message": r.message,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows.scalars().all()]


@router.post("/api/logs/clear")
async def clear_logs(payload: dict = None, db=Depends(get_db), current_user=Depends(require_role("admin"))):
    _tid = current_user._tenant_id
    days = (payload or {}).get("days", 30)
    cutoff = utcnow() - timedelta(days=days)
    result = await db.execute(select(func.count(BotLog.id)).where(BotLog.tenant_id == _tid, BotLog.created_at < cutoff))
    count = result.scalar() or 0
    await db.execute(BotLog.__table__.delete().where(BotLog.tenant_id == _tid, BotLog.created_at < cutoff))
    await db.commit()
    return {"deleted": count}


@router.post("/api/bot/trigger")
async def trigger_manual_reply(_=Depends(require_role("admin"))):
    """Force one bot cycle NOW — useful after commenting on Facebook."""
    asyncio.create_task(_run_single_cycle())
    return {"ok": True, "message": "Bot cycle triggered — replies will appear in /api/logs"}
