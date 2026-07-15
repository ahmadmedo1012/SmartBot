"""Multi-platform publisher routes."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy import select

from database import get_db
from models import ScheduledPost, User
from routers.auth import get_current_user, require_role
from _services import _publisher, fb, _track_event

router = APIRouter(tags=["publisher"])


@router.get("/api/publisher/status")
async def publisher_status(current_user: User = Depends(get_current_user)):
    _publisher.load_credentials(None, tenant_id=current_user._tenant_id)
    return _publisher.get_status()


@router.get("/api/publisher/settings/{platform}")
async def publisher_settings(platform: str, _=Depends(get_current_user)):
    return {
        "platform": platform,
        "fields": _publisher.get_platform_settings_template(platform),
    }


@router.post("/api/publisher/configure")
async def publisher_configure(data: dict = Body(...), db=Depends(get_db),
                               current_user: User = Depends(require_role("admin"))):
    platform = data.get("platform", "")
    creds = data.get("credentials", {})
    if not platform or not creds:
        raise HTTPException(400, "platform and credentials required")
    ok = await _publisher.save_credentials(db, platform, creds, tenant_id=current_user._tenant_id)
    return {"ok": ok, "platform": platform}


@router.post("/api/publisher/publish")
async def publisher_publish(data: dict = Body(...), db=Depends(get_db),
                             current_user=Depends(require_role("editor"))):
    platform = data.get("platform", "facebook")
    message = data.get("message", "")
    image_url = data.get("image_url", "")
    scheduled_at = data.get("scheduled_at", "")

    if not message.strip():
        raise HTTPException(400, "Message required")

    if scheduled_at:
        try:
            sched = datetime.fromisoformat(scheduled_at)
        except ValueError:
            raise HTTPException(400, "Invalid date format — use ISO 8601")
        _publisher.load_credentials(db, tenant_id=current_user._tenant_id)
        post = ScheduledPost(
            message=message, image_url=image_url, platform=platform,
            scheduled_at=sched, status="scheduled",
            created_by=current_user.username or "",
            tenant_id=current_user._tenant_id,
        )
        db.add(post)
        await db.commit()
        _track_event("post_scheduled", {"platform": platform})
        return {"id": post.id, "status": "scheduled", "scheduled_at": scheduled_at}

    # Publish immediately
    if platform == "facebook":
        result = await fb.post_to_page(message)
        if not result:
            raise HTTPException(400, "فشل النشر على فيسبوك")
        fb_post_id = result.get("id", "")
        _track_event("post_published", {"platform": "facebook"})
        return {"platform": "facebook", "post_id": fb_post_id, "status": "published"}
    else:
        _publisher.load_credentials(db, tenant_id=current_user._tenant_id)
        result = await _publisher.publish_to_platform(platform, message, image_url)
        if not result:
            raise HTTPException(400, f"فشل النشر على {_publisher.get_platform_display_name(platform)}")
        _track_event("post_published", {"platform": platform})
        return {**result, "status": "published"}
