"""v24-C4 — backend robustness fixes (agent: c4-backend).

Every test pins ONE fix from docs/reports/v24-B1-backend.md /
docs/reports/v24-B3-datalayer.md at the exact failure mode the audit named:

  P0  pipeline CRM check-then-insert race on uq_customer_tenant_fbuser:
      IntegrityError swallowed without rollback → PendingRollback session →
      every LATER comment's DB write failed for the rest of the cycle.
  H1  publisher scheduled_at tz-aware → naive-UTC column (asyncpg DataError
      class — Neon commit failure for scheduled multi-platform posts).
  H3  sequences/flows/calendar raw body["key"] → KeyError 500 + false
      CRITICAL alerts (v15-E3 clean-422 convention).
  M1  users create_user commit race → 409 (register.py pattern).
  H2  /api/ai/suggest + /api/ai/analyze open to viewer + no per-user limit
      → editor gate + per-user daily cap (429).
  V1  rate-limit IP fidelity: client_ip() honors X-Forwarded-For only behind
      a known proxy (VERCEL) — left-most public IP, ports stripped.
  M9  webhook unguarded json.loads → 500 to Facebook (retry storm) → 400.
  #8  sequences list step_count — one grouped COUNT query, no N+1.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import sys
import uuid
from datetime import datetime
from types import SimpleNamespace

_FB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))
if _FB_DIR not in sys.path:
    sys.path.insert(0, _FB_DIR)


# ══════════════════════════════════════════════════════════════════════════
# P0 — pipeline CRM savepoint (session poisoning)
# ══════════════════════════════════════════════════════════════════════════


class FakeFB:
    """Sufficient ReplyPipeline surface (same contract as the v23 tests)."""

    def __init__(self, page_id="PAGE1"):
        self.page_id = page_id
        self.replies: list[tuple[str, str]] = []

    async def reply_to_comment(self, comment_id, message):
        self.replies.append((comment_id, message))
        return {"id": f"rc_{len(self.replies)}"}

    async def send_private_reply(self, comment_id, message):
        return None

    async def send_dm(self, user_id, message, messaging_type="RESPONSE", tag=None):
        return None


class FakeDedup:
    def __init__(self):
        self._seen: set[str] = set()

    async def is_dup(self, cid: str) -> bool:
        return cid in self._seen

    async def mark(self, cid: str):
        self._seen.add(cid)


class FakeCooldown:
    def is_blocked(self, uid: str) -> bool:
        return False

    def adjust_window(self, uid: str, seconds: int):
        pass


class FakeMatcher:
    def __init__(self, template="السعر 50 د.ل", rule_id=7):
        self._t, self._rid = template, rule_id

    def match(self, text, intent=None):
        return self._t, None, self._rid


def _raw_comment(cid=None, text="كم السعر؟", from_id="999888777", from_name="علي حسن"):
    # "كم السعر؟" classifies as price_inquiry → the Stage-10 CRM branch runs.
    return {
        "id": cid or f"c_{uuid.uuid4().hex[:8]}",
        "message": text,
        "from": {"id": from_id, "name": from_name} if from_id else {},
        "created_time": "2026-09-11T10:00:00+0000",
    }


async def _mk_pipeline(world, tid, fb):
    from bot_engine.pipeline import ReplyPipeline
    return ReplyPipeline(fb, FakeDedup(), FakeCooldown(), tenant_id=tid)


class _RacingSession:
    """v24-C4 test double — the exact CRM check-then-insert race.

    Delegates everything to the real session, but the FIRST Customer SELECT
    answers "not found" even though the winner's row is already committed in
    the DB — precisely what a concurrent webhook+cycle reply to the SAME new
    commenter does to the loser between its read and its flush. The loser's
    INSERT then hits uq_customer_tenant_fbuser at flush time.
    """

    def __init__(self, inner):
        self._inner = inner
        self._stale_reads = 1

    async def execute(self, stmt, *a, **kw):
        from models import Customer
        try:
            entities = [d.get("entity") for d in getattr(stmt, "column_descriptions", [])]
        except Exception:
            entities = []
        if self._stale_reads and any(e is Customer for e in entities):
            self._stale_reads -= 1

            class _Empty:
                def scalar_one_or_none(self):
                    return None

            return _Empty()
        return await self._inner.execute(stmt, *a, **kw)

    def __getattr__(self, name):
        return getattr(self._inner, name)


class _PoisonedCommitSession:
    """Delegates everything, but the Nth commit raises (non-Integrity) — pins
    that the outer CRM except now rolls back instead of leaving the shared
    cycle session dirty."""

    def __init__(self, inner, fail_on: int):
        self._inner = inner
        self._fail_on = fail_on
        self._commits = 0

    async def commit(self):
        self._commits += 1
        if self._commits == self._fail_on:
            raise RuntimeError("simulated commit failure")
        return await self._inner.commit()

    def __getattr__(self, name):
        return getattr(self._inner, name)


async def test_crm_race_savepoint_session_stays_usable(v10_seed):
    """P0: the IntegrityError loser heals onto the winner's row and the SAME
    session keeps writing — before v24-C4 it entered PendingRollback and every
    later comment in the cycle failed its DB writes (replies silently lost)."""
    from models import Customer, Reply
    from sqlalchemy import select
    w = v10_seed.world
    _, tid, _ = await v10_seed.tenant_user(role="admin")

    fb_user = f"race_{uuid.uuid4().hex[:8]}"
    # the concurrent winner already committed its CRM row
    async with w.sf() as db:
        db.add(Customer(tenant_id=tid, fb_user_id=fb_user, name="الفائز بالسباق",
                        source="facebook", stage="lead", last_intent="price_inquiry",
                        total_interactions=1))
        await db.commit()

    fb = FakeFB()
    pipe = await _mk_pipeline(w, tid, fb)
    c1 = _raw_comment(cid=f"c1_{uuid.uuid4().hex[:6]}", from_id=fb_user)
    c2 = _raw_comment(cid=f"c2_{uuid.uuid4().hex[:6]}", from_id=fb_user)
    async with w.sf() as real_session:
        session = _RacingSession(real_session)
        ok1 = await pipe.process(session, c1, "p1", FakeMatcher())
        # THE regression: the second comment on the SAME session must still
        # succeed (stage 9 writes the Reply row → returns True)
        ok2 = await pipe.process(session, c2, "p1", FakeMatcher())
        # and the session itself answers plain queries without PendingRollback
        rows = (await session.execute(
            select(Reply).where(Reply.tenant_id == tid))).scalars().all()

    assert ok1 is True and ok2 is True, "a poisoned session loses later replies"
    assert len(rows) == 2, rows
    assert len(fb.replies) == 2
    # the loser healed onto the winner's row: 1 (winner's insert) + 1 (loser's
    # re-read touch) + 1 (comment #2's normal update path) — never a duplicate row
    async with w.sf() as db:
        c = (await db.execute(select(Customer).where(
            Customer.tenant_id == tid, Customer.fb_user_id == fb_user))).scalar_one()
        assert c.total_interactions == 3, c.total_interactions
        assert c.stage == "prospect"  # price_inquiry promoted the lead
    # exactly one customer row — the loser never inserted a duplicate
    async with w.sf() as db:
        all_c = (await db.execute(select(Customer).where(
            Customer.tenant_id == tid))).scalars().all()
        assert len(all_c) == 1


async def test_crm_commit_failure_rolls_back_session(v10_seed):
    """P0 belt-and-braces: a non-Integrity commit failure in the CRM stage
    now rolls the shared session back — later comments keep working."""
    from models import Reply
    from sqlalchemy import select
    w = v10_seed.world
    _, tid, _ = await v10_seed.tenant_user(role="admin")

    fb_user = f"boom_{uuid.uuid4().hex[:8]}"
    fb = FakeFB()
    pipe = await _mk_pipeline(w, tid, fb)
    c1 = _raw_comment(cid=f"c1_{uuid.uuid4().hex[:6]}", from_id=fb_user)
    c2 = _raw_comment(cid=f"c2_{uuid.uuid4().hex[:6]}", from_id=fb_user)
    async with w.sf() as real_session:
        session = _PoisonedCommitSession(real_session, fail_on=2)  # 1=stage 9, 2=CRM
        ok1 = await pipe.process(session, c1, "p1", FakeMatcher())
        ok2 = await pipe.process(session, c2, "p1", FakeMatcher())

    assert ok1 is True and ok2 is True
    async with w.sf() as db:
        rows = (await db.execute(select(Reply).where(Reply.tenant_id == tid))).scalars().all()
        assert len(rows) == 2


# ══════════════════════════════════════════════════════════════════════════
# H1 — publisher tz-aware scheduled_at
# ══════════════════════════════════════════════════════════════════════════


async def test_publisher_scheduled_aware_offsets_normalized_to_utc(v10_seed):
    """H1: a Z/offset ISO string must land in the naive-UTC column as naive —
    the aware bind is the asyncpg DataError that killed scheduled posts on
    Neon (v21 bug class) while SQLite tests stayed green."""
    from models import ScheduledPost
    from sqlalchemy import select
    c = v10_seed.world.client
    ua, tid, _ = await v10_seed.tenant_user(role="editor", tenant_name="PUB-C4")
    v10_seed.auth(ua, tid)

    r = await c.post("/api/publisher/publish", json={
        "message": "مجدول بإزاحة", "platform": "x",
        "scheduled_at": "2030-06-01T12:00:00+02:00"})
    assert r.status_code == 200, r.text
    r = await c.post("/api/publisher/publish", json={
        "message": "مجدول بZ", "platform": "x",
        "scheduled_at": "2030-06-02T10:00:00Z"})
    assert r.status_code == 200, r.text

    async with v10_seed.world.sf() as db:
        posts = (await db.execute(select(ScheduledPost).where(
            ScheduledPost.tenant_id == tid).order_by(ScheduledPost.id))).scalars().all()
    assert posts[0].scheduled_at.tzinfo is None, posts[0].scheduled_at
    assert posts[0].scheduled_at == datetime(2030, 6, 1, 10, 0, 0)
    assert posts[1].scheduled_at == datetime(2030, 6, 2, 10, 0, 0)


async def test_publisher_scheduled_past_rejected(v10_seed):
    """H1 (sibling parity): a past date is a clean 400, not a silently
    instantly-overdue scheduled row."""
    c = v10_seed.world.client
    ua, tid, _ = await v10_seed.tenant_user(role="editor", tenant_name="PUB-C4p")
    v10_seed.auth(ua, tid)
    r = await c.post("/api/publisher/publish", json={
        "message": "في الماضي", "platform": "x",
        "scheduled_at": "2020-01-01T10:00:00"})
    assert r.status_code == 400, r.text
    assert "الماضي" in r.json()["detail"]


# ══════════════════════════════════════════════════════════════════════════
# H3 — clean 422s for sequences / flows / calendar
# ══════════════════════════════════════════════════════════════════════════

_MALFORMED = b"{not-json"


async def _editor(v10_seed, tenant_name):
    ua, tid, _ = await v10_seed.tenant_user(role="editor", tenant_name=tenant_name)
    v10_seed.auth(ua, tid)
    return v10_seed.world.client


async def test_sequences_missing_name_422_not_500(v10_seed):
    """H3: body["name"] KeyError → 500 + CRITICAL alert; now the v15-E3 422."""
    c = await _editor(v10_seed, "SEQ-C4")
    r = await c.post("/api/sequences", json={"description": "بلا اسم"})
    assert r.status_code == 422, r.text
    assert "name" in r.json()["detail"]
    r = await c.post("/api/sequences", content=_MALFORMED,
                     headers={"content-type": "application/json"})
    assert r.status_code == 422, r.text


async def test_sequences_update_and_steps_malformed_422(v10_seed):
    c = await _editor(v10_seed, "SEQ-C4b")
    r = await c.post("/api/sequences", json={"name": "سلسلة"})
    assert r.status_code == 200, r.text
    seq_id = r.json()["data"]["id"]

    r = await c.put(f"/api/sequences/{seq_id}", content=_MALFORMED,
                    headers={"content-type": "application/json"})
    assert r.status_code == 422, r.text
    r = await c.post(f"/api/sequences/{seq_id}/steps", content=_MALFORMED,
                     headers={"content-type": "application/json"})
    assert r.status_code == 422, r.text
    r = await c.put("/api/sequences/steps/999", content=_MALFORMED,
                    headers={"content-type": "application/json"})
    assert r.status_code == 422, r.text


async def test_flows_missing_name_422_not_500(v10_seed):
    c = await _editor(v10_seed, "FLW-C4")
    r = await c.post("/api/flows", json={"nodes": []})
    assert r.status_code == 422, r.text
    assert "name" in r.json()["detail"]
    r = await c.post("/api/flows", content=_MALFORMED,
                     headers={"content-type": "application/json"})
    assert r.status_code == 422, r.text


async def test_flows_update_and_test_malformed_422(v10_seed):
    c = await _editor(v10_seed, "FLW-C4b")
    r = await c.post("/api/flows", json={"name": "تدفق"})
    assert r.status_code == 200, r.text
    fid = r.json()["data"]["id"]
    r = await c.put(f"/api/flows/{fid}", content=_MALFORMED,
                    headers={"content-type": "application/json"})
    assert r.status_code == 422, r.text
    r = await c.post(f"/api/flows/{fid}/test", content=_MALFORMED,
                     headers={"content-type": "application/json"})
    assert r.status_code == 422, r.text


async def test_calendar_missing_message_422_not_500(v10_seed):
    c = await _editor(v10_seed, "CAL-C4")
    r = await c.post("/api/calendar", json={"platform": "facebook"})
    assert r.status_code == 422, r.text
    assert "message" in r.json()["detail"]
    r = await c.post("/api/calendar", content=_MALFORMED,
                     headers={"content-type": "application/json"})
    assert r.status_code == 422, r.text


async def test_calendar_month13_is_422_not_engine_500(v10_seed):
    """H3 bonus: month=13 used to reach date(year, 13, 1) → ValueError 500."""
    c = await _editor(v10_seed, "CAL-C4b")
    r = await c.get("/api/calendar?year=2026&month=13")
    assert r.status_code == 422, r.text
    r = await c.get("/api/calendar/day?year=2026&month=13&day=1")
    assert r.status_code == 422, r.text
    r = await c.get("/api/calendar/day?year=2026&month=2&day=31")
    assert r.status_code == 422, r.text
    r = await c.get("/api/calendar/month-summary?year=2026&month=0")
    assert r.status_code == 422, r.text
    # valid values still pass
    r = await c.get("/api/calendar?year=2026&month=12")
    assert r.status_code == 200, r.text


# ══════════════════════════════════════════════════════════════════════════
# M1 — users create_user race → 409
# ══════════════════════════════════════════════════════════════════════════


async def test_create_user_commit_race_maps_409(v10_seed, monkeypatch):
    """M1: a concurrent duplicate winning uq_user_tenant_username at commit
    was a raw 500 — now the register.py-style clean 409 with the SAME Arabic
    message the pre-check answers."""
    from database import get_db
    from sqlalchemy.exc import IntegrityError

    w = v10_seed.world
    evidence = "UNIQUE constraint failed: users.tenant_id, users.username"

    async def override_get_db():
        async with w.sf() as session:
            async def boom():
                raise IntegrityError("INSERT ...", {}, RuntimeError(evidence))
            session.commit = boom
            yield session

    w.app.dependency_overrides[get_db] = override_get_db
    try:
        ua, tid, _ = await v10_seed.tenant_user(role="admin", tenant_name="USR-C4")
        v10_seed.auth(ua, tid)
        r = await w.client.post("/api/users", data={
            "username": "racing_user", "password": "pass123456", "role": "viewer"})
        assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text[:300]}"
        assert "موجود مسبقاً" in r.json()["detail"]
    finally:
        w.app.dependency_overrides.pop(get_db, None)


# ══════════════════════════════════════════════════════════════════════════
# H2 — AI cost gate: editor role + per-user daily cap
# ══════════════════════════════════════════════════════════════════════════


class _FakeAI:
    available = True
    provider_name = "fake"

    def __init__(self):
        self.calls = 0

    async def suggest_replies(self, text, name="", page_context=""):
        self.calls += 1
        return {"suggestions": ["رد مقترح"], "intent": "price_inquiry",
                "sentiment": "positive", "confidence": 0.9}

    async def analyze_tone(self, text):
        self.calls += 1
        return {"tone": "ودي", "sentiment": "positive", "urgency": 0}


async def _fake_ai_module(monkeypatch):
    fake = _FakeAI()

    async def _noop_refresh():
        return None

    import _services as _svc
    monkeypatch.setattr(_svc, "get_ai", lambda: fake, raising=False)
    monkeypatch.setattr(_svc, "refresh_ai_from_db", _noop_refresh, raising=False)
    return fake


async def test_ai_suggest_viewer_gets_403(v10_seed):
    """H2: viewer role could drive unlimited paid LLM calls — now 403."""
    uv, tid, _ = await v10_seed.tenant_user(role="viewer", tenant_name="AI-C4v")
    v10_seed.auth(uv, tid)
    r = await v10_seed.world.client.post(
        "/api/ai/suggest", data={"comment_text": "كم السعر؟"})
    assert r.status_code == 403, r.text
    r = await v10_seed.world.client.post(
        "/api/ai/analyze", data={"comment_text": "كم السعر؟"})
    assert r.status_code == 403, r.text


async def test_ai_suggest_daily_cap_429_after_budget(v10_seed, monkeypatch):
    """H2: 30/day/user/tenant (env SMARTBOT_AI_DAILY_LIMIT) — the third call
    with a 2-call budget answers 429 BEFORE any provider call (cost guard)."""
    import routers.ai as ai_mod
    monkeypatch.setattr(ai_mod, "_AI_DAILY_MAX", 2)
    fake = await _fake_ai_module(monkeypatch)

    ua, tid, _ = await v10_seed.tenant_user(role="editor", tenant_name="AI-C4e")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client
    r1 = await c.post("/api/ai/suggest", data={"comment_text": "كم السعر؟"})
    r2 = await c.post("/api/ai/suggest", data={"comment_text": "شحال؟"})
    r3 = await c.post("/api/ai/suggest", data={"comment_text": "بكم؟"})
    assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)
    assert r3.status_code == 429, r3.text
    assert "الحد اليومي" in r3.json()["detail"]
    assert fake.calls == 2, "the capped call must never reach the provider"
    # a different user in the SAME tenant has their own budget
    ub, tid2, _ = await v10_seed.tenant_user(role="editor", tenant_name="AI-C4e2")
    assert tid2 != tid
    v10_seed.auth(ub, tid2)
    r4 = await c.post("/api/ai/suggest", data={"comment_text": "كم؟"})
    assert r4.status_code == 200, r4.text


async def test_ai_analyze_daily_cap_429(v10_seed, monkeypatch):
    import routers.ai as ai_mod
    monkeypatch.setattr(ai_mod, "_AI_DAILY_MAX", 1)
    fake = await _fake_ai_module(monkeypatch)
    ua, tid, _ = await v10_seed.tenant_user(role="editor", tenant_name="AI-C4a")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client
    r1 = await c.post("/api/ai/analyze", data={"comment_text": "غاضب"})
    r2 = await c.post("/api/ai/analyze", data={"comment_text": "غاضب جداً"})
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 429, r2.text
    assert fake.calls == 1


# ══════════════════════════════════════════════════════════════════════════
# V1 — rate-limit IP fidelity (client_ip helper)
# ══════════════════════════════════════════════════════════════════════════


class _FakeRequest:
    def __init__(self, client_host="127.0.0.1", xff=None):
        self.client = SimpleNamespace(host=client_host)
        self.headers = {"x-forwarded-for": xff} if xff else {}


def test_client_ip_ignores_spoofed_xff_without_proxy(monkeypatch):
    """No VERCEL / SMARTBOT_TRUST_XFF → the header is client-controlled and
    must be ignored (same behavior as before v24-C4)."""
    from _rate_limit import client_ip
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("SMARTBOT_TRUST_XFF", raising=False)
    req = _FakeRequest(client_host="7.7.7.7", xff="8.8.8.8, 9.9.9.9")
    assert client_ip(req) == "7.7.7.7"


def test_client_ip_vercel_takes_proxy_appended_rightmost_ip(monkeypatch):
    """v24-R4 F1 spoof hardening: the trusted proxy APPENDS the real client IP
    as the LAST hop; left entries are client-supplied and forgeable. The
    right-most VALID entry must win — a spoofed left hop must NEVER key the
    bucket (fresh-bucket bypass / victim-IP lockout)."""
    from _rate_limit import client_ip
    monkeypatch.setenv("VERCEL", "1")
    # THE spoof pin: forged left hop ignored, proxy-appended real IP wins
    assert client_ip(_FakeRequest(xff="6.6.6.6, 93.184.216.34")) == "93.184.216.34"
    # multiple forged left hops still lose to the right-most (appended) hop
    assert client_ip(_FakeRequest(xff="6.6.6.6, 8.8.8.8, 1.2.3.4")) == "1.2.3.4"
    # single entry (direct proxy hop): ports stripped (v4 and [v6] forms)
    assert client_ip(_FakeRequest(xff="93.184.216.34:54321")) == "93.184.216.34"
    v6 = "[2606:2800:220:1:248:1893:25c8:1946]:8443"
    assert client_ip(_FakeRequest(xff=v6)) == "2606:2800:220:1:248:1893:25c8:1946"
    # garbage right-most entries skipped, next valid (right-ward) entry used
    assert client_ip(_FakeRequest(xff="8.8.4.4, garbage")) == "8.8.4.4"
    # a private right-most entry is still the proxy-observed client (CGNAT) —
    # it keys the bucket (trust anchor), not the connection host
    assert client_ip(_FakeRequest(client_host="10.1.2.3", xff="10.0.0.5, 127.0.0.1")) == "127.0.0.1"
    # no header at all → the connection host
    assert client_ip(_FakeRequest(client_host="10.1.2.3")) == "10.1.2.3"


def test_client_ip_trust_xff_env_knob(monkeypatch):
    """Non-Vercel deployments behind a trusted proxy can opt in explicitly."""
    from _rate_limit import client_ip
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setenv("SMARTBOT_TRUST_XFF", "1")
    assert client_ip(_FakeRequest(xff="1.2.3.4")) == "1.2.3.4"
    # the knob must be exactly "1" — anything else stays untrusted
    monkeypatch.setenv("SMARTBOT_TRUST_XFF", "0")
    assert client_ip(_FakeRequest(client_host="5.5.5.5", xff="1.2.3.4")) == "5.5.5.5"


async def test_middleware_mutate_bucket_keyed_by_forwarded_ip(v10_seed, monkeypatch):
    """V1: behind VERCEL the mutate bucket key uses the FORWARDED client IP,
    not the shared proxy address — before v24-C4 every user behind the proxy
    landed in one bucket (cross-user 429 lockouts). Captures the limiter keys
    (the limiter's DB write is patched out — the key IS the contract here)."""
    import _rate_limit as rl
    import app.middleware as mw

    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(mw, "_MUTATE_MAX", 1)
    captured: list[str] = []

    async def _capture(db, key, max_attempts=10, window_seconds=60):
        captured.append(key)
        return True

    monkeypatch.setattr(rl, "check_rate_limit", _capture)
    c = v10_seed.world.client
    await c.post("/api/__c4_xff_probe__", headers={"x-forwarded-for": "93.184.216.34"})
    await c.post("/api/__c4_xff_probe__", headers={"x-forwarded-for": "93.184.216.35"})
    await c.post("/api/__c4_xff_probe__")  # no header → connection host
    assert captured[:2] == ["mutate:93.184.216.34", "mutate:93.184.216.35"], captured
    assert captured[2].startswith("mutate:") and captured[2] not in captured[:2], captured


# ══════════════════════════════════════════════════════════════════════════
# M9 — webhook json.loads guard
# ══════════════════════════════════════════════════════════════════════════


async def test_webhook_malformed_json_is_400_not_500(v10_seed, monkeypatch):
    """M9: a signed-but-malformed body must answer 400 — the old raw 500 sent
    Facebook into a retry storm on the same poison payload."""
    import runner

    monkeypatch.setattr(runner, "WEBHOOK_APP_SECRET", "c4-test-secret")

    def _sign(body: bytes) -> str:
        return "sha256=" + hmac.new(b"c4-test-secret", body, hashlib.sha256).hexdigest()

    c = v10_seed.world.client
    r = await c.post("/webhook", content=b"not-json-at-all",
                     headers={"x-hub-signature-256": _sign(b"not-json-at-all")})
    assert r.status_code == 400, r.text
    # non-object JSON (list) is equally rejected instead of AttributeError 500
    body = b"[1,2,3]"
    r = await c.post("/webhook", content=body,
                     headers={"x-hub-signature-256": _sign(body)})
    assert r.status_code == 400, r.text
    # an unsigned body still never reaches the parser (401 first — order kept)
    r = await c.post("/webhook", content=b"garbage", headers={})
    assert r.status_code == 401, r.text


# ══════════════════════════════════════════════════════════════════════════
# Task 8 — sequences list step_count (single grouped COUNT, no N+1)
# ══════════════════════════════════════════════════════════════════════════


async def test_sequences_list_step_count(v10_seed):
    """The list rows carry step_count (frontend: step_count ?? steps?.length ?? 0):
    2 steps → 2, none → 0 — one grouped COUNT query for the whole list."""
    c = await _editor(v10_seed, "SEQ-CNT")
    r = await c.post("/api/sequences", json={"name": "بخطوات"})
    assert r.status_code == 200, r.text
    seq_a = r.json()["data"]["id"]
    r = await c.post("/api/sequences", json={"name": "بلا خطوات"})
    assert r.status_code == 200, r.text
    seq_b = r.json()["data"]["id"]
    for _ in range(2):
        r = await c.post(f"/api/sequences/{seq_a}/steps", json={
            "step_order": 1, "delay_hours": 1, "message_template": "مرحبا"})
        assert r.status_code == 200, r.text

    r = await c.get("/api/sequences")
    assert r.status_code == 200, r.text
    items = {s["id"]: s for s in r.json()["data"]}
    assert items[seq_a]["step_count"] == 2, items[seq_a]
    assert items[seq_b]["step_count"] == 0, items[seq_b]
