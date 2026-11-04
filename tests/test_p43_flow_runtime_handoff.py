from __future__ import annotations

"""P43 acceptance tests — SB-1 flow runtime + SB-2 conversation handoff.

SB-1 (flow engine revival):
  * publish gate: graph validation (exactly-one TRIGGER, edge refs, orphan
    cycle) + draft-level structure validation at create + unpublish +
    executions/stats endpoints;
  * runtime: keyword trigger starts a run, MESSAGE DM is sent and attributed
    (Message.flow_id), run completes;
  * one-active guard: a keyword-wait run advances on the matching message
    instead of starting a second run;
  * DELAY: parks with resume_at; resume_due_flow_executions only fires when
    due and completes the run (tenant FB client resolved via _services);
  * bot_paused: the flow layer yields completely (handoff semantics).

SB-2 (conversation handoff):
  * PATCH status/assignee/bot_paused with the full 422 family;
  * cross-tenant assignee rejection + tenant isolation on the conversation;
  * detail endpoint: handoff fields + notes;
  * first_response_at stamped on the first human reply (Form reply path).
"""
import os
import sys
import uuid
from datetime import timedelta

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))

from _utils import utcnow  # noqa: E402
from database import AsyncSessionLocal  # noqa: E402
from database import engine as db_engine
from httpx import ASGITransport, AsyncClient  # noqa: E402
from models import Base  # noqa: E402


@pytest.fixture(scope="module")
async def app_client():
    from runner import app

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    import _rate_limit as _rl

    async def _allow(db, key, max_attempts=10, window_seconds=60):
        return True

    mp = pytest.MonkeyPatch()
    mp.setattr(_rl, "check_rate_limit", _allow)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t",
                               follow_redirects=True) as ac:
            yield ac
    finally:
        mp.undo()


async def _register(ac: AsyncClient, prefix: str) -> dict:
    uname = f"{prefix}_{uuid.uuid4().hex[:8]}"
    r = await ac.post("/api/register", json={
        "username": uname, "email": f"{uname}@t.ly",
        "password": "Str0ngPass!ly", "name": prefix,
    })
    assert r.status_code == 200, r.text
    d = r.json()["data"]["user"]
    return {"id": d["id"], "username": uname, "tenant_id": d["tenant_id"]}


async def _seed_team_member(tenant_id: int, prefix: str = "p43mate") -> dict:
    """A user row in the SAME tenant (direct DB seed — /api/register always
    mints a fresh tenant, so team members come from /api/users, not register)."""
    from _hash import hash_password
    from models import User

    uname = f"{prefix}_{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        u = User(username=uname, email=f"{uname}@t.ly",
                 password_hash=hash_password("Str0ngPass!ly"),
                 tenant_id=tenant_id, role="editor")
        db.add(u)
        await db.commit()
        return {"id": u.id, "username": uname, "tenant_id": tenant_id}


# ── graph fixtures (P43 flat node schema) ─────────────────────────────

def _trigger(nid: str = "t1", keywords: list[str] | None = None,
             match: str = "any") -> dict:
    return {"id": nid, "type": "TRIGGER",
            "data": {"triggerType": "keyword",
                     "keywords": keywords or ["خصم"], "matchMode": match}}


def _msg(nid: str, text: str) -> dict:
    return {"id": nid, "type": "MESSAGE", "data": {"text": text}}


def _goal(nid: str = "g1") -> dict:
    return {"id": nid, "type": "GOAL", "data": {}}


def _delay(nid: str, minutes: int) -> dict:
    return {"id": nid, "type": "DELAY", "data": {"minutes": minutes}}


VALID_GRAPH = ([_trigger(), _msg("m1", "أهلاً {{first_name}}! كود الخصم P43"), _goal()],
               [{"source": "t1", "target": "m1"}, {"source": "m1", "target": "g1"}])


class FakeFlowFB:
    """Minimal tenant FB client — DMs + conversation messages recorded."""

    def __init__(self) -> None:
        self.page_id = "p43-page"
        self.dms: list[tuple[str, str]] = []
        self.conv_msgs: list[tuple[str, str]] = []
        self._n = 0

    async def send_dm(self, user_id: str, text: str) -> dict:
        self._n += 1
        self.dms.append((user_id, text))
        return {"message_id": f"p43_dm_{self._n}"}

    async def send_conversation_message(self, conversation_id: str, message: str) -> dict:
        self._n += 1
        self.conv_msgs.append((conversation_id, message))
        return {"recipient_id": "9001", "message_id": f"p43_conv_{self._n}"}

    async def reply_to_comment(self, comment_id: str, message: str) -> dict:
        return {"_error": True, "body": "fake: comment path unused"}


async def _seed_runtime_world(tenant_id: int, *, page_id: str = "p43-page",
                              conv_fb_id: str = "c_p43_1",
                              subscriber_fb_id: str = "9001",
                              custom_data: dict | None = None,
                              bot_paused: bool = False,
                              flow_nodes=None, flow_edges=None,
                              flow_status: str = "active",
                              ) -> dict:
    """Seed Conversation + Subscriber + active Flow; returns ids."""
    from models import Conversation, Flow, Subscriber

    async with AsyncSessionLocal() as db:
        flow = Flow(tenant_id=tenant_id, name=f"P43-flow-{uuid.uuid4().hex[:6]}",
                    nodes=flow_nodes if flow_nodes is not None else VALID_GRAPH[0],
                    edges=flow_edges if flow_edges is not None else VALID_GRAPH[1],
                    status=flow_status)
        db.add(flow)
        await db.flush()

        sub = Subscriber(tenant_id=tenant_id, fb_user_id=subscriber_fb_id,
                         first_name="سالم", page_id=page_id,
                         custom_data=custom_data or {})
        db.add(sub)
        await db.flush()

        conv = Conversation(tenant_id=tenant_id,
                            fb_conversation_id=conv_fb_id,
                            user_name="سالم", message_count=0, unread_count=0,
                            bot_paused=bot_paused)
        db.add(conv)
        await db.commit()
        return {"flow_id": flow.id, "subscriber_id": sub.id,
                "conversation_id": conv.id}


# ══ SB-1: create / publish / executions / stats (HTTP) ════════════════

class TestFlowPublishAPI:
    @pytest.fixture(autouse=True)
    async def _owner(self, app_client):
        self.ac = app_client
        self.me = await _register(app_client, "p43flow")
        yield

    async def _create(self, nodes, edges) -> int:
        r = await self.ac.post("/api/flows", json={
            "name": f"فلو-{uuid.uuid4().hex[:6]}", "nodes": nodes, "edges": edges})
        assert r.status_code == 200, r.text
        return r.json()["data"]["id"]

    async def test_create_rejects_bad_structure(self):
        r = await self.ac.post("/api/flows", json={
            "name": "سيء", "nodes": [{"id": "x", "type": "WAT"}], "edges": []})
        assert r.status_code == 422

    async def test_draft_validation_rejects_dangling_edge_at_create(self):
        r = await self.ac.post("/api/flows", json={
            "name": "حافة معلقة", "nodes": [_trigger()],
            "edges": [{"source": "t1", "target": "ghost"}]})
        assert r.status_code == 422
        assert "ghost" in r.text

    async def test_publish_requires_one_trigger(self):
        fid = await self._create(
            [_msg("m1", "بلا مشغل"), _goal()],
            [{"source": "m1", "target": "g1"}])
        r = await self.ac.post(f"/api/flows/{fid}/publish")
        assert r.status_code == 422
        assert "TRIGGER" in r.text or "تشغيل" in r.text

    async def test_publish_rejects_two_triggers(self):
        fid = await self._create(
            [_trigger("t1"), _trigger("t2"), _msg("m1", "x"), _goal()],
            [{"source": "t1", "target": "m1"}, {"source": "m1", "target": "g1"}])
        r = await self.ac.post(f"/api/flows/{fid}/publish")
        assert r.status_code == 422

    async def test_publish_rejects_orphan_cycle(self):
        # m1 -> m2 -> m1 loop with no path to any terminal
        fid = await self._create(
            [_trigger(), _msg("m1", "حلقة"), _msg("m2", "مغلقة")],
            [{"source": "t1", "target": "m1"},
             {"source": "m1", "target": "m2"},
             {"source": "m2", "target": "m1"}])
        r = await self.ac.post(f"/api/flows/{fid}/publish")
        assert r.status_code == 422
        assert "دورة" in r.text or "يتيمة" in r.text

    async def test_publish_valid_then_unpublish(self):
        fid = await self._create(*VALID_GRAPH)
        r = await self.ac.post(f"/api/flows/{fid}/publish")
        assert r.status_code == 200, r.text
        assert r.json()["data"]["status"] == "active"
        r2 = await self.ac.post(f"/api/flows/{fid}/unpublish")
        assert r2.status_code == 200, r2.text
        assert r2.json()["data"]["status"] == "paused"

    async def test_publish_unknown_flow_404(self):
        r = await self.ac.post("/api/flows/999999/publish")
        assert r.status_code == 404

    async def test_executions_and_stats_shape(self):
        fid = await self._create(*VALID_GRAPH)
        r = await self.ac.post(f"/api/flows/{fid}/publish")
        assert r.status_code == 200
        r = await self.ac.get(f"/api/flows/{fid}/executions")
        assert r.status_code == 200, r.text
        r2 = await self.ac.get(f"/api/flows/{fid}/stats")
        assert r2.status_code == 200, r2.text
        stats = r2.json()["data"]
        for key in ("total_executions", "completed", "failed", "active",
                    "messages_sent", "avg_steps"):
            assert key in stats, f"stats missing {key}: {stats}"


# ══ SB-1: runtime execution (direct seam) ═════════════════════════════

class TestFlowRuntime:
    @pytest.fixture(autouse=True)
    async def _owner(self, app_client):
        self.ac = app_client
        self.me = await _register(app_client, "p43rt")
        yield

    async def test_keyword_trigger_starts_completes_and_attributes(self):
        from flow_engine import handle_incoming_message
        from models import FlowExecution, Message

        ids = await _seed_runtime_world(self.me["tenant_id"])
        fake = FakeFlowFB()
        status = await handle_incoming_message(
            self.me["tenant_id"], "p43-page", "c_p43_1", "9001", "أريد خصم",
            fb_client=fake, sender_name="سالم")
        assert status["handled"] is True, status
        assert status["sent"] is True, status
        assert len(fake.dms) == 1 and "P43" in fake.dms[0][1]

        async with AsyncSessionLocal() as db:
            ex = (await db.execute(
                FlowExecution.__table__.select().where(
                    FlowExecution.flow_id == ids["flow_id"]))).mappings().first()
            assert ex is not None
            assert ex["status"] == "completed", ex
            msg = (await db.execute(
                Message.__table__.select().where(
                    Message.flow_id == ids["flow_id"]))).mappings().first()
            assert msg is not None and msg["is_from_page"] is True
            assert msg["replied_by_bot"] is True and msg["rule_id"] is None

    async def test_one_active_run_advances_not_duplicates(self):
        from flow_engine import handle_incoming_message
        from models import FlowExecution

        # A run that waits for the NEXT message: trigger -> message ->
        # keyword-wait trigger -> message -> goal
        nodes = [_trigger(keywords=["ابدأ"]),
                 {"id": "m1", "type": "MESSAGE", "data": {"text": "مرحبًا بك في مسار الطلب"}},
                 {"id": "t2", "type": "TRIGGER",
                  "data": {"triggerType": "keyword", "keywords": ["نعم"], "matchMode": "exact"}},
                 _msg("m2", "تم!"), _goal()]
        edges = [{"source": "t1", "target": "m1"}, {"source": "m1", "target": "t2"},
                 {"source": "t2", "target": "m2"}, {"source": "m2", "target": "g1"}]
        ids = await _seed_runtime_world(self.me["tenant_id"], conv_fb_id="c_p43_2",
                                        flow_nodes=nodes, flow_edges=edges)
        fake = FakeFlowFB()
        s1 = await handle_incoming_message(
            self.me["tenant_id"], "p43-page", "c_p43_2", "9001", "ابدأ",
            fb_client=fake)
        assert s1["handled"] is True and s1["sent"] is True
        # the run is now parked before the t2 keyword-wait (still active)
        s2 = await handle_incoming_message(
            self.me["tenant_id"], "p43-page", "c_p43_2", "9001", "نعم",
            fb_client=fake)
        assert s2["handled"] is True, s2
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(
                FlowExecution.__table__.select().where(
                    FlowExecution.flow_id == ids["flow_id"]))).mappings().all()
            assert len(rows) == 1, "one run per subscriber — never duplicates"
            assert rows[0]["status"] == "completed"

    async def test_delay_parks_and_resume_completes(self):
        import _services
        from flow_engine import handle_incoming_message, resume_due_flow_executions
        from models import FlowExecution

        nodes = [_trigger(keywords=["توصيل"]),
                 _delay("d1", 30), _msg("m1", "طلبك خرج للتوصيل!"), _goal()]
        edges = [{"source": "t1", "target": "d1"}, {"source": "d1", "target": "m1"},
                 {"source": "m1", "target": "g1"}]
        ids = await _seed_runtime_world(self.me["tenant_id"], conv_fb_id="c_p43_3",
                                        flow_nodes=nodes, flow_edges=edges)
        fake = FakeFlowFB()
        s = await handle_incoming_message(
            self.me["tenant_id"], "p43-page", "c_p43_3", "9001", "توصيل",
            fb_client=fake)
        assert s["handled"] is True and s["sent"] is False, s
        async with AsyncSessionLocal() as db:
            ex = (await db.execute(
                FlowExecution.__table__.select().where(
                    FlowExecution.flow_id == ids["flow_id"]))).mappings().first()
            assert ex["status"] == "active" and ex["resume_at"] is not None

        # the beat resolves the tenant FB client via _services — patch it so
        # the resumed run actually delivers through our fake
        async def _factory(tenant_id: int):
            return fake

        mp = pytest.MonkeyPatch()
        mp.setattr(_services, "get_tenant_fb_client", _factory)
        try:
            # not due yet → the beat must NOT resume it
            await resume_due_flow_executions()
            assert len(fake.dms) == 0

            # force-due → the beat completes the run and sends the DM
            async with AsyncSessionLocal() as db:
                from sqlalchemy import update
                await db.execute(
                    update(FlowExecution).where(
                        FlowExecution.id == ex["id"]).values(
                        resume_at=utcnow() - timedelta(seconds=1)))
                await db.commit()
            await resume_due_flow_executions(sf=AsyncSessionLocal)
            assert len(fake.dms) == 1, "due DELAY resumed by the automation beat"
        finally:
            mp.undo()
        async with AsyncSessionLocal() as db:
            ex2 = (await db.execute(
                FlowExecution.__table__.select().where(
                    FlowExecution.id == ex["id"]))).mappings().first()
            assert ex2["status"] == "completed"

    async def test_condition_branches_on_custom_data(self):
        from flow_engine import handle_incoming_message

        cond = {"id": "c1", "type": "CONDITION",
                "data": {"left": "var:vip", "op": "eq", "right": "1"}}
        nodes = [_trigger(keywords=["عرض"]),
                 cond, _msg("yes", "عرض VIP خاص لك"), _msg("no", "العرض العام"), _goal()]
        edges = [{"source": "t1", "target": "c1"},
                 {"source": "c1", "target": "yes", "sourceHandle": "yes"},
                 {"source": "c1", "target": "no", "sourceHandle": "no"},
                 {"source": "yes", "target": "g1"}, {"source": "no", "target": "g1"}]

        # vip=1 → the yes branch
        await _seed_runtime_world(self.me["tenant_id"], conv_fb_id="c_p43_4",
                                  custom_data={"vip": "1"},
                                  flow_nodes=nodes, flow_edges=edges)
        fake = FakeFlowFB()
        await handle_incoming_message(self.me["tenant_id"], "p43-page", "c_p43_4",
                                      "9001", "عرض", fb_client=fake)
        assert len(fake.dms) == 1 and "VIP" in fake.dms[0][1]

        # vip absent → the no branch (different subscriber to dodge cooldown)
        await _seed_runtime_world(self.me["tenant_id"], conv_fb_id="c_p43_5",
                                  subscriber_fb_id="9002",
                                  flow_nodes=nodes, flow_edges=edges)
        fake2 = FakeFlowFB()
        await handle_incoming_message(self.me["tenant_id"], "p43-page", "c_p43_5",
                                      "9002", "عرض", fb_client=fake2)
        assert len(fake2.dms) == 1 and "العام" in fake2.dms[0][1]

    async def test_bot_paused_conversation_yields_completely(self):
        from flow_engine import handle_incoming_message

        await _seed_runtime_world(self.me["tenant_id"], conv_fb_id="c_p43_6",
                                  bot_paused=True)
        fake = FakeFlowFB()
        status = await handle_incoming_message(
            self.me["tenant_id"], "p43-page", "c_p43_6", "9001", "أريد خصم",
            fb_client=fake)
        assert status["action"] == "bot_paused", status
        assert status["handled"] is False
        assert len(fake.dms) == 0


# ══ SB-2: conversation handoff (HTTP) ═════════════════════════════════

class TestInboxHandoff:
    @pytest.fixture(autouse=True)
    async def _owner(self, app_client):
        self.ac = app_client
        self.me = await _register(app_client, "p43ho")
        async with AsyncSessionLocal() as db:
            from models import Conversation
            db.add(Conversation(tenant_id=self.me["tenant_id"],
                                fb_conversation_id="c_ho_1",
                                user_name="زبون", message_count=1, unread_count=1))
            await db.commit()
        yield

    def _url(self, cid: str = "c_ho_1") -> str:
        return f"/api/inbox/conversations/{cid}"

    async def test_patch_status_lifecycle_and_invalid(self):
        r = await self.ac.patch(self._url(), json={"status": "pending"})
        assert r.status_code == 200, r.text
        assert r.json()["data"]["status"] == "pending"
        r2 = await self.ac.patch(self._url(), json={"status": "closed"})
        assert r2.status_code == 200
        bad = await self.ac.patch(self._url(), json={"status": "ابورشة"})
        assert bad.status_code == 422

    async def test_patch_requires_at_least_one_field(self):
        r = await self.ac.patch(self._url(), json={})
        assert r.status_code == 422

    async def test_patch_bot_paused_type_checked(self):
        bad = await self.ac.patch(self._url(), json={"bot_paused": "نعم"})
        assert bad.status_code == 422
        ok = await self.ac.patch(self._url(), json={"bot_paused": True})
        assert ok.status_code == 200
        assert ok.json()["data"]["bot_paused"] is True

    async def test_patch_assignee_same_tenant_and_unassign(self):
        mate = await _seed_team_member(self.me["tenant_id"])
        r = await self.ac.patch(self._url(), json={"assignee_id": mate["id"]})
        assert r.status_code == 200, r.text
        assert r.json()["data"]["assignee"]["username"] == mate["username"]
        r2 = await self.ac.patch(self._url(), json={"assignee_id": None})
        assert r2.status_code == 200
        assert r2.json()["data"]["assignee"] is None

    async def test_patch_assignee_cross_tenant_rejected(self):
        stranger = await _register(self.ac, "p43str")
        assert stranger["tenant_id"] != self.me["tenant_id"]
        # /api/register authenticates the NEW account — restore our session
        # before the PATCH (the stranger must be nothing more than an id).
        await self.ac.post("/api/login", json={
            "username": self.me["username"], "password": "Str0ngPass!ly"})
        r = await self.ac.patch(self._url(), json={"assignee_id": stranger["id"]})
        assert r.status_code == 422
        assert "فريق" in r.text or "مساحتك" in r.text

    async def test_patch_conversation_tenant_isolation(self):
        stranger = await _register(self.ac, "p43iso")
        await self.ac.post("/api/login", json={
            "username": stranger["username"], "password": "Str0ngPass!ly"})
        r2 = await self.ac.patch(self._url(), json={"status": "closed"})
        assert r2.status_code == 404, "cross-tenant conversation access must 404"
        # restore session for the next tests
        await self.ac.post("/api/login", json={
            "username": self.me["username"], "password": "Str0ngPass!ly"})

    async def test_detail_returns_handoff_fields_and_notes(self):
        note = await self.ac.post(self._url() + "/notes",
                                  json={"content": "زبون غاضب — تسليم يدوي"})
        assert note.status_code == 200, note.text
        r = await self.ac.get(self._url() + "/detail")
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        for key in ("status", "assignee", "bot_paused", "first_response_at", "notes"):
            assert key in data, f"detail missing {key}: {list(data)}"
        assert any("تسليم يدوي" in (n.get("content") or "") for n in data["notes"])

    async def test_first_human_reply_stamps_first_response_at(self):
        import routers.inbox as inbox_mod

        fake = FakeFlowFB()

        async def _factory(tenant_id: int):
            return fake

        mp = pytest.MonkeyPatch()
        mp.setattr(inbox_mod, "get_tenant_fb_client", _factory)
        mp.setattr(inbox_mod, "_tenant_fb_cache", {})
        try:
            r = await self.ac.post(self._url() + "/reply",
                                   data={"message": "تحياتي، سنتابع طلبك الآن"})
            assert r.status_code == 200, r.text
        finally:
            mp.undo()
        d = await self.ac.get(self._url() + "/detail")
        assert d.status_code == 200
        assert d.json()["data"]["first_response_at"] is not None, \
            "first human reply must stamp first_response_at"
