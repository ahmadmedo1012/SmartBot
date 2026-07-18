"""Subscribers + Tags CRUD routes."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select

from database import get_db
from models import User
from routers.auth import get_current_user, require_role
from _services import subscriber_engine, tag_engine

router = APIRouter(tags=["subscribers"])


@router.get("/api/subscribers")
async def list_subscribers(
    search: str = Query(""), platform: str = Query(""), tag: str = Query(""),
    page: int = Query(1), per_page: int = Query(20),
    db=Depends(get_db), current_user: User = Depends(get_current_user),
):
    return await subscriber_engine.search(
        query=search, platform=platform, tag=tag,
        page=page, per_page=per_page, session=db,
        tenant_id=current_user._tenant_id,
    )


@router.get("/api/subscribers/{sub_id}")
async def get_subscriber(sub_id: int, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    detail = await subscriber_engine.get_detail(sub_id, db, tenant_id=current_user._tenant_id)
    if not detail:
        raise HTTPException(404, "Subscriber not found")
    return detail


@router.post("/api/subscribers/{sub_id}/tags")
async def assign_subscriber_tag(sub_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    body = await request.json()
    ok = await subscriber_engine.add_tag(sub_id, body["tag_id"], db, tenant_id=current_user._tenant_id)
    return {"ok": ok}


@router.delete("/api/subscribers/{sub_id}/tags/{tag_id}")
async def remove_subscriber_tag(sub_id: int, tag_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    ok = await subscriber_engine.remove_tag(sub_id, tag_id, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(404, "Tag not assigned to subscriber")
    return {"ok": True}


@router.get("/api/tags")
async def list_tags(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await tag_engine.list_tags(db, tenant_id=current_user._tenant_id)


@router.post("/api/tags")
async def create_tag(request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    body = await request.json()
    try:
        result = await tag_engine.create_tag(body["name"], body.get("color", "#6366f1"), db, tenant_id=current_user._tenant_id)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/api/tags/{tag_id}")
async def delete_tag(tag_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    ok = await tag_engine.delete_tag(tag_id, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(404, "Tag not found")
    return {"ok": True}
