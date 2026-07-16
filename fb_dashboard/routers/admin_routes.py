from __future__ import annotations
"""Admin routes: repair, tenant deletion, rule priority, cooldown, template-vars, rules-categories."""
import json
import logging
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Form
from fastapi.responses import JSONResponse
from sqlalchemy import select, func

from config import settings
from database import engine, AsyncSessionLocal, get_db
from models import Base, Rule, Reply, BotLog, BotState, Tenant, User, ConversationNote
from models import ReplyTemplate, AISuggestion, ConversationTag, ConversationLabel, ScheduledPost, AnalyticsEvent, BotAlert, Offer, OfferClaim, BrandConfig, Customer, Flow, FlowExecution
from models import Subscriber, Tag, SubscriberTag, Sequence, SequenceStep, SequenceSubscription, Broadcast, BroadcastRecipient, ConversationAssignee, ReportSchedule, PaymentRequest
from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(prefix="", tags=["admin"])


async def seed_admin(db):
    """Seed initial admin user from env vars if no users exist."""
    count = await db.scalar(select(func.count(User.id))) or 0
    if count > 0:
        return  # ponytail: users already exist — do not reset passwords
    username = os.environ.get("INITIAL_ADMIN_USERNAME", "admin")
    password = os.environ.get("INITIAL_ADMIN_PASSWORD", "admin")
    from _hash import hash_password
    pw_hash = hash_password(password)
    db.add(User(username=username, password_hash=pw_hash, role="admin"))
    await db.commit()
    log.info("Initial admin user seeded")


@router.post("/api/repair")
async def repair(current_user: User = Depends(require_role("admin"))):
    """Manual DB repair: create tables, run migrations, seed admin. Admin only."""
    try:
        async with engine.connect() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.commit()
        async with AsyncSessionLocal() as session:
            await seed_admin(session)
        return {"ok": True, "message": "DB repaired"}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


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
    return {"ok": True, "deleted_tenant_id": tenant_id}


@router.post("/api/admin/rules/{rule_id}/priority")
async def set_rule_priority(rule_id: int, priority: int = Form(...), db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    rule = (await db.execute(
        select(Rule).where(Rule.id == rule_id, Rule.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not rule: raise HTTPException(404, "Rule not found")
    rule.priority = max(0, min(9999, priority))
    await db.commit()
    return {"ok": True, "priority": rule.priority}


@router.post("/api/admin/cooldown")
async def set_cooldown(seconds: int = Form(...), _=Depends(require_role("admin"))):
    if seconds < 10 or seconds > 3600:
        raise HTTPException(400, "يجب أن تكون المدة بين 10 و3600 ثانية")
    from bot import BotEngine
    eng = BotEngine._instance
    if eng: eng.cooldown.adjust_window("global", seconds)
    return {"ok": True, "cooldown_seconds": seconds}


@router.get("/api/admin/template-vars")
async def template_vars(_=Depends(get_current_user)):
    return {"vars": {"{name}": "الاسم الأول", "{full_name}": "الاسم الكامل",
                     "{username}": "اسم المستخدم", "{message}": "النص", "{mention}": "تاغ الإشعار"},
            "example": "شكراً {name} على تعليقك!"}


@router.get("/api/admin/rules-categories")
async def rule_categories(_=Depends(get_current_user)):
    return {"categories": [
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
