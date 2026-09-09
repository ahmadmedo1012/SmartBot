# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
from __future__ import annotations

"""Reply Templates routes."""

import json

from _responses import ok
from database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from models import ReplyTemplate, User
from pydantic import BaseModel, ValidationError
from sqlalchemy import select

from routers.auth import get_current_user, require_role

router = APIRouter(prefix="", tags=["templates"])


class TemplateCreate(BaseModel):
    """v17-E-B1 (D5-F1): JSON body contract for create/update template.

    The tools page posts ``JSON.stringify`` (csrf-client sets
    ``Content-Type: application/json``) — the old ``Form(...)``-only signature
    422'd every attempt, so templates could never be created from the UI.
    """

    name: str
    text: str
    category: str = "general"
    shortcut: str = ""


async def _template_payload(request: Request) -> TemplateCreate:
    """v17-E-B1 (D5-F1): accept BOTH JSON and form-encoded bodies.

    Content-type decides the parse: JSON (the live frontend) goes through the
    Pydantic model; form/multipart (legacy/URLSearchParams clients) keeps the
    old Form(...) contract byte-for-byte (absent category still defaults to
    "general"). Malformed bodies answer 422 Arabic — same family as
    broadcasts._json_body, never a raw 500.
    """
    ctype = (request.headers.get("content-type") or "").lower()
    if "application/json" in ctype:
        try:
            data = json.loads(await request.body() or b"{}")
        except json.JSONDecodeError:
            raise HTTPException(422, "قيمة غير صالحة: جسم الطلب ليس JSON صالحاً") from None
        if not isinstance(data, dict):
            raise HTTPException(422, "قيمة غير صالحة: جسم الطلب يجب أن يكون كائن JSON")
    else:
        data = {k: v for k, v in (await request.form()).items()}
    try:
        return TemplateCreate(**data)
    except ValidationError:
        raise HTTPException(422, "قيمة غير صالحة: الحقلان 'name' و 'text' مطلوبان") from None


@router.get("/api/templates")
async def list_templates(category: str = Query(""), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    stmt = select(ReplyTemplate).where(ReplyTemplate.tenant_id == _tid)
    if category:
        stmt = stmt.where(ReplyTemplate.category == category)
    rows = await db.execute(stmt.order_by(ReplyTemplate.category, ReplyTemplate.name))
    return ok(
        [{"id": t.id, "name": t.name, "text": t.text, "category": t.category, "shortcut": t.shortcut}
            for t in rows.scalars().all()]
    )


@router.post("/api/templates")
async def create_template(request: Request, db=Depends(get_db),
                          current_user: User = Depends(require_role("editor"))):
    p = await _template_payload(request)
    t = ReplyTemplate(name=p.name, text=p.text, category=p.category, shortcut=p.shortcut,
                      tenant_id=current_user._tenant_id)
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return ok({"id": t.id})


@router.put("/api/templates/{template_id}")
async def update_template(template_id: int, request: Request, db=Depends(get_db),
                          current_user: User = Depends(require_role("editor"))):
    p = await _template_payload(request)
    t = (await db.execute(
        select(ReplyTemplate).where(ReplyTemplate.id == template_id, ReplyTemplate.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "القالب غير موجود")
    t.name = p.name
    t.text = p.text
    t.category = p.category
    t.shortcut = p.shortcut
    await db.commit()
    return ok({"ok": True})


@router.delete("/api/templates/{template_id}")
async def delete_template(template_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    t = (await db.execute(
        select(ReplyTemplate).where(ReplyTemplate.id == template_id, ReplyTemplate.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "القالب غير موجود")
    await db.delete(t)
    await db.commit()
    return ok({"ok": True})
