# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
"""Facebook routes — 100% tenant-scoped (world-class launch plan v3 §4.1).

BEFORE: every endpoint here used the GLOBAL env FB client (`_services.fb`),
so a tenant who connected their page via /connect (token stored per-tenant in
BotState) still saw empty data — the global token is unset in production.
Root cause of "after connecting the page nothing shows / all zeros".

NOW: every endpoint resolves the CALLER's tenant client via
get_tenant_fb_client() and fails loudly with a clear Arabic message when the
page is not connected.
"""
from __future__ import annotations
import logging

from fastapi import APIRouter, Depends, HTTPException, Form, Query, Request
from sqlalchemy import select

from config import settings
from database import get_db
from models import User, BotState
from routers.auth import get_current_user, require_role
from _services import get_tenant_fb_client, encrypt_token, decrypt_token, _track_event
from _responses import ok

router = APIRouter(prefix="", tags=["facebook"])
log = logging.getLogger("fb-api")

# per-tenant post pagination cursors: (tenant_id, page) -> after-cursor
_post_cursors: dict[tuple[int, int], str] = {}


async def _tenant_fb(current_user: User):
    """Resolve the caller's tenant FB client or raise 400 with guidance."""
    tenant_id = current_user._tenant_id or 0
    if not tenant_id:
        raise HTTPException(400, "لا يوجد مستأجر مرتبط بحسابك")
    fb = await get_tenant_fb_client(tenant_id)
    if fb is None:
        raise HTTPException(400, "لم يتم ربط صفحة فيسبوك بعد — اربط صفحتك من صفحة /connect")
    return fb


async def _tenant_state(db, tenant_id: int, key: str) -> str:
    row = await db.execute(
        select(BotState).where(BotState.tenant_id == tenant_id, BotState.key == key)
    )
    bs = row.scalar_one_or_none()
    return (bs.value if bs and bs.value else "")


@router.get("/api/facebook/settings")
async def get_facebook_settings(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    tenant_id = current_user.tenant_id or 0
    page_id = await _tenant_state(db, tenant_id, "fb_page_id")
    has_token = bool(await _tenant_state(db, tenant_id, "fb_access_token"))
    page_name = await _tenant_state(db, tenant_id, "fb_page_name")

    # env fallback only for the legacy single-tenant bootstrap mode
    if not page_id and not tenant_id:
        page_id = settings.FACEBOOK_PAGE_ID or ""
        has_token = bool(settings.FACEBOOK_ACCESS_TOKEN)

    return ok(
        {
        "page_id": page_id,
        "has_token": has_token,
        "connected": bool(page_id and has_token),
        "page_name": page_name,
    }
    )


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
    page_profile = {}
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
                # Initial profile sync (plan v3 §4.5): page name + fan count
                try:
                    page_profile = await tmp.get_page_profile()
                except Exception:
                    page_profile = {}
            except Exception as e:
                webhook_result = {"error": str(e)[:200]}

    # Store page identity snapshot for instant UI display (no live calls)
    if page_id and page_profile:
        for key, value in (
            ("fb_page_name", page_profile.get("name", "")),
            ("fb_fan_count", str(page_profile.get("fan_count", 0))),
            ("fb_picture_url", page_profile.get("picture", "")),
        ):
            if not value:
                continue
            existing = await db.execute(
                select(BotState).where(BotState.tenant_id == tenant_id, BotState.key == key)
            )
            row = existing.scalar_one_or_none()
            if row:
                row.value = str(value)
            else:
                db.add(BotState(tenant_id=tenant_id, key=key, value=str(value)))

    await db.commit()

    # Evict cached per-tenant FB clients so new credentials take effect immediately
    # (inbox router caches clients in _tenant_fb_cache; BotEngine registry in _services)
    try:
        from routers.inbox import _tenant_fb_cache as _inbox_fb_cache
        _inbox_fb_cache.pop(tenant_id, None)
    except Exception:
        pass
    try:
        from _services import reset_bot_engines
        reset_bot_engines()
    except Exception:
        pass

    _track_event("fb_settings_updated", {"page_id": page_id[:40]}, tenant_id=tenant_id)
    return ok({"ok": True, "webhook": webhook_result or "skipped",
               "page_name": page_profile.get("name", "")})


@router.post("/api/facebook/test")
async def test_facebook_connection(
    db=Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    tenant_id = current_user.tenant_id or 0
    page_id = await _tenant_state(db, tenant_id, "fb_page_id")
    token_enc = await _tenant_state(db, tenant_id, "fb_access_token")

    if not token_enc or not page_id:
        return ok({"connected": False, "fan_count": 0, "error": "لم يتم تعيين بيانات فيسبوك"})

    token = decrypt_token(token_enc)
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
        return ok(result)
    except Exception as e:
        return ok({"connected": False, "fan_count": 0, "error": str(e)[:200]})


@router.get("/api/posts")
async def list_posts(page: int = Query(1), per_page: int = Query(10),
                     current_user: User = Depends(get_current_user)):
    fb = await _tenant_fb(current_user)
    tid = current_user._tenant_id
    after_cursor = _post_cursors.get((tid, page - 1)) if page > 1 else None
    posts, paging = await fb.get_page_posts(per_page, after_cursor)
    if paging and paging.get("cursors", {}).get("after"):
        _post_cursors[(tid, page)] = paging["cursors"]["after"]
    has_next = bool(paging and paging.get("next"))
    # ponytail: FB doesn't return total count; approximate for pagination UI
    total = (page - 1) * per_page + len(posts) + (1 if has_next else 0)
    return ok(
        {
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
    )


@router.get("/api/posts/{post_id}")
async def get_post_detail(post_id: str, current_user: User = Depends(get_current_user)):
    fb = await _tenant_fb(current_user)
    detail = await fb.get_post_detail(post_id)
    if not detail:
        raise HTTPException(404, "Post not found")
    return ok(detail)


@router.delete("/api/posts/{post_id}")
async def delete_post(post_id: str, current_user: User = Depends(require_role("editor"))):
    fb = await _tenant_fb(current_user)
    result = await fb.delete_post(post_id)
    if not result:
        raise HTTPException(400, "Failed to delete post")
    return ok({"ok": True})


@router.post("/api/publish")
async def publish_post(message: str = Form(...), current_user: User = Depends(require_role("editor"))):
    fb = await _tenant_fb(current_user)
    result = await fb.post_to_page(message)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to post")
    _track_event("post_published", {"post_id": (result or {}).get("id", "")[:40]},
                 tenant_id=current_user._tenant_id)
    return ok(result)


@router.get("/api/messages")
async def list_conversations(current_user: User = Depends(get_current_user)):
    fb = await _tenant_fb(current_user)
    convos = await fb.get_conversations(25)
    return ok(
        [{
        "id": c["id"], "subject": c.get("subject", ""),
        "senders": c.get("senders", {}).get("data", []),
        "message_count": c.get("message_count", 0),
        "unread_count": c.get("unread_count", 0),
        "updated_time": c.get("updated_time", ""),
    } for c in convos]
    )


@router.get("/api/messages/{conversation_id}")
async def get_conversation_messages(conversation_id: str, current_user: User = Depends(get_current_user)):
    fb = await _tenant_fb(current_user)
    messages = await fb.get_conversation_messages(conversation_id)
    return ok(
        [{
        "id": m["id"], "message": m.get("message", ""),
        "from": m.get("from", {}),
        "created_time": m.get("created_time", ""),
    } for m in messages]
    )


@router.post("/api/messages/{conversation_id}/reply")
async def reply_to_conversation(conversation_id: str, message: str = Form(...),
                                current_user: User = Depends(require_role("editor"))):
    fb = await _tenant_fb(current_user)
    result = await fb.send_conversation_message(conversation_id, message)
    if not result:
        raise HTTPException(400, "لم يتم إرسال الرسالة — تحقق من صلاحية التوكن والمراسلة")
    _track_event("conversation_reply_sent", {"conversation_id": conversation_id[:40]},
                 tenant_id=current_user._tenant_id)
    return ok({"ok": True})


@router.get("/api/ads/accounts")
async def list_ad_accounts(current_user: User = Depends(require_role("admin"))):
    fb = await _tenant_fb(current_user)
    accounts = await fb.get_ad_accounts()
    return ok(
        [{
        "id": a["id"], "name": a.get("name", ""),
        "account_status": a.get("account_status", 0),
        "currency": a.get("currency", ""),
        "amount_spent": a.get("amount_spent", "0"),
        "balance": a.get("balance", "0"),
    } for a in accounts]
    )


@router.get("/api/ads/campaigns/{account_id}")
async def list_campaigns(account_id: str, current_user: User = Depends(require_role("editor"))):
    fb = await _tenant_fb(current_user)
    return ok(await fb.get_campaigns(account_id))


@router.get("/api/ads/ads/{account_id}")
async def list_ads(account_id: str, current_user: User = Depends(require_role("editor"))):
    fb = await _tenant_fb(current_user)
    return ok(await fb.get_ads(account_id))
