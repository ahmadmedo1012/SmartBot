from __future__ import annotations
"""Admin routes: repair, tenant deletion, rule priority, cooldown, template-vars, rules-categories."""
import json
import logging
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Form
from fastapi.responses import JSONResponse
from sqlalchemy import select, func, or_, desc

from config import settings
from database import engine, AsyncSessionLocal, get_db
from models import Base, Rule, Reply, BotLog, BotState, Tenant, User, ConversationNote
from models import ReplyTemplate, AISuggestion, ConversationTag, ConversationLabel, ScheduledPost, AnalyticsEvent, BotAlert, Offer, OfferClaim, BrandConfig, Customer, Flow, FlowExecution
from models import Subscriber, Tag, SubscriberTag, Sequence, SequenceStep, SequenceSubscription, Broadcast, BroadcastRecipient, ConversationAssignee, ReportSchedule, PaymentRequest
from models import SystemConfig
from routers.auth import get_current_user, require_role, require_platform_admin, is_platform_admin
from _responses import ok

log = logging.getLogger("fb-api")
router = APIRouter(prefix="", tags=["admin"])

# Payment config keys an admin may manage (plan §2.4). Everything else in
# SystemConfig stays hands-off — this endpoint cannot touch arbitrary rows.
_PAYMENT_CONFIG_KEYS = {
    "balance_transfer_phone_2",  # ليبيانا
    "balance_transfer_phone_1",  # مدار
    "bank_transfer_bank_name",
    "bank_transfer_account_number",
    "bank_transfer_iban",
    "mobile_wallet_cap",
}

# Support contact keys (parity-v2 §3.1 / support.py GET /info merge order).
# The owner enters these via /admin/settings — no redeploy needed.
_SUPPORT_CONFIG_KEYS = {
    "support_email",
    "support_phone",
    "support_whatsapp",
    "support_working_hours",
}

# Telegram notification keys (world-class plan v3 §5.1) — the owner sets the
# bot token + default chat id from /admin/settings; telegram_bot.py resolves
# these DB rows first with env fallback. Fixes "no telegram notifications".
_TELEGRAM_CONFIG_KEYS = {
    "telegram_bot_token",
    "telegram_chat_id",
}

_ADMIN_CONFIG_KEYS = _PAYMENT_CONFIG_KEYS | _SUPPORT_CONFIG_KEYS | _TELEGRAM_CONFIG_KEYS


@router.get("/api/admin/config")
async def admin_get_config(db=Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """Platform admin: read payment + support SystemConfig entries (secrets-free values only).

    SECURITY (2026-09-05): this writes GLOBAL bank/wallet details shown on every
    tenant's /subscribe page — a tenant admin could previously redirect all
    platform payments to their own wallet. Now platform-admin only.
    """
    rows = await db.execute(select(SystemConfig).where(SystemConfig.key.in_(_ADMIN_CONFIG_KEYS)))
    return {"success": True, "data": {r.key: r.value for r in rows.scalars().all()}}


@router.post("/api/admin/config")
async def admin_set_config(body: dict = None, db=Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """Platform admin: set payment + support config (bank details, wallet phones, wallet cap,
    support contact info).

    Plan §2.4 — the bank details shown on /subscribe come from SystemConfig;
    env vars are only fallbacks. Setting a key to "" removes the DB override
    (falls back to env / frontend defaults).
    """
    if not body:
        raise HTTPException(400, "JSON body required")
    payload = body.get("config", body) if isinstance(body.get("config", body), dict) else None
    if not payload:
        raise HTTPException(400, "config object required")
    invalid = [k for k in payload if k not in _ADMIN_CONFIG_KEYS]
    if invalid:
        raise HTTPException(400, f"مفاتيح غير مسموحة: {', '.join(invalid)}")
    # validate wallet cap value
    if "mobile_wallet_cap" in payload:
        try:
            cap = int(float(payload["mobile_wallet_cap"]))
            if cap < 1 or cap > 10000:
                raise ValueError
            payload["mobile_wallet_cap"] = str(cap)
        except (TypeError, ValueError):
            raise HTTPException(400, "mobile_wallet_cap يجب أن يكون رقماً بين 1 و 10000")
    # validate support_email shape when provided (empty = clear override, allowed)
    import re as _re
    if "support_email" in payload and str(payload["support_email"] or "").strip():
        if not _re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', str(payload["support_email"]).strip()):
            raise HTTPException(400, "support_email يجب أن يكون بريداً إلكترونياً صالحاً")
    # telegram token shape (numeric:secret — 30+ chars) / chat id (numeric or @channel)
    if "telegram_bot_token" in payload and str(payload["telegram_bot_token"] or "").strip():
        tok = str(payload["telegram_bot_token"]).strip()
        if not _re.match(r'^\d{6,12}:[A-Za-z0-9_-]{30,}$', tok):
            raise HTTPException(400, "telegram_bot_token غير صالح — الصيغة: 123456789:AA... من BotFather")
    if "telegram_chat_id" in payload and str(payload["telegram_chat_id"] or "").strip():
        cid = str(payload["telegram_chat_id"]).strip()
        if not _re.match(r'^(-?\d{5,}|@[A-Za-z0-9_]{4,})$', cid):
            raise HTTPException(400, "telegram_chat_id غير صالح — معرف رقمي أو @قناة")
    from _audit import log_audit
    await log_audit(db, "admin_set_config", actor_id=current_user.id,
                    tenant_id=current_user._tenant_id, metadata={"keys": sorted(payload.keys())})
    for k, v in payload.items():
        v = str(v or "").strip()
        existing = await db.execute(select(SystemConfig).where(SystemConfig.key == k))
        row = existing.scalar_one_or_none()
        if v == "":
            if row:
                await db.delete(row)  # remove override → env/frontend fallback applies
            continue
        if row:
            row.value = v
            row.is_secret = False
        else:
            db.add(SystemConfig(key=k, value=v, is_secret=False))
    await db.commit()
    # invalidate the cached public /api/config so new values show immediately
    try:
        from _services import api_cache
        api_cache.clear_all()
    except Exception:
        pass
    return {"success": True, "data": {"updated": sorted(payload.keys())}}


from _bootstrap import seed_admin  # single source of truth (runner.py imports the same)


@router.post("/api/repair")
async def repair(current_user: User = Depends(require_platform_admin)):
    """Manual DB repair: create tables, run migrations, seed admin. Platform admin only."""
    try:
        async with engine.connect() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.commit()
        async with AsyncSessionLocal() as session:
            await seed_admin(session)
        return ok({"ok": True, "message": "DB repaired"})
    except Exception as e:
        log.error("DB repair failed", exc_info=True)
        raise HTTPException(status_code=500, detail="فشل إصلاح قاعدة البيانات — راجع سجلات الخادم")


@router.delete("/api/admin/tenants/{tenant_id}")
async def delete_tenant(tenant_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    """GDPR-compliant tenant deletion. Deletes all tenant-scoped data."""
    # Guard: only platform admin (no tenant) can delete other tenants
    if current_user._tenant_id and current_user._tenant_id != tenant_id:
        raise HTTPException(403, "لا يمكنك حذف مستأجر آخر")
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    tables = [
        SequenceSubscription, SequenceStep, BroadcastRecipient, SubscriberTag,
        Subscriber, Tag, FlowExecution, ConversationLabel, ConversationNote, ConversationAssignee,
        Customer, OfferClaim, Offer, ScheduledPost, AISuggestion, ReplyTemplate,
        Reply, BotLog, BotState, BrandConfig, Rule, AnalyticsEvent, BotAlert,
    ]
    for table in tables:
        await db.execute(table.__table__.delete().where(table.tenant_id == tenant_id))

    await db.execute(User.__table__.delete().where(User.tenant_id == tenant_id))
    await db.delete(tenant)
    await db.commit()
    return ok({"ok": True, "deleted_tenant_id": tenant_id})


@router.post("/api/admin/rules/{rule_id}/priority")
async def set_rule_priority(rule_id: int, priority: int = Form(...), db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    rule = (await db.execute(
        select(Rule).where(Rule.id == rule_id, Rule.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not rule: raise HTTPException(404, "Rule not found")
    rule.priority = max(0, min(9999, priority))
    await db.commit()
    return ok({"ok": True, "priority": rule.priority})


@router.post("/api/admin/cooldown")
async def set_cooldown(seconds: int = Form(...), _=Depends(require_role("admin"))):
    if seconds < 10 or seconds > 3600:
        raise HTTPException(400, "يجب أن تكون المدة بين 10 و3600 ثانية")
    from _services import get_bot_engine
    eng = get_bot_engine(tenant_id=_._tenant_id)
    eng.cooldown.adjust_window("global", seconds)
    return ok({"ok": True, "cooldown_seconds": seconds})


@router.get("/api/admin/template-vars")
async def template_vars(_=Depends(get_current_user)):
    return ok(
        {"vars": {"{name}": "الاسم الأول", "{full_name}": "الاسم الكامل",
                     "{username}": "اسم المستخدم", "{message}": "النص", "{mention}": "تاغ الإشعار"},
            "example": "شكراً {name} على تعليقك!"}
    )


@router.get("/api/admin/rules-categories")
async def rule_categories(_=Depends(get_current_user)):
    return ok(
        {"categories": [
        {"id": "negative", "label": "شكوى", "color": "red"},
        {"id": "complaint", "label": "شكوى صريحة", "color": "red"},
        {"id": "price_inquiry", "label": "استفسار سعر", "color": "blue"},
        {"id": "order", "label": "طلب شراء", "color": "green"},
        {"id": "contact", "label": "طلب تواصل", "color": "purple"},
        {"id": "question", "label": "سؤال", "color": "indigo"},
        {"id": "praise", "label": "إشادة", "color": "emerald"},
        {"id": "greeting", "label": "تحية", "color": "sky"},
        {"id": "urgent", "label": "عاجل", "color": "orange"},
        {"id": "neutral", "label": "محايد", "color": "gray"},
    ]}
    )


# ── Platform user management (platform admin only) ───────────────────────────
# Gives the operator cross-tenant visibility (who registered, which tenants are
# test leftovers) plus delegated platform-admin promotion — previously only
# reachable with direct DB access.

@router.get("/api/admin/platform/users")
async def platform_list_users(
    q: str = "", page: int = 1, page_size: int = 50,
    db=Depends(get_db), current_user: User = Depends(require_platform_admin),
):
    """Platform admin: paginated list of ALL users across tenants, searchable."""
    page = max(1, page)
    page_size = min(100, max(10, page_size))
    stmt = select(User)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(User.username.ilike(like), User.email.ilike(like)))
    total = await db.scalar(
        select(func.count()).select_from(stmt.order_by(None).subquery())
    ) or 0
    rows = await db.execute(
        stmt.order_by(desc(User.created_at)).offset((page - 1) * page_size).limit(page_size)
    )
    items = []
    for u in rows.scalars().all():
        items.append({
            "id": u.id, "username": u.username, "email": u.email or "",
            "role": u.role, "tenant_id": u.tenant_id,
            "is_platform_admin": is_platform_admin(u),
            "delegated": bool(u.tenant_id not in (None, 0) and u.is_platform_admin),
            "created_at": u.created_at.isoformat() + "Z" if u.created_at else None,
        })
    return ok({"items": items, "total": total, "page": page, "page_size": page_size})


@router.patch("/api/admin/platform/users/{user_id}")
async def platform_update_user(
    user_id: int, body: dict = None, db=Depends(get_db),
    current_user: User = Depends(require_platform_admin),
):
    """Platform admin: grant/revoke delegated platform-admin rights on a tenant user."""
    body = body or {}
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "المستخدم غير موجود")
    if user.tenant_id in (None, 0):
        raise HTTPException(400, "حساب الإقلاع مسؤول منصة بالضرورة — لا يمكن تعديل صلاحيته")
    if "is_platform_admin" not in body:
        raise HTTPException(400, "is_platform_admin مطلوب")
    new_val = bool(body["is_platform_admin"])
    user.is_platform_admin = new_val
    await db.commit()
    from _audit import log_audit
    await log_audit(db, "platform_admin_toggle", actor_id=current_user.id,
                    target_type="user", target_id=user.id,
                    metadata={"is_platform_admin": new_val})
    await db.commit()
    return ok({"id": user.id, "username": user.username, "is_platform_admin": is_platform_admin(user)})
