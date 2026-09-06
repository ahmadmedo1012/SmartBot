"""v11-A6 — S1 backlog #4: محرك الناشر متعدد المنصات + محرك الفريق.

publisher_engine.py كان 0% تغطية و team_engine.py 20% — أكبر فجوتين بعد
محركات البث/السلاسل (استبعاد runner.py/bot.py قيد إعادة الهيكلة الموازية).
هذه البوابة تثبّت:

  [x] الناشر — الحراسة بلا إعداد: XPublisher/LinkedIn غير مضبوطين →
        publish يعيد None دون أي نداء httpx (لا شبكة بلا اعتمادات).
  [x] الناشر — get_status/قوالب حقول الإعداد لكل منصة/الأسماء العربية
        للعرض (فيسبوك/إنستغرام/X/لينكد إن) والتمرير لغير المعروف.
  [x] الناشر — load_credentials من BotState (جلسة تزامنية كما صمّمها
        المحرك: تنفيذ بلا await) و save_credentials يكتب الصفوف.
  [x] الناشر — المسارات: status/settings تعملان، والتحقق من الرسالة
        الفارغة (400) والتاريخ الفاسد (400)، والنشر الفوري لفيسبوك عبر
        عميل مزيّف (مسجّل نداء واحد).
  [x] BUG (مُبلَّغ، xfail ×3): load_credentials ينفّذ execute بلا await
        على AsyncSession — كل مسارات publish المجدول/الفوري لغير فيسبوك
        و configure تهرب AttributeError → 500 (publisher_engine.py:106).
  [x] الفريق — get_team_members: إسناد الردود من سجلات BotLog
        («User alice ...») + آخر نشاط + الأدوار (إصلاح N+1 في v5 §4).
  [x] الفريق — get_team_activity: دمج BotLog/Reply/AnalyticsEvent مع
        تصفية الأيام وترتيب تنازلي، get_user_role_summary بالعدّ،
        get_team_performance لأدمن/محرر فقط، و_extract_username.
  [x] الفريق — مسارات HTTP: /api/team/members و /activity تعملان
        بالعقد ok().

Hermetic: النشر لفيسبوك عبر مسجّل؛ لا أي نداء شبكي.
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import timedelta

from sqlalchemy import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))


# ── الناشر: المحرك ──────────────────────────────────────────────────────────


async def test_x_publisher_unconfigured_returns_none_without_network():
    """XPublisher بلا اعتمادات: publish → None مباشرة (الحارس قبل httpx —
    لا محاولة شبكة على الإطلاق)."""
    from publisher_engine import XPublisher

    xp = XPublisher()
    assert xp.is_configured() is False
    assert await xp.publish("مرحبا") is None
    assert await xp.publish("مرحبا", image_url="https://x.test/i.png") is None


async def test_linkedin_publisher_unconfigured_returns_none():
    """LinkedInPublisher بلا اعتمادات: publish → None (نفس الحارس)."""
    from publisher_engine import LinkedInPublisher

    lp = LinkedInPublisher()
    assert lp.is_configured() is False
    assert await lp.publish("منشور") is None


async def test_publisher_engine_status_defaults():
    """الحالة الافتراضية: فيسبوك/إنستغرام configured (عبر FBClient)،
    X/LinkedIn غير مضبوطين بعد."""
    from publisher_engine import PublisherEngine

    status = PublisherEngine().get_status()
    assert status["facebook"] == {"configured": True, "platform": "Facebook"}
    assert status["instagram"]["configured"] is True
    assert status["x"]["configured"] is False
    assert status["linkedin"]["configured"] is False


def test_publisher_settings_templates_per_platform():
    """قوالب الحقول: x → 4 حقول (كلمة المرور/سر)، linkedin → حقان،
    منصة مجهولة → قائمة فارغة."""
    from publisher_engine import PublisherEngine

    eng = PublisherEngine()
    x_fields = eng.get_platform_settings_template("x")
    assert [f["key"] for f in x_fields] == ["api_key", "api_secret",
                                            "access_token", "access_secret"]
    assert x_fields[0]["type"] == "password"
    assert any("Developer" in (f.get("hint") or "") for f in x_fields)

    li = eng.get_platform_settings_template("linkedin")
    assert [f["key"] for f in li] == ["access_token", "organization_id"]

    assert eng.get_platform_settings_template("tiktok") == []


def test_publisher_display_names_arabic():
    """أسماء العرض العربية للمنصات؛ المنصة غير المعروفة تُمرَّر كما هي."""
    from publisher_engine import PublisherEngine

    eng = PublisherEngine()
    assert eng.get_platform_display_name("facebook") == "فيسبوك"
    assert eng.get_platform_display_name("instagram") == "إنستغرام"
    assert eng.get_platform_display_name("x") == "X (تويتر)"
    assert eng.get_platform_display_name("linkedin") == "لينكد إن"
    assert eng.get_platform_display_name("mastodon") == "mastodon"


async def test_publish_to_platform_routing_unconfigured():
    """publish_to_platform: facebook → None (المسؤول FBClient مباشرة)،
    x/linkedin غير مضبوطين → None، منصة مجهولة → None."""
    from publisher_engine import PublisherEngine

    eng = PublisherEngine()
    assert await eng.publish_to_platform("facebook", "نص") is None
    assert await eng.publish_to_platform("x", "نص") is None
    assert await eng.publish_to_platform("linkedin", "نص") is None
    assert await eng.publish_to_platform("whatsapp", "نص") is None


async def test_load_credentials_from_botstate(v10_world):
    """load_credentials يقرأ صفوف publisher_* من BotState (جلسة async —
    عقد v11 المُصلح: المحرك الآن async ويُستدعى بـawait): يبني
    XPublisher/LinkedIn مضبوطين، والصفوف الغائبة تعيد بناء الافتراضيات."""
    from models import BotState
    from publisher_engine import PublisherEngine

    async with v10_world.sf() as db:
        db.add(BotState(tenant_id=5, key="publisher_x_api_key", value="k"))
        db.add(BotState(tenant_id=5, key="publisher_x_api_secret", value="s"))
        db.add(BotState(tenant_id=5, key="publisher_x_access_token", value="at"))
        db.add(BotState(tenant_id=5, key="publisher_x_access_secret", value="as"))
        db.add(BotState(tenant_id=5, key="publisher_linkedin_access_token", value="li"))
        db.add(BotState(tenant_id=5, key="publisher_linkedin_organization_id", value="org1"))
        db.add(BotState(tenant_id=9, key="publisher_x_api_key", value="غير هذا المستأجر"))
        await db.commit()

        eng = PublisherEngine()
        await eng.load_credentials(db, tenant_id=5)
        assert eng.x.is_configured() is True
        assert eng.x.api_key == "k" and eng.x.access_token == "at"
        assert eng.linkedin.is_configured() is True
        assert eng.linkedin.organization_id == "org1"

        # مستأجر آخر بلا صفوف → الافتراضي (غير مضبوط) رغم وجود صفوف مستأجر 9
        eng2 = PublisherEngine()
        await eng2.load_credentials(db, tenant_id=7)
        assert eng2.x.is_configured() is False


async def test_save_credentials_writes_botstate_rows(v10_world):
    """save_credentials: يكتب publisher_{platform}_{key} في BotState (مع
    تحديث الصف الموجود لا تكراره) ويعيد True (إعادة التحميل مغطاة مباشرة
    في اختبار load_credentials — النسخة المُصلحة async)."""
    from models import BotState
    from publisher_engine import PublisherEngine

    async def _noop_reload(db, tenant_id=0):
        return None

    eng = PublisherEngine()
    eng.load_credentials = _noop_reload

    async with v10_world.sf() as db:
        assert await eng.save_credentials(db, "x",
                                          {"api_key": "k1", "access_token": "t1"},
                                          tenant_id=3) is True
        rows = {r.key: r.value for r in (await db.execute(
            select(BotState).where(BotState.tenant_id == 3,
                                   BotState.key.like("publisher_x_%")))).scalars()}
        # v12-E1.5: publisher credentials are Fernet-encrypted at rest now —
        # pin the ciphertext shape + the decrypt round-trip (not plaintext).
        from _crypto import decrypt_token

        assert set(rows) == {"publisher_x_api_key", "publisher_x_access_token"}
        assert all(v.startswith("gAAAA") for v in rows.values()), rows
        assert decrypt_token(rows["publisher_x_api_key"]) == "k1"
        assert decrypt_token(rows["publisher_x_access_token"]) == "t1"

        # كتابة ثانية لنفس المفاتيح = تحديث لا صفوف جديدة
        assert await eng.save_credentials(db, "x", {"api_key": "k2"},
                                          tenant_id=3) is True
        rows = (await db.execute(
            select(BotState).where(BotState.tenant_id == 3,
                                   BotState.key == "publisher_x_api_key"))).scalars().all()
        assert len(rows) == 1 and decrypt_token(rows[0].value) == "k2"


# ── الناشر: المسارات ────────────────────────────────────────────────────────


async def test_publisher_status_and_settings_routes(v10_seed):
    """GET /api/publisher/status و /settings/x: العقد ok() مع الحالة
    الافتراضية (x غير مضبوط) وحقول x الأربعة."""
    uname, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="PUB")
    await v10_seed.login(uname)
    c = v10_seed.world.client

    r = await c.get("/api/publisher/status")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["x"]["configured"] is False
    assert data["facebook"]["configured"] is True

    r = await c.get("/api/publisher/settings/linkedin")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["platform"] == "linkedin"
    assert [f["key"] for f in r.json()["data"]["fields"]] == [
        "access_token", "organization_id"]


async def test_publisher_publish_validation_guards(v10_seed):
    """التحقق قبل أي إعداد: رسالة فارغة → 400 «Message required»،
    وتاريخ غير ISO → 400 «Invalid date format»."""
    uname, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="PUB-V")
    await v10_seed.login(uname)
    c = v10_seed.world.client

    r = await c.post("/api/publisher/publish", json={"message": "   "})
    assert r.status_code == 400 and r.json()["detail"] == "نص المنشور مطلوب", r.text  # v12: عربية

    r = await c.post("/api/publisher/publish", json={
        "message": "منشور", "scheduled_at": "غدًا"})
    assert r.status_code == 400 and "صيغة التاريخ" in r.json()["detail"], r.text  # v12: عربية


async def test_publisher_publish_facebook_immediate(v10_seed, monkeypatch):
    """النشر الفوري لفيسبوك عبر fb.post_to_page (مُحاكى بمسجّل): يعيد
    post_id وحالة published — نداء واحد بالرسالة نفسها."""
    import routers.publisher_routes as pr_mod

    calls: list[tuple[str, str]] = []

    class RecorderFB:
        async def post_to_page(self, message):
            calls.append(("post_to_page", message))
            return {"id": "fb_post_123"}

    # v12-E2.3: the route resolves the TENANT client via get_tenant_fb_client
    # (the module-level `fb` global is gone) — patch that resolver instead.
    async def _fake_tenant_fb(tenant_id):
        return RecorderFB()

    monkeypatch.setattr(pr_mod, "get_tenant_fb_client", _fake_tenant_fb)

    uname, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="PUB-FB")
    await v10_seed.login(uname)
    r = await v0_seed_post(v10_seed, "منشور فوري بالعربية")
    assert r.status_code == 200, r.text
    assert r.json()["data"] == {"platform": "facebook", "post_id": "fb_post_123",
                                "status": "published"}, r.text
    assert calls == [("post_to_page", "منشور فوري بالعربية")]


async def v0_seed_post(v10_seed, message: str):
    """POST /api/publisher/publish لفيسبوك بلا جدولة."""
    return await v10_seed.world.client.post("/api/publisher/publish", json={
        "message": message, "platform": "facebook"})


# FIXED in v11: load_credentials was sync (db.execute without await) → 500s
# on every publish/configure path. Test now a plain regression guard.
async def test_publisher_publish_scheduled_creates_post(v10_seed):
    """النشر المجدول: scheduled_at صالح → 200 {status: scheduled} وصف
    ScheduledPost بالرسالة والمنصة والمستخدم."""
    from models import ScheduledPost

    uname, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="PUB-S")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.post("/api/publisher/publish", json={
        "message": "عرض نهاية الأسبوع", "platform": "x",
        "scheduled_at": "2030-01-01T10:00:00"})
    assert r.status_code == 200, f"scheduled publish → {r.status_code}: {r.text[:200]}"
    assert r.json()["data"]["status"] == "scheduled"

    async with v10_seed.world.sf() as db:
        posts = (await db.execute(select(ScheduledPost).where(
            ScheduledPost.tenant_id == tid))).scalars().all()
        assert len(posts) == 1
        assert posts[0].message == "عرض نهاية الأسبوع"
        assert posts[0].platform == "x"
        assert posts[0].status == "scheduled"
        assert posts[0].created_by == uname


# FIXED in v11: same load_credentials bug (configure reloaded creds sync → 500).
async def test_publisher_configure_saves_and_reports(v10_seed):
    """configure (أدمن): 200 ok ويكتب اعتمادات المنصة في BotState ثم يعرضها
    الحالة configured=true (اليوم: 500 بعد الحفظ)."""
    from models import BotState

    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="PUB-C")
    await v10_seed.login(uname)
    c = v10_seed.world.client

    r = await c.post("/api/publisher/configure", json={
        "platform": "x", "credentials": {"api_key": "k", "api_secret": "s",
                                         "access_token": "t"}})
    assert r.status_code == 200, f"configure → {r.status_code}: {r.text[:200]}"
    assert r.json()["data"] == {"ok": True, "platform": "x"}

    async with v10_seed.world.sf() as db:
        rows = {r.key: r.value for r in (await db.execute(
            select(BotState).where(BotState.tenant_id == tid,
                                   BotState.key.like("publisher_x_%")))).scalars()}
        # v12-E1.5: encrypted at rest — decrypt to verify the round-trip
        from _crypto import decrypt_token

        assert decrypt_token(rows["publisher_x_api_key"]) == "k"

    r = await c.get("/api/publisher/status")
    assert r.json()["data"]["x"]["configured"] is True


async def test_publisher_configure_requires_platform_and_credentials(v10_seed):
    """configure بلا platform/credentials → 400 (تحقق قبل أي كتابة)."""
    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="PUB-E")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.post("/api/publisher/configure", json={})
    assert r.status_code == 400, r.text


# FIXED in v11: same load_credentials bug on the immediate-publish path.
async def test_publisher_publish_immediate_x_unconfigured_arabic_400(v10_seed):
    """نشر فوري لX بلا اعتمادات → 400 عربية «فشل النشر على X (تويتر)»
    (رسالة الاسم المعروض للمنصة) — لا 500."""
    uname, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="PUB-X")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.post("/api/publisher/publish", json={
        "message": "رسالة", "platform": "x"})
    assert r.status_code == 400, r.text
    assert "X (تويتر)" in r.json()["detail"], r.text


# ── الفريق: المحرك ──────────────────────────────────────────────────────────


async def _seed_team_world(v10_world, n_users: int = 2):
    """مستأجر + مستخدمون بأدوار + سجلات BotLog بصيغة «User <name> ...»."""
    from _hash import hash_password
    from models import BotLog, Tenant, User

    names = []
    async with v10_world.sf() as db:
        t = Tenant(name=f"TEAM-{uuid.uuid4().hex[:8]}", is_active=True,
                   subscription_status="PAID")
        db.add(t)
        await db.flush()
        roles = ["admin", "editor", "viewer"]
        for i in range(n_users):
            name = f"m{i}_{uuid.uuid4().hex[:6]}"
            names.append(name)
            db.add(User(username=name, email=f"{name}@test.ly",
                        password_hash=hash_password("x"), tenant_id=t.id,
                        role=roles[i % 3]))
        await db.flush()
        # سجلات نشاط بمقياس «User <name>» (وكيل الإسناد الحالي)
        db.add(BotLog(tenant_id=t.id, level="INFO",
                      message=f"User {names[0]} replied to comment #1"))
        db.add(BotLog(tenant_id=t.id, level="INFO",
                      message=f"User {names[0]} replied to comment #2"))
        if len(names) > 1:
            db.add(BotLog(tenant_id=t.id, level="INFO",
                          message=f"User {names[1]} replied to comment #3"))
        await db.commit()
        return t.id, names


async def test_team_members_attributions_from_botlogs(v10_world):
    """الأعضاء: replies_count من سجلات «User X» (استعلام مجمّع واحد — إصلاح
    N+1)، last_active بآخر سجل، والأدوار كما هي؛ مستأجر بلا أحد → []."""
    from team_engine import TeamEngine

    tid, names = await _seed_team_world(v10_world, n_users=2)
    eng = TeamEngine()
    async with v10_world.sf() as db:
        members = await eng.get_team_members(db, tenant_id=tid)
    by_name = {m["username"]: m for m in members}
    assert by_name[names[0]]["replies_count"] == 2
    assert by_name[names[1]]["replies_count"] == 1
    assert by_name[names[0]]["last_active"] is not None
    assert {m["role"] for m in members} == {"admin", "editor"}
    assert all(m["created_at"] for m in members)

    async with v10_world.sf() as db:
        assert await eng.get_team_members(db, tenant_id=999999) == []


async def test_team_activity_merges_sources_sorted(v10_world):
    """النشاط: دمج bot-log + reply + analytics-event في قائمة واحدة
    مرتبة تنازليًا؛ الردود تُنسب ل«system» وتفاصيلها عربية، والأحداث
    تقرأ user من metadata_json."""
    from models import AnalyticsEvent, Reply
    from team_engine import TeamEngine

    tid, _names = await _seed_team_world(v10_world, n_users=1)
    async with v10_world.sf() as db:
        db.add(Reply(tenant_id=tid, fb_comment_id="c1", fb_post_id="p1",
                     commenter_name="سارة العبيدي", comment_text="كم السعر؟",
                     reply_text="السعر 50 د.ل"))
        # string JSON — كما يكتبها _track_event (المُنتج الفعلي للأحداث)
        import json as _json
        db.add(AnalyticsEvent(tenant_id=tid, event_type="rule_triggered",
                              metadata_json=_json.dumps(
                                  {"user": "mona", "rule": "الترحيب"},
                                  ensure_ascii=False)))
        await db.commit()

    eng = TeamEngine()
    async with v10_world.sf() as db:
        activities = await eng.get_team_activity(7, db, tenant_id=tid)
    types = {a["type"] for a in activities}
    assert types == {"log", "reply", "event"}, types
    reply_row = [a for a in activities if a["type"] == "reply"][0]
    assert reply_row["user"] == "system"
    assert "سارة العبيدي" in reply_row["detail"]
    event_row = [a for a in activities if a["type"] == "event"][0]
    assert event_row["user"] == "mona"
    assert event_row["action"] == "rule_triggered"
    # ترتيب تنازلي بالوقت (سلاسل ISO متقاربة)
    times = [a["time"] for a in activities]
    assert times == sorted(times, reverse=True), times


async def test_team_activity_days_filter_excludes_old(v10_world):
    """تصفية الأيام: سجل عمره 35 يومًا لا يظهر بنافذة 7 أيام؛ الرد الحديث
    يظهر."""
    from _utils import utcnow
    from models import BotLog, Reply
    from team_engine import TeamEngine

    tid, _names = await _seed_team_world(v10_world, n_users=1)
    async with v10_world.sf() as db:
        db.add(BotLog(tenant_id=tid, level="INFO", message="سجل قديم",
                      created_at=utcnow() - timedelta(days=35)))
        db.add(Reply(tenant_id=tid, fb_comment_id="c2", fb_post_id="p2",
                     commenter_name="ليلى", reply_text="شكرًا"))
        await db.commit()

    eng = TeamEngine()
    async with v10_world.sf() as db:
        recent = await eng.get_team_activity(7, db, tenant_id=tid)
        old = await eng.get_team_activity(60, db, tenant_id=tid)
    assert all(a["detail"] != "سجل قديم" for a in recent)
    assert any(a["detail"] == "سجل قديم" for a in old)
    assert any(a["type"] == "reply" for a in recent)


async def test_team_role_summary_counts(v10_world):
    """ملخص الأدوار: عدّ admin/editor/viewer + total عبر كل المستأجرين."""
    from team_engine import TeamEngine

    await _seed_team_world(v10_world, n_users=3)
    eng = TeamEngine()
    async with v10_world.sf() as db:
        summary = await eng.get_user_role_summary(db)
    assert summary["admin"] >= 1 and summary["editor"] >= 1 and summary["viewer"] >= 1
    assert summary["total"] == summary["admin"] + summary["editor"] + summary["viewer"]


async def test_team_performance_admins_editors_only(v10_world):
    """الأداء: admin/editor فقط (viewer يُستبعد)، replies_handled من سجلات
    آخر 30 يومًا، وonline_status offline افتراضيًا."""
    from _utils import utcnow
    from models import BotLog
    from team_engine import TeamEngine

    tid, names = await _seed_team_world(v10_world, n_users=3)
    async with v10_world.sf() as db:
        db.add(BotLog(tenant_id=tid, level="INFO",
                      message=f"User {names[0]} handled a reply"))
        db.add(BotLog(tenant_id=tid, level="INFO",
                      message=f"User {names[0]} handled another",
                      created_at=utcnow() - timedelta(days=40)))  # خارج النافذة
        await db.commit()

    eng = TeamEngine()
    async with v10_world.sf() as db:
        perf = await eng.get_team_performance(db, tenant_id=tid)
    usernames = {p["username"] for p in perf}
    assert names[0] in usernames and names[1] in usernames
    assert names[2] not in usernames, "viewer must be excluded from performance"
    row0 = [p for p in perf if p["username"] == names[0]][0]
    # ردّان من الزرع + «handled a reply» = 3؛ سجل الأربعين يومًا مستبعد (وإلا 4)
    assert row0["replies_handled"] == 3, perf
    assert all(p["online_status"] == "offline" for p in perf)


# FIXED in v11: metadata_json may arrive as dict (JSON column) — json.loads(dict)
# crashed both the parse and the except branch → 500 on /api/team/activity.
async def test_team_activity_supports_dict_metadata_json(v10_world):
    """حدث AnalyticsEvent بـ metadata_json=dict (الشكل الطبيعي للعمود):
    يظهر في النشاط مع user من meta — لا 500."""
    from models import AnalyticsEvent
    from team_engine import TeamEngine

    tid, _names = await _seed_team_world(v10_world, n_users=1)
    async with v10_world.sf() as db:
        db.add(AnalyticsEvent(tenant_id=tid, event_type="post_published",
                              metadata_json={"user": "dalal", "platform": "x"}))
        await db.commit()

    eng = TeamEngine()
    async with v10_world.sf() as db:
        activities = await eng.get_team_activity(7, db, tenant_id=tid)
    events = [a for a in activities if a["type"] == "event"]
    assert events and events[0]["user"] == "dalal"


# FIXED in v11: BotLog performance query now filters tenant_id — usernames are
# unique per-tenant only (v10-A1), cross-tenant rows no longer leak in.
async def test_team_performance_is_tenant_scoped(v10_world):
    """أداء المستأجر A لا يُحسب من سجلات مستأجر B حتى مع تطابق الاسم
    (الاسم مكرر عبر المستأجرين — واقع منذ v10-A1)."""
    from models import BotLog, Tenant, User
    from team_engine import TeamEngine

    shared = f"dupe_{uuid.uuid4().hex[:6]}"
    async with v10_world.sf() as db:
        ta = Tenant(name=f"PA-{uuid.uuid4().hex[:6]}", is_active=True)
        tb = Tenant(name=f"PB-{uuid.uuid4().hex[:6]}", is_active=True)
        db.add_all([ta, tb])
        await db.flush()
        db.add(User(username=shared, email=f"{shared}@a.ly", password_hash="x",
                    tenant_id=ta.id, role="admin"))
        db.add(User(username=shared, email=f"{shared}@b.ly", password_hash="x",
                    tenant_id=tb.id, role="admin"))
        await db.flush()
        db.add(BotLog(tenant_id=tb.id, level="INFO",
                      message=f"User {shared} replied in tenant B"))
        await db.commit()

    eng = TeamEngine()
    async with v10_world.sf() as db:
        perf = await eng.get_team_performance(db, tenant_id=ta.id)
    row = [p for p in perf if p["username"] == shared][0]
    assert row["replies_handled"] == 0, "tenant A counted tenant B's activity"


def test_extract_username_patterns():
    """استخراج الاسم من «User admin replied to X» → admin؛ بلا صيغة
    User → system."""
    from team_engine import TeamEngine

    eng = TeamEngine()
    assert eng._extract_username("User admin replied to comment") == "admin"
    assert eng._extract_username("بدون صيغة مستخدم") == "system"


# ── الفريق: المسارات ────────────────────────────────────────────────────────


async def test_team_members_and_activity_http(v10_seed):
    """GET /api/team/members (أدمن مستأجر) و /activity (أي موثّق): عقد ok()
    مع بيانات المحرك نفسها (أعضاء بالأدوار + مصادر النشاط)."""
    from models import BotLog

    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="TM")
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client

    async with v10_seed.world.sf() as db:
        db.add(BotLog(tenant_id=tid, level="INFO", message=f"User {uname} replied"))
        await db.commit()

    r = await c.get("/api/team/members")
    assert r.status_code == 200, r.text
    members = r.json()["data"]
    assert any(m["username"] == uname for m in members)
    assert all(m["role"] for m in members)

    r = await c.get("/api/team/activity?days=7")
    assert r.status_code == 200, r.text
    assert any(a["type"] == "log" for a in r.json()["data"])
