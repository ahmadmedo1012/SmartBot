from fastapi import APIRouter, Depends, HTTPException, Form, Query
from sqlalchemy import select, desc, or_
from datetime import datetime
from database import get_db
from models import Offer, BrandConfig, Customer, BotAlert, User
from routers.auth import get_current_user, require_role
from _services import ws_manager
from _utils import utcnow
import asyncio

router = APIRouter(prefix="", tags=["alerts"])


@router.get("/api/alerts")
async def list_alerts(resolved: bool = Query(False), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    # ponytail: BotAlert at module level
    stmt = select(BotAlert).where(BotAlert.tenant_id == current_user._tenant_id, BotAlert.resolved == resolved).order_by(desc(BotAlert.created_at)).limit(20)
    rows = await db.execute(stmt)
    return [{
        "id": a.id, "type": a.alert_type, "severity": a.severity,
        "message": a.message, "resolved": a.resolved,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    } for a in rows.scalars().all()]


@router.post("/api/alerts")
async def create_alert(
    alert_type: str = Form(...), severity: str = Form("info"),
    message: str = Form(...), db=Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    # ponytail: BotAlert at module level
    alert = BotAlert(alert_type=alert_type, severity=severity, message=message, tenant_id=current_user._tenant_id)
    db.add(alert)
    await db.commit()
    # Broadcast via WebSocket
    try:
        asyncio.create_task(ws_manager.broadcast("alert", {
            "type": alert_type, "severity": severity, "message": message,
        }))
    except Exception:
        pass
    return {"id": alert.id}


@router.post("/api/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    # ponytail: BotAlert at module level
    a = (await db.execute(
        select(BotAlert).where(BotAlert.id == alert_id, BotAlert.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not a:
        raise HTTPException(404, "التنبيه غير موجود")
    a.resolved = True
    a.resolved_at = utcnow()
    await db.commit()
    return {"ok": True}


@router.post("/api/notifications/broadcast")
async def broadcast_notification(
    notif_type: str = Form("info"), title: str = Form(...),
    message: str = Form(""), link: str = Form(""),
    _=Depends(require_role("admin")),
):
    """Broadcast a notification to all connected dashboard clients."""
    asyncio.create_task(ws_manager.broadcast("notification", {
        "type": notif_type, "title": title, "message": message, "link": link or None,
    }))
    return {"ok": True}
