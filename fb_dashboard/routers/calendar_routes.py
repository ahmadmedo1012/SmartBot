"""Content Calendar CRUD + publish routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select

from database import get_db
from models import User
from routers.auth import get_current_user, require_role
from _services import content_calendar_engine, utcnow

router = APIRouter(tags=["calendar"])


@router.get("/api/calendar")
async def calendar_list(year: int = Query(utcnow().year), month: int = Query(utcnow().month),
                        db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await content_calendar_engine.get_calendar_posts(year, month, db, tenant_id=current_user._tenant_id)


@router.get("/api/calendar/day")
async def calendar_day(year: int = Query(...), month: int = Query(...), day: int = Query(...),
                       db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await content_calendar_engine.get_calendar_posts_by_date(year, month, day, db, tenant_id=current_user._tenant_id)


@router.post("/api/calendar")
async def calendar_create(request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    body = await request.json()
    try:
        post_id = await content_calendar_engine.create_post(
            message=body["message"],
            image_url=body.get("image_url", ""),
            scheduled_at=body.get("scheduled_at", ""),
            platform=body.get("platform", "facebook"),
            created_by="editor",
            session=db,
            tenant_id=current_user._tenant_id,
        )
        return {"id": post_id}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/api/calendar/{post_id}")
async def calendar_update(post_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    data = await request.json()
    ok = await content_calendar_engine.update_post(post_id, data, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(404, "Post not found")
    return {"ok": True}


@router.delete("/api/calendar/{post_id}")
async def calendar_delete(post_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    ok = await content_calendar_engine.delete_post(post_id, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(404, "Post not found")
    return {"ok": True}


@router.post("/api/calendar/{post_id}/publish")
async def calendar_publish(post_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    ok = await content_calendar_engine.publish_post(post_id, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(404, "Post not found or publish failed")
    return {"ok": True}


@router.get("/api/calendar/month-summary")
async def calendar_month_summary(year: int = Query(...), month: int = Query(...),
                                 db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await content_calendar_engine.get_month_summary(year, month, db, tenant_id=current_user._tenant_id)
