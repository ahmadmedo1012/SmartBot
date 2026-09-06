"""v12 §1 (المسار E1) — اختبارات انحدار أمن المحركات (Hermetic، لا شبكة).

تثبّت إصلاحات خطة v12 المسار E1:
  [x] E1.1 — BOLA عابر للمستأجرين في وسوم المشتركين: add_tag/remove_tag
        ترفض ربط/فك وسمٍ لا يملكه المستأجر (المشترك والوسم معًا)، وget_detail
        لا يسرّب وسوم مستأجر آخر عبر روابط subscriber_tags قديمة.
  [x] E1.2 — find-or-create بنطاق المستأجر: get_or_create لا يعيد صف مستأجر
        آخر لنفس fb_user_id وينشئ الصف بtenant_id، وcreate_tag يقبل الاسم
        نفسه لمستأجرين مختلفين (الفحص القديم كان عالميًا).
  [x] E1.3 — SSRF: post_to_page_with_image يرفض الروابط غير الآمنة قبل بناء
        أي عميل HTTP (لا جلب إطلاقًا) وينشر نصًا فقط.
  [x] E1.4 — PDF: primary_color خارج نمط hex يرفع ValueError (لا حقن CSS)
        وlogo_url غير الآمن يرفع UnsafeImageUrlError (لا SSRF في WeasyPrint).
  [x] E1.5 — Fernet لاعتمادات الناشر: الحفظ مشفّر (لا نص صريح في bot_state)
        + قراءة ذهاب/إياب + سقوط آمن للصفوف القديمة نصًا صريحًا.
  [x] E1.6 — المحفظة: Decimal بثلاث منازل (قروش LYD لا تُقتطع) + قرض ذرّي
        واحد + تحديث صف قديم «0» نصي.
  [x] E1.7/E1.8 — الفهارس وtoken_ver معرفة في النموذج وفي ترحيل 011 (فحص
        بنيوي — تشغيل alembic الحقيقي عند E6).
  [x] E1.9 — حدود Shopify مقيدة 1..100.

غير المغطى هنا مباشرة (يُوثَّق في worklog): فرع CRM في pipeline.py — يحتاج
كومة البوت كاملة (FBClient/dedup/matcher) — التغيير سطر واحد مُراجَع.
"""

from __future__ import annotations

import os
import sys
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))


# ── E1.1 — BOLA عابر للمستأجرين في الوسوم ───────────────────────────────────


async def _seed_two_tenants_with_tags(v10_world):
    """مستأجران + مشترك في كل واحد + وسم «vip» في كل واحد."""
    from models import Subscriber, Tag, Tenant

    async with v10_world.sf() as db:
        ta = Tenant(name="E1-TA")
        tb = Tenant(name="E1-TB")
        db.add_all([ta, tb])
        await db.flush()
        sub_a = Subscriber(tenant_id=ta.id, fb_user_id="fb_e1_sub_a", name="أحمد")
        sub_b = Subscriber(tenant_id=tb.id, fb_user_id="fb_e1_sub_b", name="سالم")
        tag_a = Tag(tenant_id=ta.id, name="vip", color="#dc2626")
        tag_b = Tag(tenant_id=tb.id, name="vip", color="#2563eb")
        db.add_all([sub_a, sub_b, tag_a, tag_b])
        await db.commit()
        return ta.id, tb.id, sub_a.id, sub_b.id, tag_a.id, tag_b.id


async def test_add_tag_rejects_cross_tenant_ids(v10_world):
    """B يوسم مشترك A بوسمه → False؛ A يوسم وسم B → False؛ الصف المشروع → True.
    لا يُكتب أي رابط للمحاولات المرفوضة."""
    from models import SubscriberTag
    from subscriber_engine import SubscriberEngine

    ta, tb, sub_a, _sub_b, tag_a, tag_b = await _seed_two_tenants_with_tags(v10_world)
    eng = SubscriberEngine()
    async with v10_world.sf() as db:
        # وسم B على مشترك A باسم B (المشترك ليس ملكه) → مرفوض
        assert await eng.add_tag(sub_a, tag_b, db, tenant_id=tb) is False
        # وسم B على مشترك A باسم A (الوسم ليس ملكه) → مرفوض
        assert await eng.add_tag(sub_a, tag_b, db, tenant_id=ta) is False
        # الصف المشروع: مشترك A + وسم A باسم A → True
        assert await eng.add_tag(sub_a, tag_a, db, tenant_id=ta) is True

        links = (await db.execute(select(SubscriberTag))).scalars().all()
        assert len(links) == 1
        assert links[0].subscriber_id == sub_a and links[0].tag_id == tag_a


async def test_remove_tag_rejects_cross_tenant_and_keeps_link(v10_world):
    """فك الوسم بنفس حارس الملكية: B لا يفك وسم A، والرابط يبقى حتى يفكه A."""
    from models import SubscriberTag
    from subscriber_engine import SubscriberEngine

    ta, tb, sub_a, _sub_b, tag_a, _tag_b = await _seed_two_tenants_with_tags(v10_world)
    eng = SubscriberEngine()
    async with v10_world.sf() as db:
        assert await eng.add_tag(sub_a, tag_a, db, tenant_id=ta) is True
        # B يحاول فك رابط A → False والرابط باقٍ
        assert await eng.remove_tag(sub_a, tag_a, db, tenant_id=tb) is False
        links = (await db.execute(select(SubscriberTag))).scalars().all()
        assert len(links) == 1
        # A يفك وسمه → True ويختفي الرابط
        assert await eng.remove_tag(sub_a, tag_a, db, tenant_id=ta) is True
        links = (await db.execute(select(SubscriberTag))).scalars().all()
        assert links == []


async def test_get_detail_hides_foreign_tenant_tags(v10_world):
    """روابط subscriber_tags قديمة عابرة للمستأجرين لا تظهر في تفاصيل
    المشترك — وصلة الوسم ترشّح Tag.tenant_id."""
    from models import SubscriberTag
    from subscriber_engine import SubscriberEngine

    ta, _tb, sub_a, _sub_b, tag_a, tag_b = await _seed_two_tenants_with_tags(v10_world)
    eng = SubscriberEngine()
    async with v10_world.sf() as db:
        # رابط مشروع + رابط قديم عابر (كتبه المسار القديم قبل الحارس)
        db.add(SubscriberTag(subscriber_id=sub_a, tag_id=tag_a))
        db.add(SubscriberTag(subscriber_id=sub_a, tag_id=tag_b))
        await db.commit()

        detail = await eng.get_detail(sub_a, db, tenant_id=ta)
        assert detail is not None
        tag_ids = {t["id"] for t in detail["tags"]}
        assert tag_a in tag_ids
        assert tag_b not in tag_ids


# ── E1.2 — find-or-create بنطاق المستأجر ────────────────────────────────────


async def test_get_or_create_is_tenant_scoped(v10_world):
    """نفس fb_user_id لمستأجرين مختلفين → صفان منفصلان؛ إعادة الاستدعاء
    داخل نفس المستأجر تعيد الصف نفسه؛ الصف المنشأ يحمل tenant_id."""
    from models import Subscriber, Tenant
    from subscriber_engine import SubscriberEngine

    eng = SubscriberEngine()
    async with v10_world.sf() as db:
        ta = Tenant(name="E1-GC-A")
        tb = Tenant(name="E1-GC-B")
        db.add_all([ta, tb])
        await db.commit()

        first = await eng.get_or_create("fb_e1_shared", name="مروان", session=db, tenant_id=ta.id)
        assert first.tenant_id == ta.id

        # المستأجر B لا يعيد صف A لنفس المستخدم — ينشئ صفه الخاص
        second = await eng.get_or_create("fb_e1_shared", name="مروان", session=db, tenant_id=tb.id)
        assert second.id != first.id
        assert second.tenant_id == tb.id

        # إعادة الاستدعاء داخل A تعيد الصف نفسه (لا تكرار)
        again = await eng.get_or_create("fb_e1_shared", session=db, tenant_id=ta.id)
        assert again.id == first.id

        rows = (await db.execute(
            select(Subscriber).where(Subscriber.fb_user_id == "fb_e1_shared"))).scalars().all()
        assert {r.tenant_id for r in rows} == {ta.id, tb.id}


async def test_create_tag_uniqueness_is_tenant_scoped(v10_world):
    """اسم الوسم نفسه مسموح لمستأجرين مختلفين (الفحص القديم كان عالميًا
    يرفض زورًا)؛ التكرار داخل المستأجر نفسه يرفع ValueError."""
    from models import Tag, Tenant
    from subscriber_engine import TagEngine

    eng = TagEngine()
    async with v10_world.sf() as db:
        ta = Tenant(name="E1-TAG-A")
        tb = Tenant(name="E1-TAG-B")
        db.add_all([ta, tb])
        await db.commit()

        await eng.create_tag("مهم", "#111111", db, tenant_id=ta.id)
        # نفس الاسم لمستأجر آخر → يُقبل
        tag_b = await eng.create_tag("مهم", "#222222", db, tenant_id=tb.id)
        assert tag_b["name"] == "مهم"
        # التكرار داخل نفس المستأجر → مرفوض
        with pytest.raises(ValueError):
            await eng.create_tag("مهم", "#333333", db, tenant_id=ta.id)

        rows = (await db.execute(select(Tag).where(Tag.name == "مهم"))).scalars().all()
        assert {r.tenant_id for r in rows} == {ta.id, tb.id}


# ── E1.3 — SSRF في نشر الصور ────────────────────────────────────────────────


async def test_post_to_page_with_image_rejects_unsafe_urls_before_fetch(monkeypatch):
    """الرابط غير الآمن يُرفض قبل بناء أي عميل HTTP (لا جلب على الإطلاق)
    وينشر النص فقط — نفس عقد التدهور القائم للصور غير القابلة للاستخدام."""
    import fb_client as fb_mod
    from fb_client import FBClient

    fb = FBClient("tok", "page_e1")
    text_posts: list[str] = []

    async def _fake_text_post(message: str):
        text_posts.append(message)
        return {"id": "txt_only"}

    monkeypatch.setattr(fb, "post_to_page", _fake_text_post)

    async def _no_http():
        raise AssertionError("HTTP client built before the SSRF guard ran")

    monkeypatch.setattr(fb_mod, "_ensure_client", _no_http)

    unsafe = [
        "http://example.com/banner.png",             # مخطط غير https
        "https://169.254.169.254/latest/meta-data",  # link-local / metadata
        "https://localhost/banner.png",              # loopback بالاسم
        "https://10.1.2.3/banner.png",               # شبكة خاصة
        "https://127.1/banner.png",                  # ترميز رقمي للـloopback
        "ليس رابطًا",                                  # ليس URL أصلًا
    ]
    for url in unsafe:
        result = await fb.post_to_page_with_image("منشور", url)
        assert result == {"id": "txt_only"}, f"unsafe url must degrade to text post: {url}"
    assert text_posts == ["منشور"] * len(unsafe)


# ── E1.4 — PDF: حقن CSS + SSRF للشعار ───────────────────────────────────────


def test_branding_primary_color_rejects_css_injection():
    """primary_color خارج نمط #hex (3..8 خانات) → ValueError — لا يدخل _css()."""
    from pdf_reports_engine import BrandingConfig

    bad_colors = [
        "#dc2626; } body { display:none",  # حقن CSS
        "red",                              # اسم لون
        "",                                 # فارغ
        "#12",                              # خانتان فقط
        "#123456789",                       # 9 خانات
        "dc2626",                           # بلا #
        "#gggggg",                          # ليس hex
        "javascript:alert(1)",              # مخطط
    ]
    for bad in bad_colors:
        with pytest.raises(ValueError):
            BrandingConfig(primary_color=bad)

    for good in ["#abc", "#abcd", "#dc2626", "#DC2626", "#dc262680"]:
        assert BrandingConfig(primary_color=good).primary_color == good
    # البناء الافتراضي سليم (يعمل مسار التقارير بلا branding)
    assert BrandingConfig().primary_color == "#dc2626"


def test_branding_logo_url_rejects_ssrf_targets():
    """logo_url يجلبه WeasyPrint من الخادم — حارس SSRF يرفع قبل الدخول
    إلى <img src=…>؛ الرابط الفارغ (لا شعار) والhttps العام مسموحان."""
    from ai_service import UnsafeImageUrlError
    from pdf_reports_engine import BrandingConfig

    bad_urls = [
        "http://cdn.example.com/logo.png",        # مخطط غير https
        "https://169.254.169.254/logo.png",       # metadata
        "https://localhost/logo.png",             # loopback
        "https://192.168.0.10/logo.png",          # خاص
    ]
    for bad in bad_urls:
        with pytest.raises(UnsafeImageUrlError):
            BrandingConfig(logo_url=bad)

    ok = BrandingConfig(logo_url="https://cdn.example.com/logo.png")
    assert ok.logo_url == "https://cdn.example.com/logo.png"
    BrandingConfig(logo_url="")  # لا شعار — مسموح


# ── E1.5 — اعتمادات الناشر: Fernet + سقوط للقديم ────────────────────────────


async def test_publisher_x_credentials_fernet_roundtrip(v10_world):
    """الحفظ يشفّر الحقول السرية (لا نص صريح في bot_state) والقراءة
    تفك التشفير وتعيد الناشر مضبوطًا."""
    from models import BotState
    from publisher_engine import PublisherEngine

    eng = PublisherEngine()
    async with v10_world.sf() as db:
        assert await eng.save_credentials(db, "x", {
            "api_key": "k1", "api_secret": "s1",
            "access_token": "t1", "access_secret": "sc1",
        }, tenant_id=41) is True

        rows = {r.key: r.value for r in (await db.execute(
            select(BotState).where(BotState.tenant_id == 41,
                                   BotState.key.like("publisher_x_%")))).scalars()}
        assert set(rows) == {"publisher_x_api_key", "publisher_x_api_secret",
                             "publisher_x_access_token", "publisher_x_access_secret"}
        # لا نص صريح — القيم رموز Fernet (base64 طويلة)
        for plaintext in ("k1", "s1", "t1", "sc1"):
            assert plaintext not in rows.values()
        assert all(len(v) > 40 for v in rows.values())

    eng2 = PublisherEngine()
    async with v10_world.sf() as db:
        await eng2.load_credentials(db, tenant_id=41)
        assert eng2.x.is_configured() is True
        assert eng2.x.api_key == "k1"
        assert eng2.x.api_secret == "s1"
        assert eng2.x.access_token == "t1"
        assert eng2.x.access_secret == "sc1"


async def test_publisher_linkedin_token_encrypted_org_id_plain(v10_world):
    """الحقول السرية فقط تُشفَّر (access_token)؛ organization_id معرّف عام
    يبقى نصًا — والقراءة تعيد الاثنين كما هما."""
    from models import BotState
    from publisher_engine import PublisherEngine

    eng = PublisherEngine()
    async with v10_world.sf() as db:
        await eng.save_credentials(db, "linkedin",
                                   {"access_token": "li-tok", "organization_id": "org9"},
                                   tenant_id=42)
        rows = {r.key: r.value for r in (await db.execute(
            select(BotState).where(BotState.tenant_id == 42,
                                   BotState.key.like("publisher_linkedin_%")))).scalars()}
        assert rows["publisher_linkedin_organization_id"] == "org9"
        assert rows["publisher_linkedin_access_token"] != "li-tok"
        assert "li-tok" not in rows["publisher_linkedin_access_token"]

    eng2 = PublisherEngine()
    async with v10_world.sf() as db:
        await eng2.load_credentials(db, tenant_id=42)
        assert eng2.linkedin.is_configured() is True
        assert eng2.linkedin.access_token == "li-tok"
        assert eng2.linkedin.organization_id == "org9"


async def test_publisher_legacy_plaintext_credentials_still_load(v10_world):
    """صفوف كُتبت نصًا صريحًا قبل التشفير (توافق خلفي): فك التشفير يفشل
    فتُرجع القيمة كما هي — المستأجرون الحاليون لا ينكسرون."""
    from models import BotState
    from publisher_engine import PublisherEngine

    async with v10_world.sf() as db:
        db.add(BotState(tenant_id=43, key="publisher_x_api_key", value="legacy-plain"))
        db.add(BotState(tenant_id=43, key="publisher_x_api_secret", value="legacy-sec"))
        db.add(BotState(tenant_id=43, key="publisher_x_access_token", value="legacy-tok"))
        db.add(BotState(tenant_id=43, key="publisher_x_access_secret", value="legacy-as"))
        await db.commit()

    eng = PublisherEngine()
    async with v10_world.sf() as db:
        await eng.load_credentials(db, tenant_id=43)
        assert eng.x.is_configured() is True
        assert eng.x.api_key == "legacy-plain"
        assert eng.x.access_token == "legacy-tok"


# ── E1.6 — المحفظة: دقة القروش + القرص الذرّي ────────────────────────────────


def test_to_wallet_decimal_normalizes_types():
    """Decimal/float/str/int → Decimal بثلاث منازل؛ القيمة غير الرقمية → 0.000."""
    from _wallet import to_wallet_decimal

    assert str(to_wallet_decimal(Decimal("10.999"))) == "10.999"
    assert str(to_wallet_decimal(0.499)) == "0.499"
    assert str(to_wallet_decimal("2.5")) == "2.500"
    assert str(to_wallet_decimal(10)) == "10.000"
    assert str(to_wallet_decimal(None)) == "0.000"
    assert str(to_wallet_decimal("ليس رقمًا")) == "0.000"


async def test_wallet_credit_preserves_lyd_millimes(v10_world):
    """قروش LYD لا تُقتطع (القديم int(float()) كان يحوّل 0.499 إلى 0)،
    والقرض يُنشئ الصف عند غيابه ويجمع تراكميًا بدقة 0.001."""
    from _wallet import credit_wallet, get_wallet_balance

    async with v10_world.sf() as db:
        assert str(await get_wallet_balance(db, 51)) == "0.000"

        bal = await credit_wallet(db, 51, 0.499)
        assert str(bal) == "0.499"
        bal = await credit_wallet(db, 51, "10.126")
        assert str(bal) == "10.625"
        bal = await credit_wallet(db, 51, Decimal("0.005"))
        assert str(bal) == "10.630"
        await db.commit()

    # قراءة جديدة بعد الالتزام — القيمة مثبتة نصًا في bot_state
    async with v10_world.sf() as db:
        assert str(await get_wallet_balance(db, 51)) == "10.630"


async def test_wallet_credit_updates_legacy_text_row(v10_world):
    """رصيد قديم نصي («0») يُحدَّث في مكانه بعملية واحدة — لا صف مكرر
    (uq_botstate_tenant_key) ولا استثناء."""
    from _wallet import credit_wallet, get_wallet_balance
    from models import BotState

    async with v10_world.sf() as db:
        db.add(BotState(tenant_id=52, key="balance", value="0"))
        await db.commit()

        bal = await credit_wallet(db, 52, Decimal("5.500"))
        assert str(bal) == "5.500"

        rows = (await db.execute(
            select(BotState).where(BotState.tenant_id == 52))).scalars().all()
        assert len(rows) == 1
        assert str(await get_wallet_balance(db, 52)) == "5.500"


# ── E1.7/E1.8 — الفهارس وtoken_ver (فحص بنيوي) ──────────────────────────────


def test_models_define_v12_indexes_and_token_ver():
    """النماذج تعلن فهارس E1.7 وعمود users.token_ver (E1.8)."""
    import models

    def _index_names(table):
        return {ix.name for ix in table.indexes}

    assert "ix_botstate_key_value" in _index_names(models.BotState.__table__)
    assert "ix_ai_suggestion_tenant_created" in _index_names(models.AISuggestion.__table__)
    assert "ix_payment_request_tenant_created" in _index_names(models.PaymentRequest.__table__)
    assert "ix_sub_payment_tenant_status_created" in _index_names(
        models.SubscriptionPayment.__table__)
    assert "ix_broadcast_tenant_created" in _index_names(models.Broadcast.__table__)
    assert "ix_bot_alert_tenant_resolved_created" in _index_names(models.BotAlert.__table__)
    assert "ix_sub_tenant_platform_status" in _index_names(models.Subscriber.__table__)

    # E1.8 — token_ver عمود صحيح غير فارغ بقيمة افتراضية 0
    col = models.User.__table__.columns.get("token_ver")
    assert col is not None
    assert col.nullable is False


def test_migration_011_declares_same_indexes_and_chains_to_010():
    """ترحيل 011 يعلن الفهارس السبعة نفسها + إضافة token_ver، وسلسلته
    down_revision = "010" (تشغيل الترحيل الفعلي على قاعدة حقيقية عند E6)."""
    path = Path(__file__).resolve().parent.parent / "alembic" / "versions" / "011_v12_indexes.py"
    src = path.read_text(encoding="utf-8")

    assert 'down_revision = "010"' in src
    for name in (
        "ix_botstate_key_value",
        "ix_ai_suggestion_tenant_created",
        "ix_payment_request_tenant_created",
        "ix_sub_payment_tenant_status_created",
        "ix_broadcast_tenant_created",
        "ix_bot_alert_tenant_resolved_created",
        "ix_sub_tenant_platform_status",
    ):
        assert name in src, name
    assert "token_ver" in src
    assert "op.add_column" in src
    assert "def downgrade" in src


# ── E1.9 — حدود Shopify ─────────────────────────────────────────────────────


async def test_shopify_limit_clamped_1_to_100(monkeypatch):
    """limit يُقيَّد 1..100 (والقيمة غير الرقمية → 10) قبل أي نداء إلى
    Shopify — لا يُمرَّر حد عملاق إلى المتجر."""
    import httpx
    from commerce_engine import ShopifyIntegration

    calls: list[dict] = []

    class _Resp:
        status_code = 200

        def json(self):
            return {"orders": [], "products": []}

    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, headers=None, params=None):
            calls.append({"url": url, "params": dict(params or {})})
            return _Resp()

    monkeypatch.setattr(httpx, "AsyncClient", _Client)
    shop = ShopifyIntegration(store_domain="e1.myshopify.com", access_token="t")

    assert shop.is_configured() is True
    await shop.get_orders(limit=5000)
    await shop.get_orders(limit=0)
    await shop.get_orders(limit="abc")
    await shop.get_products(limit=-3)

    assert calls[0]["params"]["limit"] == 100
    assert calls[1]["params"]["limit"] == 1
    assert calls[2]["params"]["limit"] == 10
    assert calls[3]["params"]["limit"] == 1
