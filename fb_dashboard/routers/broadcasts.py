"""Broadcast CRUD + send + cancel + estimate routes."""
# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
import logging

# v15-E3 (C-BCAST1): `from _async import spawn` REMOVED — the send endpoint
# no longer spawns the fan-out. Vercel freezes the function the moment the
# response is written, so the spawned task never ran in production and the
# broadcast row stayed 'draft' forever (D1-C1: a paid feature dying silently).
# The endpoint now queues (draft → pending, atomic) and answers immediately;
# broadcast_engine.process_pending() — the outbox consumer E1 calls at the
# end of every bot cycle — claims (pending → sending) and fans out.
from _responses import ok
from _utils import iso_z
from broadcast_engine import tenant_broadcast_allowed
from database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from models import Broadcast, User
from sqlalchemy import desc, select, update

from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["broadcasts"])


async def _json_body(request: Request) -> dict:
    """D1-H1 (v15-E3): parse the JSON body or answer a clean 422 Arabic.

    Raw ``await request.json()`` raises ``JSONDecodeError`` on a malformed
    body → unhandled 500 + a CRITICAL Sentry/Telegram alert for what is a
    plain client typo. A bad body is a client contract error: 422 «قيمة غير
    صالحة», same family as the Pydantic validation_handler — never a 500.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(422, "قيمة غير صالحة: جسم الطلب ليس JSON صالحاً") from None
    if not isinstance(body, dict):
        raise HTTPException(422, "قيمة غير صالحة: جسم الطلب يجب أن يكون كائن JSON")
    return body


def _required_key(body: dict, key: str):
    """D1-H1 (v15-E3): ``body["key"]`` → KeyError → 500. Required keys answer
    422 Arabic (mirrors the validation_handler contract)."""
    if key not in body or body[key] is None:
        raise HTTPException(422, f"قيمة غير صالحة: الحقل '{key}' مطلوب")
    return body[key]


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
    # D1-H1 (v15-E3): JSON body + required 'name' → 422 Arabic, not a 500.
    body = await _json_body(request)
    name = _required_key(body, "name")
    # D2-H1 (v15-E3): the has_broadcast plan gate is checked at CREATION too
    # (not only at send) — a tenant on a plan without the broadcast feature
    # should not even draft one.
    allowed, reason = await tenant_broadcast_allowed(db, current_user._tenant_id)
    if not allowed:
        raise HTTPException(403, reason)
    bcast_id = await broadcast_engine.create_broadcast(
        name=name,
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
    # D1-H1 (v15-E3): malformed body → 422 Arabic, not a 500.
    body = await _json_body(request)
    done = await broadcast_engine.update_broadcast(bcast_id, body, db, tenant_id=current_user._tenant_id)  # v9-A5: no ok-shadowing
    if not done:
        raise HTTPException(404, "البث غير موجود")
    return ok({"ok": True})


@router.post("/api/broadcasts/{bcast_id}/send")
async def send_broadcast(bcast_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    bcast = (await db.execute(
        select(Broadcast).where(Broadcast.id == bcast_id, Broadcast.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not bcast:
        raise HTTPException(404, "البث غير موجود")
    # D2-H1 (v15-E3): plan gate — refuse before queueing (same message the
    # creation gate and the engine-level gate use).
    allowed, reason = await tenant_broadcast_allowed(db, current_user._tenant_id)
    if not allowed:
        raise HTTPException(403, reason)
    # v15-E3 (C-BCAST1): QUEUE, don't spawn. Atomic claim draft→pending
    # (UPDATE ... WHERE status='draft' RETURNING) — a double-click / two
    # concurrent tabs cannot both queue it — then commit and answer «في
    # الطابور» immediately. The fan-out happens in
    # broadcast_engine.process_pending(), which the bot cycle (E1) calls at
    # the end of every beat; on Vercel the old spawned task never ran past
    # the response, so the row sat 'draft' forever.
    row = (await db.execute(
        update(Broadcast)
        .where(Broadcast.id == bcast_id,
               Broadcast.tenant_id == current_user._tenant_id,
               Broadcast.status == "draft")
        .values(status="pending")
        .returning(Broadcast.id)
    )).scalar_one_or_none()
    if row is None:
        # Lost the race: already queued/sending/sent/cancelled → honest 400
        raise HTTPException(400, "يُرسل البث في حالة المسودة فقط — هذا البث مُجدول للإرسال أو أُرسل مسبقاً")
    await db.commit()
    return ok({
        "ok": True,
        "queued": True,
        "id": bcast_id,
        "message": "تم وضع البث في الطابور — سيبدأ الإرسال تلقائياً مع دورة البوت القادمة",
    })


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
    # D1-H1 (v15-E3): malformed body → 422 Arabic, not a 500.
    body = await _json_body(request)
    result = await broadcast_engine.estimate_audience(
        segment_filters=body.get("segment_filters", {}),
        platform_filter=body.get("platform_filter", {}),
        session=db,
        tenant_id=current_user._tenant_id,
    )
    return ok({"count": result["count"]})
