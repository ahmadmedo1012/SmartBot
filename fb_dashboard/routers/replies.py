"""Replies & comments listing routes.

v4 radical plan §3.6 + §4.10 (G1):
- /api/comments is DB-FIRST (Comment table, tenant-scoped) with a non-fatal
  live Graph sync so newly posted comments appear even without webhooks.
  The old path used the GLOBAL env client → the page was ALWAYS empty in
  production because the env token is unset.
- hide/delete/manual-reply now resolve the TENANT's page client, and manual
  replies also upsert the Comment row (replied state stays visible).
"""
import logging

from fastapi import APIRouter, Depends, Query, HTTPException, Form
from sqlalchemy import select, func, desc

from database import get_db
from _utils import iso_z
from models import Reply, User, Comment
from routers.auth import get_current_user, require_role
from _services import get_tenant_fb_client
from ws_manager import ws_manager
from _responses import ok

log = logging.getLogger("fb-api")
router = APIRouter(tags=["replies"])


async def _tenant_fb_or_400(tenant_id: int):
    fb = await get_tenant_fb_client(tenant_id)
    if fb is None:
        raise HTTPException(
            400, "لا توجد صفحة فيسبوك مرتبطة بحسابك — اربط صفحتك أولاً من صفحة «الصفحات»"
        )
    return fb


async def _sync_recent_comments(db, tenant_id: int, fb, limit: int = 25) -> None:
    """Best-effort live Graph → DB sync (non-fatal: webhook + bot loop also upsert).

    Failure (expired token, network) leaves the stored rows untouched —
    the page keeps serving real data instead of going blank."""
    from datetime import datetime, timezone
    try:
        live = await fb.get_recent_comments(limit)
    except Exception as e:
        log.warning(f"live comment sync failed (tenant {tenant_id}): {e}")
        return
    for c in live or []:
        cid = c.get("id", "")
        if not cid:
            continue
        from_data = c.get("from", {}) or {}
        created_at = None
        raw_time = str(c.get("created_time", "") or "")
        if raw_time:
            try:
                created_at = datetime.fromisoformat(
                    raw_time.replace("+0000", "+00:00").replace("Z", "+00:00")
                ).astimezone(timezone.utc).replace(tzinfo=None)
            except ValueError:
                created_at = None
        row = (await db.execute(
            select(Comment).where(Comment.tenant_id == tenant_id, Comment.fb_comment_id == cid)
        )).scalar_one_or_none()
        if row is None:
            db.add(Comment(
                tenant_id=tenant_id, fb_comment_id=cid,
                fb_post_id=c.get("_post_id", ""),
                commenter_id=from_data.get("id", ""),
                commenter_name=from_data.get("name", ""),
                comment_text=c.get("message", ""),
                created_at=created_at,
            ))
    await db.commit()


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
    return ok(
        {
        "total": total, "page": page, "per_page": per_page,
        "items": [{
            "id": r.id, "commenter_name": r.commenter_name, "comment_text": r.comment_text,
            "reply_text": r.reply_text, "fb_comment_id": r.fb_comment_id,
            "rule_id": r.rule_id,
            "created_at": iso_z(r.created_at),
        } for r in rows.scalars().all()]
    }
    )


@router.get("/api/comments")
async def list_comments(limit: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    # v4 §4.10 — DB-first: serve stored comments (webhook + sync + bot loop all
    # write here), then top up with a non-fatal live Graph sync.
    fb = await get_tenant_fb_client(_tid)
    if fb is not None:
        await _sync_recent_comments(db, _tid, fb, limit=min(limit, 50))
    rows = await db.execute(
        select(Comment)
        .where(Comment.tenant_id == _tid, Comment.hidden == False)
        .order_by(desc(Comment.created_at))
        .limit(limit)
    )
    items = [{
        "id": c.fb_comment_id or str(c.id),
        "message": c.comment_text,
        "from_name": c.commenter_name,
        "from_id": c.commenter_id,
        "created_time": iso_z(c.created_at),
        "post_id": c.fb_post_id,
        "post_message": "",
        "replied_at": iso_z(c.created_at) if c.replied_by_bot else None,
        "reply_text": c.reply_text or None,
    } for c in rows.scalars().all()]
    return ok({"items": items, "source": "db"})


@router.post("/api/comments/{comment_id}/hide")
async def hide_comment(comment_id: str, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    fb = await _tenant_fb_or_400(current_user._tenant_id)
    result = await fb.hide_comment(comment_id)
    if not result:
        raise HTTPException(400, "فشل إخفاء التعليق — تحقق من صلاحيات التوكن")
    # keep stored row hidden so DB-first list reflects it
    row = (await db.execute(
        select(Comment).where(
            Comment.tenant_id == current_user._tenant_id, Comment.fb_comment_id == comment_id)
    )).scalar_one_or_none()
    if row is not None:
        row.hidden = True
        await db.commit()
    return ok({"ok": True})


@router.delete("/api/comments/{comment_id}")
async def delete_api_comment(comment_id: str, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    fb = await _tenant_fb_or_400(current_user._tenant_id)
    result = await fb.delete_comment(comment_id)
    if not result:
        raise HTTPException(400, "فشل حذف التعليق — تحقق من صلاحيات التوكن")
    row = (await db.execute(
        select(Comment).where(
            Comment.tenant_id == current_user._tenant_id, Comment.fb_comment_id == comment_id)
    )).scalar_one_or_none()
    if row is not None:
        await db.delete(row)
        await db.commit()
    return ok({"ok": True})


@router.post("/api/replies/{comment_id}/reply")
async def reply_to_comment(comment_id: str, message: str = Form(...), db=Depends(get_db),
                           current_user: User = Depends(require_role("editor"))):
    fb = await _tenant_fb_or_400(current_user._tenant_id)
    result = await fb.reply_to_comment(comment_id, message)
    if not result:
        raise HTTPException(400, "فشل إرسال الرد — تحقق من صلاحيات التوكن")
    commenter_name = "[يدوي]"
    comment_text = message
    post_id = ""
    try:
        comment_data = await fb._get(comment_id, {"fields": "from{name},message,parent,post"})
        if comment_data:
            from_data = comment_data.get("from", {}) or {}
            commenter_name = from_data.get("name", commenter_name)
            comment_text = comment_data.get("message", comment_text)
            post_id = str(comment_data.get("post", "") or "")
            if isinstance(comment_data.get("post"), dict):
                post_id = str(comment_data["post"].get("id", "") or "")
    except Exception:
        pass
    reply = Reply(
        commenter_name=commenter_name,
        comment_text=comment_text,
        reply_text=message,
        fb_comment_id=comment_id,
        fb_post_id=post_id,
        rule_id=None,
        tenant_id=current_user._tenant_id,
    )
    db.add(reply)
    # v4 §4.10 — keep the Comment row in sync (replied state + text)
    crow = (await db.execute(
        select(Comment).where(
            Comment.tenant_id == current_user._tenant_id, Comment.fb_comment_id == comment_id)
    )).scalar_one_or_none()
    if crow is None:
        crow = Comment(
            tenant_id=current_user._tenant_id, fb_comment_id=comment_id,
            fb_post_id=post_id, commenter_name=commenter_name, comment_text=comment_text,
        )
        db.add(crow)
    crow.reply_text = message
    crow.replied_by_bot = False
    await db.commit()
    log.info(f"Manual reply: user={current_user.username} comment={comment_id} reply_id={reply.id}")
    await ws_manager.broadcast_to_tenant(current_user._tenant_id, "new_reply")
    await ws_manager.broadcast_to_tenant(current_user._tenant_id, "notification")
    return ok({"ok": True, "reply_id": reply.id})
