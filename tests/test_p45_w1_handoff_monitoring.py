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
