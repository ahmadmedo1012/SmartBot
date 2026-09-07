"""Multi-platform publisher routes."""
# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
from __future__ import annotations

from datetime import datetime

from _responses import ok
from _services import _track_event, get_publisher_engine, get_tenant_fb_client
from database import get_db
from fastapi import APIRouter, Body, Depends, HTTPException
from models import ScheduledPost, User

from routers.auth import get_current_user, require_role

router = APIRouter(tags=["publisher"])


@router.get("/api/publisher/status")
async def publisher_status(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    # v14-E2 (C-ENG1): fresh per-request engine + a REAL db load. The old
    # shared singleton answered with whichever tenant loaded credentials
    # LAST (and ``load_credentials(None)`` was a no-op) — one tenant's
    # configured state leaked into every other tenant's status card.
    engine = get_publisher_engine()
    await engine.load_credentials(db, tenant_id=current_user._tenant_id)
    return ok(engine.get_status())


@router.get("/api/publisher/settings/{platform}")
async def publisher_settings(platform: str, _=Depends(get_current_user)):
    engine = get_publisher_engine()
    return ok(
        {
        "platform": platform,
        "fields": engine.get_platform_settings_template(platform),
    }
    )


@router.post("/api/publisher/configure")
async def publisher_configure(data: dict = Body(...), db=Depends(get_db),
                               current_user: User = Depends(require_role("admin"))):
    platform = data.get("platform", "")
    creds = data.get("credentials", {})
    if not platform or not creds:
        raise HTTPException(400, "الحقلان مطلوبان: المنصة وبيانات الاعتماد")
    engine = get_publisher_engine()  # v14-E2 (C-ENG1): request-scoped engine
    saved = await engine.save_credentials(db, platform, creds, tenant_id=current_user._tenant_id)  # v9-A5: no ok-shadowing
    return ok({"ok": saved, "platform": platform})


@router.post("/api/publisher/publish")
async def publisher_publish(data: dict = Body(...), db=Depends(get_db),
                             current_user=Depends(require_role("editor"))):
    platform = data.get("platform", "facebook")
    message = data.get("message", "")
    image_url = data.get("image_url", "")
    scheduled_at = data.get("scheduled_at", "")

    if not message.strip():
        raise HTTPException(400, "نص المنشور مطلوب")

    if scheduled_at:
        try:
            sched = datetime.fromisoformat(scheduled_at)
        except ValueError:
            raise HTTPException(400, "صيغة التاريخ غير صالحة — استخدم ISO 8601") from None
        post = ScheduledPost(
            message=message, image_url=image_url, platform=platform,
            scheduled_at=sched, status="scheduled",
            created_by=current_user.username or "",
            tenant_id=current_user._tenant_id,
        )
        db.add(post)
        await db.commit()
        _track_event("post_scheduled", {"platform": platform})
        return ok({"id": post.id, "status": "scheduled", "scheduled_at": scheduled_at})

    # Publish immediately
    if platform == "facebook":
        # v12-E2.3: the tenant's own page client — was the GLOBAL env client
        # (``_services.fb``), which is unset in multi-tenant production, so an
        # immediate publish posted with the PLATFORM token (or failed outright).
        fb = await get_tenant_fb_client(current_user._tenant_id)
        if fb is None:
            raise HTTPException(400, "لا توجد صفحة فيسبوك مرتبطة بحسابك — اربط صفحتك أولاً")
        result = await fb.post_to_page(message)
        if not result:
            raise HTTPException(400, "فشل النشر على فيسبوك")
        fb_post_id = result.get("id", "")
        _track_event("post_published", {"platform": "facebook"})
        return ok({"platform": "facebook", "post_id": fb_post_id, "status": "published"})
    else:
        # v14-E2 (C-ENG1): fresh engine per request — the tenant's own
        # credentials are loaded and used inside THIS request only.
        engine = get_publisher_engine()
        await engine.load_credentials(db, tenant_id=current_user._tenant_id)
        result = await engine.publish_to_platform(platform, message, image_url)
        if not result:
            raise HTTPException(400, f"فشل النشر على {engine.get_platform_display_name(platform)}")
        _track_event("post_published", {"platform": platform})
        return ok({**result, "status": "published"})
