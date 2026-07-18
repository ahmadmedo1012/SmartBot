"""Broadcast CRUD + send + cancel + estimate routes."""
import asyncio
import logging

from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy import select, func, desc

from database import get_db, AsyncSessionLocal
from models import Broadcast, BroadcastRecipient, User
from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["broadcasts"])


@router.get("/api/broadcasts")
async def list_broadcasts(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from _services import broadcast_engine
    return await broadcast_engine.list_broadcasts(db, tenant_id=current_user._tenant_id)


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
    return {"id": bcast_id}


@router.get("/api/broadcasts/{bcast_id}")
async def get_broadcast(bcast_id: int, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from _services import broadcast_engine
    bcast = await broadcast_engine.get_broadcast(bcast_id, db, tenant_id=current_user._tenant_id)
    if not bcast:
        raise HTTPException(404, "Broadcast not found")
    return bcast


@router.put("/api/broadcasts/{bcast_id}")
async def update_broadcast(bcast_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import broadcast_engine
    body = await request.json()
    ok = await broadcast_engine.update_broadcast(bcast_id, body, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(404, "Broadcast not found")
    return {"ok": True}


@router.post("/api/broadcasts/{bcast_id}/send")
async def send_broadcast(bcast_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    from _services import broadcast_engine
    bcast = (await db.execute(
        select(Broadcast).where(Broadcast.id == bcast_id, Broadcast.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not bcast:
        raise HTTPException(404, "Broadcast not found")
    if bcast.status != "draft":
        raise HTTPException(400, "Only draft broadcasts can be sent")
    bc_id = bcast_id
    async def _send():
        async with AsyncSessionLocal() as s:
            await broadcast_engine.send_broadcast(bc_id, s)
    asyncio.create_task(_send())
    return {"ok": True, "message": "Broadcast sending started"}


@router.post("/api/broadcasts/{bcast_id}/cancel")
async def cancel_broadcast(bcast_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    from _services import broadcast_engine
    ok = await broadcast_engine.cancel_broadcast(bcast_id, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(400, "Broadcast not found or not cancellable")
    return {"ok": True}


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
    return {"count": result["count"]}
