# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
from __future__ import annotations

"""Inbox & conversations routes."""
import logging
from datetime import UTC, datetime

from _responses import ok
from _services import _track_event, get_tenant_fb_client
from _utils import iso_z, utcnow
from database import AsyncSessionLocal, get_db
from fastapi import APIRouter, Depends, Form, HTTPException, Query
from models import Conversation, ConversationLabel, ConversationTag, Message, User
from sqlalchemy import and_, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.exc import OperationalError as _OpErr

from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["inbox"])

# ponytail: per-tenant fb client cache — dict[tenant_id, (FBClient, expires_at)].
# Evict on token refresh. Replace with Redis-backed registry when multi-worker.
# v20: entries now carry a TTL (10 min) — on multi-instance serverless deploys
# the eviction performed on instance A (settings save / token self-heal)
# could never reach instance B, whose cache kept serving a stale/broken token
# until the instance recycled. A TTL bounds that divergence window.
_tenant_fb_cache: dict[int, tuple[object, float]] = {}
_FB_CACHE_TTL_S = 600.0

# v8-A12: monotonic timestamp of the last successful Graph sync per tenant —
# the polling messages page re-synced on every 10s poll before this.
_INBOX_LAST_SYNC: dict[int, float] = {}

async def _get_inbox_fb(tenant_id: int):
    """Resolve (and cache) the tenant's FB client. Awaited — get_tenant_fb_client is async."""
    import time as _time
    cached = _tenant_fb_cache.get(tenant_id)
    if cached is not None and cached[1] > _time.monotonic():
        return cached[0]
    if cached is not None:
        _tenant_fb_cache.pop(tenant_id, None)  # expired
    fb = await get_tenant_fb_client(tenant_id)
    if fb is None:
        raise HTTPException(400, "لم يتم إعداد فيسبوك بعد — اربط صفحتك من صفحة /connect")
    _tenant_fb_cache[tenant_id] = (fb, _time.monotonic() + _FB_CACHE_TTL_S)
    return fb


def _parse_graph_time(raw) -> datetime | None:
    """Graph ISO time («2026-09-10T01:05:00+0000» / «…Z») → naive-UTC.

    Same v21 hotfix contract: aware datetimes bound for the naive DateTime
    columns make asyncpg raise DataError → 500 on production Postgres —
    every timestamp that crosses the DB boundary is normalized to
    naive-UTC first (the ``_parse_fb_time`` convention).
    """
    s = str(raw or "").strip()
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(
            s.replace("+0000", "+00:00").replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(UTC).replace(tzinfo=None)
    return dt


async def _persist_graph_thread(tenant_id: int, conversation_id: str,
                                messages: list) -> int:
    """Dedup-persist a fetched Graph thread (v21 pattern — now shared by
    the empty-thread fall-through AND the v22 staleness re-sync).

    Dedup by (tenant_id, fb_message_id); the conversation row's counters
    advance by the rows actually written. Best-effort by contract: a
    persist failure must NEVER 500 the thread read (the live fetch result
    is already in hand). Returns the number of NEW rows written.
    """
    try:
        async with AsyncSessionLocal() as s2:
            row = (await s2.execute(
                select(Conversation).where(
                    Conversation.tenant_id == tenant_id,
                    Conversation.fb_conversation_id == conversation_id,
                )
            )).scalar_one_or_none()
            if row is None:
                return 0
            mids = [str(m.get("id") or "") for m in messages if m.get("id")]
            existing: set[str] = set()
            if mids:
                for mid in (await s2.execute(
                    select(Message.fb_message_id).where(
                        Message.tenant_id == tenant_id,
                        Message.fb_message_id.in_(mids))
                )).scalars().all():
                    existing.add(mid)
            written = 0
            newest_at = None
            newest_text = ""
            for m in messages:
                mid = str(m.get("id") or "")
                if not mid or mid in existing:
                    continue
                sender = m.get("from") or {}
                created = _parse_graph_time(m.get("created_time"))
                s2.add(Message(
                    tenant_id=tenant_id, conversation_id=row.id,
                    fb_message_id=mid, fb_conversation_id=conversation_id,
                    sender_id=str(sender.get("id", "") or ""),
                    sender_name=str(sender.get("name", "") or ""),
                    text=str(m.get("message", "") or ""),
                    is_from_page=bool(m.get("is_from_page", False)),
                    created_at=created,
                ))
                written += 1
                if created is not None and (newest_at is None or created > newest_at):
                    newest_at = created
                    newest_text = str(m.get("message", "") or "")
            if written:
                row.message_count = (row.message_count or 0) + written
                if newest_at is not None and (row.last_message_at is None
                                              or newest_at > row.last_message_at):
                    row.last_message_at = newest_at
                    row.last_message_text = newest_text[:500]
            await s2.commit()
            return written
    except Exception:
        log.warning("inbox thread persist failed (tenant=%s conv=%s)",
                    tenant_id, str(conversation_id)[:40], exc_info=True)
        return 0


async def _resync_thread_if_stale(tenant_id: int, conversation_id: str,
                                  row: Conversation) -> bool:
    """v22-D2 (W1-D2 frozen-thread fix): re-sync a NON-EMPTY stored thread.

    The v21 path only persisted a thread when the DB copy was EMPTY —
    after the first persist the thread froze forever (live evidence
    2026-09-10: DB 46 vs Graph 47; the newer «الو» 11:02:54 never appeared
    on any re-open). One cheap ``GET /{conversation}?fields=updated_time,
    message_count`` probe decides staleness: ``updated_time`` moves on
    EVERY new message; ``message_count`` is the fallback marker for rows
    stored without timestamps. Stale → full re-fetch + dedup-persist.

    Never raises and never blocks the DB copy from serving: "not
    connected", a probe failure, a fetch failure or a persist failure all
    just leave the stored thread as-is. Returns True when new rows were
    persisted (caller re-reads the merged thread).
    """
    try:
        fb = await _get_inbox_fb(tenant_id)
    except HTTPException:
        return False  # not connected — the DB copy serves (loud 400 stays
        # the LIST/thread contract for empty threads only)
    except Exception as exc:
        log.warning("inbox staleness probe failed (tenant=%s conv=%s): %s",
                    tenant_id, str(conversation_id)[:40], exc)
        return False
    probe = getattr(fb, "get_conversation_meta", None)
    if probe is None:
        return False  # client without the v22 seam — keep the v21 contract
    try:
        meta = await probe(conversation_id)
    except Exception as exc:
        log.warning("inbox staleness probe failed (tenant=%s conv=%s): %s",
                    tenant_id, str(conversation_id)[:40], exc)
        return False
    if not isinstance(meta, dict):
        return False

    live_updated = _parse_graph_time(meta.get("updated_time"))
    try:
        live_count = int(meta.get("message_count") or 0)
    except (TypeError, ValueError):
        live_count = 0

    async with AsyncSessionLocal() as s:
        newest_db = await s.scalar(
            select(func.max(Message.created_at)).where(
                Message.conversation_id == row.id))
        db_count = (await s.scalar(
            select(func.count(Message.id)).where(
                Message.conversation_id == row.id)) or 0)
    if db_count <= 0:
        return False  # empty thread — the v21 fall-through path owns it

    stale = False
    if live_updated is not None and (newest_db is None or live_updated > newest_db):
        stale = True
    if live_count and live_count > db_count:
        stale = True
    if not stale:
        return False

    try:
        messages = await fb.get_conversation_messages(conversation_id)
    except Exception as exc:
        log.warning("inbox stale re-fetch failed (tenant=%s conv=%s): %s",
                    tenant_id, str(conversation_id)[:40], exc)
        return False
    if not messages:
        return False
    return await _persist_graph_thread(tenant_id, conversation_id, messages) > 0


@router.get("/api/inbox/conversations")
async def inbox_list(
    status: str = Query("all"), tag: str = Query(""), search: str = Query(""),
    page: int = Query(1, ge=1), per_page: int = Query(25, ge=1, le=100), current_user: User = Depends(get_current_user),
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
    # v8-A12: (a) 30-second per-tenant sync skip — the messages page polls
    # this endpoint every 10-15s; re-hitting the Graph API + a DB write
    # transaction on every poll was pure waste. (b) batch upsert — the old
    # loop ran one SELECT per conversation (up to 50 sequential round-trips
    # + commit); now one IN(...) fetch, diff in Python, add_all.
    import time as _time
    now = _time.monotonic()
    # v20 fix: the default sentinel is None (never synced), NOT 0.0 —
    # ``now - 0.0 < 30`` is true on any lambda younger than 30s, skipping the
    # very first sync on every short-lived serverless instance. The DB rows
    # still serve, but the live refresh (and its token self-heal side effect)
    # was starved exactly where it mattered most.
    last = _INBOX_LAST_SYNC.get(tenant_id)
    if last is not None and now - last < 30:
        convos = None
    else:
        _INBOX_LAST_SYNC[tenant_id] = now
        convos = None
        try:
            fb = await _get_inbox_fb(tenant_id)
            convos = await fb.get_conversations(50)
        except HTTPException:
            # v20: "not connected" is a legitimate state (a distinct 400 the
            # route below reports) — debug-level only, no warning noise.
            convos = None  # not connected — DB rows below still serve
        except Exception as exc:
            # v20: was ``convos = None`` with zero logging — an expired token,
            # a user-token rejection (Graph code 10) or a network failure all
            # vanished here and the inbox just looked empty forever.
            log.warning("inbox live sync failed (tenant=%s): %s", tenant_id, exc)
            convos = None  # expired token / offline — DB rows below still serve
    if convos:
        try:
            async with AsyncSessionLocal() as s:
                cids = [str(c.get("id") or "") for c in convos if c.get("id")]
                existing: dict[str, Conversation] = {}
                if cids:
                    for row in (await s.execute(
                        select(Conversation).where(
                            Conversation.tenant_id == tenant_id,
                            Conversation.fb_conversation_id.in_(cids),
                        )
                    )).scalars().all():
                        existing[row.fb_conversation_id] = row
                new_rows: list[Conversation] = []
                for c in convos:
                    cid = str(c.get("id") or "")
                    if not cid:
                        continue
                    senders = (c.get("senders") or {}).get("data") or []
                    name = (senders[0].get("name") if senders else "") or ""
                    row = existing.get(cid)
                    if row is None:
                        new_rows.append(Conversation(
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
                if new_rows:
                    s.add_all(new_rows)
                await s.commit()
        except Exception:
            pass  # non-fatal — DB rows below still serve

    # ── 2) DB rows → response items (legacy shape) ──
    # v15-fix (بطارية p11-t10): قفل SQLite العابر (database is locked — كتابة
    # متزامنة من معالجة الويبهوك أثناء القراءة) كان يرفع 500 خاماً.
    # ببيئة الإنتاج PostgreSQL هذه الفئة غير موجودة (MVCC) — هنا إعادة
    # محاولة واحدة بعد 300ms تحمي وضع التطوير المحلي والبطارية.
    import asyncio as _asyncio

    rows = None
    for _attempt in range(2):
        try:
            async with AsyncSessionLocal() as s:
                rows = (await s.execute(
                    select(Conversation)
                    .where(Conversation.tenant_id == tenant_id)
                    .order_by(Conversation.last_message_at.desc())
                    .limit(200)
                )).scalars().all()
            break
        except _OpErr:
            if _attempt:
                raise
            await _asyncio.sleep(0.3)
    items = [{
        "id": c.fb_conversation_id,
        "subject": (c.last_message_text or "")[:80] or "بدون موضوع",
        "senders": [{"name": c.user_name or c.fb_user_id or "غير معروف"}],
        "message_count": c.message_count or 0,
        "unread_count": c.unread_count or 0,
        "updated_time": iso_z(c.last_message_at),
        "tags": [],
    } for c in rows]

    # Load tags from DB for all conversation IDs (v9-A3: join also
    # filtered by tenant so foreign labels/tags can never surface here)
    if items:
        ids = [it["id"] for it in items]
        try:
            async with AsyncSessionLocal() as s2:
                lbls = await s2.execute(
                    select(ConversationLabel, ConversationTag)
                    .join(ConversationTag, ConversationLabel.tag_id == ConversationTag.id)
                    .where(ConversationLabel.conversation_id.in_(ids),
                           ConversationTag.tenant_id == tenant_id)
                )
                tag_pairs = lbls.all()
        except _OpErr:
            tag_pairs = []
    else:
        tag_pairs = []
    tag_map: dict[str, list] = {}
    for lbl, tag in tag_pairs:
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

    v21 (browser-evidenced 2026-09-10): the list sync creates Conversation
    ROWS from Graph metadata (message_count from the conversations edge)
    without persisting the thread, so a row with a NON-zero message_count
    could serve ZERO persisted messages — the dashboard showed «45 رسالة»
    in the list and «لا توجد رسائل في هذه المحادثة» when opened. A row
    with an EMPTY persisted thread now falls through to the live Graph
    fetch (and persists what it returns, dedup by fb_message_id) instead
    of answering an empty list.

    v22-D2 (W1-D2 frozen-thread evidence): a NON-EMPTY stored thread used
    to be served WITHOUT any live check — the thread froze at its first
    persist (DB 46 vs Graph 47; the newer message never appeared on any
    re-open). One cheap meta probe (``updated_time`` / ``message_count``)
    now detects staleness and re-syncs: refetch + dedup-persist, then the
    merged DB thread serves. Probe failures never break the DB read.
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
            if msgs:
                # v22-D2: staleness re-sync BEFORE serving — the frozen-
                # thread fix (see _resync_thread_if_stale). New rows →
                # re-read so the response carries the merged thread.
                if await _resync_thread_if_stale(tenant_id, conversation_id, row):
                    async with AsyncSessionLocal() as s2:
                        msgs = (await s2.execute(
                            select(Message)
                            .where(Message.conversation_id == row.id)
                            .order_by(Message.created_at.asc())
                            .limit(200)
                        )).scalars().all()
                return ok([{
                    "id": str(m.fb_message_id or m.id),
                    "message": m.text or "",
                    "from": {"id": m.sender_id or "", "name": m.sender_name or ("الصفحة" if m.is_from_page else "")},
                    # v4 §2.4 — the frontend compared from.id === "page" which never
                    # matches the numeric page id → page replies rendered as customer
                    # bubbles. Explicit flag is unambiguous.
                    "is_from_page": bool(m.is_from_page),
                    "attachment_type": m.attachment_type or "",
                    "attachment_url": m.attachment_url or "",
                    "postback_payload": m.postback_payload or "",
                    "created_time": iso_z(m.created_at),
                } for m in msgs])
            # v21: empty persisted thread — fall through to the live fetch
            # below (the row stays loaded via conversation_id for persistence)

    # DB miss OR empty persisted thread → live Graph fetch (conversation
    # discovered via live sync, or thread never webhook-persisted)
    fb = await _get_inbox_fb(tenant_id)
    messages = await fb.get_conversation_messages(conversation_id)
    # v21 → v22-D2: persist the fetched thread — dedup by (tenant_id,
    # fb_message_id); the next open serves instantly from the DB and
    # survives a Graph outage. Shared helper (same naive-UTC pattern as
    # the staleness re-sync path).
    if messages:
        await _persist_graph_thread(tenant_id, conversation_id, messages)
    # v4 §2.4 — is_from_page explicit on the live path too (message.data
    # carries the page id on page-sent messages)
    return ok(
        [{
        "id": m["id"], "message": m.get("message", ""),
        "from": m.get("from", {}),
        "is_from_page": m.get("is_from_page", False),
        "created_time": m.get("created_time", ""),
    } for m in messages]
    )


@router.post("/api/inbox/conversations/{conversation_id}/read")
async def inbox_mark_read(conversation_id: str, db=Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    """v17-E-B1 (D10-M3): mark a conversation read — zero its unread_count.

    Opening a conversation in the dashboard never cleared the unread badge
    (the "غير مقروء" filter lied until the user read it inside Facebook
    itself) because no endpoint existed. Contract (E-B1 → E-F1, plan §3):
    returns the tenant's TOTAL unread AFTER the reset as ``ok({"unread": n})``
    so the messages page updates its list optimally with one round-trip.

    get_current_user (not editor): reading is passive — a viewer opening a
    conversation is exactly the event that should clear the badge.
    Tenant-scoped like every inbox path: another tenant's conversation id
    answers 404, never a cross-tenant write.
    """
    tenant_id = current_user._tenant_id
    row = (await db.execute(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.fb_conversation_id == conversation_id,
        )
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "المحادثة غير موجودة")
    if row.unread_count:
        row.unread_count = 0
        await db.commit()
    # SUM ignores NULL unread_count rows (legacy DBs) — coalesce keeps the 0.
    unread_total = await db.scalar(
        select(func.coalesce(func.sum(Conversation.unread_count), 0)).where(
            Conversation.tenant_id == tenant_id)
    ) or 0
    return ok({"unread": int(unread_total)})


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


async def _persist_page_sent_message(tenant_id: int, conversation_id: str,
                                     message: str, result: dict, fb) -> None:
    """v22-D2 (W1-D2 §4.2): persist the page's OWN reply at send time.

    The sent message previously appeared only on a future EMPTY-thread
    fetch — which can never happen once the thread is non-empty, so manual
    inbox replies vanished from the dashboard until some external re-sync.
    Attribution: sender = the page (fb.page_id), is_from_page=True, the
    Graph response's ``message_id`` as the dedup key. Best-effort: a
    persist failure must never fail the (already-delivered) reply."""
    mid = str((result or {}).get("message_id") or "")
    if not mid:
        return  # no stable id — nothing dedup-safe to persist
    page_id = str(getattr(fb, "page_id", "") or "")
    now = utcnow()
    try:
        async with AsyncSessionLocal() as db:
            existing = await db.execute(
                select(Message.id).where(
                    Message.tenant_id == tenant_id,
                    Message.fb_message_id == mid))
            if existing.scalar_one_or_none() is not None:
                return  # webhook echo / redelivery already stored it
            conv = (await db.execute(
                select(Conversation).where(
                    Conversation.tenant_id == tenant_id,
                    Conversation.fb_conversation_id == conversation_id)
            )).scalar_one_or_none()
            if conv is None:
                # live-only conversation (never persisted): create the row so
                # the reply attaches to the tenant's inbox from now on
                conv = Conversation(
                    tenant_id=tenant_id, fb_conversation_id=conversation_id,
                    message_count=0, unread_count=0)
                db.add(conv)
                await db.flush()
            db.add(Message(
                tenant_id=tenant_id, conversation_id=conv.id,
                fb_message_id=mid, fb_conversation_id=conversation_id,
                sender_id=page_id, sender_name="",
                text=message, is_from_page=True, created_at=now,
            ))
            conv.message_count = (conv.message_count or 0) + 1
            conv.last_message_text = message[:500]
            conv.last_message_at = now
            await db.commit()
    except Exception:
        log.warning("page-sent reply persist failed (tenant=%s conv=%s)",
                    tenant_id, str(conversation_id)[:40], exc_info=True)


@router.post("/api/inbox/conversations/{conversation_id}/reply")
async def inbox_reply(
    conversation_id: str, message: str = Form(...),
    current_user: User = Depends(require_role("editor")),
):
    """Send a reply in a conversation. Tries Messenger first, falls back to private_reply.

    v22-D2: the page-sent message is PERSISTED at send time (dedup by the
    Graph message_id) — manual replies used to vanish from the thread
    until an (impossible) empty-thread re-fetch."""
    fb = await _get_inbox_fb(current_user._tenant_id)
    # Try Messenger conversation reply
    result = await fb.send_conversation_message(conversation_id, message)
    if result:
        await _persist_page_sent_message(
            current_user._tenant_id, conversation_id, message, result, fb)
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
    """Create a new tag.

    v8-A5: uniqueness is per-tenant — a global name check let tenant A's
    "VIP" tag wrongly block tenant B from creating their own.
    v15-E4 (D13-F1 عائلة 409): التكرار يرد 409 (كان 400) وسباق الإنشاء
    المتزامن (uq_ctag_tenant_name) يُلتقط عند الالتزام ويرد نفس الرسالة —
    لا 500 خام أبداً.
    """
    existing = await db.execute(
        select(ConversationTag).where(
            ConversationTag.name == name,
            ConversationTag.tenant_id == current_user._tenant_id))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "اسم الوسم موجود مسبقاً في مساحتك — اختر اسماً آخر")
    tag = ConversationTag(name=name, color=color, tenant_id=current_user._tenant_id)
    db.add(tag)
    try:
        await db.commit()
    except IntegrityError as exc:
        # v15-E4 (D12 sibling): طلبا إنشاء متزامنان لنفس الاسم — الخاسر
        # يلتقط قيد التفرد عند الالتزام ويرد 409 نظيفة (كان 500 خام).
        await db.rollback()
        log.warning("inbox tag create conflict: %s", exc)
        raise HTTPException(409, "اسم الوسم موجود مسبقاً في مساحتك — اختر اسماً آخر") from exc
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
    """Assign a tag to a conversation.

    v9-A3 (BOLA fix): the conversation must belong to the CURRENT tenant
    before any label is inserted — previously a tenant editor could tag any
    other tenant's conversation id (and the label row itself had no tenant
    context). The label now records the owning tenant as well.
    """
    tenant_id = current_user._tenant_id
    convo = (await db.execute(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.fb_conversation_id == conv_id)
    )).scalar_one_or_none()
    if not convo:
        raise HTTPException(404, "المحادثة غير موجودة")
    tag = (await db.execute(
        select(ConversationTag).where(ConversationTag.id == tag_id, ConversationTag.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if not tag:
        raise HTTPException(404, "الوسم غير موجود")
    existing = await db.execute(
        select(ConversationLabel).where(
            and_(ConversationLabel.conversation_id == conv_id, ConversationLabel.tag_id == tag_id))
    )
    if not existing.scalar_one_or_none():
        db.add(ConversationLabel(tenant_id=tenant_id, conversation_id=conv_id, tag_id=tag_id))
        await db.commit()
    return ok({"ok": True})


@router.delete("/api/inbox/conversations/{conv_id}/tags/{tag_id}")
async def inbox_remove_tag(conv_id: str, tag_id: int,
                           db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    """Remove a tag from a conversation.

    v9-A3 (BOLA fix): BOTH the conversation AND the tag must belong to the
    current tenant — previously the delete was unscoped: any tenant could
    strip labels off any other tenant's conversation.
    """
    tenant_id = current_user._tenant_id
    convo = (await db.execute(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.fb_conversation_id == conv_id)
    )).scalar_one_or_none()
    if not convo:
        raise HTTPException(404, "المحادثة غير موجودة")
    tag = (await db.execute(
        select(ConversationTag).where(ConversationTag.id == tag_id, ConversationTag.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if not tag:
        raise HTTPException(404, "الوسم غير موجود")
    await db.execute(
        ConversationLabel.__table__.delete().where(
            and_(ConversationLabel.conversation_id == conv_id, ConversationLabel.tag_id == tag_id,
                 ConversationLabel.tenant_id == tenant_id))
    )
    await db.commit()
    return ok({"ok": True})
