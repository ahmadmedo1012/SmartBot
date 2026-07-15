"""Flow CRUD + toggle + test routes."""
import logging

from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy import select, func, desc

from database import get_db
from models import Flow, FlowExecution, User
from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["flows"])

ST_CYCLE = {"draft": "active", "active": "paused", "paused": "active"}


@router.get("/api/flows")
async def list_flows(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = await db.execute(select(Flow).where(Flow.tenant_id == current_user._tenant_id).order_by(Flow.created_at.desc()))
    return [{
        "id": f.id, "name": f.name, "description": f.description,
        "status": f.status, "version": f.version, "total_replies": f.total_replies,
        "created_at": f.created_at.isoformat() if f.created_at else None,
        "updated_at": f.updated_at.isoformat() if f.updated_at else None,
    } for f in rows.scalars().all()]


@router.post("/api/flows")
async def create_flow(request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    body = await request.json()
    flow = Flow(
        name=body["name"],
        description=body.get("description", ""),
        nodes=body.get("nodes", []),
        edges=body.get("edges", []),
        tenant_id=current_user._tenant_id,
    )
    db.add(flow)
    await db.commit()
    await db.refresh(flow)
    return {"id": flow.id}


@router.get("/api/flows/{flow_id}")
async def get_flow(flow_id: int, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    flow = (await db.execute(
        select(Flow).where(Flow.id == flow_id, Flow.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Flow not found")
    return {
        "id": flow.id, "name": flow.name, "description": flow.description,
        "nodes": flow.nodes, "edges": flow.edges,
        "status": flow.status, "version": flow.version,
        "total_replies": flow.total_replies,
        "created_by": flow.created_by,
        "last_triggered_at": flow.last_triggered_at.isoformat() if flow.last_triggered_at else None,
        "created_at": flow.created_at.isoformat() if flow.created_at else None,
        "updated_at": flow.updated_at.isoformat() if flow.updated_at else None,
    }


@router.put("/api/flows/{flow_id}")
async def update_flow(flow_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    flow = (await db.execute(
        select(Flow).where(Flow.id == flow_id, Flow.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Flow not found")
    body = await request.json()
    for key in ("name", "description", "nodes", "edges", "status"):
        if key in body:
            setattr(flow, key, body[key])
    await db.commit()
    return {"ok": True}


@router.delete("/api/flows/{flow_id}")
async def delete_flow(flow_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    flow = (await db.execute(
        select(Flow).where(Flow.id == flow_id, Flow.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Flow not found")
    await db.execute(FlowExecution.__table__.delete().where(FlowExecution.flow_id == flow_id))
    await db.delete(flow)
    await db.commit()
    return {"ok": True}


@router.post("/api/flows/{flow_id}/toggle")
async def toggle_flow(flow_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    flow = (await db.execute(
        select(Flow).where(Flow.id == flow_id, Flow.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Flow not found")
    flow.status = ST_CYCLE.get(flow.status, "active")
    await db.commit()
    return {"status": flow.status}


@router.post("/api/flows/{flow_id}/test")
async def test_flow(flow_id: int, request: Request, db=Depends(get_db), _=Depends(require_role("editor"))):
    body = await request.json()
    flow = (await db.execute(
        select(Flow).where(Flow.id == flow_id, Flow.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "Flow not found")
    from runner import flow_engine
    from flow_engine import FlowContext
    ctx = FlowContext(
        from_id=body.get("from_id", "test_123"),
        from_name=body.get("from_name", "Test"),
        text=body.get("text", ""),
        trigger_type="manual",
    )
    result = await flow_engine.execute(flow_id, ctx, db)
    return result
