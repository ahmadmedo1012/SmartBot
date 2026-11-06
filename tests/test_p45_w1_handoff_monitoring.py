from __future__ import annotations

"""P45-W1 acceptance tests — the handoff/monitoring UI's backend contracts.

Item 3 (Inbox handoff UI — Initiative B):
  * GET /api/inbox/assignees — the editor-readable assignee roster the
    HandoffPanel's selector consumes (team/users lists are admin-only,
    the PATCH is editor-gated): tenant-scoped, {id, username, name} only.

Item 4 (Flow monitoring depth — Initiative A):
  * GET /api/flows — every row now carries its LAST execution summary
    (status + finished_at, additive) so the list can surface failures;
  * GET /api/flows/{id}/executions — every row now joins the subscriber
    name + the FB conversation id (additive) so the panel can show WHO
    ran and deep-link «افتح في الوارد».
"""
import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))

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


async def _seed_team_member(tenant_id: int, prefix: str = "p45mate") -> dict:
    from _hash import hash_password
    from models import User

    uname = f"{prefix}_{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        u = User(username=uname, email=f"{uname}@t.ly",
                 password_hash=hash_password("Str0ngPass!ly"),
                 tenant_id=tenant_id, role="editor", name=f"عضو {prefix}")
        db.add(u)
        await db.commit()
        return {"id": u.id, "username": uname, "name": u.name}


# ══ Item 3: the assignee roster ════════════════════════════════════════

class TestInboxAssignees:
    @pytest.fixture(autouse=True)
    async def _owner(self, app_client):
        self.ac = app_client
        self.me = await _register(app_client, "p45asg")
        self.mate = await _seed_team_member(self.me["tenant_id"])
        yield

    async def test_roster_lists_same_tenant_members(self):
        r = await self.ac.get("/api/inbox/assignees")
        assert r.status_code == 200, r.text
        rows = r.json()["data"]
        ids = {row["id"] for row in rows}
        assert self.me["id"] in ids
        assert self.mate["id"] in ids
        mate_row = next(row for row in rows if row["id"] == self.mate["id"])
        assert mate_row["username"] == self.mate["username"]
        assert mate_row["name"] == self.mate["name"]
        for row in rows:
            assert set(row) == {"id", "username", "name"}, \
                f"roster leaks fields beyond the assignee shape: {row}"

    async def test_roster_never_leaks_other_tenants(self):
        stranger = await _register(self.ac, "p45othr")
        # register authenticated the stranger — restore our session
        await self.ac.post("/api/login", json={
            "username": self.me["username"], "password": "Str0ngPass!ly"})
        r = await self.ac.get("/api/inbox/assignees")
        assert r.status_code == 200
        ids = {row["id"] for row in r.json()["data"]}
        assert stranger["id"] not in ids, "cross-tenant member leaked into the roster"

    async def test_roster_assignee_roundtrip(self):
        """The roster ids must satisfy the PATCH assignee contract (editor
        picks a roster member → 200, not 422)."""
        from models import Conversation
        async with AsyncSessionLocal() as db:
            db.add(Conversation(tenant_id=self.me["tenant_id"],
                                fb_conversation_id=f"c_p45_{uuid.uuid4().hex[:6]}",
                                user_name="زبون", message_count=1, unread_count=0))
            await db.commit()
        r = await self.ac.get("/api/inbox/conversations?status=all&search=")
        assert r.status_code == 200, r.text
        cid = r.json()["data"]["items"][0]["id"]
        p = await self.ac.patch(f"/api/inbox/conversations/{cid}",
                                json={"assignee_id": self.mate["id"]})
        assert p.status_code == 200, p.text
        assert p.json()["data"]["assignee"]["username"] == self.mate["username"]

# ══ Item 4: flow monitoring depth ═════════════════════════════════════

async def _seed_flow_world(tenant_id: int) -> dict:
    """A flow + a subscriber + a conversation + two executions (the older
    completed, the newest FAILED — the audit's failing-since-X case)."""
    from _utils import utcnow
    from models import Conversation, Flow, FlowExecution, Subscriber

    async with AsyncSessionLocal() as db:
        flow = Flow(tenant_id=tenant_id, name=f"P45-flow-{uuid.uuid4().hex[:6]}",
                    nodes=[{"id": "t1", "type": "TRIGGER",
                            "data": {"triggerType": "keyword", "keywords": ["سعر"], "matchMode": "any"}},
                           {"id": "m1", "type": "MESSAGE", "data": {"text": "أهلاً"}}],
                    edges=[{"source": "t1", "target": "m1"}],
                    status="active")
        db.add(flow)
        await db.flush()

        sub = Subscriber(tenant_id=tenant_id, fb_user_id="9101",
                         first_name="سالم", name="سالم الفني")
        db.add(sub)
        await db.flush()

        conv = Conversation(tenant_id=tenant_id, fb_conversation_id="c_p45_flow_1",
                            user_name="سالم الفني", message_count=2, unread_count=0)
        db.add(conv)
        await db.flush()

        old = FlowExecution(tenant_id=tenant_id, flow_id=flow.id, subscriber_id=sub.id,
                            conversation_id=conv.id, trigger_type="keyword",
                            status="completed", steps=2,
                            started_at=utcnow(), completed_at=utcnow())
        new = FlowExecution(tenant_id=tenant_id, flow_id=flow.id, subscriber_id=sub.id,
                            conversation_id=conv.id, trigger_type="keyword",
                            status="failed", steps=1, error_log={"error": "send failed"},
                            started_at=utcnow())
        db.add_all([old, new])
        await db.commit()
        return {"flow_id": flow.id, "subscriber_id": sub.id,
                "conversation_id": conv.id}


class TestFlowListLastExecution:
    @pytest.fixture(autouse=True)
    async def _owner(self, app_client):
        self.ac = app_client
        self.me = await _register(app_client, "p45flx")
        self.ids = await _seed_flow_world(self.me["tenant_id"])
        yield

    async def test_list_carries_the_latest_execution_summary(self):
        r = await self.ac.get("/api/flows")
        assert r.status_code == 200, r.text
        rows = r.json()["data"]
        row = next(f for f in rows if f["id"] == self.ids["flow_id"])
        last = row["last_execution"]
        assert last is not None, "flows list lost the last_execution slice"
        assert last["status"] == "failed", \
            "the summary must carry the LATEST execution (id order), not the first"
        assert last["finished_at"] is None, "a failed run never finished — honest null"
        assert last["started_at"] is not None

    async def test_flows_without_executions_carry_an_honest_null(self):
        r = await self.ac.post("/api/flows", json={
            "name": "بلا تنفيذات", "nodes": [], "edges": []})
        assert r.status_code == 200, r.text
        fid = r.json()["data"]["id"]
        rows = (await self.ac.get("/api/flows")).json()["data"]
        row = next(f for f in rows if f["id"] == fid)
        assert row["last_execution"] is None


class TestExecutionsJoins:
    @pytest.fixture(autouse=True)
    async def _owner(self, app_client):
        self.ac = app_client
        self.me = await _register(app_client, "p45exj")
        self.ids = await _seed_flow_world(self.me["tenant_id"])
        yield

    async def test_executions_carry_subscriber_name_and_fb_conversation_id(self):
        r = await self.ac.get(f"/api/flows/{self.ids['flow_id']}/executions")
        assert r.status_code == 200, r.text
        items = r.json()["data"]["items"]
        assert len(items) == 2
        # newest first (id desc) — the failed run leads
        assert items[0]["status"] == "failed"
        for it in items:
            assert it["subscriber_name"] == "سالم الفني", it
            assert it["fb_conversation_id"] == "c_p45_flow_1", it

    async def test_status_filter_and_pagination_shape(self):
        r = await self.ac.get(
            f"/api/flows/{self.ids['flow_id']}/executions?status=completed&page=1&per_page=10")
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["total"] == 1
        assert [it["status"] for it in data["items"]] == ["completed"]

    async def test_pruned_subscriber_and_conversation_render_honest_empties(self):
        """A run whose subscriber/conversation rows were deleted (FK
        SET NULL / pruned) must surface "", never another tenant's data."""
        from models import FlowExecution
        async with AsyncSessionLocal() as db:
            ex = FlowExecution(tenant_id=self.me["tenant_id"],
                               flow_id=self.ids["flow_id"],
                               subscriber_id=None, conversation_id=None,
                               trigger_type="manual", status="expired", steps=0)
            db.add(ex)
            await db.commit()
        r = await self.ac.get(f"/api/flows/{self.ids['flow_id']}/executions?status=expired")
        assert r.status_code == 200
        it = r.json()["data"]["items"][0]
        assert it["subscriber_name"] == ""
        assert it["fb_conversation_id"] == ""

    async def test_cross_tenant_flow_executions_404(self):
        stranger = await _register(self.ac, "p45iso2")
        await self.ac.post("/api/login", json={
            "username": stranger["username"], "password": "Str0ngPass!ly"})
        r = await self.ac.get(f"/api/flows/{self.ids['flow_id']}/executions")
        assert r.status_code == 404, "cross-tenant execution access must 404"
        await self.ac.post("/api/login", json={
            "username": self.me["username"], "password": "Str0ngPass!ly"})
