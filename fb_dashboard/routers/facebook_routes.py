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
from datetime import UTC, datetime

from _responses import ok
from _services import _track_event, decrypt_token, encrypt_token, get_tenant_fb_client
from _utils import iso_z
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
    """Graph created_time ("2026-09-09T15:00:00+0000") → NAIVE-UTC datetime | None.

    v21 (live root-caused on production 2026-09-10): the parser returned a
    TZ-AWARE datetime (fromisoformat keeps the "+0000" offset) and asyncpg
    REFUSES aware datetimes bound to the naive ``DateTime`` columns
    (TIMESTAMP WITHOUT TIME ZONE) — DataError "invalid input for query
    argument" — which rolled back EVERY posts sync on production (Neon
    Postgres) while the exact same code+token passed on SQLite (aiosqlite
    serializes any datetime). 13 hours of empty posts section, invisible
    until the v21 sync_error surface exposed it. The comments sync already
    normalizes (replies.py: astimezone(UTC).replace(tzinfo=None)); the
    posts parser now matches that contract — the API convention is
    naive-UTC columns everywhere."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(UTC).replace(tzinfo=None)
    return parsed


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


async def _sync_page_posts(db, tenant_id: int, fb) -> tuple[bool, str]:
    """Best-effort live posts refresh — returns (False, reason) on failure.

    Uses the raw fetch (``get_page_posts_raw``): ``None`` = the call itself
    failed → ``synced=False`` so the UI can say «فشل الاتصال» instead of a
    lying empty list. Non-fatal by contract — DB rows below still serve.

    v21: the bool return made production failures INVISIBLE from outside
    (log.warning only, no surface) — the exact blind spot that kept the
    live posts section empty for hours with zero diagnosable evidence.
    The second element is a short machine-readable reason surfaced by the
    route as ``sync_error`` so an operator (or an agent) can read the
    ACTUAL failure class from the API response itself."""
    if fb is None:
        reason = ("client_none: FB client resolution returned None "
                  "(decrypt/DB — see server logs)")
        log.warning("posts sync: %s (tenant=%s)", reason, tenant_id)
        return False, reason
    try:
        r = await fb.get_page_posts_raw(50)
    except Exception as exc:
        # v20: was a silent False — the sync's Graph failure reason vanished
        reason = f"graph_exc: {type(exc).__name__}: {str(exc)[:150]}"
        log.warning("posts sync: Graph fetch failed (tenant=%s): %s",
                    tenant_id, exc)
        return False, reason
    if r is None:
        reason = ("graph_failed: posts fetch returned no data — both field "
                  "sets (full+degraded) rejected or network failed")
        return False, reason
    posts = r.get("data", []) or []
    if not posts:
        return True, ""
    fb_ids = [str(p.get("id") or "") for p in posts]
    fb_ids = [i for i in fb_ids if i]
    if not fb_ids:
        return True, ""
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
        return True, ""
    except Exception as exc:
        # v20: was a silent rollback+False — the DB-side failure reason vanished
        reason = f"db_exc: {type(exc).__name__}: {str(exc)[:150]}"
        log.warning("posts sync: DB write failed (tenant=%s): %s",
                    tenant_id, exc)
        await db.rollback()
        return False, reason


async def _sync_ad_accounts(db, tenant_id: int, fb) -> tuple[bool, str]:
    """Best-effort ad-accounts refresh (same contract as _sync_page_posts —
    v21: (ok, reason) tuple, reason surfaced as sync_error).

    v22-D2 (W1-D2 live evidence): with a PAGE token ``me/adaccounts`` is a
    STRUCTURAL 400 #100 (page tokens cannot list user ad accounts — not a
    permission to grant, not a connectivity failure). The reason carries the
    ``page_token_unsupported:`` prefix so the route can answer the honest
    «غير متاح برمز صفحة — يتطلب رمز مستخدم بحساب إعلاني» state instead of
    the misleading «فشل الاتصال بفيسبوك» (which sent owners chasing token
    problems that do not exist)."""
    if fb is None:
        reason = ("client_none: FB client resolution returned None "
                  "(decrypt/DB — see server logs)")
        log.warning("ads accounts sync: %s (tenant=%s)", reason, tenant_id)
        return False, reason
    try:
        r = await fb.get_ad_accounts_raw()
    except Exception as exc:
        # v20: silent False → logged
        reason = f"graph_exc: {type(exc).__name__}: {str(exc)[:150]}"
        log.warning("ads accounts sync: Graph fetch failed (tenant=%s): %s",
                    tenant_id, exc)
        return False, reason
    if r is None:
        reason = "graph_failed: adaccounts fetch returned no data"
        return False, reason
    if r.get("_error"):
        if r.get("_class") == "page_token_unsupported":
            # the honest structural verdict — NOT a retryable failure
            return False, ("page_token_unsupported: me/adaccounts غير متاح "
                           "برمز صفحة — يتطلب رمز مستخدم بحساب إعلاني "
                           "(ads_read)")
        reason = f"graph_error: {str(r.get('_body') or '')[:150]}"
        return False, reason
    accounts = r.get("data", []) or []
    if not accounts:
        return True, ""
    fb_ids = [str(a.get("id") or "") for a in accounts]
    fb_ids = [i for i in fb_ids if i]
    if not fb_ids:
        return True, ""
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
        return True, ""
    except Exception as exc:
        reason = f"db_exc: {type(exc).__name__}: {str(exc)[:150]}"
        log.warning("ads accounts sync: DB write failed (tenant=%s): %s",
                    tenant_id, exc)
        await db.rollback()
        return False, reason


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


# ── v22-D2: the LOUD webhook-subscription health state ────────────────────
# W1-D2 root cause: the connect-time ``POST /{page}/subscribed_apps`` fails
# with 403 #200 (the FB app lacks ``pages_manage_metadata``) and the failure
# was reduced to a soft Arabic warning riding ONE response field nobody
# renders — so the page shows «متصل ✓» while Facebook delivers ZERO events
# (subscribed_apps = [] — live-verified for t23 AND t24): comments/replies/
# subscribers/unread are permanently 0 and messages appear only when the
# owner opens a thread. The honest fix is a PERSISTED health signal, written
# from every path that can see the truth, served to every surface:
#
#   BotState key "fb_webhook_subscribed" (the fb_token_check pattern) —
#   value = {"ts": epoch, "subscribed": bool, "fields": [...],
#            "error": str, "missing": [perm…], "source": connect|test|heartbeat}
#
# Writers: PUT /api/facebook/settings (connect), POST /api/facebook/test,
# and the heartbeat/piggyback automation sweep (routers/bot.py fan step —
# one cheap GET per beat per connected tenant). Readers: GET /api/facebook/
# settings (the connect-page banner), POST /api/facebook/test, and the
# frontend dashboard banner (WebhookHealthBanner). No new tables — the
# existing (tenant_id, key) BotState row, upserted.
FB_WEBHOOK_STATE_KEY = "fb_webhook_subscribed"


def _webhook_state_payload(probe: dict, source: str,
                           missing_extra: list[str] | None = None) -> str:
    """Probe verdict → the compact JSON persisted in BotState.

    ``error`` is a SHORT CLASS (``http_403`` / ``probe_failed`` / "") — the
    raw Graph body stays in server logs; payloads stay Arabic-safe (the
    v17-E-B3 English-leak contract).
    """
    missing: list[str] = []
    if not probe.get("subscribed"):
        perm = str(probe.get("missing_permission") or "")
        if perm:
            missing.append(perm)
    for perm in missing_extra or []:
        if perm and perm not in missing:
            missing.append(perm)
    return json.dumps({
        "ts": int(time.time()),
        "subscribed": bool(probe.get("subscribed")),
        "fields": list(probe.get("fields") or [])[:12],
        "error": str(probe.get("error") or "")[:60],
        "missing": missing,
        "source": str(source or "")[:24],
    }, ensure_ascii=False)


async def _read_webhook_state(db, tenant_id: int) -> dict:
    """Stored verdict → dict ({} when never written — "unknown", not False)."""
    raw = await _tenant_state(db, tenant_id, FB_WEBHOOK_STATE_KEY)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


async def record_webhook_subscription_state(sf, tenant_id: int, fb,
                                            *, source: str = "heartbeat",
                                            subscribe_error: str = "",
                                            probe_override: dict | None = None) -> dict:
    """Probe the page's webhook subscription and PERSIST the verdict.

    One cheap ``GET /{page}/subscribed_apps``; the result is upserted into
    BotState (``fb_webhook_subscribed``) so every surface — connect page,
    dashboard banner, /api/facebook/test — reads the SAME persisted truth
    instead of re-deriving it or (worse) never learning it. Never raises:
    a probe failure is recorded as ``subscribed: false`` + the error text,
    the callers keep their contracts. Returns the persisted state dict.

    ``sf``: session factory (AsyncSessionLocal by the caller) — injectable
    so tests drive the write against their own engine.
    """
    probe: dict = {"subscribed": False, "fields": [], "error": "",
                   "error_code": None, "missing_permission": ""}
    if probe_override is not None:
        # caller already KNOWS the verdict (e.g. a successful subscribe
        # POST) — persist it directly, zero extra Graph calls.
        probe = dict(probe_override)
    else:
        checker = getattr(fb, "check_page_subscription", None)
        if checker is None:
            # this client cannot probe (a test fake, or an exotic client) —
            # NO verdict, persist nothing ("unknown" is not "false").
            return {}
        try:
            probe = await checker()
        except Exception as exc:
            probe["error"] = f"probe_exc_{type(exc).__name__}"
            log.warning("webhook health probe failed (tenant=%s): %s",
                        tenant_id, exc)
    # ``subscribe_error`` is the failed POST's Graph body — EVIDENCE for the
    # missing-permission verdict only; its raw text never lands in the state
    # (the v17-E-B3 no-English-leak contract covers BotState payloads too).
    missing_extra: list[str] = []
    if subscribe_error and "pages_manage_metadata" in str(subscribe_error):
        missing_extra.append("pages_manage_metadata")
    payload = _webhook_state_payload(probe, source, missing_extra)
    state = json.loads(payload)
    try:
        from database import AsyncSessionLocal as _default_sf
        factory = sf or _default_sf
        async with factory() as db:
            row = await db.execute(
                select(BotState).where(
                    BotState.tenant_id == tenant_id,
                    BotState.key == FB_WEBHOOK_STATE_KEY))
            bs = row.scalar_one_or_none()
            if bs:
                bs.value = payload
            else:
                db.add(BotState(tenant_id=tenant_id,
                                key=FB_WEBHOOK_STATE_KEY, value=payload))
            await db.commit()
    except Exception as exc:
        log.warning("webhook health state persist failed (tenant=%s): %s",
                    tenant_id, exc)
    if not state.get("subscribed"):
        log.warning("FB webhook NOT subscribed (tenant=%s page=%s source=%s "
                    "error=%r missing=%s) — live events are OFF until the "
                    "owner grants the missing permission(s) and re-connects",
                    tenant_id,
                    str(getattr(fb, "page_id", "") or "")[:40], source,
                    state.get("error"), state.get("missing"))
    return state


def _classify_subscribe_failure(webhook_result: dict | None) -> str:
    """(v22-D2) The subscribe POST's Graph error → the REAL Arabic cause.

    The old message blamed «رمز الوصول ومعرف الصفحة» — both wrong for the
    live 403 #200 (the app lacks pages_manage_metadata; the token and page
    id are fine). English Graph detail stays in the log; the user gets the
    true diagnosis + the fix path."""
    if not webhook_result:
        return ""
    body = str(webhook_result.get("body") or "")
    if webhook_result.get("_error") and "pages_manage_metadata" in body:
        return ("تعذر تفعيل الويبهوك — تطبيق SmartBot لم تُمنح له صلاحية "
                "pages_manage_metadata لدى فيسبوك (خطأ 403). منح الصلاحية "
                "ثم إعادة الربط يفعّل الرسائل والتعليقات اللحظية.")
    if webhook_result.get("_error"):
        return ("تعذر تفعيل الويبهوك — راجع صلاحيات التطبيق في "
                "developers.facebook.com ثم أعد الربط")
    return ""


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

    # v20: surface the last stored-token verdict (written by the self-heal
    # and the connect gate) so the UI can say «تعذّر الاتصال بصفحة فيسبوك —
    # أعد الربط» instead of rendering a silently-empty dashboard. Shape:
    # {"ts": epoch, "status": page_token|user_token_exchanged|
    #  not_page_admin|unverified, "detail": str}
    token_check = _payload(await _tenant_state(db, tenant_id, "fb_token_check"))
    token_ok = token_check.get("status") in ("", "page_token",
                                             "user_token_exchanged", None)

    # v22-D2: the PERSISTED webhook-subscription verdict (written by the
    # connect gate / test endpoint / heartbeat sweep). ``subscribed`` is
    # absent (never probed) vs false (probed, not subscribed) vs true — the
    # connect page + dashboard banner render the loud «متصل لكن الويبهوك
    # غير مفعل — البيانات الحية معطلة» state off exactly this field.
    webhook_state = await _read_webhook_state(db, tenant_id)

    return ok(
        {
        "page_id": page_id,
        "has_token": has_token,
        "connected": bool(page_id and has_token),
        "page_name": page_name,
        "token_check": token_check or None,
        "token_ok": token_ok,
        # v22-D2 — None (unknown / never probed) is NOT false: only a
        # probed-and-negative verdict may drive the red banner.
        "webhook_subscribed": (bool(webhook_state.get("subscribed"))
                               if webhook_state else None),
        "webhook_state": webhook_state or None,
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
    # v20 (live evidence): USER access tokens pass every public-field probe
    # (name/fan_count/picture → «متصل ✓») and then fail EVERY data path with
    # Graph code 190 subcode 2069032 / code 10 — silently. The connect flow
    # must refuse to store a token that cannot serve page data:
    #   - already a Page token            → store as-is
    #   - User token administering page   → EXCHANGE for the page token (the
    #     /me/accounts exchange is live-proven) and store the PAGE token
    #   - User token NOT administering it → loud Arabic 400 (never a silent
    #     empty dashboard later)
    #   - /me unreachable (network/invalid) → non-fatal: store as-is; the
    #     upgraded /api/facebook/test reports the real state afterwards
    token_exchanged = False
    if access_token and page_id:
        from fb_client import FBClient
        try:
            verdict = await FBClient(access_token, page_id).ensure_page_token()
            if verdict.get("status") == "not_page_admin":
                identity = (verdict.get("identity") or {}).get("id", "")
                log.warning("connect rejected: USER token (identity=%s) does not "
                            "administer page %s (tenant=%s)", identity,
                            page_id[:40], tenant_id)
                raise HTTPException(
                    400,
                    "الرمز الذي أدخلته رمز مستخدم لا يدير هذه الصفحة — انسخ Page Access Token الخاص بالصفحة من إعدادات فيسبوك ثم أعد المحاولة")
            if verdict.get("status") == "exchanged":
                access_token = verdict["token"]
                token_exchanged = True
                log.info("connect: USER token auto-exchanged for a PAGE token "
                         "(tenant=%s page=%s)", tenant_id, page_id[:40])
        except HTTPException:
            raise
        except Exception as exc:
            # probe itself failed (network/Graph) — never block saving on a
            # transient probe; the self-heal + test endpoint will catch it.
            log.warning("token type probe failed pre-save (tenant=%s): %s",
                        tenant_id, exc)

    webhook_result = None
    webhook_state: dict = {}
    subscribe_error_raw = ""
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
            # v20: the page-identity snapshot (name/fans/picture) runs for
            # EVERY token save — the old code fetched it only inside the
            # ``if subscribe and page_id`` webhook branch, so the connect
            # page's test button (subscribe_webhook: false) saved a token
            # while NEVER persisting the page name → settings showed a bare
            # numeric ID forever (the «الآيدي فقط» complaint).
            if page_id:
                try:
                    from fb_client import FBClient
                    page_profile = await FBClient(access_token, page_id).get_page_profile()
                except Exception:
                    # v20: silent {} swallowed the reason — log it now
                    log.warning("page profile snapshot failed (tenant=%s page=%s)",
                                tenant_id, page_id[:40], exc_info=True)
            # Auto-subscribe webhook after saving valid token
            if subscribe and page_id:
                from fb_client import FBClient
                tmp = FBClient(access_token, page_id)
                try:
                    webhook_result = await tmp.subscribe_page_webhooks()
                except Exception as e:
                    # v17-E-B3 (D9 #3): the Graph API's English error text never
                    # reaches the user — technical detail goes to the log, the
                    # payload carries a fixed Arabic message.
                    log.warning("webhook subscribe failed (tenant=%s page=%s): %s",
                                tenant_id, page_id[:40], str(e)[:300])
                    webhook_result = {"_error": True, "body": str(e)[:300]}
                if webhook_result and webhook_result.get("_error"):
                    # v17-E-B3: English Graph detail stays in the LOG; the
                    # payload carries the REAL Arabic diagnosis (was: the
                    # raw English body — or the wrong «تحقق من رمز الوصول
                    # ومعرف الصفحة» for a 403 #200 that is neither).
                    subscribe_error_raw = str(webhook_result.get("body") or "")
                    log.warning("webhook subscribe rejected (tenant=%s page=%s): %s",
                                tenant_id, page_id[:40],
                                str(webhook_result.get("body") or "")[:300])
                    real_cause = _classify_subscribe_failure(webhook_result)
                    webhook_result = ({"error": real_cause} if real_cause else
                                      {"error": "تعذر تفعيل الويبهوك — راجع صلاحيات التطبيق في developers.facebook.com ثم أعد الربط"})

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

    # v22-D2 (W1-D2 root-cause companion) — AFTER the settings commit: one
    # cheap GET /{page}/subscribed_apps is the ground truth (a failed POST
    # with a pre-existing subscription still counts as subscribed) and the
    # verdict is PERSISTED in BotState (fb_webhook_subscribed) for the
    # connect-page banner, the dashboard banner and /api/facebook/test —
    # the loud signal that replaces the old one-response whisper. Running
    # after the commit also keeps its own short transaction from sharing
    # the (still-open) route transaction on the single test connection.
    # The probe runs ONLY when the subscribe POST produced a Graph-shaped
    # verdict (success or _error+status): a plain EXCEPTION means the
    # network itself is unknown — skip (the test endpoint/heartbeat will
    # classify later) instead of stacking a second doomed Graph call.
    graph_shaped = bool(
        webhook_result and (
            webhook_result.get("success") is not None
            or isinstance(webhook_result.get("status"), int)))
    if subscribe and page_id and access_token and graph_shaped:
        try:
            if webhook_result.get("success") is True:
                # the POST succeeded — the page IS subscribed; record it
                # directly (zero extra Graph calls, no probe race).
                webhook_state = await record_webhook_subscription_state(
                    None, tenant_id, None, source="connect",
                    probe_override={"subscribed": True})
            else:
                from fb_client import FBClient
                probe_client = FBClient(access_token, page_id)
                webhook_state = await record_webhook_subscription_state(
                    None, tenant_id, probe_client, source="connect",
                    subscribe_error=subscribe_error_raw)
        except Exception as exc:  # never block the save on the probe
            log.warning("webhook health probe at connect failed (tenant=%s): %s",
                        tenant_id, exc)

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
               "page_name": page_profile.get("name", ""),
               "token_exchanged": token_exchanged,
               # v22-D2: the subscription verdict the connect page can render
               # LOUDLY (the old ``webhook`` error field was ignored by every
               # consumer — the silent-failure root cause).
               "webhook_subscribed": (bool(webhook_state.get("subscribed"))
                                      if webhook_state else None),
               "webhook_state": webhook_state or None})


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

    # v20: decrypt moved INSIDE the guarded region — it used to sit outside
    # the try, so a decrypt failure (rotated key) raised an unhandled 500.
    from fb_client import FBClient
    try:
        token = decrypt_token(token_enc)
    except Exception as exc:
        log.error("facebook test: token decrypt FAILED (tenant=%s): %s",
                  tenant_id, exc, exc_info=True)
        return ok({"connected": False, "fan_count": 0, "token_type": "unreadable",
                   "error": "تعذّر فك تشفير رمز الوصول المخزّن — أعد ربط الصفحة"})

    # v20: a USER token used to pass this endpoint (fan_count is a public
    # field — connected:true while every data path failed with Graph code
    # 190/10). The test now verifies the token TYPE first, attempts the
    # page-token exchange, and only then trusts fan_count. connected:true
    # requires a working PAGE token, not a public-field fluke.
    verdict: dict = {"status": "unverified"}
    try:
        verdict = await FBClient(token, page_id).ensure_page_token()
    except Exception as exc:
        log.warning("facebook test: token probe failed (tenant=%s): %s",
                    tenant_id, exc)

    token_type = {
        "page_token": "page",
        "exchanged": "user",
        "not_page_admin": "user",
        "unverified": "unknown",
    }.get(verdict.get("status"), "unknown")

    if verdict.get("status") == "not_page_admin":
        identity = (verdict.get("identity") or {}).get("id", "")
        log.warning("facebook test: USER token (identity=%s) does not administer "
                    "page %s (tenant=%s)", identity, page_id[:40], tenant_id)
        return ok({"connected": False, "fan_count": 0, "token_type": token_type,
                   "error": "الرمز المخزّن رمز مستخدم لا يدير هذه الصفحة — أعد الربط بـ Page Access Token"})

    effective_token = token
    token_exchanged = False
    if verdict.get("status") == "exchanged":
        token_exchanged = True
        effective_token = verdict["token"]

    try:
        client = FBClient(effective_token, page_id)
        fan_count = await client.get_page_fan_count()
        # Check token scopes
        scope_check = await client.check_token_scopes()
        # v22-D2: the webhook-subscription verdict — probed AND persisted so
        # every surface (connect page banner, dashboard banner, the next
        # GET /settings) reads the same truth. The test click is the owner's
        # natural "what's wrong?" moment: it must answer "متصل لكن الويبهوك
        # غير مفعل — البيانات الحية معطلة" when that is the live state.
        webhook_state = await record_webhook_subscription_state(
            None, tenant_id, client, source="test")
        # v20: connected requires the fan_count READ to succeed (None = the
        # Graph call failed — the old code still answered connected:true)
        connected = fan_count is not None and verdict.get("status") in (
            "page_token", "exchanged")
        result = {"connected": connected, "fan_count": fan_count or 0,
                  "token_type": token_type, "token_exchanged": token_exchanged,
                  "scopes": scope_check,
                  "webhook_subscribed": bool(webhook_state.get("subscribed")),
                  "webhook_state": webhook_state}

        # v20 self-heal on test: persist the exchanged PAGE token so the
        # user's own test click repairs the stored credentials immediately
        # (otherwise the repair waits for the cron heartbeat's TTL window).
        if token_exchanged:
            try:
                encrypted = encrypt_token(effective_token)
                existing = await db.execute(
                    select(BotState).where(
                        BotState.tenant_id == tenant_id,
                        BotState.key == "fb_access_token"))
                row = existing.scalar_one_or_none()
                if row:
                    row.value = encrypted
                else:
                    db.add(BotState(tenant_id=tenant_id, key="fb_access_token",
                                    value=encrypted))
                # refresh the identity snapshot too (name/fans/picture)
                profile = {}
                try:
                    profile = await client.get_page_profile()
                except Exception:
                    log.warning("profile snapshot after test-exchange failed "
                                "(tenant=%s)", tenant_id, exc_info=True)
                for key, value in (
                    ("fb_page_name", profile.get("name", "")),
                    ("fb_fan_count", str(profile.get("fan_count", 0) or 0)),
                    ("fb_picture_url", profile.get("picture", "")),
                    ("fb_token_check", json.dumps(
                        {"ts": int(time.time()), "status": "user_token_exchanged",
                         "detail": "استُبدل رمز المستخدم برمز صفحة تلقائياً"},
                        ensure_ascii=False)),
                ):
                    if not value:
                        continue
                    prow = await db.execute(
                        select(BotState).where(
                            BotState.tenant_id == tenant_id, BotState.key == key))
                    pbs = prow.scalar_one_or_none()
                    if pbs:
                        pbs.value = str(value)
                    else:
                        db.add(BotState(tenant_id=tenant_id, key=key,
                                        value=str(value)))
                await db.commit()
                # evict per-instance caches built on the old user token
                try:
                    from routers.inbox import _tenant_fb_cache as _inbox_cache
                    _inbox_cache.pop(tenant_id, None)
                except Exception:
                    pass
                log.info("facebook test: stored USER token exchanged + persisted "
                         "as PAGE token (tenant=%s page=%s)", tenant_id,
                         page_id[:40])
            except Exception as exc:
                await db.rollback()
                log.error("facebook test: exchange persist failed (tenant=%s): %s",
                          tenant_id, exc, exc_info=True)

        if not connected:
            result["error"] = "الرمز المخزّن لا يعمل — تحقق من صلاحيته أو أعد الربط"
        if scope_check.get("missing"):
            result["warning"] = (
                f"التوكن ينقصه الصلاحيات التالية: {'، '.join(scope_check['missing'])}. "
                "قد لا تعمل بعض ميزات البوت بشكل كامل."
            )
        # v22-D2 (W1-D2): the merged three-critical-permission verdict —
        # pages_manage_metadata (webhook subscription) + the scopes diff
        # (pages_read_engagement / pages_read_user_content for page
        # tokens) — one honest list for the connect-page warning UI.
        if result["webhook_subscribed"] is False:
            result["missing_permissions"] = sorted(set(
                list(scope_check.get("missing") or [])
                + list(webhook_state.get("missing") or [])))
            result["webhook_warning"] = (
                "متصل لكن الويبهوك غير مفعل — البيانات الحية معطلة: لن تصل "
                "الرسائل والتعليقات لحظياً ولن يعمل الرد التلقائي. "
                + (f"الصلاحيات الناقصة: {'، '.join(result['missing_permissions'])}. "
                   if result["missing_permissions"] else "")
                + "امنح التطبيق الصلاحيات من developers.facebook.com ثم أعد "
                  "توليد الرمز وأعد الربط من صفحة الربط."
            )
        return ok(result)
    except Exception as e:
        # v17-E-B3 (D9 #3): English exception text never reaches the user (the
        # connect page renders td.error in errorMsg + toast) — log it instead.
        log.warning("facebook connection test failed (tenant=%s page=%s): %s",
                    tenant_id, page_id[:40], str(e)[:300])
        return ok({"connected": False, "fan_count": 0, "token_type": token_type,
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
    sync_error = ""
    sync_attempted = False
    if _sync_allowed(_POSTS_LAST_SYNC, tid, _POSTS_SYNC_SKIP_S):
        sync_attempted = True
        synced, sync_error = await _sync_page_posts(db, tid, fb)
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
            "created_time": iso_z(r.created_time) or "",
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
        # v21: live-diagnosis surface — the ACTUAL failure class, readable
        # from the API response (log-only evidence kept the posts section
        # empty for hours with zero outside visibility). "" on success;
        # absent effect on existing consumers (additive keys).
        "sync_attempted": sync_attempted,
        "sync_error": sync_error,
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
            "created_time": iso_z(row.created_time) or "",
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
    sync_error = ""
    sync_attempted = False
    if _sync_allowed(_ADACC_LAST_SYNC, tid, _ADACC_SYNC_SKIP_S):
        sync_attempted = True
        synced, sync_error = await _sync_ad_accounts(db, tid, fb)
    # v22-D2: the honest ads state — a page token structurally cannot query
    # me/adaccounts; the UI renders «غير متاح برمز صفحة…» instead of the
    # misleading «فشل الاتصال بفيسبوك» (empty rows + this flag = honest
    # degradation, NOT a retry-loop failure).
    ads_unavailable = sync_error.startswith("page_token_unsupported")
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
        # v21: same live-diagnosis surface as /api/posts
        "sync_attempted": sync_attempted,
        "sync_error": sync_error,
        # v22-D2 — honest structural state for page-token tenants
        "ads_unavailable": ads_unavailable,
        "ads_unavailable_reason": (
            "غير متاح برمز صفحة — يتطلب رمز مستخدم بحساب إعلاني" if ads_unavailable
            else ""),
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
