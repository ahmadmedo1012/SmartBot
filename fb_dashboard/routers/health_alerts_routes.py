from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc
from _utils import utcnow
from datetime import datetime, timedelta
from config import settings
from database import get_db
from models import BotAlert, Reply, Rule, User
from routers.auth import get_current_user, require_role
from _services import fb

router = APIRouter(prefix="", tags=["health"])


@router.get("/api/health/alerts")
async def get_bot_alerts(resolved: bool = Query(False), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get bot health alerts."""
    stmt = select(BotAlert).where(BotAlert.tenant_id == current_user._tenant_id)
    if not resolved:
        stmt = stmt.where(BotAlert.resolved == False)
    rows = await db.execute(stmt.order_by(desc(BotAlert.created_at)).limit(20))
    return [{
        "id": a.id, "alert_type": a.alert_type, "severity": a.severity,
        "message": a.message, "resolved": a.resolved,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    } for a in rows.scalars().all()]


@router.post("/api/health/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    alert = (await db.execute(
        select(BotAlert).where(BotAlert.id == alert_id, BotAlert.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not alert:
        raise HTTPException(404, "Alert not found")
    alert.resolved = True
    alert.resolved_at = utcnow()
    await db.commit()
    return {"ok": True}


@router.get("/api/health/bot-check")
async def health_bot_check(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Run bot health checks and return status."""
    _tid = current_user._tenant_id
    issues = []

    # 1. Check recent reply volume
    hour_ago = utcnow() - timedelta(hours=1)
    recent = await db.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == _tid, Reply.created_at >= hour_ago)) or 0
    if recent == 0:
        issues.append({"type": "no_replies", "severity": "warning", "message": "لا توجد ردود في آخر ساعة"})

    # 2. Check token connectivity
    try:
        fan_count = await fb.get_page_fan_count()
    except Exception:
        fan_count = None
        issues.append({"type": "fb_token", "severity": "critical", "message": "فشل الاتصال بفيسبوك — تحقق من التوكن"})

    # 3. Check rules
    rule_count = await db.scalar(select(func.count(Rule.id)).where(Rule.tenant_id == _tid)) or 0
    if rule_count == 0:
        issues.append({"type": "no_rules", "severity": "critical", "message": "لا توجد قواعد رد — البوت لن يعمل"})

    # 4. Check bot running
    from runner import _bot_task as _bt
    running = _bt is not None and not _bt.done()

    return {
        "status": "ok" if not issues else "warning",
        "running": running,
        "fan_count": fan_count,
        "replies_last_hour": recent,
        "rule_count": rule_count,
        "issues": issues,
        "alerts_count": 0,
    }
