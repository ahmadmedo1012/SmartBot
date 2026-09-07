"""Broadcast CRUD + send + cancel + estimate routes."""
# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
import logging

from _async import spawn  # v9-A11: GC-safe background tasks
from _responses import ok
from _utils import iso_z
from database import AsyncSessionLocal, get_db
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from models import Broadcast, User
from sqlalchemy import desc, select

from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["broadcasts"])


@router.get("/api/broadcasts")
async def list_broadcasts(
    # v14-E3 (D10 §6): كانت القائمة بلا سقف — صف لكل حملة أنشأها المستأجر
    # قط، والصفحة تستطلعها كل 30ث. السقف هنا في الراوتر مباشرة (بحد
    # DB-side) — ملف broadcast_engine.py خارج ملكية هذا الوكيل، ودالة
    # محركه list_broadcasts تبقى بلا limit للاستخدامات الداخلية.
    limit: int = Query(50, ge=1, le=200),
    db=Depends(get_db), current_user: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(Broadcast)
        .where(Broadcast.tenant_id == current_user._tenant_id)
        .order_by(desc(Broadcast.created_at))
        .limit(limit)
    )).scalars().all()
    # نفس شكل حقول broadcast_engine.list_broadcasts حرفيًا — إن غُيّر هناك
    # فغيّر هنا (خطر انحراف موثّق في تقرير E3 للمنسّق).
    return ok([{
        "id": b.id,
        "name": b.name,
        "status": b.status,
        "total_recipients": b.total_recipients,
        "sent_count": b.sent_count,
        "failed_count": b.failed_count,
        "opened_count": b.opened_count,
        "created_by": b.created_by,
        "created_at": iso_z(b.created_at),
        "sent_at": iso_z(b.sent_at),
    } for b in rows])


@router.post("/api/broadcasts")
async def create_broadcast(request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import broadcast_engine
    body = await request.json()
    bcast_id = await broadcast_engine.create_broadcast(
        name=body["name"],
        message_template=body.get("message_template", ""),
        platform_filter=body.get("platform_filter", {}),
        segment_filters=body.get("segment_filters", {}),
        created_by="",
        session=db,
        tenant_id=current_user._tenant_id,
    )
    return ok({"id": bcast_id})


@router.get("/api/broadcasts/{bcast_id}")
async def get_broadcast(bcast_id: int, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from _services import broadcast_engine
    bcast = await broadcast_engine.get_broadcast(bcast_id, db, tenant_id=current_user._tenant_id)
    if not bcast:
        raise HTTPException(404, "البث غير موجود")
    return ok(bcast)


@router.put("/api/broadcasts/{bcast_id}")
async def update_broadcast(bcast_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import broadcast_engine
    body = await request.json()
    done = await broadcast_engine.update_broadcast(bcast_id, body, db, tenant_id=current_user._tenant_id)  # v9-A5: no ok-shadowing
    if not done:
        raise HTTPException(404, "البث غير موجود")
    return ok({"ok": True})


@router.post("/api/broadcasts/{bcast_id}/send")
async def send_broadcast(bcast_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    from _services import broadcast_engine
    bcast = (await db.execute(
        select(Broadcast).where(Broadcast.id == bcast_id, Broadcast.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not bcast:
        raise HTTPException(404, "البث غير موجود")
    if bcast.status != "draft":
        raise HTTPException(400, "يُرسل البث في حالة المسودة فقط")
    bc_id = bcast_id
    async def _send():
        async with AsyncSessionLocal() as s:
            await broadcast_engine.send_broadcast(bc_id, s)
    spawn(_send())
    return ok({"ok": True, "message": "Broadcast sending started"})


@router.post("/api/broadcasts/{bcast_id}/cancel")
async def cancel_broadcast(bcast_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    from _services import broadcast_engine
    done = await broadcast_engine.cancel_broadcast(bcast_id, db, tenant_id=current_user._tenant_id)  # v9-A5: no ok-shadowing
    if not done:
        raise HTTPException(400, "البث غير موجود أو لا يمكن إلغاؤه")
    return ok({"ok": True})


@router.post("/api/broadcasts/estimate")
async def estimate_broadcast_audience(request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import broadcast_engine
    body = await request.json()
    result = await broadcast_engine.estimate_audience(
        segment_filters=body.get("segment_filters", {}),
        platform_filter=body.get("platform_filter", {}),
        session=db,
        tenant_id=current_user._tenant_id,
    )
    return ok({"count": result["count"]})
