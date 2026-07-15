from __future__ import annotations
"""Scheduled Posts routes."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Form, Query
from sqlalchemy import select, desc

from _utils import utcnow
from database import get_db
from models import ReplyTemplate, ScheduledPost, User
from routers.auth import get_current_user, require_role
from _services import fb, _track_event

router = APIRouter(prefix="", tags=["scheduled"])


@router.get("/api/scheduled-posts")
async def list_scheduled_posts(status: str = Query(""), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    stmt = select(ScheduledPost).where(ScheduledPost.tenant_id == _tid)
    if status:
        stmt = stmt.where(ScheduledPost.status == status)
    rows = await db.execute(stmt.order_by(desc(ScheduledPost.scheduled_at)))
    return [{
        "id": p.id, "message": p.message, "image_url": p.image_url,
        "scheduled_at": p.scheduled_at.isoformat() if p.scheduled_at else None,
        "status": p.status, "fb_post_id": p.fb_post_id,
        "created_by": p.created_by,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "published_at": p.published_at.isoformat() if p.published_at else None,
    } for p in rows.scalars().all()]


@router.post("/api/scheduled-posts")
async def create_scheduled_post(
    message: str = Form(...), image_url: str = Form(""),
    scheduled_at: str = Form(""), db=Depends(get_db),
    current_user: User = Depends(require_role("editor")),
):
    sched = None
    if scheduled_at:
        try:
            sched = datetime.fromisoformat(scheduled_at)
        except ValueError:
            raise HTTPException(400, "صيغة التاريخ غير صالحة — استخدم ISO 8601")

    post = ScheduledPost(
        message=message, image_url=image_url, scheduled_at=sched,
        status="draft" if not sched else "scheduled",
        created_by=current_user.username or "",
        tenant_id=current_user._tenant_id,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return {"id": post.id, "status": post.status}


@router.post("/api/scheduled-posts/{post_id}/publish")
async def publish_scheduled_post(post_id: int, db=Depends(get_db),
                                 current_user: User = Depends(require_role("editor"))):
    """Publish a scheduled post immediately or at its scheduled time."""
    post = (await db.execute(
        select(ScheduledPost).where(ScheduledPost.id == post_id, ScheduledPost.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not post:
        raise HTTPException(404, "المنشور غير موجود")
    result = await fb.post_to_page(post.message)
    if not result:
        raise HTTPException(400, "فشل النشر على فيسبوك")
    post.status = "published"
    post.fb_post_id = result.get("id", "")
    post.published_at = utcnow()
    await db.commit()
    _track_event("post_published", {"scheduled_post_id": post_id})
    return {"ok": True, "fb_post_id": post.fb_post_id}


@router.delete("/api/scheduled-posts/{post_id}")
async def delete_scheduled_post(post_id: int, db=Depends(get_db),
                                current_user: User = Depends(require_role("editor"))):
    post = (await db.execute(
        select(ScheduledPost).where(ScheduledPost.id == post_id, ScheduledPost.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not post:
        raise HTTPException(404, "المنشور غير موجود")
    await db.delete(post)
    await db.commit()
    return {"ok": True}
