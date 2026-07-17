from __future__ import annotations
"""Inbox & conversations routes."""
import json
import logging

from fastapi import APIRouter, Depends, Query, HTTPException, Form
from sqlalchemy import select, func, and_

from config import settings
from database import get_db, AsyncSessionLocal
from models import ConversationLabel, ConversationNote, ConversationTag, User, AnalyticsEvent
from routers.auth import get_current_user, require_role
from _services import get_tenant_fb_client, _track_event

log = logging.getLogger("fb-api")
router = APIRouter(tags=["inbox"])

# ponytail: per-tenant fb client cache — dict[tenant_id, FBClient].
# Evict on token refresh. Replace with Redis-backed registry when multi-worker.
_tenant_fb_cache: dict[int, object] = {}

def _get_inbox_fb(tenant_id: int):
    if tenant_id not in _tenant_fb_cache:
        fb = get_tenant_fb_client(tenant_id)
        if fb is None:
            raise HTTPException(500, "لم يتم إعداد فيسبوك بعد")
        _tenant_fb_cache[tenant_id] = fb
    return _tenant_fb_cache[tenant_id]


@router.get("/api/inbox/conversations")
async def inbox_list(
    status: str = Query("all"), tag: str = Query(""), search: str = Query(""),
    page: int = Query(1), per_page: int = Query(25), current_user: User = Depends(get_current_user),
):
    """Professional inbox: list conversations with filters, tags, search."""
    fb = _get_inbox_fb(current_user._tenant_id)
    convos = await fb.get_conversations(50)
    items = []
    for c in convos:
        items.append({
            "id": c["id"], "subject": c.get("subject", "بدون موضوع"),
            "senders": c.get("senders", {}).get("data", []),
            "message_count": c.get("message_count", 0),
            "unread_count": c.get("unread_count", 0),
            "updated_time": c.get("updated_time", ""),
            "tags": [],  # populated below
        })

    # Load tags from DB for all conversation IDs
    if items:
        async with AsyncSessionLocal() as s:
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
    return {"items": paged, "total": total, "page": page, "per_page": per_page}


@router.get("/api/inbox/conversations/{conversation_id}")
async def inbox_messages(conversation_id: str, current_user: User = Depends(get_current_user)):
    """Get full conversation messages with AI analysis hints."""
    fb = _get_inbox_fb(current_user._tenant_id)
    messages = await fb.get_conversation_messages(conversation_id)
    return [{
        "id": m["id"], "message": m.get("message", ""),
        "from": m.get("from", {}),
        "created_time": m.get("created_time", ""),
    } for m in messages]


@router.post("/api/inbox/conversations/{conversation_id}/reply")
async def inbox_reply(
    conversation_id: str, message: str = Form(...),
    current_user: User = Depends(require_role("editor")),
):
    """Send a reply in a conversation. Tries Messenger first, falls back to private_reply."""
    fb = _get_inbox_fb(current_user._tenant_id)
    # Try Messenger conversation reply
    result = await fb.send_conversation_message(conversation_id, message)
    if result:
        _track_event("inbox_reply_sent", {"conversation_id": conversation_id}, tenant_id=current_user._tenant_id)
        return {"ok": True}

    # Fallback: try private_reply (works for ANY comment, no prior conversation needed)
    result = await fb.send_private_reply(conversation_id, message)
    if result and not result.get("_error"):
        _track_event("inbox_reply_sent", {"conversation_id": conversation_id}, tenant_id=current_user._tenant_id)
        return {"ok": True}

    raise HTTPException(400, "لم يتم الرد — راجع سجل الخادم لتفاصيل خطأ فيسبوك")


@router.get("/api/inbox/tags")
async def inbox_list_tags(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all conversation tags."""
    rows = await db.execute(select(ConversationTag).where(ConversationTag.tenant_id == current_user._tenant_id))
    return [{"id": t.id, "name": t.name, "color": t.color} for t in rows.scalars().all()]


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
    return {"id": tag.id, "name": tag.name, "color": tag.color}


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
    return {"ok": True}


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
    return {"ok": True}


@router.delete("/api/inbox/conversations/{conv_id}/tags/{tag_id}")
async def inbox_remove_tag(conv_id: str, tag_id: int,
                           db=Depends(get_db), _=Depends(require_role("editor"))):
    await db.execute(
        ConversationLabel.__table__.delete().where(
            and_(ConversationLabel.conversation_id == conv_id, ConversationLabel.tag_id == tag_id))
    )
    await db.commit()
    return {"ok": True}
