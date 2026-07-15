from __future__ import annotations
"""Reply Templates routes."""

from fastapi import APIRouter, Depends, HTTPException, Form, Query
from sqlalchemy import select, desc

from database import get_db
from models import ReplyTemplate, ScheduledPost, User
from routers.auth import get_current_user, require_role
from _services import fb, _track_event

router = APIRouter(prefix="", tags=["templates"])


@router.get("/api/templates")
async def list_templates(category: str = Query(""), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    stmt = select(ReplyTemplate).where(ReplyTemplate.tenant_id == _tid)
    if category:
        stmt = stmt.where(ReplyTemplate.category == category)
    rows = await db.execute(stmt.order_by(ReplyTemplate.category, ReplyTemplate.name))
    return [{"id": t.id, "name": t.name, "text": t.text, "category": t.category, "shortcut": t.shortcut}
            for t in rows.scalars().all()]


@router.post("/api/templates")
async def create_template(name: str = Form(...), text: str = Form(...), category: str = Form("general"),
                          shortcut: str = Form(""), db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    t = ReplyTemplate(name=name, text=text, category=category, shortcut=shortcut, tenant_id=current_user._tenant_id)
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return {"id": t.id}


@router.put("/api/templates/{template_id}")
async def update_template(template_id: int, name: str = Form(...), text: str = Form(...),
                          category: str = Form("general"), shortcut: str = Form(""),
                          db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    t = (await db.execute(
        select(ReplyTemplate).where(ReplyTemplate.id == template_id, ReplyTemplate.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "القالب غير موجود")
    t.name = name; t.text = text; t.category = category; t.shortcut = shortcut
    await db.commit()
    return {"ok": True}


@router.delete("/api/templates/{template_id}")
async def delete_template(template_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    t = (await db.execute(
        select(ReplyTemplate).where(ReplyTemplate.id == template_id, ReplyTemplate.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "القالب غير موجود")
    await db.delete(t)
    await db.commit()
    return {"ok": True}
