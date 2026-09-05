"""Rules CRUD routes: list, create, update, delete, toggle."""
# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
import logging

from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy import select, func, desc

from database import get_db
from models import Rule, Reply, User, Message
from routers.auth import get_current_user, require_role
from _responses import ok

log = logging.getLogger("fb-api")
router = APIRouter(tags=["rules"])


async def _invalidate_engine_rules(tenant_id: int) -> None:
    """v4 §5.14 — rule edits must take effect immediately.

    The engine keeps a 120s TTL rule cache; without invalidation an edited
    rule kept firing (or stayed dead) for up to two minutes after save."""
    try:
        from _services import _bot_engines
        engine = _bot_engines.get(tenant_id)
        if engine is not None and getattr(engine, "_rule_cache", None) is not None:
            await engine._rule_cache.invalidate()
    except Exception as e:  # never fail a CRUD over cache invalidation
        log.warning(f"rule cache invalidation failed for tenant {tenant_id}: {e}")


@router.get("/api/rules")
async def list_rules(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    rows = await db.execute(select(Rule).where(Rule.tenant_id == _tid).order_by(Rule.priority, Rule.id))
    rules = rows.scalars().all()
    counts_stmt = select(Reply.rule_id, func.count(Reply.id).label("cnt")).where(Reply.tenant_id == _tid).group_by(Reply.rule_id)
    counts = {row[0]: row[1] for row in (await db.execute(counts_stmt))}
    # v4 §5.19 — bot DM replies (messages.rule_id) join the per-rule stats;
    # before, only comment replies counted → rules looked idle while the
    # messenger bot answered everything.
    dm_counts_stmt = select(Message.rule_id, func.count(Message.id).label("cnt")).where(
        Message.tenant_id == _tid, Message.rule_id.isnot(None), Message.is_from_page == True
    ).group_by(Message.rule_id)
    for row in (await db.execute(dm_counts_stmt)):
        counts[row[0]] = counts.get(row[0], 0) + row[1]
    return ok(
        [{
        "id": r.id, "name": r.name, "keywords": r.keywords,
        "reply_template": r.reply_template,
        "dm_template": r.dm_template or "",
        "enabled": r.enabled, "description": r.description,
        "bot_type": "reply",
        "priority": getattr(r, "priority", 999),
        "replies_count": counts.get(r.id, 0),
    } for r in rules]
    )


@router.post("/api/rules")
async def create_rule(
    name: str = Form(...), keywords: str = Form(...),
    reply_template: str = Form(...), description: str = Form(""),
    bot_type: str = Form("reply"), dm_template: str = Form(""),
    priority: int = Form(999),
    db=Depends(get_db), current_user: User = Depends(require_role("editor")),
):
    # v4 §5.14 — priority is finally settable from the API/UI (was write-dead:
    # every rule defaulted to 999 and UI had no field)
    priority = max(1, min(999, priority))
    kw_list = [k.strip() for k in keywords.split(",") if k.strip()]
    rule = Rule(name=name, keywords=kw_list, reply_template=reply_template,
                description=description, dm_template=dm_template, priority=priority)
    rule.tenant_id = current_user._tenant_id
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    await _invalidate_engine_rules(current_user._tenant_id)
    return ok({"id": rule.id})


@router.put("/api/rules/{rule_id}")
async def update_rule(
    rule_id: int, name: str = Form(...), keywords: str = Form(...),
    reply_template: str = Form(...), description: str = Form(""),
    dm_template: str = Form(""), priority: int | None = Form(None),
    db=Depends(get_db), current_user: User = Depends(require_role("editor")),
):
    rule = (await db.execute(
        select(Rule).where(Rule.id == rule_id, Rule.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "القاعدة غير موجودة")
    rule.name = name
    rule.keywords = [k.strip() for k in keywords.split(",") if k.strip()]
    rule.reply_template = reply_template
    rule.dm_template = dm_template
    rule.description = description
    if priority is not None:
        rule.priority = max(1, min(999, priority))
    await db.commit()
    await _invalidate_engine_rules(current_user._tenant_id)
    return ok({"ok": True})


@router.delete("/api/rules/{rule_id}")
async def delete_rule(rule_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    rule = (await db.execute(
        select(Rule).where(Rule.id == rule_id, Rule.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "القاعدة غير موجودة")
    await db.delete(rule)
    await db.commit()
    await _invalidate_engine_rules(current_user._tenant_id)
    return ok({"ok": True})


@router.post("/api/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    rule = (await db.execute(
        select(Rule).where(Rule.id == rule_id, Rule.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "القاعدة غير موجودة")
    rule.enabled = not rule.enabled
    await db.commit()
    await _invalidate_engine_rules(current_user._tenant_id)
    return ok({"enabled": rule.enabled})
