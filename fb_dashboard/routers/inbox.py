# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
from __future__ import annotations
"""Inbox & conversations routes."""
import json
import logging

from fastapi import APIRouter, Depends, Query, HTTPException, Form
from sqlalchemy import select, func, and_

from config import settings
from database import get_db, AsyncSessionLocal
from models import ConversationLabel, ConversationNote, ConversationTag, User, AnalyticsEvent, Conversation, Message
from routers.auth import get_current_user, require_role
from _services import get_tenant_fb_client, _track_event
from _responses import ok
from _utils import iso_z

log = logging.getLogger("fb-api")
router = APIRouter(tags=["inbox"])

# ponytail: per-tenant fb client cache — dict[tenant_id, FBClient].
# Evict on token refresh. Replace with Redis-backed registry when multi-worker.
_tenant_fb_cache: dict[int, object] = {}

async def _get_inbox_fb(tenant_id: int):
    """Resolve (and cache) the tenant's FB client. Awaited — get_tenant_fb_client is async."""
    if tenant_id not in _tenant_fb_cache:
        fb = await get_tenant_fb_client(tenant_id)
        if fb is None:
            raise HTTPException(400, "لم يتم إعداد فيسبوك بعد — اربط صفحتك من صفحة /connect")
        _tenant_fb_cache[tenant_id] = fb
    return _tenant_fb_cache[tenant_id]


@router.get("/api/inbox/conversations")
async def inbox_list(
    status: str = Query("all"), tag: str = Query(""), search: str = Query(""),
    page: int = Query(1), per_page: int = Query(25), current_user: User = Depends(get_current_user),
):
    """Professional inbox: DB-FIRST (v3 final-launch §4.2).

    The webhook ingestion path (runner /webhook → messenger_service) persists
    every inbound message to the Conversation/Message tables — the inbox MUST
    surface those within seconds. Legacy behavior was live-Graph-only: an
    expired/invalid token showed an empty list even while messages kept
    arriving (the "everything is zero" complaint). Now:
      1. best-effort live sync: upsert conversations FB knows about (failures
         are non-fatal — offline/expired token just skips the refresh)
      2. serve the DB rows (filters: status/tag/search) — same item shape as
         before so the dashboard consumes it unchanged.
    """
    tenant_id = current_user._tenant_id

    # ── 1) best-effort live refresh ──
    try:
        fb = await _get_inbox_fb(tenant_id)
        convos = await fb.get_conversations(50)
        if convos:
            async with AsyncSessionLocal() as s:
                for c in convos:
                    cid = str(c.get("id") or "")
                    if not cid:
                        continue
                    senders = (c.get("senders") or {}).get("data") or []
                    name = (senders[0].get("name") if senders else "") or ""
                    row = (await s.execute(
                        select(Conversation).where(
                            Conversation.tenant_id == tenant_id,
                            Conversation.fb_conversation_id == cid,
                        )
                    )).scalar_one_or_none()
                    if row is None:
                        s.add(Conversation(
                            tenant_id=tenant_id, fb_conversation_id=cid,
                            fb_user_id=str(senders[0].get("id", "") if senders else ""),
                            user_name=name,
                            message_count=int(c.get("message_count") or 0),
                            unread_count=int(c.get("unread_count") or 0),
                            last_message_text=str(c.get("subject") or ""),
                        ))
                    else:
                        row.message_count = max(row.message_count or 0, int(c.get("message_count") or 0))
                        row.unread_count = int(c.get("unread_count") or row.unread_count or 0)
                        if name:
                            row.user_name = name
                await s.commit()
    except Exception:
        pass  # expired token / offline — DB rows below still serve

    # ── 2) DB rows → response items (legacy shape) ──
    async with AsyncSessionLocal() as s:
        rows = (await s.execute(
            select(Conversation)
            .where(Conversation.tenant_id == tenant_id)
            .order_by(Conversation.last_message_at.desc())
            .limit(200)
        )).scalars().all()
        items = [{
            "id": c.fb_conversation_id,
            "subject": (c.last_message_text or "")[:80] or "بدون موضوع",
            "senders": [{"name": c.user_name or c.fb_user_id or "غير معروف"}],
            "message_count": c.message_count or 0,
            "unread_count": c.unread_count or 0,
            "updated_time": iso_z(c.last_message_at),
            "tags": [],
        } for c in rows]

        # Load tags from DB for all conversation IDs
        if items:
            ids = [it["id"] for it in items]
            lbls = await s.execute(
                select(ConversationLabel, ConversationTag)
                .join(ConversationTag, ConversationLabel.tag_id == ConversationTag.id)
                .where(ConversationLabel.conversation_id.in_(ids))
            )
            tag_map: dict[str, list] = {}
            for lbl, tag in lbls:
                tag_map.setdefault(lbl.conversation_id, []).append({"id": tag.id, "name": tag.name, "color": tag.color})
            for it in items:
                it["tags"] = tag_map.get(it["id"], [])

    # Server-side search filter
    if search:
        sl = search.lower()
        items = [it for it in items if sl in it["subject"].lower()
                 or any(sl in (s.get("name", "") or "").lower() for s in it["senders"])]

    # Tag filter
    if tag:
        items = [it for it in items if any(t["name"] == tag for t in it["tags"])]

    # Status filter
    if status == "unread":
        items = [it for it in items if it["unread_count"] > 0]
    elif status == "read":
        items = [it for it in items if it["unread_count"] == 0]
    elif status == "needs_reply":
        items = [it for it in items if it["unread_count"] > 0 and it["message_count"] > 0]

    total = len(items)
    offset = (page - 1) * per_page
    paged = items[offset:offset + per_page]
    return ok({"items": paged, "total": total, "page": page, "per_page": per_page})


@router.get("/api/inbox/conversations/{conversation_id}")
async def inbox_messages(conversation_id: str, current_user: User = Depends(get_current_user)):
    """Get full conversation messages — DB-first (v3 final-launch §4.2).

    Webhook-persisted conversations (synthetic or real ids) serve their
    stored thread instantly; live-FB-only conversations fall back to a Graph
    fetch. Response shape unchanged: [{id, message, from, created_time}].
    """
    tenant_id = current_user._tenant_id
    async with AsyncSessionLocal() as s:
        row = (await s.execute(
            select(Conversation).where(
                Conversation.tenant_id == tenant_id,
                Conversation.fb_conversation_id == conversation_id,
            )
        )).scalar_one_or_none()
        if row:
            msgs = (await s.execute(
                select(Message)
                .where(Message.conversation_id == row.id)
                .order_by(Message.created_at.asc())
                .limit(200)
            )).scalars().all()
            return ok([{
                "id": str(m.fb_message_id or m.id),
                "message": m.text or "",
                "from": {"id": m.sender_id or "", "name": m.sender_name or ("الصفحة" if m.is_from_page else "")},
                "created_time": iso_z(m.created_at),
            } for m in msgs])

    # DB miss → live Graph fetch (conversation discovered via live sync)
    fb = await _get_inbox_fb(tenant_id)
    messages = await fb.get_conversation_messages(conversation_id)
    return ok(
        [{
        "id": m["id"], "message": m.get("message", ""),
        "from": m.get("from", {}),
        "created_time": m.get("created_time", ""),
    } for m in messages]
    )


@router.delete("/api/inbox/conversations/{conversation_id}")
async def inbox_delete_conversation(
    conversation_id: str, db=Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Delete a conversation (and its messages) from the tenant inbox (v3 §4).

    Tenant-scoped. Messages are removed explicitly (portable across SQLite
    test envs where FK cascade may be off) before the conversation row."""
    tenant_id = current_user._tenant_id
    row = (await db.execute(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.fb_conversation_id == conversation_id,
        )
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "المحادثة غير موجودة")
    await db.execute(
        Message.__table__.delete().where(
            Message.tenant_id == tenant_id, Message.conversation_id == row.id))
    await db.delete(row)
    await db.commit()
    _track_event("inbox_conversation_deleted", {"conversation_id": conversation_id[:60]},
                 tenant_id=tenant_id)
    return ok({"ok": True})


@router.post("/api/inbox/conversations/{conversation_id}/reply")
async def inbox_reply(
    conversation_id: str, message: str = Form(...),
    current_user: User = Depends(require_role("editor")),
):
    """Send a reply in a conversation. Tries Messenger first, falls back to private_reply."""
    fb = await _get_inbox_fb(current_user._tenant_id)
    # Try Messenger conversation reply
    result = await fb.send_conversation_message(conversation_id, message)
    if result:
        _track_event("inbox_reply_sent", {"conversation_id": conversation_id}, tenant_id=current_user._tenant_id)
        return ok({"ok": True})

    # Fallback: try private_reply (works for ANY comment, no prior conversation needed)
    result = await fb.send_private_reply(conversation_id, message)
    if result and not result.get("_error"):
        _track_event("inbox_reply_sent", {"conversation_id": conversation_id}, tenant_id=current_user._tenant_id)
        return ok({"ok": True})

    raise HTTPException(400, "لم يتم الرد — راجع سجل الخادم لتفاصيل خطأ فيسبوك")


@router.get("/api/inbox/tags")
async def inbox_list_tags(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all conversation tags."""
    rows = await db.execute(select(ConversationTag).where(ConversationTag.tenant_id == current_user._tenant_id))
    return ok([{"id": t.id, "name": t.name, "color": t.color} for t in rows.scalars().all()])


@router.post("/api/inbox/tags")
async def inbox_create_tag(name: str = Form(...), color: str = Form("#6366f1"),
                           db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    """Create a new tag."""
    existing = await db.execute(select(ConversationTag).where(ConversationTag.name == name))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "اسم الوسم موجود مسبقاً")
    tag = ConversationTag(name=name, color=color, tenant_id=current_user._tenant_id)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return ok({"id": tag.id, "name": tag.name, "color": tag.color})


@router.delete("/api/inbox/tags/{tag_id}")
async def inbox_delete_tag(tag_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    tag = (await db.execute(
        select(ConversationTag).where(ConversationTag.id == tag_id, ConversationTag.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not tag:
        raise HTTPException(404, "الوسم غير موجود")
    await db.execute(ConversationLabel.__table__.delete().where(ConversationLabel.tag_id == tag_id))
    await db.delete(tag)
    await db.commit()
    return ok({"ok": True})


@router.post("/api/inbox/conversations/{conv_id}/tags")
async def inbox_assign_tag(conv_id: str, tag_id: int = Form(...),
                           db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    """Assign a tag to a conversation."""
    tag = (await db.execute(
        select(ConversationTag).where(ConversationTag.id == tag_id, ConversationTag.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not tag:
        raise HTTPException(404, "الوسم غير موجود")
    existing = await db.execute(
        select(ConversationLabel).where(
            and_(ConversationLabel.conversation_id == conv_id, ConversationLabel.tag_id == tag_id))
    )
    if not existing.scalar_one_or_none():
        db.add(ConversationLabel(conversation_id=conv_id, tag_id=tag_id))
        await db.commit()
    return ok({"ok": True})


@router.delete("/api/inbox/conversations/{conv_id}/tags/{tag_id}")
async def inbox_remove_tag(conv_id: str, tag_id: int,
                           db=Depends(get_db), _=Depends(require_role("editor"))):
    await db.execute(
        ConversationLabel.__table__.delete().where(
            and_(ConversationLabel.conversation_id == conv_id, ConversationLabel.tag_id == tag_id))
    )
    await db.commit()
    return ok({"ok": True})
