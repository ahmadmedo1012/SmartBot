"""v19 Step 4 — /api/rules JSON+Form dual body (v17 Convention #1 closure).

The live UI sends URLSearchParams (worked); any JSON client hit a guaranteed
422 because rules.py declared Form(...) ONLY — the exact latent defect the
v17 Convention #1 (templates precedent) was supposed to eliminate app-wide.
This suite pins BOTH bodies on create + update, plus the 422 Arabic family.
"""
from __future__ import annotations

import os
import uuid

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
os.environ.setdefault("DEBUG", "True")

import pytest
from database import engine as db_engine
from httpx import ASGITransport, AsyncClient
from models import Base


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
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
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
    return r.json()["data"]["user"]


async def _rules(ac: AsyncClient) -> list:
    r = await ac.get("/api/rules")
    assert r.status_code == 200, r.text
    return r.json()["data"]


async def test_rule_create_json_body(app_client):
    ac = app_client
    await _register(ac, "r19a")
    r = await ac.post("/api/rules", json={
        "name": "قاعدة JSON", "keywords": "سعر, سعر؟", "reply_template": "السعر 50 دينار",
        "priority": 5,
    })
    assert r.status_code == 200, r.text
    rid = r.json()["data"]["id"]
    rules = await _rules(ac)
    match = next(x for x in rules if x["id"] == rid)
    assert match["keywords"] == ["سعر", "سعر؟"]
    assert match["reply_template"] == "السعر 50 دينار"
    assert match["priority"] == 5


async def test_rule_create_form_body_still_works(app_client):
    """The live UI's URLSearchParams contract — byte-for-byte preserved."""
    from urllib.parse import urlencode

    ac = app_client
    await _register(ac, "r19b")
    r = await ac.post("/api/rules", content=urlencode({
        "name": "قاعدة فورم", "keywords": "مرحبا", "reply_template": "أهلاً بك", "priority": 10,
    }).encode(), headers={"content-type": "application/x-www-form-urlencoded"})
    assert r.status_code == 200, r.text
    rid = r.json()["data"]["id"]
    rules = await _rules(ac)
    match = next(x for x in rules if x["id"] == rid)
    assert match["keywords"] == ["مرحبا"]


async def test_rule_update_json_body(app_client):
    ac = app_client
    await _register(ac, "r19c")
    create = await ac.post("/api/rules", json={
        "name": "قبل التعديل", "keywords": "كلمة", "reply_template": "رد",
    })
    rid = create.json()["data"]["id"]
    r = await ac.put(f"/api/rules/{rid}", json={
        "name": "بعد التعديل", "keywords": "كلمة,كلمتان", "reply_template": "رد محدث",
        "priority": 7,
    })
    assert r.status_code == 200, r.text
    rules = await _rules(ac)
    match = next(x for x in rules if x["id"] == rid)
    assert match["name"] == "بعد التعديل"
    assert match["priority"] == 7


async def test_rule_update_form_body_still_works(app_client):
    ac = app_client
    await _register(ac, "r19d")
    create = await ac.post("/api/rules", json={
        "name": "x", "keywords": "k", "reply_template": "r",
    })
    rid = create.json()["data"]["id"]
    r = await ac.put(f"/api/rules/{rid}", content=(
        "name=معدل+فورم&keywords=kk&reply_template=rr"
    ).encode(), headers={"content-type": "application/x-www-form-urlencoded"})
    assert r.status_code == 200, r.text


async def test_rule_malformed_json_422_arabic(app_client):
    ac = app_client
    await _register(ac, "r19e")
    r = await ac.post("/api/rules", content=b"{not json",
                      headers={"content-type": "application/json"})
    assert r.status_code == 422, r.text
    assert "قيمة غير صالحة" in r.json()["detail"]


async def test_rule_missing_fields_422_arabic(app_client):
    ac = app_client
    await _register(ac, "r19f")
    r = await ac.post("/api/rules", json={"name": "بلا كلمات"})
    assert r.status_code == 422, r.text
    assert "قيمة غير صالحة" in r.json()["detail"]


async def test_rule_bad_priority_type_422_arabic(app_client):
    ac = app_client
    await _register(ac, "r19g")
    r = await ac.post("/api/rules", json={
        "name": "أولوية سيئة", "keywords": "k", "reply_template": "r", "priority": "high",
    })
    assert r.status_code == 422, r.text
    assert "الأولوية" in r.json()["detail"]
