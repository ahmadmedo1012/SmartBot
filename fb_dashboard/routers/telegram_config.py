"""Telegram configuration API routes — mirrors Smart-Menu's admin Telegram pages.

World-class plan v3 §5.2: config is DB-backed (SystemConfig: telegram_bot_token,
telegram_chat_id) with env fallback — same resolution as telegram_bot.py.
BEFORE: POST /config was a stub returning {updated: true} without saving
anything, and the token came from env only (never set in production).

v17-E-B2 (D5-F2): «تفعيل إشعارات تليجرام» (isActive) + «الأحداث المرسلة»
(events) used to ride the POST body and die there — GET served hardcoded
defaults, so both controls snapped back after every reload. There is NO
dedicated telegram-settings column for them in models.py (SystemConfig /
TelegramApprover / TelegramBroadcastTarget only), and adding a Column or a
_schema_reconcile line is outside this file's ownership — so, per the plan's
storage decision, they persist as JSON inside the EXISTING SystemConfig.value
column under one key: ``telegram_notify_config`` → {"isActive": bool,
"events": [str]}. Key-present semantics mirror the v15-E5 token rule: an
absent key keeps its stored value; only an explicitly-present key is written.
"""
from __future__ import annotations

import json
import logging
import os
import re

import httpx
from _responses import ok
from _utils import iso_z
from database import get_db
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from models import SystemConfig, TelegramApprover, TelegramBroadcastTarget
from sqlalchemy import delete as sa_delete
from sqlalchemy import select

from routers.auth import require_platform_admin

log = logging.getLogger("fb-tg-config")
router = APIRouter(prefix="/api", tags=["telegram"])
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

# v17-E-B2 (D5-F2): notify-switch + events persistence (see module docstring).
_NOTIFY_KEY = "telegram_notify_config"
_DEFAULT_EVENTS = ("new_order", "payment", "settings_change")
_MAX_EVENTS = 20
_EVENT_NAME_RE = re.compile(r"^[a-z0-9_]{2,40}$")


def _parse_notify(raw: str | None) -> dict:
    """Parse the stored telegram_notify_config JSON — corrupt/legacy values
    degrade to {} so the GET per-key fallbacks apply (fail-open, same doctrine
    as every other SystemConfig read in this router)."""
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


async def _notify_config(db) -> dict:
    row = (await db.execute(
        select(SystemConfig).where(SystemConfig.key == _NOTIFY_KEY)
    )).scalar_one_or_none()
    return _parse_notify(row.value if row is not None else None)


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
    # v17-E-B2 (D5-F2): events/isActive come from the STORED notify config —
    # no more hardcoded echo. Per-key fallbacks keep pre-v17 installs on the
    # exact behavior they saw before (default events list; isActive = a token
    # is configured), and an explicitly-saved empty events list [] survives
    # (it is the user's choice, not "unset").
    notify = await _notify_config(db)
    events = notify.get("events")
    if not isinstance(events, list):
        events = list(_DEFAULT_EVENTS)
    is_active = notify.get("isActive")
    if not isinstance(is_active, bool):
        is_active = bool(token)
    return ok({
        "chatId": chat_id,
        "botTokenConfigured": bool(token),
        "botTokenSource": "db" if cfg.get("telegram_bot_token") else ("env" if BOT_TOKEN else ""),
        "events": [str(e) for e in events],
        "isActive": is_active,
        "botTokenMasked": bool(token),
    })


@router.post("/telegram/config")
async def update_config(body: dict = Body(None), db=Depends(get_db),
                        _=Depends(require_platform_admin)):
    """REAL save (was a stub): persists telegram_bot_token / telegram_chat_id
    to SystemConfig. Empty value clears the DB override (env fallback).

    v15-E5 (D4-H2): a MISSING botToken/telegram_bot_token key now means
    «keep the stored token» — the admin page seeds the field empty while a
    token exists (the masked «••••••••» placeholder used to ride the save
    and 400 the whole request). Only an explicitly-present key is written;
    an explicit empty string still clears (documented contract unchanged)."""
    if not body:
        raise HTTPException(400, "جسم الطلب JSON مطلوب")
    import re as _re
    # v15-E5 (D4-H2): detect key presence BEFORE the `or`-chain flattens
    # "absent" into "" (which would clear the stored token).
    token_key_present = "botToken" in body or "telegram_bot_token" in body
    token = str(body.get("botToken") or body.get("telegram_bot_token") or "").strip()
    chat_id = str(body.get("chatId") or body.get("telegram_chat_id") or "").strip()

    if token and not _re.match(r'^\d{6,12}:[A-Za-z0-9_-]{30,}$', token):
        raise HTTPException(400, "telegram_bot_token غير صالح — الصيغة: 123456789:AA... من BotFather")
    if chat_id and not _re.match(r'^(-?\d{5,}|@[A-Za-z0-9_]{4,})$', chat_id):
        raise HTTPException(400, "telegram_chat_id غير صالح — معرف رقمي أو @قناة")

    # v17-E-B2 (D5-F2): isActive/events validation — the two formerly-dead
    # keys. Absent key ⇒ keep stored value (key-present contract, same as the
    # token above); present key ⇒ validated here so a bad value 400s BEFORE
    # any DB write (never a half-saved request).
    notify_updates: dict = {}
    if body.get("isActive") is not None:
        raw_active = body["isActive"]
        if isinstance(raw_active, bool):
            notify_updates["isActive"] = raw_active
        elif isinstance(raw_active, str) and raw_active.strip().lower() in ("true", "false"):
            notify_updates["isActive"] = raw_active.strip().lower() == "true"
        else:
            raise HTTPException(400, "قيمة isActive غير صالحة — استخدم true أو false")
    if body.get("events") is not None:
        raw_events = body["events"]
        if not isinstance(raw_events, list):
            raise HTTPException(400, "الأحداث المرسلة يجب أن تكون قائمة: events = [\"new_order\", ...]")
        events = [str(e).strip().lower() for e in raw_events if str(e or "").strip()]
        if len(events) > _MAX_EVENTS:
            raise HTTPException(400, f"الحد الأقصى {_MAX_EVENTS} حدثاً في قائمة الأحداث المرسلة")
        for e in events:
            if not _EVENT_NAME_RE.match(e):
                raise HTTPException(400, f"اسم الحدث غير صالح: «{e}» — أحرف لاتينية صغيرة وأرقام وشرطة سفلية فقط")
        notify_updates["events"] = events

    # (key, value) pairs to persist — the token pair is SKIPPED entirely
    # when its key was absent from the request (keep-stored-token semantics).
    pairs: list[tuple[str, str]] = []
    if token_key_present:
        pairs.append(("telegram_bot_token", token))
    pairs.append(("telegram_chat_id", chat_id))

    updated = []
    for key, value in pairs:
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

    # v17-E-B2 (D5-F2): merge + persist the notify config — only the keys the
    # request actually carried (partial saves keep the rest), JSON in the
    # existing SystemConfig.value column. NOT a secret (a boolean + event
    # names): is_secret stays False so /api/admin/config-style masking never
    # applies to it.
    if notify_updates:
        stored = await _notify_config(db)
        stored.update(notify_updates)
        notify_json = json.dumps(stored, ensure_ascii=False, separators=(",", ":"))
        row = (await db.execute(
            select(SystemConfig).where(SystemConfig.key == _NOTIFY_KEY)
        )).scalar_one_or_none()
        if row:
            row.value = notify_json
            row.is_secret = False
        else:
            db.add(SystemConfig(key=_NOTIFY_KEY, value=notify_json, category="telegram",
                                is_secret=False,
                                description="تفعيل إشعارات تليجرام والأحداث المرسلة (v17-E-B2)"))
        updated.append(_NOTIFY_KEY)
    await db.commit()
    return ok({"updated": updated or "no-change"})


@router.get("/telegram/diagnose")
async def diagnose(dry_run: bool = Query(False), db=Depends(get_db), _=Depends(require_platform_admin)):
    from telegram_bot import get_admin_ids, get_bot_token, get_chat_id
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
    return ok(result)

@router.get("/admin/telegram/approvers")
async def list_approvers(db=Depends(get_db), _=Depends(require_platform_admin)):
    rows = await db.execute(select(TelegramApprover).order_by(TelegramApprover.created_at.desc()))
    return ok([{
        "id": a.id, "telegramId": a.telegram_id, "label": a.label,
        "addedBy": {"id": a.added_by_id} if a.added_by_id else None,
        "createdAt": iso_z(a.created_at),
    } for a in rows.scalars().all()])

@router.post("/admin/telegram/approvers")
async def add_approver(body: dict = Body(None), db=Depends(get_db),
                        current_user=Depends(require_platform_admin)):
    if not body or "telegramId" not in body:
        raise HTTPException(400, "الحقل مطلوب: telegramId")
    tid = str(body["telegramId"])
    existing = await db.execute(select(TelegramApprover).where(TelegramApprover.telegram_id == tid))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "المعتمد موجود مسبقاً")
    a = TelegramApprover(telegram_id=tid, label=body.get("label", ""), added_by_id=current_user.id)
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return ok({"id": a.id, "telegramId": a.telegram_id, "label": a.label})

@router.delete("/admin/telegram/approvers/{approver_id}")
async def remove_approver(approver_id: int, db=Depends(get_db), _=Depends(require_platform_admin)):
    await db.execute(sa_delete(TelegramApprover).where(TelegramApprover.id == approver_id))
    await db.commit()
    return ok()

@router.get("/telegram/broadcast-targets")
async def list_targets(db=Depends(get_db), _=Depends(require_platform_admin)):
    rows = await db.execute(select(TelegramBroadcastTarget).order_by(TelegramBroadcastTarget.created_at.desc()))
    return ok([{
        "id": t.id, "label": t.label, "chatId": t.chat_id,
        "isActive": t.is_active, "createdAt": iso_z(t.created_at),
    } for t in rows.scalars().all()])

@router.post("/telegram/broadcast-targets")
async def add_target(body: dict = Body(None), db=Depends(get_db), _=Depends(require_platform_admin)):
    if not body or "chatId" not in body:
        raise HTTPException(400, "الحقل مطلوب: chatId")
    t = TelegramBroadcastTarget(label=body.get("label", ""), chat_id=str(body["chatId"]))
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return ok({"id": t.id, "label": t.label, "chatId": t.chat_id, "isActive": t.is_active})

@router.patch("/telegram/broadcast-targets/{target_id}")
async def update_target(target_id: int, body: dict = Body(None), db=Depends(get_db), _=Depends(require_platform_admin)):
    t = await db.get(TelegramBroadcastTarget, target_id)
    if not t:
        raise HTTPException(404, "هدف البث غير موجود")
    if "isActive" in body:
        t.is_active = body["isActive"]
    await db.commit()
    return ok()

@router.delete("/telegram/broadcast-targets/{target_id}")
async def delete_target(target_id: int, db=Depends(get_db), _=Depends(require_platform_admin)):
    await db.execute(sa_delete(TelegramBroadcastTarget).where(TelegramBroadcastTarget.id == target_id))
    await db.commit()
    return ok()

@router.post("/telegram/test")
async def test_telegram(db=Depends(get_db), _=Depends(require_platform_admin)):
    """Send a REAL test message (was a stub returning sent:true blindly)."""
    from telegram_bot import get_admin_ids, get_bot_token, get_chat_id, send_message
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
    return ok({"sent": True, "recipients": sent})
