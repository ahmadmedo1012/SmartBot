"""Content Calendar CRUD + publish routes."""
# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
from __future__ import annotations

from _responses import ok
from _services import content_calendar_engine, utcnow
from database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from models import User

from routers.auth import get_current_user, require_role
from routers.broadcasts import _json_body, _required_key

router = APIRouter(tags=["calendar"])


@router.get("/api/calendar")
async def calendar_list(
    # v24-C4 (H3): month=13 reached the engine's date(year, month, 1) →
    # ValueError → raw 500 (same family as the raw-body KeyErrors). Bound
    # year/month like the analytics `days` params — FastAPI's 422 handler
    # answers the clean Arabic validation error.
    year: int = Query(utcnow().year, ge=2000, le=3000),
    month: int = Query(utcnow().month, ge=1, le=12),
    db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return ok(await content_calendar_engine.get_calendar_posts(year, month, db, tenant_id=current_user._tenant_id))


@router.get("/api/calendar/day")
async def calendar_day(
    year: int = Query(..., ge=2000, le=3000),
    month: int = Query(..., ge=1, le=12),
    day: int = Query(..., ge=1, le=31),
    db=Depends(get_db), current_user: User = Depends(get_current_user)):
    # v24-C4 (H3): Feb 31 etc. still pass the per-field bounds but explode in
    # date() — answer the clean 422 instead of a raw 500.
    try:
        return ok(await content_calendar_engine.get_calendar_posts_by_date(
            year, month, day, db, tenant_id=current_user._tenant_id))
    except ValueError:
        raise HTTPException(422, "قيمة غير صالحة: التاريخ المطلوب غير موجود") from None


@router.post("/api/calendar")
async def calendar_create(request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    # v24-C4 (H3): body["message"] → KeyError → 500 + false CRITICAL alert
    # on a plain client typo — adopt the v15-E3 clean-422 convention
    # (broadcasts); the engine's ValueError stays the 400 contract.
    body = await _json_body(request)
    message = _required_key(body, "message")
    try:
        post_id = await content_calendar_engine.create_post(
            message=message,
            image_url=body.get("image_url", ""),
            scheduled_at=body.get("scheduled_at", ""),
            platform=body.get("platform", "facebook"),
            created_by="editor",
            session=db,
            tenant_id=current_user._tenant_id,
        )
        return ok({"id": post_id})
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.put("/api/calendar/{post_id}")
async def calendar_update(post_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    # v24-C4 (H3): malformed JSON → 422 Arabic, not a 500 (v15-E3 convention).
    data = await _json_body(request)
    done = await content_calendar_engine.update_post(post_id, data, db, tenant_id=current_user._tenant_id)  # v9-A5: no ok-shadowing
    if not done:
        raise HTTPException(404, "المنشور غير موجود")
    return ok({"ok": True})


@router.delete("/api/calendar/{post_id}")
async def calendar_delete(post_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    done = await content_calendar_engine.delete_post(post_id, db, tenant_id=current_user._tenant_id)  # v9-A5: no ok-shadowing
    if not done:
        raise HTTPException(404, "المنشور غير موجود")
    return ok({"ok": True})


@router.post("/api/calendar/{post_id}/publish")
async def calendar_publish(post_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    done = await content_calendar_engine.publish_post(post_id, db, tenant_id=current_user._tenant_id)  # v9-A5: no ok-shadowing
    if not done:
        raise HTTPException(404, "المنشور غير موجود أو فشل نشره")
    return ok({"ok": True})


@router.get("/api/calendar/month-summary")
async def calendar_month_summary(
    year: int = Query(..., ge=2000, le=3000),
    month: int = Query(..., ge=1, le=12),
    db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return ok(await content_calendar_engine.get_month_summary(year, month, db, tenant_id=current_user._tenant_id))
