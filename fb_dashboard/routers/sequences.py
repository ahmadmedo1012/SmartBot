"""Sequence CRUD + step + subscribe routes."""
import logging

from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy import select, func, desc

from database import get_db
from models import Sequence, SequenceStep, SequenceSubscription, User
from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["sequences"])


@router.get("/api/sequences")
async def list_sequences(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from _services import sequence_engine
    return await sequence_engine.list_sequences(db, tenant_id=current_user._tenant_id)


@router.post("/api/sequences")
async def create_sequence(request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    body = await request.json()
    seq_id = await sequence_engine.create_sequence(
        name=body["name"],
        description=body.get("description", ""),
        created_by=body.get("created_by", ""),
        session=db,
        tenant_id=current_user._tenant_id,
    )
    await db.commit()
    await db.refresh(await db.get(Sequence, seq_id))
    return {"id": seq_id}


@router.get("/api/sequences/{seq_id}")
async def get_sequence(seq_id: int, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from _services import sequence_engine
    seq = await sequence_engine.get_sequence(seq_id, db, tenant_id=current_user._tenant_id)
    if not seq:
        raise HTTPException(404, "Sequence not found")
    return seq


@router.put("/api/sequences/{seq_id}")
async def update_sequence(seq_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    body = await request.json()
    ok = await sequence_engine.update_sequence(seq_id, body, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(404, "Sequence not found")
    await db.commit()
    return {"ok": True}


@router.delete("/api/sequences/{seq_id}")
async def delete_sequence(seq_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    ok = await sequence_engine.delete_sequence(seq_id, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(404, "Sequence not found")
    await db.commit()
    return {"ok": True}


@router.post("/api/sequences/{seq_id}/steps")
async def add_sequence_step(seq_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    body = await request.json()
    step_id = await sequence_engine.add_step(seq_id, body, db, tenant_id=current_user._tenant_id)
    await db.commit()
    return {"id": step_id}


@router.put("/api/sequences/steps/{step_id}")
async def update_sequence_step(step_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    body = await request.json()
    ok = await sequence_engine.update_step(step_id, body, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(404, "Step not found")
    await db.commit()
    return {"ok": True}


@router.delete("/api/sequences/steps/{step_id}")
async def delete_sequence_step(step_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    ok = await sequence_engine.delete_step(step_id, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(404, "Step not found")
    await db.commit()
    return {"ok": True}


@router.post("/api/sequences/{seq_id}/subscribe/{sub_id}")
async def subscribe_to_sequence(seq_id: int, sub_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    ok = await sequence_engine.subscribe(sub_id, seq_id, db, tenant_id=current_user._tenant_id)
    await db.commit()
    return {"ok": ok}


@router.post("/api/sequences/{seq_id}/unsubscribe/{sub_id}")
async def unsubscribe_from_sequence(seq_id: int, sub_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    from _services import sequence_engine
    ok = await sequence_engine.unsubscribe(sub_id, seq_id, db, tenant_id=current_user._tenant_id)
    await db.commit()
    return {"ok": ok}
