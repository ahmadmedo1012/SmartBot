"""Replies & comments listing routes."""
import logging

from fastapi import APIRouter, Depends, Query, HTTPException, Form
from sqlalchemy import select, func, desc

from database import get_db
from models import Reply, User
from routers.auth import get_current_user, require_role
from ws_manager import ws_manager

log = logging.getLogger("fb-api")
router = APIRouter(tags=["replies"])


@router.get("/api/replies")
async def list_replies(page: int = Query(1), per_page: int = Query(20), rule_id: int = Query(None), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    offset = (page - 1) * per_page
    stmt = select(Reply).where(Reply.tenant_id == _tid)
    if rule_id:
        stmt = stmt.where(Reply.rule_id == rule_id)
        total = await db.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == _tid, Reply.rule_id == rule_id))
    else:
        total = await db.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == _tid))
    rows = await db.execute(
        stmt.order_by(desc(Reply.created_at)).offset(offset).limit(per_page)
    )
    return {
        "total": total, "page": page, "per_page": per_page,
        "items": [{
            "id": r.id, "commenter_name": r.commenter_name, "comment_text": r.comment_text,
            "reply_text": r.reply_text, "fb_comment_id": r.fb_comment_id,
            "rule_id": r.rule_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in rows.scalars().all()]
    }


@router.get("/api/comments")
async def list_comments(limit: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from runner import fb as _fb
    _tid = current_user._tenant_id
    all_comments = await _fb.get_recent_comments(limit)
    fb_ids = [c["id"] for c in all_comments if c.get("id")]
    replied_map = {}
    if fb_ids:
        rows = await db.execute(
            select(Reply.fb_comment_id, Reply.reply_text, Reply.created_at)
            .where(Reply.tenant_id == _tid, Reply.fb_comment_id.in_(fb_ids))
        )
        for r in rows:
            replied_map[r.fb_comment_id] = {
                "replied_at": r.created_at.isoformat() if r.created_at else None,
                "reply_text": r.reply_text,
            }
    items = []
    for c in all_comments:
        from_data = c.get("from", {}) or {}
        cid = c.get("id", "")
        extra = replied_map.get(cid, {})
        items.append({
            "id": cid,
            "message": c.get("message", ""),
            "from_name": from_data.get("name", ""),
            "from_id": from_data.get("id", ""),
            "created_time": c.get("created_time", ""),
            "post_id": c.get("_post_id", ""),
            "post_message": c.get("_post_message", ""),
            "replied_at": extra.get("replied_at"),
            "reply_text": extra.get("reply_text"),
        })
    items.sort(key=lambda x: x.get("created_time", ""), reverse=True)
    items = items[:limit]
    return {"items": items}


@router.post("/api/comments/{comment_id}/hide")
async def hide_comment(comment_id: str, _=Depends(require_role("editor"))):
    from runner import fb as _fb
    result = await _fb.hide_comment(comment_id)
    if not result:
        raise HTTPException(400, "Failed to hide comment")
    return {"ok": True}


@router.delete("/api/comments/{comment_id}")
async def delete_api_comment(comment_id: str, _=Depends(require_role("editor"))):
    from runner import fb as _fb
    result = await _fb.delete_comment(comment_id)
    if not result:
        raise HTTPException(400, "Failed to delete comment")
    return {"ok": True}


@router.post("/api/replies/{comment_id}/reply")
async def reply_to_comment(comment_id: str, message: str = Form(...), db=Depends(get_db),
                           current_user: User = Depends(require_role("editor"))):
    from runner import fb as _fb
    result = await _fb.reply_to_comment(comment_id, message)
    if not result:
        raise HTTPException(400, "Failed to send reply")
    commenter_name = "[يدوي]"
    comment_text = message
    try:
        comment_data = await _fb._get(comment_id, {"fields": "from{name},message,parent"})
        if comment_data:
            from_data = comment_data.get("from", {}) or {}
            commenter_name = from_data.get("name", commenter_name)
            comment_text = comment_data.get("message", comment_text)
    except Exception:
        pass
    reply = Reply(
        commenter_name=commenter_name,
        comment_text=comment_text,
        reply_text=message,
        fb_comment_id=comment_id,
        fb_post_id="",
        rule_id=None,
        tenant_id=current_user._tenant_id,
    )
    db.add(reply)
    await db.commit()
    log.info(f"Manual reply: user={current_user.username} comment={comment_id} reply_id={reply.id}")
    await ws_manager.broadcast("new_reply")
    await ws_manager.broadcast("notification")
    return {"ok": True, "reply_id": reply.id}
