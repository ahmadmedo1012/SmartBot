"""
v8 security regression gate — المسار A من خطة v8:

  [x] A1: GET /api/config (عام) لا يسرّب أي مفتاح اعتماد حتى لو خُزّن
        بـ is_secret=False بالخطأ — قائمة السماح الصريحة هي خط الدفاع.
  [x] A2: SSE /api/events معزول بين المستأجرين — حدث مستأجر آخر
        لا يصل أبدًا لتيار مستأجر مختلف.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))
FB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))


async def _make_fixture():
    from database import get_db
    from models import Base
    from runner import app
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    test_engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    import httpx
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    return app, session_factory, test_engine, client


async def _teardown(fixture):
    from database import get_db
    app, _sf, te, client = fixture
    app.dependency_overrides.pop(get_db, None)
    await client.aclose()
    await te.dispose()
    try:
        from _services import api_cache
        api_cache.clear_all()
    except Exception:
        pass


async def _seed_user(sf, username: str, tenant_name: str):
    from _hash import hash_password
    from models import Tenant, User
    async with sf() as db:
        t = Tenant(name=tenant_name, subscription_status="PAID", is_active=True)
        db.add(t)
        await db.flush()
        u = User(username=username, email=f"{username}@test.ly",
                 password_hash=hash_password("pass123456"), tenant_id=t.id, role="admin")
        db.add(u)
        await db.commit()
        return username, t.id


# ── A1: public /api/config allowlist ────────────────────────────────────────

async def test_public_config_never_leaks_credentials():
    """حتى لو خُزّن مفتاح AI بـ is_secret=False (حالة ما قبل v8)،
    قائمة السماح في /api/config تمنع ظهوره للعامة — الدفاع بالتصميم."""
    fixture = await _make_fixture()
    try:
        app, sf, te, client = fixture
        from models import SystemConfig
        async with sf() as db:
            # Simulate PRE-fix state: credentials saved non-secret (the exact
            # historical bug) + a legit public payment row.
            db.add_all([
                SystemConfig(key="openai_api_key", value="sk-LEAKED-KEY-123", is_secret=False),
                SystemConfig(key="gemini_api_key", value="AIza-LEAKED-456", is_secret=False),
                SystemConfig(key="telegram_bot_token", value="123456:LEAKED-TOKEN", is_secret=False),
                SystemConfig(key="balance_transfer_phone_1", value="0912345678", is_secret=False),
            ])
            await db.commit()
        try:
            from _services import api_cache
            api_cache.clear_all()
        except Exception:
            pass
        r = await client.get("/api/config")
        assert r.status_code == 200, r.text
        body = r.json()
        data = body.get("data", {})
        assert data.get("balance_transfer_phone_1") == "0912345678", "payment key must be served"
        assert "openai_api_key" not in data, "AI key leaked via public /api/config!"
        assert "gemini_api_key" not in data, "Gemini key leaked via public /api/config!"
        assert "telegram_bot_token" not in data, "telegram token leaked via public /api/config!"
        assert "sk-LEAKED-KEY-123" not in r.text
        assert "AIza-LEAKED-456" not in r.text
    finally:
        await _teardown(fixture)


# ── A2: SSE tenant isolation ────────────────────────────────────────────────

async def test_sse_isolates_tenant_events():
    """تيار SSE لمستأجر A: حدث مستأجر B لا يصل، حدث A يصل.

    ملاحظة منهجية: نستهلك مولّد الاستجابة مباشرة (بدل httpx ASGITransport
    الذي يجمعّ كامل الجسم — مستحيل مع مولّد SSE لانهائي). هذا يختبر منطق
    الاشتراك/التصفية الحقيقي داخل sse_endpoint نفسه.
    """
    fixture = await _make_fixture()
    try:
        app, sf, te, client = fixture
        from event_bus import event_bus

        _uname_a, tid_a = await _seed_user(sf, f"sse_a_{uuid.uuid4().hex[:6]}", "Tenant-A")
        _uname_b, tid_b = await _seed_user(sf, f"sse_b_{uuid.uuid4().hex[:6]}", "Tenant-B")

        from runner import sse_endpoint

        class _UserStub:
            _tenant_id = tid_a

        class _RequestStub:
            pass

        resp = await sse_endpoint(request=_RequestStub(), user=_UserStub())
        chunks: list[str] = []

        async def consume_and_emit():
            aiter = resp.body_iterator.__aiter__()
            # 1st chunk: the "connected" hello — arrives immediately
            chunks.append(await asyncio.wait_for(aiter.__anext__(), timeout=2))
            # foreign tenant event — MUST be filtered by the subscription
            await event_bus.emit("agent_message", {"text": "SECRET-FROM-TENANT-B"}, tenant_id=tid_b)
            # small grace window proves nothing leaks through
            await asyncio.sleep(0.4)
            # own tenant event — MUST arrive
            await event_bus.emit("agent_message", {"text": "OWN-TENANT-A-MESSAGE"}, tenant_id=tid_a)
            nxt = await asyncio.wait_for(aiter.__anext__(), timeout=2)
            chunks.append(nxt)
            await aiter.aclose()  # triggers the finally → unsubscribe

        await asyncio.wait_for(consume_and_emit(), timeout=6)
        joined = "".join(chunks)
        assert "OWN-TENANT-A-MESSAGE" in joined, f"own-tenant event never arrived: {chunks}"
        assert "SECRET-FROM-TENANT-B" not in joined, \
            f"CROSS-TENANT LEAK: foreign event reached the stream: {chunks}"
        # hygiene: the handler must be unsubscribed after close (no dangling global)
        remaining = [subs for _evt, subs in event_bus._subscribers.items()]
        assert not any(getattr(cb, "__qualname__", "").startswith("_make_handler")
                       for lst in remaining for cb, _t in lst), \
            "SSE handler leaked after stream close"
    finally:
        await _teardown(fixture)
