"""Flow CRUD + toggle + test routes.

Product surface ruling (P21-W5-C1, from the W5-A1 audit): has_flows is an
API-only capability today — the web dashboard and mobile app ship NO flows
UI consumer (no nav entry, no /api/flows caller), so the gate's Arabic
upgrade copy is reachable only via direct API use. Documented deliberately
instead of building UI for an unsold surface; the gate itself (Premium+,
creation-time only, 403 «التدفقات متاحة في خطة مميز أو أعلى — رقِّ خطتك»)
is enforced and contract-pinned — a future flows UI inherits it for free.
"""
# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
import logging

from _plan_gates import enforce_plan_feature
from _responses import ok
from _utils import iso_z
from database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from models import Flow, FlowExecution, User
from sqlalchemy import select

from routers.auth import get_current_user, require_role
from routers.broadcasts import _json_body, _required_key

log = logging.getLogger("fb-api")
router = APIRouter(tags=["flows"])

ST_CYCLE = {"draft": "active", "active": "paused", "paused": "active"}


@router.get("/api/flows")
async def list_flows(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = await db.execute(select(Flow).where(Flow.tenant_id == current_user._tenant_id).order_by(Flow.created_at.desc()))
    return ok(
        [{
        "id": f.id, "name": f.name, "description": f.description,
        "status": f.status, "version": f.version, "total_replies": f.total_replies,
        "created_at": iso_z(f.created_at),
        "updated_at": iso_z(f.updated_at),
    } for f in rows.scalars().all()]
    )


@router.post("/api/flows")
async def create_flow(request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    # P21-W4-B: the has_flows gate joins the family — the canonical seed
    # (app/startup.py) carries real entitlement values (Free/Basic False,
    # Premium+ True); a seeded entitlement with no enforcement point is
    # exactly the decorative-flag pattern _plan_gates exists to end.
    # Creation-time only: existing flows keep running after a downgrade
    # (get/toggle/test/list stay open), same as the family doctrine.
    await enforce_plan_feature(db, current_user._tenant_id, "has_flows")
    # v24-C4 (H3): body["name"] → KeyError → 500 + false CRITICAL alert on a
    # plain client typo — adopt the v15-E3 clean-422 convention (broadcasts).
    body = await _json_body(request)
    name = _required_key(body, "name")
    flow = Flow(
        name=name,
        description=body.get("description", ""),
        nodes=body.get("nodes", []),
        edges=body.get("edges", []),
        tenant_id=current_user._tenant_id,
    )
    db.add(flow)
    await db.commit()
    await db.refresh(flow)
    return ok({"id": flow.id})


@router.get("/api/flows/{flow_id}")
async def get_flow(flow_id: int, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    flow = (await db.execute(
        select(Flow).where(Flow.id == flow_id, Flow.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "التدفق غير موجود")
    return ok(
        {
        "id": flow.id, "name": flow.name, "description": flow.description,
        "nodes": flow.nodes, "edges": flow.edges,
        "status": flow.status, "version": flow.version,
        "total_replies": flow.total_replies,
        "created_by": flow.created_by,
        "last_triggered_at": iso_z(flow.last_triggered_at),
        "created_at": iso_z(flow.created_at),
        "updated_at": iso_z(flow.updated_at),
    }
    )


@router.put("/api/flows/{flow_id}")
async def update_flow(flow_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    flow = (await db.execute(
        select(Flow).where(Flow.id == flow_id, Flow.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "التدفق غير موجود")
    # v24-C4 (H3): malformed JSON → 422 Arabic, not a 500 (v15-E3 convention).
    body = await _json_body(request)
    for key in ("name", "description", "nodes", "edges", "status"):
        if key in body:
            setattr(flow, key, body[key])
    await db.commit()
    return ok({"ok": True})


@router.delete("/api/flows/{flow_id}")
async def delete_flow(flow_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    flow = (await db.execute(
        select(Flow).where(Flow.id == flow_id, Flow.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "التدفق غير موجود")
    await db.execute(FlowExecution.__table__.delete().where(FlowExecution.flow_id == flow_id))
    await db.delete(flow)
    await db.commit()
    return ok({"ok": True})


@router.post("/api/flows/{flow_id}/toggle")
async def toggle_flow(flow_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    flow = (await db.execute(
        select(Flow).where(Flow.id == flow_id, Flow.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "التدفق غير موجود")
    flow.status = ST_CYCLE.get(flow.status, "active")
    await db.commit()
    return ok({"status": flow.status})


@router.post("/api/flows/{flow_id}/test")
async def test_flow(flow_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    # v24-C4 (H3): malformed JSON → 422 Arabic, not a 500 (v15-E3 convention).
    body = await _json_body(request)
    flow = (await db.execute(
        select(Flow).where(Flow.id == flow_id, Flow.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "التدفق غير موجود")
    from _services import flow_engine
    from flow_engine import FlowContext
    ctx = FlowContext(
        from_id=body.get("from_id", "test_123"),
        from_name=body.get("from_name", "Test"),
        text=body.get("text", ""),
        trigger_type="manual",
    )
    result = await flow_engine.execute(flow_id, ctx, db)
    return ok(result)
