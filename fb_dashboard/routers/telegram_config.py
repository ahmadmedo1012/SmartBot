"""Telegram configuration API routes — mirrors Smart-Menu's admin Telegram pages.

World-class plan v3 §5.2: config is DB-backed (SystemConfig: telegram_bot_token,
telegram_chat_id) with env fallback — same resolution as telegram_bot.py.
BEFORE: POST /config was a stub returning {updated: true} without saving
anything, and the token came from env only (never set in production).
"""
from __future__ import annotations
import os, logging
from fastapi import APIRouter, Depends, HTTPException, Body, Query, Request
from sqlalchemy import select, delete as sa_delete
from database import get_db
from _utils import iso_z
from models import TelegramApprover, TelegramBroadcastTarget, SystemConfig
from routers.auth import require_platform_admin
import httpx

log = logging.getLogger("fb-tg-config")
router = APIRouter(prefix="/api", tags=["telegram"])
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")


async def _db_config(db) -> dict:
    try:
        rows = await db.execute(select(SystemConfig).where(
            SystemConfig.key.in_(("telegram_bot_token", "telegram_chat_id"))))
        return {r.key: r.value for r in rows.scalars().all()}
    except Exception:
        return {}


@router.get("/telegram/config")
async def get_config(db=Depends(get_db), _=Depends(require_platform_admin)):
    cfg = await _db_config(db)
    token = cfg.get("telegram_bot_token") or BOT_TOKEN
    chat_id = cfg.get("telegram_chat_id") or os.getenv("TELEGRAM_CHAT_ID", "")
    return {"success": True, "data": {
        "chatId": chat_id,
        "botTokenConfigured": bool(token),
        "botTokenSource": "db" if cfg.get("telegram_bot_token") else ("env" if BOT_TOKEN else ""),
        "events": ["new_order", "payment", "settings_change"],
        "isActive": bool(token),
        "botTokenMasked": bool(token),
    }}


@router.post("/telegram/config")
async def update_config(body: dict = Body(None), db=Depends(get_db),
                        _=Depends(require_platform_admin)):
    """REAL save (was a stub): persists telegram_bot_token / telegram_chat_id
    to SystemConfig. Empty value clears the DB override (env fallback)."""
    if not body:
        raise HTTPException(400, "JSON body required")
    token = str(body.get("botToken") or body.get("telegram_bot_token") or "").strip()
    chat_id = str(body.get("chatId") or body.get("telegram_chat_id") or "").strip()

    import re as _re
    if token and not _re.match(r'^\d{6,12}:[A-Za-z0-9_-]{30,}$', token):
        raise HTTPException(400, "telegram_bot_token غير صالح — الصيغة: 123456789:AA... من BotFather")
    if chat_id and not _re.match(r'^(-?\d{5,}|@[A-Za-z0-9_]{4,})$', chat_id):
        raise HTTPException(400, "telegram_chat_id غير صالح — معرف رقمي أو @قناة")

    updated = []
    for key, value in (("telegram_bot_token", token), ("telegram_chat_id", chat_id)):
        existing = await db.execute(select(SystemConfig).where(SystemConfig.key == key))
        row = existing.scalar_one_or_none()
        if value == "":
            if row:
                await db.delete(row)
            continue
        if row:
            row.value = value
            row.is_secret = True
        else:
            db.add(SystemConfig(key=key, value=value, is_secret=True))
        updated.append(key)
    await db.commit()
    return {"success": True, "data": {"updated": updated or "no-change"}}


@router.get("/telegram/diagnose")
async def diagnose(dry_run: bool = Query(False), db=Depends(get_db), _=Depends(require_platform_admin)):
    from telegram_bot import get_bot_token, get_chat_id, get_admin_ids
    token = await get_bot_token()
    chat_id = await get_chat_id()
    admins = await get_admin_ids()
    result = {"configExists": bool(token), "isActive": bool(token),
              "source": "db-or-env",
              "adminCount": len(admins),
              "botTokenPreview": token[:10] + "..." if token else None}
    if dry_run and token:
        target = chat_id or (str(admins[0]) if admins else "")
        if not target:
            result["dryRunResult"] = "fail: لا يوجد معرف دردشة أو مدير"
        else:
            try:
                async with httpx.AsyncClient() as client:
                    r = await client.post(f"https://api.telegram.org/bot{token}/sendMessage",
                        json={"chat_id": target, "text": "🔍 اختبار SmartBot — الإشعارات تعمل"}, timeout=10)
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
async def test_telegram(db=Depends(get_db), _=Depends(require_platform_admin)):
    """Send a REAL test message (was a stub returning sent:true blindly)."""
    from telegram_bot import send_message, get_bot_token, get_chat_id, get_admin_ids
    token = await get_bot_token()
    if not token:
        raise HTTPException(400, "لم يتم إعداد توكن البوت — أضفه من الإعدادات")
    admins = await get_admin_ids()
    chat_id = await get_chat_id()
    targets = [chat_id] if chat_id else [str(a) for a in admins]
    if not targets:
        raise HTTPException(400, "لا يوجد مستلم — أضف معرف دردشة أو مدراء")
    sent = 0
    last_err = ""
    for t in targets:
        try:
            r = await send_message(t, "✅ رسالة تجريبية من SmartBot — الإشعارات تعمل")
            if r is not None:
                sent += 1
            else:
                last_err = "فشل الإرسال — تحقق من التوكن وأن البوت بدأ محادثة مع المستلم"
        except Exception as e:
            last_err = str(e)[:160]
    if sent == 0:
        raise HTTPException(400, last_err or "فشل الإرسال")
    return {"success": True, "data": {"sent": True, "recipients": sent}}
