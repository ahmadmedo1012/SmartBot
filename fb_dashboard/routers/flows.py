"""Flow CRUD + toggle + test routes.

Product surface ruling (P21-W5-C1, from the W5-A1 audit): has_flows is an
API-only capability today — the web dashboard and mobile app ship NO flows
UI consumer (no nav entry, no /api/flows caller), so the gate's Arabic
upgrade copy is reachable only via direct API use. Documented deliberately
instead of building UI for an unsold surface; the gate itself (Premium+,
creation-time only, 403 «التدفقات متاحة في خطة مميز أو أعلى — رقِّ خطتك»)
is enforced and contract-pinned — a future flows UI inherits it for free.

P43-SB1 — the dormant engine is a REAL executor now (flow_engine.FlowRuntime
driven by messenger_service ingestion + the automation beat), so this router
grows the management surface the runtime needs:
  * POST/PUT validate the node/edge JSON (draft structure —
    ``validate_flow_structure``);
  * POST /{id}/publish — full graph validation (exactly one TRIGGER, edge
    refs, no orphan cycles) + the has_flows activation gate; draft→active;
  * POST /{id}/unpublish — active→paused (the live-run yield);
  * GET /{id}/executions — paginated execution history with status/error;
  * GET /{id}/stats — totals + messages sent (Message.flow_id attribution)
    + avg steps.
"""
# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
import logging

from _plan_gates import enforce_plan_feature
from _responses import ok
from _utils import iso_z
from database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from flow_engine import validate_flow_graph, validate_flow_structure
from models import Conversation, Flow, FlowExecution, Message, Subscriber, User
from sqlalchemy import func, select

from routers.auth import get_current_user, require_role
from routers.broadcasts import _json_body, _required_key

log = logging.getLogger("fb-api")
router = APIRouter(tags=["flows"])

ST_CYCLE = {"draft": "active", "active": "paused", "paused": "active"}


@router.get("/api/flows")
async def list_flows(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    flows = (await db.execute(
        select(Flow).where(Flow.tenant_id == current_user._tenant_id)
        .order_by(Flow.created_at.desc())
    )).scalars().all()
    # P45-W1 (Initiative A) — each flow's LAST execution summary (additive
    # aggregate): one grouped max(id) query + one IN fetch (the D-09/D-12
    # doctrine — never per-flow queries on the list path). Before this, no
    # list-level surface existed for "failing since X": the audit finding.
    last_ids: dict[int, int] = {}
    if flows:
        last_ids = dict((await db.execute(
            select(FlowExecution.flow_id, func.max(FlowExecution.id))
            .where(FlowExecution.tenant_id == current_user._tenant_id,
                   FlowExecution.flow_id.in_([f.id for f in flows]))
            .group_by(FlowExecution.flow_id)
        )).all())
    last_execs: dict[int, FlowExecution] = {}
    if last_ids:
        for ex in (await db.execute(
            select(FlowExecution).where(FlowExecution.id.in_(last_ids.values()))
        )).scalars().all():
            last_execs[ex.flow_id] = ex

    def _last_summary(f: Flow) -> dict | None:
        ex = last_execs.get(f.id)
        if ex is None:
            return None
        return {
            "id": ex.id, "status": ex.status,
            "started_at": iso_z(ex.started_at),
            "finished_at": iso_z(ex.completed_at),
        }

    return ok(
        [{
        "id": f.id, "name": f.name, "description": f.description,
        "status": f.status, "version": f.version, "total_replies": f.total_replies,
        "created_at": iso_z(f.created_at),
        "updated_at": iso_z(f.updated_at),
        "last_execution": _last_summary(f),
    } for f in flows]
    )


def _validated_graph_body(body: dict) -> tuple[list, list]:
    """P43-SB1 — structural node/edge validation (draft-level).

    Empty lists stay valid (a draft starts blank); anything present must be
    structurally sound. Malformed → clean 422 Arabic (the v15-E3 family —
    a client contract error, never a 500).
    """
    nodes = body.get("nodes", [])
    edges = body.get("edges", [])
    errors = validate_flow_structure(nodes, edges)
    if errors:
        raise HTTPException(422, "قيمة غير صالحة: " + "؛ ".join(errors[:4]))
    return nodes, edges


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
    nodes, edges = _validated_graph_body(body)
    flow = Flow(
        name=name,
        description=body.get("description", ""),
        nodes=nodes,
        edges=edges,
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
    _validated_graph_body(body)
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


@router.post("/api/flows/{flow_id}/publish")
async def publish_flow(flow_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    """P43-SB1 — draft→active: the ACTIVATION gate + full graph validation.

    Activation is where has_flows is enforced (per the P43 contract —
    execution itself stays open so downgraded tenants keep their live runs).
    The graph must be publishable: exactly one TRIGGER, all edges reference
    declared nodes, no orphan cycles without a terminal. The legacy /toggle
    cycle keeps its own contract (creation-time-only family doctrine).
    """
    flow = (await db.execute(
        select(Flow).where(Flow.id == flow_id, Flow.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "التدفق غير موجود")
    if flow.status not in ("draft", "paused"):
        raise HTTPException(422, f"لا يمكن نشر تدفق بحالة «{flow.status}» — النشر يبدأ من المسودة أو المتوقف")
    await enforce_plan_feature(db, current_user._tenant_id, "has_flows")
    errors = validate_flow_graph(flow.nodes, flow.edges)
    if errors:
        raise HTTPException(422, "قيمة غير صالحة: " + "؛ ".join(errors[:4]))
    flow.status = "active"
    flow.version = (flow.version or 1) + 1
    await db.commit()
    return ok({"status": flow.status, "version": flow.version})


@router.post("/api/flows/{flow_id}/unpublish")
async def unpublish_flow(flow_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    """P43-SB1 — active→paused: stops NEW trigger matches immediately.

    Runs already in flight keep advancing honestly: the runtime expires an
    active execution when it next touches a paused flow (never a silent
    dead-end). Re-publishing revalidates the graph + the plan gate.
    """
    flow = (await db.execute(
        select(Flow).where(Flow.id == flow_id, Flow.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "التدفق غير موجود")
    if flow.status != "active":
        raise HTTPException(422, f"لا يمكن إلغاء نشر تدفق بحالة «{flow.status}» — فقط المنشور يُلغى نشره")
    flow.status = "paused"
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


@router.get("/api/flows/{flow_id}/executions")
async def list_flow_executions(flow_id: int, db=Depends(get_db),
                               status: str = Query(""),
                               page: int = Query(1, ge=1),
                               per_page: int = Query(25, ge=1, le=100),
                               current_user: User = Depends(get_current_user)):
    """P43-SB1 — paginated execution history for one flow (tenant-scoped).

    ``status`` filters active/completed/failed/expired; every row carries
    its live resume point + error_log so the dashboard renders WHY a run
    died, not just that it did.

    P45-W1 (Initiative A) — additive joins: ``subscriber_name`` (WHO ran)
    and ``fb_conversation_id`` (WHERE — the deep-link id for «افتح في
    الوارد»). Batched IN lookups per page, both tenant-scoped; rows whose
    subscriber/conversation were pruned carry honest empty strings.
    """
    flow = (await db.execute(
        select(Flow).where(Flow.id == flow_id, Flow.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "التدفق غير موجود")
    base = select(FlowExecution).where(
        FlowExecution.tenant_id == current_user._tenant_id,
        FlowExecution.flow_id == flow_id,
    )
    if status:
        base = base.where(FlowExecution.status == status)
    total = await db.scalar(
        select(func.count()).select_from(base.subquery())) or 0
    rows = (await db.execute(
        base.order_by(FlowExecution.id.desc())
        .offset((page - 1) * per_page).limit(per_page)
    )).scalars().all()

    # P45-W1: batched tenant-scoped lookups for the page's rows (one query
    # each — the D-09/D-12 doctrine).
    sub_names: dict[int, str] = {}
    sub_ids = {ex.subscriber_id for ex in rows if ex.subscriber_id}
    if sub_ids:
        for sid, sname, sfirst in (await db.execute(
            select(Subscriber.id, Subscriber.name, Subscriber.first_name).where(
                Subscriber.tenant_id == current_user._tenant_id,
                Subscriber.id.in_(sub_ids))
        )).all():
            sub_names[sid] = sname or sfirst or ""
    fb_conv_ids: dict[int, str] = {}
    conv_ids = {ex.conversation_id for ex in rows if ex.conversation_id}
    if conv_ids:
        for cid, fbcid in (await db.execute(
            select(Conversation.id, Conversation.fb_conversation_id).where(
                Conversation.tenant_id == current_user._tenant_id,
                Conversation.id.in_(conv_ids))
        )).all():
            fb_conv_ids[cid] = fbcid

    return ok({
        "items": [{
            "id": ex.id,
            "status": ex.status,
            "subscriber_id": ex.subscriber_id,
            "subscriber_name": sub_names.get(ex.subscriber_id, "") if ex.subscriber_id else "",
            "conversation_id": ex.conversation_id,
            "fb_conversation_id": fb_conv_ids.get(ex.conversation_id, "") if ex.conversation_id else "",
            "trigger_type": ex.trigger_type,
            "current_node_id": ex.current_node_id,
            "resume_at": iso_z(ex.resume_at),
            "steps": ex.steps or 0,
            "error": ex.error_log or {},
            "started_at": iso_z(ex.started_at),
            "completed_at": iso_z(ex.completed_at),
        } for ex in rows],
        "total": int(total), "page": page, "per_page": per_page,
    })


@router.get("/api/flows/{flow_id}/stats")
async def flow_stats(flow_id: int, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """P43-SB1 — flow health at a glance (tenant-scoped, one round shape).

    ``messages_sent`` counts Message rows attributed to THIS flow
    (Message.flow_id — replies_by_bot with rule_id NULL), so per-flow
    delivery truth survives execution pruning.
    """
    flow = (await db.execute(
        select(Flow).where(Flow.id == flow_id, Flow.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not flow:
        raise HTTPException(404, "التدفق غير موجود")
    tenant_id = current_user._tenant_id
    by_status = dict(
        (await db.execute(
            select(FlowExecution.status, func.count(FlowExecution.id))
            .where(FlowExecution.tenant_id == tenant_id,
                   FlowExecution.flow_id == flow_id)
            .group_by(FlowExecution.status)
        )).all()
    )
    avg_steps = await db.scalar(
        select(func.avg(FlowExecution.steps)).where(
            FlowExecution.tenant_id == tenant_id,
            FlowExecution.flow_id == flow_id,
        )
    )
    messages_sent = await db.scalar(
        select(func.count(Message.id)).where(
            Message.tenant_id == tenant_id,
            Message.flow_id == flow_id,
            Message.replied_by_bot == True,  # noqa: E712 — SQLAlchemy filter idiom
        )
    ) or 0
    total = sum(by_status.values())
    return ok({
        "flow_id": flow_id,
        "status": flow.status,
        "total_executions": int(total),
        "active": int(by_status.get("active", 0)),
        "completed": int(by_status.get("completed", 0)),
        "failed": int(by_status.get("failed", 0)),
        "expired": int(by_status.get("expired", 0)),
        "messages_sent": int(messages_sent),
        "avg_steps": round(float(avg_steps), 2) if avg_steps is not None else 0.0,
        "total_replies": flow.total_replies or 0,
    })
