from fastapi import APIRouter, Depends, HTTPException, Form, Query, Request
from sqlalchemy import select
from config import settings
from database import get_db
from models import User, BotState
from routers.auth import get_current_user, require_role
from _services import fb, encrypt_token, decrypt_token, _post_cursors

router = APIRouter(prefix="", tags=["facebook"])


@router.get("/api/facebook/settings")
async def get_facebook_settings(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    tenant_id = current_user.tenant_id or 0
    page_id = settings.FACEBOOK_PAGE_ID or ""
    has_token = bool(settings.FACEBOOK_ACCESS_TOKEN)

    if tenant_id:
        row = await db.execute(
            select(BotState).where(
                BotState.tenant_id == tenant_id,
                BotState.key == "fb_page_id",
            )
        )
        bs = row.scalar_one_or_none()
        if bs and bs.value:
            page_id = bs.value

        row = await db.execute(
            select(BotState).where(
                BotState.tenant_id == tenant_id, BotState.key == "fb_access_token"
            )
        )
        bs = row.scalar_one_or_none()
        if bs and bs.value:
            has_token = True

    return {
        "page_id": page_id,
        "has_token": has_token,
        "connected": bool(page_id and has_token),
        "page_name": "",
    }


@router.put("/api/facebook/settings")
async def update_facebook_settings(
    request: Request,
    db=Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    body = await request.json()
    page_id = body.get("page_id", "").strip()
    access_token = body.get("access_token", "").strip()
    subscribe = body.get("subscribe_webhook", True)
    tenant_id = current_user.tenant_id or 0

    if page_id:
        existing = await db.execute(
            select(BotState).where(
                BotState.tenant_id == tenant_id, BotState.key == "fb_page_id"
            )
        )
        row = existing.scalar_one_or_none()
        if row:
            row.value = page_id
        else:
            db.add(BotState(tenant_id=tenant_id, key="fb_page_id", value=page_id))

    webhook_result = None
    if access_token:
        encrypted = encrypt_token(access_token)
        existing = await db.execute(
            select(BotState).where(
                BotState.tenant_id == tenant_id, BotState.key == "fb_access_token"
            )
        )
        row = existing.scalar_one_or_none()
        if row:
            row.value = encrypted
        else:
            db.add(
                BotState(
                    tenant_id=tenant_id, key="fb_access_token", value=encrypted
                )
            )
        # Auto-subscribe webhook after saving valid token
        if subscribe and page_id:
            try:
                from fb_client import FBClient
                tmp = FBClient(access_token, page_id)
                webhook_result = await tmp.subscribe_page_webhooks()
            except Exception as e:
                webhook_result = {"error": str(e)[:200]}

    await db.commit()
    return {"ok": True, "webhook": webhook_result or "skipped"}


@router.post("/api/facebook/test")
async def test_facebook_connection(
    db=Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    tenant_id = current_user.tenant_id or 0
    page_id = ""
    token = ""

    row = await db.execute(
        select(BotState).where(
            BotState.tenant_id == tenant_id, BotState.key == "fb_page_id"
        )
    )
    bs = row.scalar_one_or_none()
    if bs:
        page_id = bs.value

    row = await db.execute(
        select(BotState).where(
            BotState.tenant_id == tenant_id, BotState.key == "fb_access_token"
        )
    )
    bs = row.scalar_one_or_none()
    if bs and bs.value:
        token = decrypt_token(bs.value)

    if not token or not page_id:
        return {"connected": False, "fan_count": 0, "error": "لم يتم تعيين بيانات فيسبوك"}

    try:
        from fb_client import FBClient

        tmp = FBClient(token, page_id)
        fan_count = await tmp.get_page_fan_count()
        # Check token scopes
        scope_check = await tmp.check_token_scopes()
        result = {"connected": True, "fan_count": fan_count, "scopes": scope_check}
        if scope_check.get("missing"):
            result["warning"] = (
                f"التوكن ينقصه الصلاحيات التالية: {'، '.join(scope_check['missing'])}. "
                "قد لا تعمل بعض ميزات البوت بشكل كامل."
            )
        return result
    except Exception as e:
        return {"connected": False, "fan_count": 0, "error": str(e)[:200]}


@router.get("/api/posts")
async def list_posts(page: int = Query(1), per_page: int = Query(10), _=Depends(get_current_user)):
    after_cursor = _post_cursors.get(page - 1) if page > 1 else None
    posts, paging = await fb.get_page_posts(per_page, after_cursor)
    if paging and paging.get("cursors", {}).get("after"):
        _post_cursors[page] = paging["cursors"]["after"]
    has_next = bool(paging and paging.get("next"))
    # ponytail: FB doesn't return total count; approximate for pagination UI
    total = (page - 1) * per_page + len(posts) + (1 if has_next else 0)
    return {
        "items": [{
            "id": p["id"], "message": p.get("message", "")[:200],
            "created_time": p.get("created_time", ""),
            "likes": (p.get("likes", {}) or {}).get("summary", {}).get("total_count", 0),
            "shares": (p.get("shares", {}) or {}).get("count", 0),
            "comments": (p.get("comments", {}) or {}).get("summary", {}).get("total_count", 0),
        } for p in posts],
        "total": total,
        "page": page,
        "per_page": per_page,
        "has_next": has_next,
    }


@router.get("/api/posts/{post_id}")
async def get_post_detail(post_id: str, _=Depends(get_current_user)):
    detail = await fb.get_post_detail(post_id)
    if not detail:
        raise HTTPException(404, "Post not found")
    return detail


@router.delete("/api/posts/{post_id}")
async def delete_post(post_id: str, _=Depends(require_role("editor"))):
    result = await fb.delete_post(post_id)
    if not result:
        raise HTTPException(400, "Failed to delete post")
    return {"ok": True}


@router.post("/api/publish")
async def publish_post(message: str = Form(...), _=Depends(require_role("editor"))):
    result = await fb.post_to_page(message)
    return result or {"error": "Failed to post"}


@router.get("/api/messages")
async def list_conversations(_=Depends(get_current_user)):
    convos = await fb.get_conversations(25)
    return [{
        "id": c["id"], "subject": c.get("subject", ""),
        "senders": c.get("senders", {}).get("data", []),
        "message_count": c.get("message_count", 0),
        "unread_count": c.get("unread_count", 0),
        "updated_time": c.get("updated_time", ""),
    } for c in convos]


@router.get("/api/messages/{conversation_id}")
async def get_conversation_messages(conversation_id: str, _=Depends(get_current_user)):
    messages = await fb.get_conversation_messages(conversation_id)
    return [{
        "id": m["id"], "message": m.get("message", ""),
        "from": m.get("from", {}),
        "created_time": m.get("created_time", ""),
    } for m in messages]


@router.post("/api/messages/{conversation_id}/reply")
async def reply_to_conversation(conversation_id: str, message: str = Form(...),
                                _=Depends(require_role("editor"))):
    result = await fb.send_conversation_message(conversation_id, message)
    if not result:
        raise HTTPException(400, "لم يتم إرسال الرسالة — تحقق من صلاحية التوكن والمراسلة")
    return {"ok": True}


@router.get("/api/ads/accounts")
async def list_ad_accounts(_=Depends(require_role("admin"))):
    accounts = await fb.get_ad_accounts()
    return [{
        "id": a["id"], "name": a.get("name", ""),
        "account_status": a.get("account_status", 0),
        "currency": a.get("currency", ""),
        "amount_spent": a.get("amount_spent", "0"),
        "balance": a.get("balance", "0"),
    } for a in accounts]


@router.get("/api/ads/campaigns/{account_id}")
async def list_campaigns(account_id: str, _=Depends(require_role("editor"))):
    return await fb.get_campaigns(account_id)


@router.get("/api/ads/ads/{account_id}")
async def list_ads(account_id: str, _=Depends(require_role("editor"))):
    return await fb.get_ads(account_id)
