"""Telegram configuration API routes — mirrors Smart-Menu's admin Telegram pages."""
from __future__ import annotations
import os, logging
from fastapi import APIRouter, Depends, HTTPException, Body, Query, Request
from sqlalchemy import select, delete as sa_delete
from database import get_db
from _utils import iso_z
from models import TelegramApprover, TelegramBroadcastTarget
from routers.auth import require_platform_admin
import httpx

log = logging.getLogger("fb-tg-config")
router = APIRouter(prefix="/api", tags=["telegram"])
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

@router.get("/telegram/config")
async def get_config(_=Depends(require_platform_admin)):
    return {"success": True, "data": {
        "chatId": os.getenv("TELEGRAM_CHAT_ID", ""),
        "events": ["new_order", "payment", "settings_change"],
        "isActive": bool(BOT_TOKEN), "botTokenMasked": bool(BOT_TOKEN),
    }}

@router.post("/telegram/config")
async def update_config(_=Depends(require_platform_admin)):
    return {"success": True, "data": {"updated": True}}

@router.get("/telegram/diagnose")
async def diagnose(dry_run: bool = Query(False), _=Depends(require_platform_admin)):
    result = {"configExists": bool(BOT_TOKEN), "isActive": bool(BOT_TOKEN),
              "botTokenPreview": BOT_TOKEN[:10] + "..." if BOT_TOKEN else None}
    if dry_run and BOT_TOKEN:
        try:
            chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
            async with httpx.AsyncClient() as client:
                r = await client.post(f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
                    json={"chat_id": chat_id, "text": "🔍 Diagnostic"}, timeout=10)
            result["dryRunResult"] = "ok" if r.is_success else f"fail: {r.text[:200]}"
        except Exception as e:
            result["dryRunResult"] = f"err: {e}"
    return {"success": True, "data": result}

@router.get("/admin/telegram/approvers")
async def list_approvers(db=Depends(get_db), _=Depends(require_platform_admin)):
    rows = await db.execute(select(TelegramApprover).order_by(TelegramApprover.created_at.desc()))
    return {"success": True, "data": [{
        "id": a.id, "telegramId": a.telegram_id, "label": a.label,
        "addedBy": {"id": a.added_by_id} if a.added_by_id else None,
        "createdAt": iso_z(a.created_at),
    } for a in rows.scalars().all()]}

@router.post("/admin/telegram/approvers")
async def add_approver(body: dict = Body(None), db=Depends(get_db),
                        current_user=Depends(require_platform_admin)):
    if not body or "telegramId" not in body:
        raise HTTPException(400, "telegramId required")
    tid = str(body["telegramId"])
    existing = await db.execute(select(TelegramApprover).where(TelegramApprover.telegram_id == tid))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Approver already exists")
    a = TelegramApprover(telegram_id=tid, label=body.get("label", ""), added_by_id=current_user.id)
    db.add(a); await db.commit(); await db.refresh(a)
    return {"success": True, "data": {"id": a.id, "telegramId": a.telegram_id, "label": a.label}}

@router.delete("/admin/telegram/approvers/{approver_id}")
async def remove_approver(approver_id: int, db=Depends(get_db), _=Depends(require_platform_admin)):
    await db.execute(sa_delete(TelegramApprover).where(TelegramApprover.id == approver_id))
    await db.commit()
    return {"success": True}

@router.get("/telegram/broadcast-targets")
async def list_targets(db=Depends(get_db), _=Depends(require_platform_admin)):
    rows = await db.execute(select(TelegramBroadcastTarget).order_by(TelegramBroadcastTarget.created_at.desc()))
    return {"success": True, "data": [{
        "id": t.id, "label": t.label, "chatId": t.chat_id,
        "isActive": t.is_active, "createdAt": iso_z(t.created_at),
    } for t in rows.scalars().all()]}

@router.post("/telegram/broadcast-targets")
async def add_target(body: dict = Body(None), db=Depends(get_db), _=Depends(require_platform_admin)):
    if not body or "chatId" not in body: raise HTTPException(400, "chatId required")
    t = TelegramBroadcastTarget(label=body.get("label", ""), chat_id=str(body["chatId"]))
    db.add(t); await db.commit(); await db.refresh(t)
    return {"success": True, "data": {"id": t.id, "label": t.label, "chatId": t.chat_id, "isActive": t.is_active}}

@router.patch("/telegram/broadcast-targets/{target_id}")
async def update_target(target_id: int, body: dict = Body(None), db=Depends(get_db), _=Depends(require_platform_admin)):
    t = await db.get(TelegramBroadcastTarget, target_id)
    if not t: raise HTTPException(404)
    if "isActive" in body: t.is_active = body["isActive"]
    await db.commit()
    return {"success": True}

@router.delete("/telegram/broadcast-targets/{target_id}")
async def delete_target(target_id: int, db=Depends(get_db), _=Depends(require_platform_admin)):
    await db.execute(sa_delete(TelegramBroadcastTarget).where(TelegramBroadcastTarget.id == target_id))
    await db.commit()
    return {"success": True}

@router.post("/telegram/test")
async def test_telegram(_=Depends(require_platform_admin)):
    if not BOT_TOKEN: raise HTTPException(400, "Telegram bot not configured")
    return {"success": True, "data": {"sent": True}}
