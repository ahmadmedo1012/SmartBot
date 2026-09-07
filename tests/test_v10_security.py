"""v10 security regression gate — المسار G من خطة v10 (وكيل W5).

انحدارات كل إصلاحات جولة v10 (W1a/W1b) التي كُتبت بلا اختبارات جديدة:

  [x] A1: اسم مستخدم مكرر عبر مستأجرين — login/get_current_user لا ينهاران
        (لا MultipleResultsFound/500)؛ توكن حديث بـtid يُحلّ scoped، والقديم
        بلا tid يمرّ عبر البحث المحدود الحتمي.
  [x] A2: بوابة _ADMIN_ONLY_TOOLS — editor لا يوقف/يشغّل بوت المنصة عبر
        الوكيل (رفض عربي، لا تنفيذ)، والأدمن يمر.
  [x] A3: GET /api/support/info — قائمة سماح صريحة (email/phone/whatsapp/
        working_hours فقط) — لا HEARTBEAT_KEY/telegram_chat_id/مفاتيح مستقبلية.
  [x] A4/A5: list_stats محصور بالمستأجر؛ create_rule يهبط في tenant المستخدم.
  [x] A6: GET /api/admin/config يرد الأسرار مقنعة (••••آخر4)؛ POST يتجاهل
        صدى القناع المرتد فلا يطمس السر الحقيقي.
  [x] A7: pdf_reports_engine — html.escape لكل دخيل غير متحكم فيه
        (أسماء معلقين/قواعد/البراند) — لا حقن HTML خام.
  [x] A8: حارس SSRF — رفض http:// والمضيفات المحلية/الخاصة بكل ترميزاتها
        (localhost/127.x/192.168.x/10.x/172.16-31/169.254/::1/0.0.0.0/127.1/
        2130706433/0x7f000001) برسالة عربية؛ وقبول https العام.
  [x] A9: أخطاء _execute ترد رسالة عامة عربية — لا str(e) داخلي للعميل.
  [x] D1: سقف المحفظة يُقرأ من SystemConfig (mobile_wallet_cap) — تعديل
        الأدمن مفروض فعليًا (151>150 مرفوض، 149 مقبول) + fallback للبيئة.
  [x] D2: GET /api/support/tickets يرد {success, data:{items, total}}.
  [x] D3: مجهول GET/POST تحت /api → 404 {detail} عربي JSON؛ طريقة خاطئة
        على مسار حقيقي → 405 عربي + ترويسة Allow؛ SPA سليم.
  [x] B3: /api/dashboard/bundle بلا اعتمادات Graph → صفر نداءات (مقيس
        بمسجّل نداءات) مع fan_count فارغ؛ والنداء يحدث عند وجود الاعتمادات.
"""

from __future__ import annotations

import os
import secrets
import sys
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))

# ── A1: login/get_current_user مع اسم مكرر عبر مستأجرين ────────────────────


async def test_a1_login_duplicated_username_no_500(v10_seed):
    """اسم واحد في مستأجرين: الدخول يعمل (لا 500 إقفالًا متبادلًا) ويصل أقدم صف."""
    shared = f"dup_{uuid.uuid4().hex[:6]}"
    _ua, tid_a, _uid = await v10_seed.tenant_user(shared, tenant_name="Dup-A")
    # v15-E2 (D12-H4): البريد فريد لكل صف — قيد uq_user_email_lower العالمي
    # الجديد يرفض ازدراع بريدين متطابقين؛ غرض A1 هو الاسم المكرر حصراً.
    _ub, tid_b, _uidb = await v10_seed.tenant_user(
        shared, tenant_name="Dup-B", email=f"{shared}-b@test.ly")
    assert tid_a != tid_b

    r = await v10_seed.login(shared)
    # قبل v10-A1: scalar_one_or_none → MultipleResultsFound → 500 متبادل
    assert r.status_code == 200, r.text
    user = r.json()["data"]["user"]
    assert user["username"] == shared
    # الاختيار حتمي (أقدم صف — order_by(id))
    assert user["tenant_id"] == tid_a


async def test_a1_modern_token_scopes_to_minting_tenant(v10_seed):
    """توكن حديث يحمل tid: get_current_user يقيّد البحث بالمستأجر الصحيح."""
    shared = f"tok_{uuid.uuid4().hex[:6]}"
    _ua, tid_a, _uida = await v10_seed.tenant_user(shared, tenant_name="Tok-A")
    # v15-E2 (D12-H4): بريد فريد للصف الثاني (قيد uq_user_email_lower).
    email_b = f"{shared}-b@test.ly"
    _ub, tid_b, _uidb = await v10_seed.tenant_user(
        shared, tenant_name="Tok-B", email=email_b)

    v10_seed.auth(shared, tid_b)  # توكن مستأجر B رغم تطابق الاسم
    r = await v10_seed.world.client.get("/api/me")
    assert r.status_code == 200, r.text
    data = r.json()["data"]["user"]
    assert data["tenant_id"] == tid_b, f"token scoped to wrong tenant: {data}"
    assert data["email"] == email_b

    # نفس التوكن يعمل عبر طلبات متتابعة (لا 500 ولا فقدان جلسة)
    r2 = await v10_seed.world.client.get("/api/rules")
    assert r2.status_code == 200, r2.text


async def test_a1_legacy_token_without_tid_bounded_lookup(v10_seed):
    """توكن قديم بلا tid: البحث المحدود limit(1) — لا انهيار مع الاسم المكرر."""
    import jwt as pyjwt
    from config import settings

    shared = f"leg_{uuid.uuid4().hex[:6]}"
    _ua, tid_a, _uida = await v10_seed.tenant_user(shared, tenant_name="Leg-A")
    # v15-E2 (D12-H4): بريد فريد للصف الثاني (قيد uq_user_email_lower).
    _ub, tid_b, _uidb = await v10_seed.tenant_user(
        shared, tenant_name="Leg-B", email=f"{shared}-b@test.ly")

    now = datetime.now(UTC)
    legacy = pyjwt.encode(
        {"sub": shared, "jti": secrets.token_hex(16),
         "iat": now, "nbf": now, "exp": now + timedelta(hours=1)},
        settings.SECRET_KEY, algorithm="HS256",
    )
    v10_seed.world.client.cookies.set("token", legacy)
    r = await v10_seed.world.client.get("/api/me")
    # قبل v10-A1: MultipleResultsFound → 500. الآن: أول مطابقة حتميًا.
    assert r.status_code == 200, r.text
    assert r.json()["data"]["user"]["username"] == shared


# ── A2: بوابة الأدوات الإدارية للوكيل (_ADMIN_ONLY_TOOLS) ──────────────────


async def test_a2_editor_cannot_toggle_bot_engine_gate(v10_seed):
    """editor يستدعي toggle_bot عبر محرك الوكيل → رفض عربي، لا تنفيذ."""
    from agent_engine import AgentEngine

    _uname, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="Gate-Ed")
    async with v10_seed.world.sf() as db:
        eng = AgentEngine()
        res = await eng._execute("toggle_bot", {"action": "stop"}, db,
                                 tenant_id=tid, role="editor")
    assert res["success"] is False, res
    assert "صلاحيات مسؤول" in res["message_ar"], res

    # بقية الأدوات الإدارية الأربع خلف البوابة نفسها
    async with v10_seed.world.sf() as db:
        eng = AgentEngine()
        for action in ("publish_post", "reply_to_comment", "system"):
            res = await eng._execute(action, {"message": "x"}, db,
                                     tenant_id=tid, role="editor")
            assert res["success"] is False, (action, res)
            assert "صلاحيات مسؤول" in res["message_ar"], (action, res)


async def test_a2_admin_passes_toggle_bot_gate(v10_seed):
    """الأدمن يمر عبر البوابة — toggle_bot (stop) بلا مهمة قائمة ينجح."""
    from agent_engine import AgentEngine

    _uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="Gate-Ad")
    async with v10_seed.world.sf() as db:
        eng = AgentEngine()
        res = await eng._execute("toggle_bot", {"action": "stop"}, db,
                                 tenant_id=tid, role="admin")
    assert res["success"] is True, res
    assert "تم إيقاف البوت" in res["message_ar"], res


async def test_a2_editor_stop_bot_rejected_via_agent_api(v10_seed):
    """المسار الحتمي كاملًا: editor يرسل «أوقف البوت» لـ/api/agent/interpret
    → الدماغ يفهم toggle_bot/stop → البوابة ترفض قبل أي لمس لمهمة المنصة."""
    import runner as runner_mod

    uname, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="Gate-API")
    await v10_seed.login(uname)
    bot_before = runner_mod._bot_task

    r = await v10_seed.world.client.post("/api/agent/interpret", data={"text": "أوقف البوت"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["data"]["action"] == "toggle_bot", body
    assert "صلاحيات مسؤول" in body["data"]["response_ar"], body
    # لم يُنفَّذ شيء على مهمة بوت المنصة
    assert runner_mod._bot_task is bot_before


# ── A3: قائمة سماح support/info العامة ─────────────────────────────────────


async def test_a3_support_info_exact_allowlist_served(v10_seed):
    """/api/support/info عام: أربعة مفاتيح فقط، بقيم SystemConfig المزروعة."""
    from models import SystemConfig

    async with v10_seed.world.sf() as db:
        db.add_all([
            SystemConfig(key="support_email", value="help@smartbot.ly", is_secret=False),
            SystemConfig(key="support_phone", value="0911111111", is_secret=False),
            SystemConfig(key="support_whatsapp", value="0933333333", is_secret=False),
            SystemConfig(key="support_working_hours", value="السبت-الخميس 9ص-5م", is_secret=False),
        ])
        await db.commit()

    r = await v10_seed.world.client.get("/api/support/info")  # بلا مصادقة
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert set(data.keys()) == {"email", "phone", "whatsapp", "working_hours"}, data
    assert data["email"] == "help@smartbot.ly"
    assert data["phone"] == "0911111111"
    assert data["whatsapp"] == "0933333333"
    assert data["working_hours"] == "السبت-الخميس 9ص-5م"


async def test_a3_support_info_never_leaks_other_config_keys(v10_seed):
    """HEARTBEAT_KEY/telegram_chat_id/أي مفتاح آخر لا يصل للمسار العام —
    حتى لو خُزّن بـ is_secret=False (حالة ما قبل v10-A3)."""
    from models import SystemConfig

    async with v10_seed.world.sf() as db:
        db.add_all([
            SystemConfig(key="support_email", value="visible@smartbot.ly", is_secret=False),
            SystemConfig(key="HEARTBEAT_KEY", value="HB-SECRET-XYZ-987", is_secret=False),
            SystemConfig(key="telegram_chat_id", value="@platform-admins", is_secret=False),
            SystemConfig(key="some_future_setting", value="FUTURE-LEAK-123", is_secret=False),
            SystemConfig(key="openai_api_key", value="sk-FUTURE-LEAK", is_secret=False),
        ])
        await db.commit()

    r = await v10_seed.world.client.get("/api/support/info")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert "HEARTBEAT_KEY" not in data and "telegram_chat_id" not in data
    assert "some_future_setting" not in data and "openai_api_key" not in data
    for secret in ("HB-SECRET-XYZ-987", "@platform-admins", "FUTURE-LEAK-123", "sk-FUTURE-LEAK"):
        assert secret not in r.text, f"config value leaked via public support/info: {secret}"


# ── A4/A5: عدادات الوكيل والقواعد محصورة بالمستأجر ──────────────────────────


async def test_a4_agent_list_stats_tenant_scoped(v10_seed):
    """list_stats عبر المحرك: يعدّ ردود المستأجر الطالب فقط."""
    from agent_engine import AgentEngine
    from models import Reply

    _ua, tid_a, _uida = await v10_seed.tenant_user(tenant_name="Stats-A")
    _ub, tid_b, _uidb = await v10_seed.tenant_user(tenant_name="Stats-B")
    async with v10_seed.world.sf() as db:
        db.add_all([
            Reply(tenant_id=tid_a, fb_comment_id="a1", fb_post_id="p",
                  commenter_name="A1", comment_text="x"),
            Reply(tenant_id=tid_a, fb_comment_id="a2", fb_post_id="p",
                  commenter_name="A2", comment_text="x"),
            Reply(tenant_id=tid_b, fb_comment_id="b1", fb_post_id="p",
                  commenter_name="B-SECRET", comment_text="x"),
            Reply(tenant_id=tid_b, fb_comment_id="b2", fb_post_id="p",
                  commenter_name="B-SECRET", comment_text="x"),
            Reply(tenant_id=tid_b, fb_comment_id="b3", fb_post_id="p",
                  commenter_name="B-SECRET", comment_text="x"),
        ])
        await db.commit()

        eng = AgentEngine()
        res_a = await eng._execute("list_stats", {}, db, tenant_id=tid_a, role="editor")
        res_b = await eng._execute("list_stats", {}, db, tenant_id=tid_b, role="editor")
    assert res_a["success"] is True and res_b["success"] is True
    # قبل v10-A4 كانت العدادات عالمية (2+3 للجميع)
    assert res_a["data"]["total_replies"] == 2, res_a
    assert res_b["data"]["total_replies"] == 3, res_b


async def test_a5_agent_create_rule_lands_in_user_tenant(v10_seed):
    """create_rule عبر المحرك: القاعدة تصب في tenant المستخدم ويراها فريقه فقط."""
    from agent_engine import AgentEngine
    from models import Rule

    ua, tid_a, _uida = await v10_seed.tenant_user(tenant_name="Rule-A")
    ub, tid_b, _uidb = await v10_seed.tenant_user(tenant_name="Rule-B")
    async with v10_seed.world.sf() as db:
        eng = AgentEngine()
        res = await eng._execute(
            "create_rule",
            {"name": "v10-agent-rule", "keywords": ["سلام"],
             "reply_template": "أهلاً بك"},
            db, tenant_id=tid_a, role="editor")
        assert res["success"] is True, res
        rule_id = res["data"]["rule_id"]

    async with v10_seed.world.sf() as db:
        rule = await db.get(Rule, rule_id)
        # قبل v10-A5 كانت القاعدة تهبط في tenant 0 (فضاء المنصة)
        assert rule.tenant_id == tid_a, f"rule landed in tenant {rule.tenant_id}, expected {tid_a}"

    # ظهور القاعدة عبر API لمستأجرها، وعدم ظهورها لمستأجر آخر
    v10_seed.auth(ua, tid_a)
    r = await v10_seed.world.client.get("/api/rules")
    names_a = [row["name"] for row in r.json()["data"]]
    assert "v10-agent-rule" in names_a, names_a

    v10_seed.auth(ub, tid_b)
    r = await v10_seed.world.client.get("/api/rules")
    names_b = [row["name"] for row in r.json()["data"]]
    assert "v10-agent-rule" not in names_b, names_b

    async with v10_seed.world.sf() as db:
        orphan = (await db.execute(
            select(Rule).where(Rule.name == "v10-agent-rule", Rule.tenant_id != tid_a)
        )).scalars().all()
        assert orphan == [], f"rule duplicated into foreign tenants: {orphan}"


# ── A6: قناع الأسرار في GET/POST /api/admin/config ──────────────────────────


async def test_a6_admin_config_get_masks_secrets(v10_seed):
    """GET للأدمن: مفاتيح الاعتماد مقنعة (••••+آخر4) والبقية خام."""
    from models import SystemConfig

    plat, _tid, _uid = await v10_seed.platform_admin()
    tg_token = "123456789:" + "A" * 35
    async with v10_seed.world.sf() as db:
        db.add_all([
            SystemConfig(key="telegram_bot_token", value=tg_token, is_secret=True),
            SystemConfig(key="facebook_app_secret", value="f" * 32, is_secret=True),
            SystemConfig(key="openai_api_key", value="sk-PROD-SECRET-987654", is_secret=True),
            SystemConfig(key="gemini_api_key", value="AIza-PROD-SECRET-555", is_secret=True),
            SystemConfig(key="bank_transfer_bank_name", value="مصرف الجمهورية", is_secret=False),
            SystemConfig(key="mobile_wallet_cap", value="150", is_secret=False),
        ])
        await db.commit()

    await v10_seed.login(plat)
    r = await v10_seed.world.client.get("/api/admin/config")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["telegram_bot_token"] == "••••" + "AAAA", data
    assert data["facebook_app_secret"] == "••••" + "ffff", data
    assert data["openai_api_key"] == "••••" + "7654", data
    assert data["gemini_api_key"] == "••••-555", data
    # غير السري يبقى خامًا (الأدمن يحتاج نسخه)
    assert data["bank_transfer_bank_name"] == "مصرف الجمهورية", data
    assert data["mobile_wallet_cap"] == "150", data
    # القيم الخام لا تغادر الخادم إطلاقًا
    for raw in (tg_token, "sk-PROD-SECRET-987654", "AIza-PROD-SECRET-555", "f" * 32):
        assert raw not in r.text, f"raw secret leaked via admin config GET: {raw[:12]}…"


async def test_a6_admin_config_post_ignores_masked_echo(v10_seed):
    """النموذج يعيد القناع كما هو: POST يتجاهله (لا يطمس السر ولا يرفض 400)
    — والقيمة الجديدة الحقيقية تُحفظ."""
    from models import SystemConfig

    plat, _tid, _uid = await v10_seed.platform_admin()
    real_token = "123456789:" + "A" * 35
    async with v10_seed.world.sf() as db:
        db.add(SystemConfig(key="telegram_bot_token", value=real_token, is_secret=True))
        await db.commit()
    await v10_seed.login(plat)

    # 1) صدى القناع يُتجاهل — يبقى السر الحقيقي كما هو
    r = await v10_seed.world.client.post("/api/admin/config", json={
        "config": {"telegram_bot_token": "••••AAAA"},
    })
    assert r.status_code == 200, r.text
    async with v10_seed.world.sf() as db:
        row = (await db.execute(
            select(SystemConfig).where(SystemConfig.key == "telegram_bot_token")
        )).scalar_one()
        assert row.value == real_token, f"mask echo overwrote the real secret: {row.value!r}"

    # 2) قيمة جديدة صالحة تُحفظ فعلاً
    new_token = "999888777:" + "B" * 35
    r = await v10_seed.world.client.post("/api/admin/config", json={
        "config": {"telegram_bot_token": new_token},
    })
    assert r.status_code == 200, r.text
    async with v10_seed.world.sf() as db:
        row = (await db.execute(
            select(SystemConfig).where(SystemConfig.key == "telegram_bot_token")
        )).scalar_one()
        assert row.value == new_token

    # 3) غير السري يمرّ خامًا (جولة ذهاب/عودة عادية)
    r = await v10_seed.world.client.post("/api/admin/config", json={
        "config": {"bank_transfer_bank_name": "مصرف الوحدة"},
    })
    assert r.status_code == 200, r.text
    async with v10_seed.world.sf() as db:
        row = (await db.execute(
            select(SystemConfig).where(SystemConfig.key == "bank_transfer_bank_name")
        )).scalar_one()
        assert row.value == "مصرف الوحدة"


# ── A7: تهريب HTML في تقارير PDF ────────────────────────────────────────────


async def _seed_evil_replies(world, tid: int) -> None:
    from models import Reply, Rule

    async with world.sf() as db:
        evil_rule = Rule(tenant_id=tid, name='<img src=x onerror=alert(2)>',
                         keywords=["evil"], reply_template="r", enabled=True)
        db.add(evil_rule)
        await db.flush()
        db.add_all([
            Reply(tenant_id=tid, fb_comment_id="e1", fb_post_id="p",
                  commenter_name='<script>alert("pwn")</script>',
                  comment_text="x", rule_id=evil_rule.id),
            Reply(tenant_id=tid, fb_comment_id="e2", fb_post_id="p",
                  commenter_name='<script>alert("pwn")</script>',
                  comment_text="x", rule_id=evil_rule.id),
        ])
        await db.commit()


async def test_a7_pdf_escapes_commenter_and_rule_names(v10_seed):
    """أسماء المعلقين والقواعد تظهر مهروبة في HTML التقرير — لا حقن خام."""
    from pdf_reports_engine import BrandingConfig, PdfReportsEngine

    _u, tid, _uid = await v10_seed.tenant_user(tenant_name="PDF-Escape")
    await _seed_evil_replies(v10_seed.world, tid)

    engine = PdfReportsEngine()
    async with v10_seed.world.sf() as s:
        overview = await engine._get_overview(30, s, tid)
        daily = await engine._get_daily_trend(30, s, tid)
        top_rules = await engine._get_top_rules(30, 10, s, tid)
        sentiment = await engine._get_sentiment_trend(30, s, tid)
        commenters = await engine._get_top_commenters(30, 10, s, tid)
        growth = await engine._get_subscriber_growth(30, s, tid)
        assert any("<script>" in (c["name"] or "") for c in commenters), commenters
        assert any("<img" in (r["name"] or "") for r in top_rules), top_rules

        html = engine._build_monthly_html(
            overview, daily, top_rules, sentiment, commenters, growth,
            BrandingConfig(company_name="TestCo"), 30, "period",
        )

    # القيم الخام حقنًا لا تمر — الصورة المهروبة هي الوحيدة الحاضرة
    assert "<script>" not in html, "raw <script> reached the PDF HTML"
    assert "<img src=x" not in html, "raw <img> tag reached the PDF HTML"
    assert "&lt;script&gt;alert(&quot;pwn&quot;)&lt;/script&gt;" in html, html[:400]
    assert "&lt;img src=x onerror=alert(2)&gt;" in html, html[:400]
    # على الجانب الآخر: بيانات المستأجر نفسها حاضرة (التهريب لم يُفقدها)
    assert "alert(" in html


async def test_a7_pdf_escapes_branding_fields(v10_seed):
    """البراند من جسم طلب المستخدم: اسم الشركة/الشعار/العنوان تُهرَّب كلها
    (بما فيها حقن علامات التنصيص في logo_url)."""
    from pdf_reports_engine import BrandingConfig, PdfReportsEngine

    _u, tid, _uid = await v10_seed.tenant_user(tenant_name="PDF-Brand")
    engine = PdfReportsEngine()

    brand = BrandingConfig(
        company_name="<script>EvilCo</script>",
        logo_url='https://evil.example/x.png" onerror="alert(1)',
        primary_color="#dc2626",
    )
    html = engine._build_html(
        ["<div class='section'>body</div>"], brand,
        "<b>title-injection</b>", "<i>subtitle-injection</i>",
    )
    assert "<script>EvilCo</script>" not in html
    assert "<b>title-injection</b>" not in html
    assert "<i>subtitle-injection</i>" not in html
    assert "&lt;script&gt;EvilCo&lt;/script&gt;" in html
    # حقن السمات عبر علامات التنصيص محيّد (escape quote=True)
    assert 'onerror="alert(1)' not in html
    assert "&quot; onerror=&quot;alert(1)" in html


# ── A8: حارس SSRF لروابط الصور ──────────────────────────────────────────────

_UNSAFE_IMAGE_URLS = [
    "http://example.com/pic.jpg",            # مخطط غير https (قابل للاعتراض)
    "https://localhost/pic.jpg",
    "https://sub.localhost/pic.jpg",
    "https://127.0.0.1/pic.jpg",
    "https://127.1/pic.jpg",                 # ترميز رقمي قصير → loopback
    "https://2130706433/pic.jpg",            # int → 127.0.0.1
    "https://0x7f000001/pic.jpg",            # hex → 127.0.0.1
    "https://192.168.1.10/pic.jpg",
    "https://10.0.0.5/pic.jpg",
    "https://172.16.0.1/pic.jpg",
    "https://169.254.169.254/latest/meta-data/",  # cloud metadata
    "https://0.0.0.0/pic.jpg",
]


@pytest.mark.parametrize("url", _UNSAFE_IMAGE_URLS)
async def test_a8_unsafe_image_urls_rejected(url):
    """كل صيغة مضيف داخلي/خاص أو مخطط غير https → UnsafeImageUrlError عربية."""
    from ai_service import UnsafeImageUrlError, _assert_safe_image_url

    with pytest.raises(UnsafeImageUrlError) as exc_info:
        _assert_safe_image_url(url)
    assert "رابط الصورة مرفوض" in str(exc_info.value)


async def test_a8_public_https_urls_accepted():
    """https عام سليم يمر عبر الحارس بلا استثناء."""
    from ai_service import _assert_safe_image_url

    _assert_safe_image_url("https://example.com/pic.jpg")
    _assert_safe_image_url("https://cdn.example.net/a/b/photo.png")
    _assert_safe_image_url("https://lh3.googleusercontent.com/some=token")


async def test_a8_agent_image_analyze_surfaces_rejection(v10_seed, monkeypatch):
    """عبر محرك الوكيل: الرابط غير الآمن → رفض رسالة عربية مضبوطة للمستخدم
    (لا تفاصيل داخلية) — مع توفّر مزود AI (متشكلًا) ليُختبر مسار الفحص."""
    import ai_service as ai_mod
    from agent_engine import AgentEngine

    monkeypatch.setattr(ai_mod.AIService, "available", property(lambda self: True))
    _u, tid, _uid = await v10_seed.tenant_user(tenant_name="SSRF")

    async with v10_seed.world.sf() as db:
        eng = AgentEngine()
        res = await eng._execute(
            "image_analyze", {"image_url": "http://169.254.169.254/latest/meta-data/"},
            db, tenant_id=tid, role="viewer")
    assert res["success"] is False, res
    assert "رابط الصورة مرفوض" in res["message_ar"], res


# ── A9: لا تسريب str(e) للعميل ──────────────────────────────────────────────


async def test_a9_agent_execute_error_is_generic(v10_seed, monkeypatch):
    """خطأ داخلي أثناء _execute → رسالة عامة عربية؛ لا أثر لتفاصيل الخطأ."""
    import agent_engine as agent_mod
    from agent_engine import AgentEngine

    def _boom():
        raise RuntimeError("SECRET-INTERNAL-DB-PATH-XYZ: deadlock at /var/lib/db")

    monkeypatch.setattr(agent_mod, "_get_fb", _boom)
    _u, tid, _uid = await v10_seed.tenant_user(tenant_name="A9")

    async with v10_seed.world.sf() as db:
        eng = AgentEngine()
        res = await eng._execute("publish_post", {"message": "hi"}, db,
                                 tenant_id=tid, role="admin")
    assert res["success"] is False, res
    assert "حدث خطأ" in res["message_ar"], res
    assert "SECRET-INTERNAL-DB-PATH-XYZ" not in res["message_ar"], res
    assert "deadlock" not in res["message_ar"], res


# ── D1: سقف المحفظة من SystemConfig ─────────────────────────────────────────


async def test_d1_wallet_cap_enforced_from_system_config(v10_seed, monkeypatch):
    """mobile_wallet_cap=150 في SystemConfig: شحن 151 → 400، و149 → مقبول.
    (قبل v10-D1 كان السقف مجمدًا على قيمة البيئة وتعديل الأدمن تجميليًا)."""
    import routers.payments as payments_mod
    from models import SystemConfig

    monkeypatch.setattr(payments_mod.wallet, "AsyncSessionLocal", v10_seed.world.sf)  # v13-L4: limiter lives in payments.wallet
    buyer, tid, _uid = await v10_seed.tenant_user(tenant_name="D1-Cap")
    async with v10_seed.world.sf() as db:
        db.add(SystemConfig(key="mobile_wallet_cap", value="150", is_secret=False))
        await db.commit()
    await v10_seed.login(buyer)

    r = await v10_seed.world.client.post("/api/payments/topup", json={
        "amount": 151, "provider": "liyana", "phone": "0912345678",
    })
    assert r.status_code == 400, r.text
    assert "بنكي" in r.json()["detail"], r.text
    assert "150" in r.json()["detail"], r.text  # الرسالة بالسقف الفعلي من DB

    r2 = await v10_seed.world.client.post("/api/payments/topup", json={
        "amount": 149, "provider": "madar", "phone": "0912345678",
    })
    assert r2.status_code == 200, r2.text
    assert r2.json()["data"]["payment_id"] > 0, r2.text


async def test_d1_wallet_cap_env_fallback_without_db_row(v10_seed, monkeypatch):
    """بلا صف في SystemConfig: السقف يعود لقيمة البيئة (MOBILE_WALLET_CAP)."""
    import routers.payments as payments_mod
    from config import settings

    monkeypatch.setattr(payments_mod.wallet, "AsyncSessionLocal", v10_seed.world.sf)  # v13-L4: limiter lives in payments.wallet
    buyer, _tid, _uid = await v10_seed.tenant_user(tenant_name="D1-Env")
    await v10_seed.login(buyer)

    cap = float(settings.MOBILE_WALLET_CAP)
    r = await v10_seed.world.client.post("/api/payments/topup", json={
        "amount": cap + 1, "provider": "liyana", "phone": "0912345678",
    })
    assert r.status_code == 400, r.text
    assert "بنكي" in r.json()["detail"], r.text

    r2 = await v10_seed.world.client.post("/api/payments/topup", json={
        "amount": cap - 1, "provider": "liyana", "phone": "0912345678",
    })
    assert r2.status_code == 200, r2.text


# ── D2: عقد تذاكر الدعم {items, total} داخل data ────────────────────────────


async def test_d2_support_tickets_envelope_shape(v10_seed):
    """GET /api/support/tickets → {success, data:{items:[...], total:N}}
    — total داخل data (عقد unwrapApi الموحد) وليس شقيقًا للغلاف."""
    from models import SupportTicket

    ua, tid_a, _uida = await v10_seed.tenant_user(tenant_name="D2-A")
    _ub, tid_b, _uidb = await v10_seed.tenant_user(tenant_name="D2-B")
    async with v10_seed.world.sf() as db:
        db.add_all([
            SupportTicket(tenant_id=tid_a, user_id=1, email="a@t.ly",
                          subject="s1", body="b" * 20, priority="medium", status="open"),
            SupportTicket(tenant_id=tid_a, user_id=1, email="a@t.ly",
                          subject="s2", body="b" * 20, priority="high", status="open"),
            SupportTicket(tenant_id=tid_b, user_id=2, email="b@t.ly",
                          subject="B-SECRET", body="b" * 20, priority="low", status="open"),
        ])
        await db.commit()

    await v10_seed.login(ua)
    r = await v10_seed.world.client.get("/api/support/tickets")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True, body
    # total لم يعد شقيق data (نقطة S2 الكاسرة لعقد unwrapApi)
    assert "total" not in body, f"total still a sibling of data: {body.keys()}"
    data = body["data"]
    assert set(data.keys()) == {"items", "total"}, data.keys()
    assert isinstance(data["items"], list) and len(data["items"]) == 2
    assert data["total"] == 2
    subjects = {t["subject"] for t in data["items"]}
    assert "B-SECRET" not in subjects  # عزل المستأجر محفوظ في العقد الجديد


# ── D3: عقد 404/405 الموحد تحت /api ─────────────────────────────────────────


async def test_d3_unknown_api_get_404_json_arabic(v10_world):
    """GET لمسار API مجهول → 404 JSON {detail} عربي (لا HTML فارغ)."""
    r = await v10_world.client.get("/api/v10-definitely-not-here")
    assert r.status_code == 404, r.text
    assert r.headers["content-type"].startswith("application/json"), r.headers
    assert r.json()["detail"] == "المسار غير موجود"


async def test_d3_unknown_api_post_404_json_arabic(v10_world):
    """POST لمسار API مجهول → 404 JSON عربي (لا 405 إنجليزي)."""
    r = await v10_world.client.post("/api/v10-definitely-not-here", json={"x": 1})
    assert r.status_code == 404, r.text
    assert r.headers["content-type"].startswith("application/json"), r.headers
    assert r.json()["detail"] == "المسار غير موجود"


async def test_d3_wrong_method_on_real_route_405_with_allow(v10_world):
    """DELETE على /api/config (GET-only) → 405 عربي + ترويسة Allow: GET."""
    r = await v10_world.client.delete("/api/config")
    assert r.status_code == 405, r.text
    allow = r.headers.get("allow", "")
    assert "GET" in allow, f"missing Allow header: {dict(r.headers)}"
    assert "الطريقة غير مسموح بها" in r.json()["detail"], r.text


async def test_d3_spa_get_still_serves_html(v10_world):
    """D3 لم يكسر SPA: /dashboard يظل 200 HTML (ليس 404 JSON)."""
    r = await v10_world.client.get("/dashboard")
    assert r.status_code == 200, r.text
    assert "text/html" in r.headers["content-type"], r.headers


# ── B3: صفر نداءات Graph بلا اعتمادات ────────────────────────────────────────


async def test_b3_bundle_zero_graph_calls_without_credentials(v10_seed, monkeypatch):
    """/api/dashboard/bundle لمستأجر غير مربوط وبيئة بلا توكن: ينجح بلا أي
    نداء Graph (كان نداء ضائع 100-600ms + ERROR لكل تحميل)."""
    import routers.dashboard_stats as ds_mod

    calls: list[int] = []

    class RecorderFB:
        async def get_page_fan_count(self):
            calls.append(1)
            return 1234

    async def no_tenant_fb(_tid):
        return None

    monkeypatch.setattr(ds_mod, "fb", RecorderFB())
    monkeypatch.setattr(ds_mod, "get_tenant_fb_client", no_tenant_fb)

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="B3")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/dashboard/bundle")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["connection"]["connected"] is False, data["connection"]
    assert calls == [], f"Graph was called {len(calls)} time(s) without credentials"
    assert data["stats"]["fan_count"] == 0  # لا رقم معجبين بدون مصدر


async def test_b3_bundle_graph_called_when_credentials_exist(v10_seed, monkeypatch):
    """الشاهد المضاد: عند وجود اعتمادات عامة يظل النداء يحدث (السلوك القديم
    محفوظ) — يثبت أن اختبار «صفر نداءات» أعلاه يقيس شيئًا حقيقيًا."""
    import routers.dashboard_stats as ds_mod

    calls: list[int] = []

    class RecorderFB:
        async def get_page_fan_count(self):
            calls.append(1)
            return 4321

    async def no_tenant_fb(_tid):
        return None

    monkeypatch.setattr(ds_mod, "fb", RecorderFB())
    monkeypatch.setattr(ds_mod, "get_tenant_fb_client", no_tenant_fb)
    monkeypatch.setattr(ds_mod, "has_global_fb_credentials", lambda: True)

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="B3-Pos")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/dashboard/bundle")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert calls == [1], "expected exactly one Graph call with credentials present"
    assert data["connection"]["connected"] is True, data["connection"]
    assert data["stats"]["fan_count"] == 4321, data["stats"]
