# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
from __future__ import annotations

"""Scheduled Posts routes."""

from datetime import UTC, datetime

from _responses import ok
from _services import _track_event, get_tenant_fb_client
from _utils import iso_z, utcnow
from database import get_db
from fastapi import APIRouter, Depends, Form, HTTPException, Query
from models import ScheduledPost, User
from sqlalchemy import desc, select

from routers.auth import get_current_user, require_role

router = APIRouter(prefix="", tags=["scheduled"])


@router.get("/api/scheduled-posts")
async def list_scheduled_posts(
    status: str = Query(""),
    # v15-E3 (D8-B6): the posts/scheduled pages poll this list every 30s and
    # the query had NO bound — scheduled posts are archival by nature (the
    # full message text + image_url per row), so history grew unbounded on
    # every poll. Default 50, max 200 (the v14-E3 cap shape).
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db=Depends(get_db), current_user: User = Depends(get_current_user),
):
    _tid = current_user._tenant_id
    stmt = select(ScheduledPost).where(ScheduledPost.tenant_id == _tid)
    if status:
        stmt = stmt.where(ScheduledPost.status == status)
    rows = await db.execute(
        stmt.order_by(desc(ScheduledPost.scheduled_at))
        .offset(offset).limit(limit)
    )
    return ok(
        [{
        "id": p.id, "message": p.message, "image_url": p.image_url,
        "scheduled_at": iso_z(p.scheduled_at),
        "status": p.status, "fb_post_id": p.fb_post_id,
        "created_by": p.created_by,
        "created_at": iso_z(p.created_at),
        "published_at": iso_z(p.published_at),
    } for p in rows.scalars().all()]
    )


@router.post("/api/scheduled-posts")
async def create_scheduled_post(
    message: str = Form(...), image_url: str = Form(""),
    scheduled_at: str = Form(""), db=Depends(get_db),
    current_user: User = Depends(require_role("editor")),
):
    sched = None
    if scheduled_at:
        # v4 §6.23 — honest timezone handling: accept ISO-8601 with or without
        # an offset. Naive values are treated as UTC (the API convention), the
        # frontend now sends toISOString() (always Z-suffixed). Past dates are
        # rejected instead of silently queueing an instantly-overdue post.
        try:
            sched = datetime.fromisoformat(
                scheduled_at.replace("Z", "+00:00").replace("+0000", "+00:00")
            )
        except ValueError:
            raise HTTPException(400, "صيغة التاريخ غير صالحة — استخدم ISO 8601") from None
        if sched.tzinfo is not None:
            sched = sched.astimezone(UTC).replace(tzinfo=None)
        if sched <= utcnow():
            raise HTTPException(400, "لا يمكن جدولة منشور في الماضي — اختر وقتاً مستقبلياً")

    post = ScheduledPost(
        message=message, image_url=image_url, scheduled_at=sched,
        status="draft" if not sched else "scheduled",
        created_by=current_user.username or "",
        tenant_id=current_user._tenant_id,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return ok({"id": post.id, "status": post.status})


@router.post("/api/scheduled-posts/{post_id}/publish")
async def publish_scheduled_post(post_id: int, db=Depends(get_db),
                                 current_user: User = Depends(require_role("editor"))):
    """Publish a scheduled post immediately or at its scheduled time.

    v4 §3.6 (G4) — uses the TENANT's page client (was the global env client,
    which is empty in production → "publish now" always failed) and honors
    the post's image_url via post_to_page_with_image."""
    post = (await db.execute(
        select(ScheduledPost).where(ScheduledPost.id == post_id, ScheduledPost.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not post:
        raise HTTPException(404, "المنشور غير موجود")
    fb = await get_tenant_fb_client(current_user._tenant_id)
    if fb is None:
        raise HTTPException(400, "لا توجد صفحة فيسبوك مرتبطة بحسابك — اربط صفحتك أولاً")
    if post.image_url:
        result = await fb.post_to_page_with_image(post.message, post.image_url)
    else:
        result = await fb.post_to_page(post.message)
    if not result:
        raise HTTPException(400, "فشل النشر على فيسبوك — تحقق من صلاحيات توكن الصفحة")
    post.status = "published"
    post.fb_post_id = result.get("id", "")
    post.published_at = utcnow()
    await db.commit()
    _track_event("post_published", {"scheduled_post_id": post_id}, tenant_id=current_user._tenant_id)
    return ok({"ok": True, "fb_post_id": post.fb_post_id})


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
    return ok({"ok": True})
