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

import json
import logging
import time
from datetime import datetime

from _responses import ok
from _services import _track_event, decrypt_token, encrypt_token, get_tenant_fb_client
from config import settings
from database import get_db
from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from models import AdAccount, AdCampaign, AdItem, BotState, Post, User
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from routers.auth import get_current_user, require_role

router = APIRouter(prefix="", tags=["facebook"])
log = logging.getLogger("fb-api")


def _page_double_bind_message(exc: IntegrityError | None = None) -> str:
    """v15-E4 (D13-F1 / D12 sibling): Arabic 409 detail for a page double-bind.

    ``uq_botstate_key_value`` is a PARTIAL unique index on (key, value)
    WHERE key='fb_page_id' — one tenant's webhook page must resolve to ONE
    tenant. When another tenant already holds this page_id the failure used
    to surface as a raw 500. The detail stays specific (double-bind) when the
    constraint evidence points at (key, value); otherwise a generic settings
    conflict is reported — never a raw 500.
    """
    evidence = str(getattr(exc, "orig", exc) or "")
    if (exc is not None and
            ("uq_botstate_key_value" in evidence or ".value" in evidence
             or "bot_state.value" in evidence)):
        return "هذه الصفحة مربوطة بمساحة عمل أخرى — تواصل مع الدعم إذا كنت ترى هذه الرسالة خطأً"
    return "تعارض أثناء حفظ إعدادات فيسبوك — أعد المحاولة أو حدّث الصفحة ثم أعد الربط"

# per-tenant post pagination was an in-memory cursor cache — replaced by
# DB pagination in v19 Step 2 (see _POSTS_LAST_SYNC block above).


async def _tenant_fb(current_user: User):
    """Resolve the caller's tenant FB client or raise 400 with guidance."""
    tenant_id = current_user._tenant_id or 0
    if not tenant_id:
        raise HTTPException(400, "لا يوجد مستأجر مرتبط بحسابك")
    fb = await get_tenant_fb_client(tenant_id)
    if fb is None:
        raise HTTPException(400, "لم يتم ربط صفحة فيسبوك بعد — اربط صفحتك من صفحة /connect")
    return fb


# ── v19 Step 2: DB-first posts + ads (the comments/inbox precedent) ──────
# BEFORE: /api/posts and /api/ads/* were live-Graph-only with no try/except
# and no DB fallback — any Graph failure (missing ads_read scope, partial
# token expiry, transient timeout) rendered those sections EMPTY with zero
# error surfaced (the «looks empty instead of broken» lie). The comments
# (v4 §4.10) and inbox (v3 §4.2) sections fixed exactly this class for
# themselves; posts/ads were forgotten. Same medicine now:
#   1. best-effort live sync, throttled once per 30s per tenant (per key for
#      the account-scoped ads endpoints), the timestamp stamped BEFORE the
#      attempt so a FAILED sync also backs off (comments precedent)
#   2. serve the stored rows — always, even when the sync just failed
#
# The old in-memory ``_post_cursors`` pagination cache is gone with the
# wind: a cold Vercel instance lost it anyway; DB ORDER BY + OFFSET/LIMIT
# paginates the same rows deterministically across instances.
_POSTS_SYNC_SKIP_S = 30.0
_POSTS_LAST_SYNC: dict[int, float] = {}
_ADACC_SYNC_SKIP_S = 30.0
_ADACC_LAST_SYNC: dict[int, float] = {}
_ADCAMP_SYNC_SKIP_S = 30.0
_ADCAMP_LAST_SYNC: dict[tuple[int, str], float] = {}
_ADITEM_SYNC_SKIP_S = 30.0
_ADITEM_LAST_SYNC: dict[tuple[int, str], float] = {}


def _sync_allowed(store: dict, key, skip_s: float) -> bool:
    """True when a live Graph sync may run for this key now (monotonic).

    Stamp BEFORE the attempt (comments precedent): a failed sync also backs
    off the full window instead of hammering Graph on every dashboard poll."""
    now = time.monotonic()
    last = store.get(key)
    if last is not None and now - last < skip_s:
        return False
    store[key] = now
    return True


def _parse_fb_time(value) -> datetime | None:
    """Graph created_time ("2026-09-09T15:00:00+0000") → datetime | None."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _payload(raw: str | None) -> dict:
    """Stored payload_json → dict (defensive: never raises on drift)."""
    try:
        value = json.loads(raw or "{}")
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def _count_field(p: dict, *path: str) -> int:
    """Graph summary counter ("likes.summary.total_count" etc.) → int."""
    node: object = p
    for part in path:
        if not isinstance(node, dict):
            return 0
        node = node.get(part) or {}
    try:
        return int(node) if not isinstance(node, dict) else 0
    except (ValueError, TypeError):
        return 0


async def _sync_page_posts(db, tenant_id: int, fb) -> bool:
    """Best-effort live posts refresh — returns False ONLY on Graph failure.

    Uses the raw fetch (``get_page_posts_raw``): ``None`` = the call itself
    failed → ``synced=False`` so the UI can say «فشل الاتصال» instead of a
    lying empty list. Non-fatal by contract — DB rows below still serve."""
    try:
        r = await fb.get_page_posts_raw(50)
    except Exception:
        return False
    if r is None:
        return False
    posts = r.get("data", []) or []
    if not posts:
        return True
    fb_ids = [str(p.get("id") or "") for p in posts]
    fb_ids = [i for i in fb_ids if i]
    if not fb_ids:
        return True
    try:
        existing = (await db.execute(
            select(Post).where(Post.tenant_id == tenant_id, Post.fb_post_id.in_(fb_ids))
        )).scalars().all()
        by_id = {row.fb_post_id: row for row in existing}
        for p in posts:
            pid = str(p.get("id") or "")
            if not pid:
                continue
            message = str(p.get("message", "") or "")
            created = _parse_fb_time(p.get("created_time"))
            row = by_id.get(pid)
            if row is None:
                db.add(Post(
                    tenant_id=tenant_id, fb_post_id=pid, message=message,
                    like_count=_count_field(p, "likes", "summary", "total_count"),
                    share_count=_count_field(p, "shares", "count"),
                    comment_count=_count_field(p, "comments", "summary", "total_count"),
                    created_time=created,
                ))
            else:
                row.message = message
                row.like_count = _count_field(p, "likes", "summary", "total_count")
                row.share_count = _count_field(p, "shares", "count")
                row.comment_count = _count_field(p, "comments", "summary", "total_count")
                if created is not None:
                    row.created_time = created
        await db.commit()
        return True
    except Exception:
        await db.rollback()
        return False


async def _sync_ad_accounts(db, tenant_id: int, fb) -> bool:
    """Best-effort ad-accounts refresh (same contract as _sync_page_posts)."""
    try:
        r = await fb.get_ad_accounts_raw()
    except Exception:
        return False
    if r is None:
        return False
    accounts = r.get("data", []) or []
    if not accounts:
        return True
    fb_ids = [str(a.get("id") or "") for a in accounts]
    fb_ids = [i for i in fb_ids if i]
    if not fb_ids:
        return True
    try:
        existing = (await db.execute(
            select(AdAccount).where(AdAccount.tenant_id == tenant_id,
                                    AdAccount.fb_account_id.in_(fb_ids))
        )).scalars().all()
        by_id = {row.fb_account_id: row for row in existing}
        for a in accounts:
            aid = str(a.get("id") or "")
            if not aid:
                continue
            row = by_id.get(aid)
            if row is None:
                db.add(AdAccount(
                    tenant_id=tenant_id, fb_account_id=aid,
                    name=str(a.get("name", "") or ""),
                    account_status=int(a.get("account_status") or 0),
                    currency=str(a.get("currency", "") or ""),
                    amount_spent=str(a.get("amount_spent", "0") or "0"),
                    balance=str(a.get("balance", "0") or "0"),
                ))
            else:
                row.name = str(a.get("name", "") or row.name)
                row.account_status = int(a.get("account_status") or 0)
                row.currency = str(a.get("currency", "") or row.currency)
                row.amount_spent = str(a.get("amount_spent", "0") or row.amount_spent)
                row.balance = str(a.get("balance", "0") or row.balance)
        await db.commit()
        return True
    except Exception:
        await db.rollback()
        return False


def _graph_status(raw: dict) -> str:
    try:
        return str(raw.get("status") or "")
    except Exception:
        return ""


async def _sync_campaigns(db, tenant_id: int, fb, account_id: str) -> bool:
    """Best-effort campaigns refresh; payload_json keeps the RAW Graph dict
    so the endpoint re-serves the exact live shape (nested adsets included)."""
    try:
        r = await fb.get_campaigns_raw(account_id)
    except Exception:
        return False
    if r is None:
        return False
    campaigns = r.get("data", []) or []
    if not campaigns:
        return True
    fb_ids = [str(c.get("id") or "") for c in campaigns]
    fb_ids = [i for i in fb_ids if i]
    if not fb_ids:
        return True
    try:
        existing = (await db.execute(
            select(AdCampaign).where(AdCampaign.tenant_id == tenant_id,
                                     AdCampaign.fb_campaign_id.in_(fb_ids))
        )).scalars().all()
        by_id = {row.fb_campaign_id: row for row in existing}
        for c in campaigns:
            cid = str(c.get("id") or "")
            if not cid:
                continue
            row = by_id.get(cid)
            if row is None:
                db.add(AdCampaign(
                    tenant_id=tenant_id, fb_account_id=account_id, fb_campaign_id=cid,
                    name=str(c.get("name", "") or ""), status=_graph_status(c),
                    payload_json=json.dumps(c, ensure_ascii=False),
                ))
            else:
                row.fb_account_id = account_id
                row.name = str(c.get("name", "") or row.name)
                row.status = _graph_status(c) or row.status
                row.payload_json = json.dumps(c, ensure_ascii=False)
        await db.commit()
        return True
    except Exception:
        await db.rollback()
        return False


async def _sync_ad_items(db, tenant_id: int, fb, account_id: str) -> bool:
    """Best-effort ads refresh; payload_json keeps the RAW Graph dict
    (creative + insights) for exact-shape re-serving."""
    try:
        r = await fb.get_ads_raw(account_id)
    except Exception:
        return False
    if r is None:
        return False
    ads = r.get("data", []) or []
    if not ads:
        return True
    fb_ids = [str(a.get("id") or "") for a in ads]
    fb_ids = [i for i in fb_ids if i]
    if not fb_ids:
        return True
    try:
        existing = (await db.execute(
            select(AdItem).where(AdItem.tenant_id == tenant_id,
                                 AdItem.fb_ad_id.in_(fb_ids))
        )).scalars().all()
        by_id = {row.fb_ad_id: row for row in existing}
        for a in ads:
            aid = str(a.get("id") or "")
            if not aid:
                continue
            row = by_id.get(aid)
            if row is None:
                db.add(AdItem(
                    tenant_id=tenant_id, fb_account_id=account_id, fb_ad_id=aid,
                    campaign_id=str(a.get("campaign_id", "") or ""),
                    name=str(a.get("name", "") or ""), status=_graph_status(a),
                    payload_json=json.dumps(a, ensure_ascii=False),
                ))
            else:
                row.fb_account_id = account_id
                row.campaign_id = str(a.get("campaign_id", "") or row.campaign_id)
                row.name = str(a.get("name", "") or row.name)
                row.status = _graph_status(a) or row.status
                row.payload_json = json.dumps(a, ensure_ascii=False)
        await db.commit()
        return True
    except Exception:
        await db.rollback()
        return False


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

    # Explicit disconnect (v3 final-launch §4): `clear: true` wipes the whole
    # page-connection state — previously empty values were no-ops, so a test
    # or wrong page stayed "connected" forever (silent lie in the UI).
    if body.get("clear"):
        for key in ("fb_page_id", "fb_access_token", "fb_page_name",
                    "fb_fan_count", "fb_picture_url"):
            existing = await db.execute(
                select(BotState).where(
                    BotState.tenant_id == tenant_id, BotState.key == key
                )
            )
            row = existing.scalar_one_or_none()
            if row:
                await db.delete(row)
        await db.commit()
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
        _track_event("fb_settings_cleared", {}, tenant_id=tenant_id)
        return ok({"ok": True, "cleared": True})

    # v15-E4 (D13-F1): pre-check the page double-bind BEFORE any write —
    # the partial unique index (uq_botstate_key_value) already enforces
    # ONE tenant per fb_page_id, but surfacing it as a clean 409 here
    # (instead of a raw 500 at flush/commit) is the deterministic path. The
    # caller's OWN row is excluded — re-binding your own page is allowed.
    if page_id:
        other = await db.execute(
            select(BotState.id).where(
                BotState.key == "fb_page_id",
                BotState.value == page_id,
                BotState.tenant_id != tenant_id,
            ).limit(1)
        )
        if other.scalar_one_or_none() is not None:
            await db.rollback()
            raise HTTPException(
                409, "هذه الصفحة مربوطة بمساحة عمل أخرى — تواصل مع الدعم إذا كنت ترى هذه الرسالة خطأً")

    # v15-E4 (D13-F1 / D12 sibling): the whole write region — including every
    # SELECT that may AUTOFLUSH the pending fb_page_id INSERT (E1's onboarding
    # lesson: the constraint can fire mid-route, not only at commit) — is one
    # guarded block: a race between the pre-check above and the flush/commit
    # (another tenant bound the same page concurrently, or a same-tenant key
    # race on uq_botstate_tenant_key) surfaces as IntegrityError HERE and is
    # answered with the specific Arabic 409, never a raw 500.
    webhook_result = None
    page_profile = {}
    try:
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
                    # v17-E-B3 (D9 #3): the Graph API's English error text never
                    # reaches the user — technical detail goes to the log, the
                    # payload carries a fixed Arabic message.
                    log.warning("webhook subscribe failed (tenant=%s page=%s): %s",
                                tenant_id, page_id[:40], str(e)[:300])
                    webhook_result = {"error": "تعذر تفعيل الويبهوك — تحقق من رمز الوصول ومعرف الصفحة"}

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
    except IntegrityError as exc:
        await db.rollback()
        log.warning("facebook settings write conflict: %s", exc)
        raise HTTPException(409, _page_double_bind_message(exc)) from exc

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
        # v17-E-B3 (D9 #3): English exception text never reaches the user (the
        # connect page renders td.error in errorMsg + toast) — log it instead.
        log.warning("facebook connection test failed (tenant=%s page=%s): %s",
                    tenant_id, page_id[:40], str(e)[:300])
        return ok({"connected": False, "fan_count": 0,
                   "error": "فشل الاتصال بفيسبوك — تحقق من رمز الوصول ومعرف الصفحة"})


@router.get("/api/posts")
async def list_posts(page: int = Query(1, ge=1), per_page: int = Query(10, ge=1, le=50),
                     db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """v19 Step 2 — DB-first posts (the /api/comments pattern verbatim).

    BEFORE: live-Graph-only with in-memory pagination cursors — any Graph
    failure rendered the section EMPTY with no error surfaced, and a cold
    Vercel instance lost the cursor cache anyway. NOW: (1) best-effort live
    sync (30s per-tenant skip, failures non-fatal), (2) stored rows serve —
    deterministic DB pagination. The loud 400 «اربط صفحتك» when no page is
    connected is intentionally preserved (test-pinned contract)."""
    fb = await _tenant_fb(current_user)
    tid = current_user._tenant_id
    synced = False
    if _sync_allowed(_POSTS_LAST_SYNC, tid, _POSTS_SYNC_SKIP_S):
        synced = await _sync_page_posts(db, tid, fb)
    offset = (page - 1) * per_page
    rows = (await db.execute(
        select(Post)
        .where(Post.tenant_id == tid)
        .order_by(Post.created_time.desc(), Post.id.desc())
        .offset(offset).limit(per_page)
    )).scalars().all()
    total = (await db.execute(
        select(func.count(Post.id)).where(Post.tenant_id == tid)
    )).scalar() or 0
    has_next = offset + len(rows) < total
    return ok(
        {
        "items": [{
            "id": r.fb_post_id, "message": (r.message or "")[:200],
            "created_time": r.created_time.isoformat() if r.created_time else "",
            "likes": r.like_count or 0,
            "shares": r.share_count or 0,
            "comments": r.comment_count or 0,
        } for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "has_next": has_next,
        "source": "db",
        "synced": synced,
    }
    )


@router.get("/api/posts/{post_id}")
async def get_post_detail(post_id: str, db=Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    """v19 Step 2: stored row first (serves even when Graph is down), live
    Graph fallback for rows the sync hasn't seen yet."""
    tid = current_user._tenant_id or 0
    row = (await db.execute(
        select(Post).where(Post.tenant_id == tid, Post.fb_post_id == post_id)
    )).scalars().first()
    if row is not None:
        return ok({
            "id": row.fb_post_id, "message": row.message or "",
            "created_time": row.created_time.isoformat() if row.created_time else "",
            "permalink_url": f"https://www.facebook.com/{row.fb_post_id}",
            "likes": row.like_count or 0,
            "shares": row.share_count or 0,
            "comments": row.comment_count or 0,
        })
    fb = await _tenant_fb(current_user)
    detail = await fb.get_post_detail(post_id)
    if not detail or detail.get("error"):
        raise HTTPException(404, "المنشور غير موجود")
    return ok(detail)


@router.delete("/api/posts/{post_id}")
async def delete_post(post_id: str, current_user: User = Depends(require_role("editor"))):
    fb = await _tenant_fb(current_user)
    result = await fb.delete_post(post_id)
    if not result:
        raise HTTPException(400, "فشل حذف المنشور")
    return ok({"ok": True})


@router.post("/api/publish")
async def publish_post(message: str = Form(...), current_user: User = Depends(require_role("editor"))):
    fb = await _tenant_fb(current_user)
    result = await fb.post_to_page(message)
    if not result:
        raise HTTPException(status_code=500, detail="فشل النشر")
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
async def list_ad_accounts(db=Depends(get_db),
                           current_user: User = Depends(require_role("admin"))):
    """v19 Step 2 — DB-first ad accounts (comments precedent).

    BEFORE: live-Graph-only; a failing token answered an empty list that the
    UI rendered as «لا توجد حسابات إعلانية مرتبطة» (looks empty instead
    of broken). NOW: non-fatal 30s sync + stored rows always serve;
    ``synced=False`` + empty items lets the UI say «فشل الاتصال بفيسبوك»
    instead of lying."""
    fb = await _tenant_fb(current_user)
    tid = current_user._tenant_id
    synced = False
    if _sync_allowed(_ADACC_LAST_SYNC, tid, _ADACC_SYNC_SKIP_S):
        synced = await _sync_ad_accounts(db, tid, fb)
    rows = (await db.execute(
        select(AdAccount).where(AdAccount.tenant_id == tid).order_by(AdAccount.id)
    )).scalars().all()
    return ok({
        "items": [{
            "id": r.fb_account_id, "name": r.name or "",
            "account_status": r.account_status or 0,
            "currency": r.currency or "",
            "amount_spent": r.amount_spent or "0",
            "balance": r.balance or "0",
        } for r in rows],
        "source": "db",
        "synced": synced,
    })


@router.get("/api/ads/campaigns/{account_id}")
async def list_campaigns(account_id: str, db=Depends(get_db),
                         current_user: User = Depends(require_role("editor"))):
    """v19 Step 2 — DB-first campaigns; payload_json re-serves the exact
    live Graph shape (nested adsets included) even when Graph is down."""
    fb = await _tenant_fb(current_user)
    tid = current_user._tenant_id
    synced = False
    if _sync_allowed(_ADCAMP_LAST_SYNC, (tid, account_id), _ADCAMP_SYNC_SKIP_S):
        synced = await _sync_campaigns(db, tid, fb, account_id)
    rows = (await db.execute(
        select(AdCampaign)
        .where(AdCampaign.tenant_id == tid, AdCampaign.fb_account_id == account_id)
        .order_by(AdCampaign.id.desc())
    )).scalars().all()
    return ok({
        "items": [_payload(r.payload_json) for r in rows],
        "source": "db",
        "synced": synced,
    })


@router.get("/api/ads/ads/{account_id}")
async def list_ads(account_id: str, db=Depends(get_db),
                   current_user: User = Depends(require_role("editor"))):
    """v19 Step 2 — DB-first ads; payload_json re-serves the exact live
    Graph shape (creative + insights) even when Graph is down."""
    fb = await _tenant_fb(current_user)
    tid = current_user._tenant_id
    synced = False
    if _sync_allowed(_ADITEM_LAST_SYNC, (tid, account_id), _ADITEM_SYNC_SKIP_S):
        synced = await _sync_ad_items(db, tid, fb, account_id)
    rows = (await db.execute(
        select(AdItem)
        .where(AdItem.tenant_id == tid, AdItem.fb_account_id == account_id)
        .order_by(AdItem.id.desc())
    )).scalars().all()
    return ok({
        "items": [_payload(r.payload_json) for r in rows],
        "source": "db",
        "synced": synced,
    })
