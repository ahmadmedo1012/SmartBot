"""Sequence CRUD + step + subscribe routes."""
# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
import logging

from _responses import ok
from database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from models import Sequence, SequenceStep, SubscriptionPlan, User
from sqlalchemy import func, select

from routers.auth import get_current_user, require_role
from routers.broadcasts import _json_body, _required_key

log = logging.getLogger("fb-api")
router = APIRouter(tags=["sequences"])


async def _enforce_has_sequences(db, tenant_id: int) -> None:
    """v22-D4 — بوابة خطة التسلسلات عند الإنشاء (كانت مفقودة كلياً).

    التسلسلات تُباع على خطتي Pro/Enterprise فقط (has_sequences=true)،
    بينما أنشأ مستأجرو Free تسلسلات فعلياً في الإنتاج (دليل v22:
    sequences.id=1 tenant 48 Free، id=2 tenant 46 Free). CLAUDE.md v15
    Convention #5: «ميزة مدفوعة بلا حارس هي علة لا TODO».

    نفس سابقة _enforce_max_rules في rules.py (v22-D3): القراءة عبر
    get_plan_limits (نقطة قراءة الخطة الوحيدة، مع انحدار المنتهية إلى
    Free)؛ غياب صف الخطة أو العلم = fail-open (عقيدة money-core)؛
    has_sequences=false → 403 عربية بالرسالة نفسها التي تستخدمها
    واجهة الترقية.
    """
    from bot_engine.pipeline import get_plan_limits
    limits = await get_plan_limits(db, tenant_id)
    if limits is None:
        return
    plan = await db.get(SubscriptionPlan, limits["plan_id"])
    has = getattr(plan, "has_sequences", None) if plan is not None else None
    if has is None or has:
        return
    raise HTTPException(
        403, "الحملات التسلسلية متاحة في خطة احترافي أو أعلى — رقِّ خطتك")



@router.get("/api/sequences")
async def list_sequences(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from _services import sequence_engine
    items = await sequence_engine.list_sequences(db, tenant_id=current_user._tenant_id)
    # v24-C4 (task 8): step_count per row — ONE grouped COUNT query over the
    # tenant's sequence_steps (the engine's own subscriber_count pattern —
    # list endpoints must not multiply queries), merged here in the router
    # because sequence_engine.py is owned by the datalayer agent. The
    # frontend already tolerates the field (step_count ?? steps?.length ?? 0).
    if items:
        step_rows = await db.execute(
            select(SequenceStep.sequence_id, func.count(SequenceStep.id))
            .where(
                SequenceStep.tenant_id == current_user._tenant_id,
                SequenceStep.sequence_id.in_([s["id"] for s in items]),
            )
            .group_by(SequenceStep.sequence_id)
        )
        step_map = {int(seq_id): int(cnt) for seq_id, cnt in step_rows.all()}
        for s in items:
            s["step_count"] = step_map.get(s["id"], 0)
    return ok(items)


@router.post("/api/sequences")
async def create_sequence(request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    # v24-C4 (H3): body["name"] → KeyError → 500 + false CRITICAL alert on a
    # plain client typo — adopt the v15-E3 clean-422 convention (broadcasts).
    body = await _json_body(request)
    name = _required_key(body, "name")
    # v22-D4: بوابة الخطة قبل الإنشاء — Pro/Enterprise فقط
    await _enforce_has_sequences(db, current_user._tenant_id)
    seq_id = await sequence_engine.create_sequence(
        name=name,
        description=body.get("description", ""),
        created_by=body.get("created_by", ""),
        session=db,
        tenant_id=current_user._tenant_id,
    )
    await db.commit()
    await db.refresh(await db.get(Sequence, seq_id))
    return ok({"id": seq_id})


@router.get("/api/sequences/{seq_id}")
async def get_sequence(seq_id: int, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from _services import sequence_engine
    seq = await sequence_engine.get_sequence(seq_id, db, tenant_id=current_user._tenant_id)
    if not seq:
        raise HTTPException(404, "التسلسل غير موجود")
    return ok(seq)


@router.put("/api/sequences/{seq_id}")
async def update_sequence(seq_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    # v24-C4 (H3): malformed JSON → 422 Arabic, not a 500 (v15-E3 convention).
    body = await _json_body(request)
    # v9-A5: local result var must NOT shadow the ok() envelope helper —
    # `ok = await ...` made the success path return ok(...) → TypeError 500
    # AFTER the update had already committed.
    done = await sequence_engine.update_sequence(seq_id, body, db, tenant_id=current_user._tenant_id)
    if not done:
        raise HTTPException(404, "التسلسل غير موجود")
    await db.commit()
    return ok({"ok": True})


@router.delete("/api/sequences/{seq_id}")
async def delete_sequence(seq_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    done = await sequence_engine.delete_sequence(seq_id, db, tenant_id=current_user._tenant_id)  # v9-A5: no ok-shadowing
    if not done:
        raise HTTPException(404, "التسلسل غير موجود")
    await db.commit()
    return ok({"ok": True})


@router.post("/api/sequences/{seq_id}/steps")
async def add_sequence_step(seq_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    # v24-C4 (H3): malformed JSON → 422 Arabic, not a 500 (v15-E3 convention).
    body = await _json_body(request)
    step_id = await sequence_engine.add_step(seq_id, body, db, tenant_id=current_user._tenant_id)
    await db.commit()
    return ok({"id": step_id})


@router.put("/api/sequences/steps/{step_id}")
async def update_sequence_step(step_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    # v24-C4 (H3): malformed JSON → 422 Arabic, not a 500 (v15-E3 convention).
    body = await _json_body(request)
    done = await sequence_engine.update_step(step_id, body, db, tenant_id=current_user._tenant_id)  # v9-A5: no ok-shadowing
    if not done:
        raise HTTPException(404, "الخطوة غير موجودة")
    await db.commit()
    return ok({"ok": True})


@router.delete("/api/sequences/steps/{step_id}")
async def delete_sequence_step(step_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    done = await sequence_engine.delete_step(step_id, db, tenant_id=current_user._tenant_id)  # v9-A5: no ok-shadowing
    if not done:
        raise HTTPException(404, "الخطوة غير موجودة")
    await db.commit()
    return ok({"ok": True})


@router.post("/api/sequences/{seq_id}/subscribe/{sub_id}")
async def subscribe_to_sequence(seq_id: int, sub_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    done = await sequence_engine.subscribe(sub_id, seq_id, db, tenant_id=current_user._tenant_id)  # v9-A5: no ok-shadowing
    await db.commit()
    return ok({"ok": done})


@router.post("/api/sequences/{seq_id}/unsubscribe/{sub_id}")
async def unsubscribe_from_sequence(seq_id: int, sub_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    done = await sequence_engine.unsubscribe(sub_id, seq_id, db, tenant_id=current_user._tenant_id)  # v9-A5: no ok-shadowing
    await db.commit()
    return ok({"ok": done})
