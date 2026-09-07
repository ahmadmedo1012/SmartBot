"""
v9 security regression gate — المسار A من خطة v9:

  [x] A1: PDF reports engine — كل استعلام مقيّد بالمستأجر؛ أسماء معلقين
        المستأجر الآخر (PII) وحملاته لا تظهر في تقرير مستأجر A.
  [x] A3: وسوم الصندوق (BOLA) — مستأجر A لا يستطيع إسناد/إزالة وسم على
        محادثة مستأجر B (404)، ويملك العملية الناجحة على محادثته.
  [x] A4: ذاكرة الوكيل — نفس اسم المستخدم في مستأجرين مختلفين يحصل على
        جلسات/ذاكرة منفصلة تماماً.
  [x] A5: ok-shadowing — مسارا sequences/broadcasts يعيدان success:true
        (كانا يعيدان 500 TypeError بعد تنفيذ العملية).
  [x] A6: /api/logs/stats — مستخدم المستأجر 403 (البافر عام بلا علامة
        مستأجر)، مسؤول المنصة 200.
"""

from __future__ import annotations

import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))


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


async def _seed_user(sf, username: str, tenant_name: str, email: str | None = None):
    from _hash import hash_password
    from models import Tenant, User
    async with sf() as db:
        t = Tenant(name=tenant_name, subscription_status="PAID", is_active=True)
        db.add(t)
        await db.flush()
        # v15-E2 (D12-H4): uq_user_email_lower صار فريداً عالمياً — البريد
        # اختياري كي يبقى مشهد «نفس الاسم عبر مستأجرين» (A4) ببريدين
        # فريدين؛ الافتراضي يظل مشتقاً من الاسم كما كان دائماً.
        u = User(username=username, email=email or f"{username}@test.ly",
                 password_hash=hash_password("pass123456"), tenant_id=t.id, role="admin")
        db.add(u)
        await db.commit()
        return username, t.id


# ── A1: PDF engine tenant isolation (direct engine calls) ───────────────────

async def test_pdf_engine_isolates_tenant_data():
    """تقرير مستأجر A: أسماء معلقي B و حملاته و مشتركوه لا يظهرون أبداً."""
    fixture = await _make_fixture()
    try:
        _app, sf, _te, _client = fixture
        from models import Broadcast, Reply, Rule, Subscriber
        from pdf_reports_engine import BrandingConfig, PdfReportsEngine

        _ua, tid_a = await _seed_user(sf, f"pdf_a_{uuid.uuid4().hex[:6]}", "PDF-Tenant-A")
        _ub, tid_b = await _seed_user(sf, f"pdf_b_{uuid.uuid4().hex[:6]}", "PDF-Tenant-B")

        async with sf() as db:
            rule_a = Rule(tenant_id=tid_a, name="ruleA", keywords=["a"],
                          reply_template="A", enabled=True)
            db.add(rule_a)
            await db.flush()
            db.add_all([
                Reply(tenant_id=tid_a, fb_comment_id="c-a1", fb_post_id="p1",
                      commenter_name="ALICE-A-PII", comment_text="hi", rule_id=rule_a.id),
                Reply(tenant_id=tid_a, fb_comment_id="c-a2", fb_post_id="p1",
                      commenter_name="ALICE-A-PII", comment_text="again", rule_id=rule_a.id),
                Reply(tenant_id=tid_b, fb_comment_id="c-b1", fb_post_id="p1",
                      commenter_name="BOB-B-SECRET-PII", comment_text="secret"),
                Reply(tenant_id=tid_b, fb_comment_id="c-b2", fb_post_id="p1",
                      commenter_name="CAROL-B-SECRET-PII", comment_text="secret2"),
            ])
            db.add_all([
                Subscriber(tenant_id=tid_a, fb_user_id="sub-a", name="SUB-A"),
                Subscriber(tenant_id=tid_a, fb_user_id="sub-a2", name="SUB-A2"),
                Subscriber(tenant_id=tid_b, fb_user_id="sub-b", name="SUB-B-SECRET"),
            ])
            bcast_a = Broadcast(tenant_id=tid_a, name="CampA", total_recipients=10)
            bcast_b = Broadcast(tenant_id=tid_b, name="CampB-SECRET", total_recipients=99)
            db.add_all([bcast_a, bcast_b])
            await db.commit()
            bcast_b_id = bcast_b.id

        engine = PdfReportsEngine()

        async with sf() as s:
            overview_a = await engine._get_overview(30, s, tid_a)
            commenters_a = await engine._get_top_commenters(30, 10, s, tid_a)
            growth_a = await engine._get_subscriber_growth(30, s, tid_a)
            top_rules_a = await engine._get_top_rules(30, 10, s, tid_a)
            daily_a = await engine._get_daily_trend(30, s, tid_a)
            sentiment_a = await engine._get_sentiment_trend(30, s, tid_a)

            # counts scoped to tenant A ONLY (global query leaked 4/3/3 before)
            assert overview_a["total_replies"] == 2, overview_a
            assert overview_a["unique_commenters"] == 1, overview_a
            assert overview_a["total_subscribers"] == 2, overview_a
            assert overview_a["active_rules"] == 1, overview_a
            # PII guard: tenant B's commenter names never surface
            assert all("SECRET" not in (c["name"] or "") for c in commenters_a), commenters_a
            assert [c["name"] for c in commenters_a] == ["ALICE-A-PII"], commenters_a
            assert sum(g["subscribers"] for g in growth_a) == 2, growth_a

            # campaign lookup: B's campaign id resolves to NOTHING for tenant A
            camp_for_a = await engine._get_campaign_data("broadcast", str(bcast_b_id), s, tid_a)
            assert camp_for_a["name"] == "" and camp_for_a["total_recipients"] == 0, camp_for_a
            # ...and to the real row for tenant B (id ownership verified)
            camp_for_b = await engine._get_campaign_data("broadcast", str(bcast_b_id), s, tid_b)
            assert camp_for_b["name"] == "CampB-SECRET" and camp_for_b["total_recipients"] == 99

            # the rendered monthly HTML itself must not carry B's PII/campaign
            html = engine._build_monthly_html(
                overview_a, daily_a, top_rules_a, sentiment_a, commenters_a,
                growth_a, BrandingConfig(company_name="TestCo"), 30, "period")
            assert "BOB-B-SECRET-PII" not in html
            assert "CAROL-B-SECRET-PII" not in html
            assert "CampB-SECRET" not in html
            assert "SUB-B-SECRET" not in html
            assert "ALICE-A-PII" in html  # own data still present
    finally:
        await _teardown(fixture)


# ── A3: inbox tag BOLA isolation ─────────────────────────────────────────────

async def test_inbox_tag_isolation_between_tenants():
    """مستأجر A لا يُسنِد/يزيل وسم محادثة مستأجر B (404) — ويعمل على محادثته."""
    fixture = await _make_fixture()
    try:
        _app, sf, _te, client = fixture
        from models import Conversation, ConversationTag

        ua, tid_a = await _seed_user(sf, f"inb_a_{uuid.uuid4().hex[:6]}", "Inbox-A")
        _ub, tid_b = await _seed_user(sf, f"inb_b_{uuid.uuid4().hex[:6]}", "Inbox-B")

        async with sf() as db:
            conv_a = Conversation(tenant_id=tid_a, fb_conversation_id="conv-A-1", user_name="A-user")
            conv_b = Conversation(tenant_id=tid_b, fb_conversation_id="conv-B-SECRET", user_name="B-user")
            tag_a = ConversationTag(tenant_id=tid_a, name="vip-a")
            tag_b = ConversationTag(tenant_id=tid_b, name="secret-b")
            db.add_all([conv_a, conv_b, tag_a, tag_b])
            await db.commit()
            tag_a_id, tag_b_id = tag_a.id, tag_b.id

        # login as tenant A's admin
        r = await client.post("/api/login", json={"username": ua, "password": "pass123456"})
        assert r.status_code == 200, r.text

        # assign A's OWN tag to A's OWN conversation → success
        r = await client.post("/api/inbox/conversations/conv-A-1/tags", data={"tag_id": tag_a_id})
        assert r.status_code == 200 and r.json()["success"] is True, r.text

        # BOLA: assign B's tag (or any tag) on B's conversation → 404
        r = await client.post("/api/inbox/conversations/conv-B-SECRET/tags", data={"tag_id": tag_b_id})
        assert r.status_code == 404, f"cross-tenant assign leaked: {r.status_code}"
        # ...even with A's own tag on B's conversation → still 404
        r = await client.post("/api/inbox/conversations/conv-B-SECRET/tags", data={"tag_id": tag_a_id})
        assert r.status_code == 404, f"cross-tenant assign leaked: {r.status_code}"

        # BOLA: remove B's tag from B's conversation as A → 404
        r = await client.delete(f"/api/inbox/conversations/conv-B-SECRET/tags/{tag_b_id}")
        assert r.status_code == 404, f"cross-tenant remove leaked: {r.status_code}"

        # label rows for B were never created by A's attempts
        from models import ConversationLabel
        async with sf() as db:
            from sqlalchemy import select
            rows = (await db.execute(
                select(ConversationLabel).where(ConversationLabel.conversation_id == "conv-B-SECRET")
            )).scalars().all()
            assert rows == [], f"A's attempts created labels on B's conversation: {rows}"
            # A's own assignment exists and is tenant-stamped
            mine = (await db.execute(
                select(ConversationLabel).where(ConversationLabel.conversation_id == "conv-A-1")
            )).scalars().all()
            assert len(mine) == 1 and mine[0].tenant_id == tid_a
    finally:
        await _teardown(fixture)


# ── A4: agent memory tenant separation ───────────────────────────────────────

async def test_agent_memory_same_username_separate_tenants():
    """نفس اسم المستخدم في مستأجرين → مفاتيح جلسة/ذاكرة منفصلة تماماً."""
    fixture = await _make_fixture()
    try:
        _app, sf, _te, _client = fixture
        import agent_memory as amem

        shared = f"dual_{uuid.uuid4().hex[:6]}"
        # v15-E2 (D12-H4): نفس الاسم عبر المستأجرين هو موضوع A4؛ البريد
        # فريد لكل صف — ازدراع بريدين متطابقين (مشتق من الاسم نفسه) صار
        # انتهاكاً صريحاً لقيد uq_user_email_lower الفريد الجديد.
        _u1, tid_a = await _seed_user(sf, shared, "Mem-A", email=f"{shared}-a@test.ly")
        _u2, tid_b = await _seed_user(sf, shared, "Mem-B", email=f"{shared}-b@test.ly")  # same username, other tenant

        # keys are tenant-prefixed and distinct
        assert amem._session_key(tid_a, shared) != amem._session_key(tid_b, shared)
        assert amem._session_key(tid_a, shared) == f"ai_session_{tid_a}_{shared}"
        assert amem._user_key(tid_b, shared) == f"ai_memory_{tid_b}_{shared}"

        async with sf() as db:
            await amem.append_to_session(db, shared, {"role": "user", "text": "SECRET-A-ONLY"}, tid_a)
            await amem.update_user_memory(db, shared, {"preferences": {"lang": "ar"}}, tid_a)

        async with sf() as db:
            # tenant B reads NOTHING of tenant A's session/memory
            session_b = await amem.get_session(db, shared, tid_b)
            memory_b = await amem.get_user_memory(db, shared, tid_b)
            assert session_b == [], f"cross-tenant session leak: {session_b}"
            assert memory_b == {"preferences": {}, "history": []}, memory_b
            # tenant A still sees its own
            session_a = await amem.get_session(db, shared, tid_a)
            memory_a = await amem.get_user_memory(db, shared, tid_a)
            assert any("SECRET-A-ONLY" in str(t) for t in session_a)
            assert memory_a["preferences"].get("lang") == "ar"

        # clear_session is scoped too — clearing B must not touch A
        async with sf() as db:
            await amem.clear_session(db, shared, tid_b)
        async with sf() as db:
            session_a2 = await amem.get_session(db, shared, tid_a)
            assert any("SECRET-A-ONLY" in str(t) for t in session_a2)
    finally:
        await _teardown(fixture)


# ── A5: ok-shadowing regression — success envelope, no 500 after commit ──────

async def test_ok_shadowing_fixed_sequences_and_broadcasts():
    """PUT sequences + PUT broadcasts: العملية تنفّذ ثم تعيد success:true
    (قبل v9-A5 كانت النتيجة 500 TypeError لأن ok= حجبت دالة ok())."""
    fixture = await _make_fixture()
    try:
        _app, sf, _te, client = fixture
        uname, _tid = await _seed_user(sf, f"oksh_{uuid.uuid4().hex[:6]}", "OkShadow")
        r = await client.post("/api/login", json={"username": uname, "password": "pass123456"})
        assert r.status_code == 200, r.text

        # ── sequences: create → update → delete ──
        r = await client.post("/api/sequences", json={"name": "seq-v9", "description": "d"})
        assert r.status_code == 200, r.text
        seq_id = r.json()["data"]["id"]
        r = await client.put(f"/api/sequences/{seq_id}", json={"name": "seq-v9-upd"})
        assert r.status_code == 200, f"sequences PUT broken: {r.status_code} {r.text[:200]}"
        assert r.json()["success"] is True, r.text
        r = await client.delete(f"/api/sequences/{seq_id}")
        assert r.status_code == 200 and r.json()["success"] is True, r.text

        # ── broadcasts: create → update ──
        r = await client.post("/api/broadcasts", json={"name": "bc-v9", "message_template": "m"})
        assert r.status_code == 200, r.text
        bc_id = r.json()["data"]["id"]
        r = await client.put(f"/api/broadcasts/{bc_id}", json={"name": "bc-v9-upd"})
        assert r.status_code == 200, f"broadcasts PUT broken: {r.status_code} {r.text[:200]}"
        assert r.json()["success"] is True, r.text
    finally:
        await _teardown(fixture)


# ── A6: global log buffer restricted to platform admin ───────────────────────

async def test_logs_stats_platform_admin_only():
    """البافر العام بلا علامة مستأجر: مستخدم المستأجر 403، مسؤول المنصة 200."""
    fixture = await _make_fixture()
    try:
        _app, sf, _te, client = fixture
        from _hash import hash_password
        from models import User

        uname, _tid = await _seed_user(sf, f"logs_{uuid.uuid4().hex[:6]}", "Logs-T")
        r = await client.post("/api/login", json={"username": uname, "password": "pass123456"})
        assert r.status_code == 200, r.text
        r = await client.get("/api/logs/stats")
        assert r.status_code == 403, f"tenant user read the global buffer: {r.status_code}"
        r = await client.get("/api/diagnostics/logs")
        assert r.status_code == 403, f"tenant user read diagnostics logs: {r.status_code}"

        plat = f"plat_{uuid.uuid4().hex[:6]}"
        async with sf() as db:
            db.add(User(username=plat, email=f"{plat}@t.ly",
                        password_hash=hash_password("pass123456"),
                        tenant_id=0, role="admin"))
            await db.commit()
        r = await client.post("/api/login", json={"username": plat, "password": "pass123456"})
        assert r.status_code == 200, r.text
        r = await client.get("/api/logs/stats")
        assert r.status_code == 200 and r.json()["success"] is True, r.text
    finally:
        await _teardown(fixture)
