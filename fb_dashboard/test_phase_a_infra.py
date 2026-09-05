from __future__ import annotations
"""
Phase A (= الخطة 1) — بوابة الخروج: البنية التحتية والاستقرار

Exit-gate evidence per PLAN-REBUILD-V2.md §1:
  1.1 WebSocket tenant isolation  → "اختبار: مستأجر A لا يرى أحداث مستأجر B"
  1.2 API stats tenant scoping    → /api/system/stats مفلتر على المستأجر
  1.3 Webhook engine registry     → get_bot_engine(fb_client, tenant_id=...) لا يوجد inline BotEngine
  1.5 next.config                 → لا يوجد output:"export" (يُتحقق منه في grep خارجي)
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import asyncio
import inspect
from unittest.mock import MagicMock

import pytest
from sqlalchemy import select

# ── 1.1 WebSocket Tenant Isolation ───────────────────────────────────────────

class MockWebSocket:
    """Captures sent messages — simulates a connected dashboard client."""
    def __init__(self, label: str):
        self.label = label
        self.sent: list[str] = []
        self.closed = False

    async def send_text(self, msg: str):
        if self.closed:
            raise RuntimeError("connection closed")
        self.sent.append(msg)

    async def accept(self):
        pass


async def test_ws_connection_tracks_tenant_and_user():
    """كل اتصال WS يحمل tenant_id و user_id (متطلب 1.1-1)."""
    from ws_manager import WSConnection
    conn = WSConnection(MockWebSocket("w"), tenant_id=7, user_id=42)
    assert conn.tenant_id == 7
    assert conn.user_id == 42


async def test_broadcast_to_tenant_isolation():
    """بوابة الخروج 1.1: مستأجر A لا يرى أحداث مستأجر B."""
    from ws_manager import ConnectionManager
    mgr = ConnectionManager()
    ws_a1 = MockWebSocket("A1")
    ws_a2 = MockWebSocket("A2")
    ws_b1 = MockWebSocket("B1")

    await mgr.connect(ws_a1, tenant_id=1, user_id=10)
    await mgr.connect(ws_a2, tenant_id=1, user_id=11)
    await mgr.connect(ws_b1, tenant_id=2, user_id=20)

    await mgr.broadcast_to_tenant(1, "new_reply", {"id": 99})

    # مستأجر A (كلا الاتصالين) استلم الحدث
    assert len(ws_a1.sent) == 1 and '"new_reply"' in ws_a1.sent[0]
    assert len(ws_a2.sent) == 1 and '"id": 99' in ws_a2.sent[0]
    # مستأجر B لم يستلم شيئاً — هذا هو جوهر بوابة الخروج
    assert ws_b1.sent == [], f"تسريب بيانات! مستأجر B استلم: {ws_b1.sent}"


async def test_broadcast_to_user_isolation():
    """البث للمستخدم لا يتجاوز نفس المستأجر ونفس المستخدم."""
    from ws_manager import ConnectionManager
    mgr = ConnectionManager()
    ws_a_u10 = MockWebSocket("A-u10")
    ws_a_u11 = MockWebSocket("A-u11")
    ws_b_u20 = MockWebSocket("B-u20")

    await mgr.connect(ws_a_u10, tenant_id=1, user_id=10)
    await mgr.connect(ws_a_u11, tenant_id=1, user_id=11)
    await mgr.connect(ws_b_u20, tenant_id=2, user_id=20)

    await mgr.broadcast_to_user(1, 10, "notification", {"title": "خاص"})

    assert len(ws_a_u10.sent) == 1
    assert ws_a_u11.sent == []   # نفس المستأجر، مستخدم آخر
    assert ws_b_u20.sent == []   # مستأجر آخر


async def test_generic_broadcast_removed():
    """متطلب 1.1-4: إزالة broadcast() العام نهائياً."""
    from ws_manager import ConnectionManager
    mgr = ConnectionManager()
    assert not hasattr(mgr, "broadcast"), "broadcast() العام لا يجب أن يكون موجوداً"
    # الطرق المتاحة كلها محدودة النطاق
    methods = [m for m in dir(mgr) if m.startswith("broadcast")]
    assert set(methods) == {"broadcast_to_tenant", "broadcast_to_user"}, methods


async def test_broadcast_dead_connection_cleanup():
    """الاتصالات الميتة تُنظف تلقائياً أثناء البث."""
    from ws_manager import ConnectionManager
    mgr = ConnectionManager()
    ws_dead = MockWebSocket("dead")
    ws_alive = MockWebSocket("alive")
    await mgr.connect(ws_dead, tenant_id=1, user_id=1)
    await mgr.connect(ws_alive, tenant_id=1, user_id=2)
    ws_dead.closed = True  # المحاكاة: مات الاتصال

    await mgr.broadcast_to_tenant(1, "ping", None)
    assert mgr.count == 1  # الميت أزيل


# ── 1.1 (تكملة) Event Bus tenant filtering ──────────────────────────────────

async def test_event_bus_tenant_filtering():
    from event_bus import EventBus
    bus = EventBus()
    got_a, got_global = [], []

    async def cb_a(data, tenant_id=None):
        got_a.append((data, tenant_id))

    async def cb_global(data):
        got_global.append(data)

    bus.subscribe("reply", cb_a, tenant_id=1)
    bus.subscribe("reply", cb_global)  # مشترك عام

    await bus.emit("reply", {"x": 1}, tenant_id=2)   # حدث مستأجر B
    assert got_a == []                                # مشترك A لم يستلمه
    assert len(got_global) == 1                       # المشترك العام استلمه

    await bus.emit("reply", {"x": 2}, tenant_id=1)   # حدث مستأجر A
    assert len(got_a) == 1 and got_a[0][0] == {"x": 2}
    assert got_a[0][1] == 1                           # tenant_id مُمرَّر للـ callback


# ── 1.3 Webhook engine registry (per-tenant BotEngine) ──────────────────────

async def test_get_bot_engine_registry_per_tenant():
    """محركات البوت معزولة لكل مستأجر ومشتركة لنفس المستأجر (dedup/cooldown مشتركة)."""
    from _services import get_bot_engine, reset_bot_engines
    reset_bot_engines()

    client_a = MagicMock()
    client_b = MagicMock()

    e_a1 = get_bot_engine(client_a, tenant_id=100)
    e_a2 = get_bot_engine(client_a, tenant_id=100)   # نفس المستأجر → نفس المحرك
    e_b = get_bot_engine(client_b, tenant_id=200)    # مستأجر آخر → محرك آخر

    assert e_a1 is e_a2, "نفس المستأجر يجب أن يعيد نفس المحرك (registry)"
    assert e_a1 is not e_b
    assert e_a1._tenant_id == 100
    assert e_b._tenant_id == 200

    reset_bot_engines()
    e_after = get_bot_engine(client_a, tenant_id=100)
    assert e_after is not e_a1, "reset يجب أن يمسح السجل"


def test_webhook_uses_tenant_scoped_engine():
    """متطلب 1.3: معالج webhook يستخدم registry بعامل المستأجر — لا BotEngine() داخلية."""
    src_path = os.path.join(os.path.dirname(__file__), "runner.py")
    src = open(src_path, encoding="utf-8").read()
    assert "get_bot_engine(fb_client, tenant_id=bs.tenant_id)" in src, \
        "معالج webhook يجب أن يستخدم get_bot_engine(fb_client, tenant_id=bs.tenant_id)"
    # داخل _process_webhook_comment لا يجوز إنشاء BotEngine مباشرة
    fn_src = src.split("async def _process_webhook_comment")[1].split("\nasync def ")[0]
    assert "BotEngine(" not in fn_src, "لا يجوز استنساخ BotEngine داخل معالج webhook"


def test_next_config_no_static_export():
    """متطلب 1.5: output:'export' أزيل من next.config.ts (كان يمنع API routes)."""
    cfg_path = os.path.join(os.path.dirname(__file__), "frontend", "next.config.ts")
    if not os.path.exists(cfg_path):
        pytest.skip("frontend غير مثبت في بيئة الاختبار")
    cfg = open(cfg_path, encoding="utf-8").read()
    # يجب ألا يكون output:"export" فعّالاً (يسمح بالتعليق التوثيقي فقط)
    for line in cfg.splitlines():
        s = line.strip()
        if s.startswith("//") or s.startswith("*"):
            continue
        assert 'output: "export"' not in s and "output: 'export'" not in s, \
            f"output:'export' مفعّل في next.config.ts: {s}"


# ── 1.2 /api/system/stats tenant scoping (HTTP integration) ─────────────────

async def _seed_two_tenants(session_factory):
    """يُنشئ مستأجرين A/B مع مستخدمين وبيانات مختلفة الحجم."""
    from models import Tenant, User, Reply, Rule
    from _hash import hash_password

    async with session_factory() as db:
        t_a = Tenant(name="Tenant-A", subscription_status="PAID", is_active=True)
        t_b = Tenant(name="Tenant-B", subscription_status="PAID", is_active=True)
        db.add_all([t_a, t_b])
        await db.flush()

        u_a = User(username="user_a", password_hash=hash_password("passA12345"),
                   tenant_id=t_a.id, role="admin")
        u_b = User(username="user_b", password_hash=hash_password("passB12345"),
                   tenant_id=t_b.id, role="admin")
        db.add_all([u_a, u_b])
        await db.flush()

        # مستأجر A: 3 ردود + 2 قاعدة | مستأجر B: 7 ردود + 5 قواعد
        db.add_all([Reply(tenant_id=t_a.id, fb_post_id="p", fb_comment_id=f"ca{i}",
                          comment_text="c", reply_text="r") for i in range(3)])
        db.add_all([Reply(tenant_id=t_b.id, fb_post_id="p", fb_comment_id=f"cb{i}",
                          comment_text="c", reply_text="r") for i in range(7)])
        db.add_all([Rule(tenant_id=t_a.id, name=f"rule_a{i}", keywords=[f"ka{i}"],
                         reply_template=f"ra{i}", enabled=True) for i in range(2)])
        db.add_all([Rule(tenant_id=t_b.id, name=f"rule_b{i}", keywords=[f"kb{i}"],
                         reply_template=f"rb{i}", enabled=True) for i in range(5)])
        await db.commit()
        return t_a.id, t_b.id


async def test_system_stats_tenant_scoped_http():
    """بوابة الخروج 1.2: /api/system/stats تُرجع أرقام المستأجر نفسه فقط.

    مستأجر A (3 ردود/2 قواعد/1 مستخدم) مقابل مستأجر B (7 ردود/5 قواعد/1 مستخدم)
    — إذا عادت أرقام الطرفين لأي منهما فهذا تسريب.
    """
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from models import Base
    from database import get_db
    from routers.auth import make_token
    import httpx

    # محرك اختبار معزول (ذاكرة مشتركة عبر StaticPool)
    test_engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=__import__("sqlalchemy.pool", fromlist=["StaticPool"]).StaticPool,
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    tid_a, tid_b = await _seed_two_tenants(session_factory)

    from runner import app

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # مستأجر A
            r_a = await client.get("/api/system/stats",
                                   cookies={"token": make_token("user_a", tid_a)})
            assert r_a.status_code == 200, r_a.text
            stats_a = r_a.json()
            # مستأجر B
            r_b = await client.get("/api/system/stats",
                                   cookies={"token": make_token("user_b", tid_b)})
            assert r_b.status_code == 200, r_b.text
            stats_b = r_b.json()

        # كل مستأجر يرى بياناته فقط — وليس مجموع المنصة
        # (المسار الفعلي المستجيب هو dashboard_stats.py — نسخة plans_config مكررة/ميتة تُنظف في المرحلة F)
        assert stats_a["data"]["totalReplies"] == 3, \
            f"تسريب/خطأ: مستأجر A رأى {stats_a['data']['totalReplies']} رداً (المتوقع 3)"
        assert stats_a["data"]["totalUsers"] == 1
        assert stats_b["data"]["totalReplies"] == 7, \
            f"تسريب/خطأ: مستأجر B رأى {stats_b['data']['totalReplies']} رداً (المتوقع 7)"
        assert stats_b["data"]["totalUsers"] == 1
        # الأرقام مختلفة فعلاً → التصفية تعمل وليست صفراً صامتاً
        assert stats_a["data"]["totalReplies"] != stats_b["data"]["totalReplies"]
        # totalTenants دائماً 1 لمستأجر عادي — لا يكشف عدد مستأجري المنصة
        assert stats_a["data"]["totalTenants"] == 1
        assert stats_b["data"]["totalTenants"] == 1
    finally:
        app.dependency_overrides.pop(get_db, None)
        await test_engine.dispose()
