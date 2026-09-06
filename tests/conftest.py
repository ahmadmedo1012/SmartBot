from __future__ import annotations

"""حزام fixtures مشترك لاختبارات v10 — المسار G من خطة v10 (وكيل W5).

additive فقط: root conftest.py (البيئة المعزولة + تصفير الحالة العامة عند حدود
الملفات) لم يُمس، وملفات الاختبار الموجودة احتفظت بمساعداتها الخاصة
(_make_fixture) — الملفات الجديدة فقط تستورد هذا الحزام بدل تكراره:

  v10_world   — تطبيق حقيقي + قاعدة in-memory خاصة بالاختبار + AsyncClient
                (نفس نمط tests/test_v8_security.py / test_v9_security.py)
  v10_seed    — مساعدات زرع (مستأجر+مستخدم، أدمن منصة) + دخول + توكن مباشر
  V10_TEST_PASSWORD — كلمة المرور الموحدة لمستخدمي الاختبار
"""

import os
import sys
import uuid
from types import SimpleNamespace

import pytest

_FB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))
if _FB_DIR not in sys.path:
    sys.path.insert(0, _FB_DIR)

V10_TEST_PASSWORD = "pass123456"

# ── v12-E3.3 compat: CSRF double-submit across ALL test clients ────────────
# The backend now enforces double-submit CSRF whenever the request carries
# the csrf_token cookie. 24 test files build their own httpx.AsyncClient and
# legitimately mix GET (which issues the cookie) + mutations — instead of
# editing every file, this construction patch mirrors the REAL frontend
# (src/lib/csrf-client.ts apiFetch): every mutation automatically attaches
# X-CSRF-Token from the sending client's cookie jar. Tests that explicitly
# set the header (even empty) are left untouched (setdefault semantics).
import httpx as _httpx

_orig_asyncclient_init = _httpx.AsyncClient.__init__


def _csrf_aware_asyncclient_init(self, *args, **kwargs):
    async def _attach_csrf(request: _httpx.Request) -> None:
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            token = self.cookies.get("csrf_token")
            if token:
                request.headers.setdefault("X-CSRF-Token", token)

    hooks = dict(kwargs.get("event_hooks") or {})
    req_hooks = list(hooks.get("request") or [])
    req_hooks.append(_attach_csrf)
    hooks["request"] = req_hooks
    kwargs["event_hooks"] = hooks
    _orig_asyncclient_init(self, *args, **kwargs)


_httpx.AsyncClient.__init__ = _csrf_aware_asyncclient_init


@pytest.fixture
async def v10_world():
    """تطبيق + قاعدة اختبار معزولة + عميل HTTP غير موثّق بعد.

    تُعاد القاعدة من الصفر لكل اختبار (function-scope) حتى لا يتسرب شيء
    بين الاختبارات؛ يُستعاد dependency_overrides في النهاية دائمًا.
    """
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
    try:
        yield SimpleNamespace(app=app, sf=session_factory, engine=test_engine, client=client)
    finally:
        app.dependency_overrides.pop(get_db, None)
        await client.aclose()
        await test_engine.dispose()
        try:
            from _services import api_cache
            api_cache.clear_all()
        except Exception:
            pass


@pytest.fixture
async def v10_seed(v10_world):
    """مساعدات الزرع/الدخول فوق v10_world:

    tenant_user(username, role, tenant_name) → (username, tenant_id, user_id)
    platform_admin(username)                → (username, 0, user_id)
    login(username)                          → POST /api/login (يضبط الكوكي)
    auth(username, tenant_id)                → توكن مباشر بلا دخول (make_token)
    logout()                                 → إزالة الكوكي
    """
    world = v10_world

    async def tenant_user(username: str | None = None, role: str = "admin",
                          tenant_name: str | None = None) -> tuple[str, int, int]:
        from _hash import hash_password
        from models import Tenant, User
        uname = username or f"u_{uuid.uuid4().hex[:8]}"
        async with world.sf() as db:
            t = Tenant(name=tenant_name or f"T-{uname}", subscription_status="PAID", is_active=True)
            db.add(t)
            await db.flush()
            u = User(username=uname, email=f"{uname}@test.ly",
                     password_hash=hash_password(V10_TEST_PASSWORD),
                     tenant_id=t.id, role=role)
            db.add(u)
            await db.commit()
            return uname, t.id, u.id

    async def platform_admin(username: str | None = None) -> tuple[str, int, int]:
        from _hash import hash_password
        from models import User
        uname = username or f"plat_{uuid.uuid4().hex[:8]}"
        async with world.sf() as db:
            u = User(username=uname, email=f"{uname}@test.ly",
                     password_hash=hash_password(V10_TEST_PASSWORD),
                     tenant_id=0, role="admin")
            db.add(u)
            await db.commit()
            return uname, 0, u.id

    async def login(username: str):
        """دخول حقيقي عبر POST /api/login — يضبط كوكي الجلسة على العميل."""
        r = await world.client.post("/api/login", json={
            "username": username, "password": V10_TEST_PASSWORD,
        })
        assert r.status_code == 200, f"login failed for {username}: {r.status_code} {r.text[:200]}"
        return r

    def auth(username: str, tenant_id: int):
        from routers.auth import make_token
        world.client.cookies.set("token", make_token(username, tenant_id))

    def logout():
        world.client.cookies.clear()

    return SimpleNamespace(world=world, tenant_user=tenant_user,
                           platform_admin=platform_admin, login=login,
                           auth=auth, logout=logout)
