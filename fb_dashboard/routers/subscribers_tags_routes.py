"""Subscribers + Tags CRUD routes."""
# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
from _responses import ok
from _services import subscriber_engine, tag_engine
from database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from models import Subscriber, User

from routers.auth import get_current_user, require_role
from routers.broadcasts import _json_body, _required_key

router = APIRouter(tags=["subscribers"])


@router.get("/api/subscribers")
async def list_subscribers(
    search: str = Query(""), platform: str = Query(""), tag: str = Query(""),
    # v14-E3 (D10 §6): كانت page/per_page بلا قيود → ?per_page=100000 يسحب
    # الجدول كاملاً (سقف le=200 + ge=1 — نفس نمط inbox.py المسقوف)
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=200),
    db=Depends(get_db), current_user: User = Depends(get_current_user),
):
    return ok(
        await subscriber_engine.search(
        query=search, platform=platform, tag=tag,
        page=page, per_page=per_page, session=db,
        tenant_id=current_user._tenant_id,
    )
    )


@router.get("/api/subscribers/{sub_id}")
async def get_subscriber(sub_id: int, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    detail = await subscriber_engine.get_detail(sub_id, db, tenant_id=current_user._tenant_id)
    if not detail:
        raise HTTPException(404, "المشترك غير موجود")
    return ok(detail)


@router.post("/api/subscribers/{sub_id}/tags")
async def assign_subscriber_tag(sub_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    # v15-E3 (D1-H1): raw request.json()/body["tag_id"] were a 500 (JSONDecode
    # / KeyError) + critical alert on a client typo; now a clean 422 Arabic.
    body = await _json_body(request)
    tag_id = _required_key(body, "tag_id")
    done = await subscriber_engine.add_tag(sub_id, tag_id, db, tenant_id=current_user._tenant_id)  # v9-A5: no ok-shadowing
    return ok({"ok": done})


@router.delete("/api/subscribers/{sub_id}/tags/{tag_id}")
async def remove_subscriber_tag(sub_id: int, tag_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    done = await subscriber_engine.remove_tag(sub_id, tag_id, db, tenant_id=current_user._tenant_id)  # v9-A5: no ok-shadowing
    if not done:
        raise HTTPException(404, "الوسم غير معيّن لهذا المشترك")
    return ok({"ok": True})


@router.get("/api/tags")
async def list_tags(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return ok(await tag_engine.list_tags(db, tenant_id=current_user._tenant_id))


@router.post("/api/tags")
async def create_tag(request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    # v15-E3 (D1-H1): raw request.json()/body["name"] were a 500 (JSONDecode
    # / KeyError) + critical alert on a client typo; now a clean 422 Arabic.
    body = await _json_body(request)
    name = _required_key(body, "name")
    try:
        result = await tag_engine.create_tag(name, body.get("color", "#8A6FE0"), db, tenant_id=current_user._tenant_id)
        return ok(result)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.delete("/api/tags/{tag_id}")
async def delete_tag(tag_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    done = await tag_engine.delete_tag(tag_id, db, tenant_id=current_user._tenant_id)  # v9-A5: no ok-shadowing
    if not done:
        raise HTTPException(404, "الوسم غير موجود")
    return ok({"ok": True})


# ── W2-BOT-9 (P42-W3، تدقيق 3a): إلغاء الاشتراك من البث الجماعي ──────────────
# الفجوة: محرك التوزيع يستقبل status=="active" حصرًا (broadcast_engine.py
# fan-out + estimate) لكن لم يكن للمشترك مخرج من لوحة التاجر — زبون طلب
# التوقف كان يبقى «active» ويستمر البث يصله. العقد: إلغاء الاشتراك =
# status=inactive (يسقط من كل بث وتقدير لاحق — نفس معاملة الزبون الذي
# انسحب عبر البوت)، وإعادة الاشتراك تعيده. محصور بالمستأجر (نفس بوابة
# get_detail) وبصلاحيات editor (عائلة الكتابة في هذا الملف).
@router.post("/api/subscribers/{sub_id}/unsubscribe")
async def unsubscribe_subscriber(sub_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    sub = await db.get(Subscriber, sub_id)
    if not sub or sub.tenant_id != current_user._tenant_id:
        raise HTTPException(404, "المشترك غير موجود")
    if sub.status != "active":
        raise HTTPException(400, "المشترك ليس نشطاً أصلاً")
    sub.status = "inactive"
    await db.commit()
    return ok({"status": sub.status})


@router.post("/api/subscribers/{sub_id}/resubscribe")
async def resubscribe_subscriber(sub_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    sub = await db.get(Subscriber, sub_id)
    if not sub or sub.tenant_id != current_user._tenant_id:
        raise HTTPException(404, "المشترك غير موجود")
    if sub.status == "active":
        raise HTTPException(400, "المشترك نشط بالفعل")
    sub.status = "active"
    await db.commit()
    return ok({"status": sub.status})
