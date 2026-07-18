"""Rules CRUD routes: list, create, update, delete, toggle."""
import logging

from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy import select, func, desc

from database import get_db
from models import Rule, Reply, User
from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["rules"])


@router.get("/api/rules")
async def list_rules(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    rows = await db.execute(select(Rule).where(Rule.tenant_id == _tid).order_by(Rule.id))
    rules = rows.scalars().all()
    counts_stmt = select(Reply.rule_id, func.count(Reply.id).label("cnt")).where(Reply.tenant_id == _tid).group_by(Reply.rule_id)
    counts = {row[0]: row[1] for row in (await db.execute(counts_stmt))}
    return [{
        "id": r.id, "name": r.name, "keywords": r.keywords,
        "reply_template": r.reply_template,
        "dm_template": r.dm_template or "",
        "enabled": r.enabled, "description": r.description,
        "bot_type": "reply",
        "priority": getattr(r, "priority", 999),
        "replies_count": counts.get(r.id, 0),
    } for r in rules]


@router.post("/api/rules")
async def create_rule(
    name: str = Form(...), keywords: str = Form(...),
    reply_template: str = Form(...), description: str = Form(""),
    bot_type: str = Form("reply"), dm_template: str = Form(""),
    db=Depends(get_db), current_user: User = Depends(require_role("editor")),
):
    kw_list = [k.strip() for k in keywords.split(",") if k.strip()]
    rule = Rule(name=name, keywords=kw_list, reply_template=reply_template,
                description=description, dm_template=dm_template)
    rule.tenant_id = current_user._tenant_id
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {"id": rule.id}


@router.put("/api/rules/{rule_id}")
async def update_rule(
    rule_id: int, name: str = Form(...), keywords: str = Form(...),
    reply_template: str = Form(...), description: str = Form(""),
    dm_template: str = Form(""),
    db=Depends(get_db), current_user: User = Depends(require_role("editor")),
):
    rule = (await db.execute(
        select(Rule).where(Rule.id == rule_id, Rule.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    rule.name = name
    rule.keywords = [k.strip() for k in keywords.split(",") if k.strip()]
    rule.reply_template = reply_template
    rule.dm_template = dm_template
    rule.description = description
    await db.commit()
    return {"ok": True}


@router.delete("/api/rules/{rule_id}")
async def delete_rule(rule_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    rule = (await db.execute(
        select(Rule).where(Rule.id == rule_id, Rule.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    await db.delete(rule)
    await db.commit()
    return {"ok": True}


@router.post("/api/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    rule = (await db.execute(
        select(Rule).where(Rule.id == rule_id, Rule.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    rule.enabled = not rule.enabled
    await db.commit()
    return {"enabled": rule.enabled}
