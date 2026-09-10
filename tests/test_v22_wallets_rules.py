"""v22 FIX-C (domains 3+5) — wallet network-mapping regression + rules fixes.

Three guarded behaviors:

1. **Wallet mapping (W1-D5 Bug #2 — RE-VERIFIED, false positive).**
   The wave-1 finding assumed «091=Libyana, 094=Al Madar»; Libya's OFFICIAL
   operator assignments are the inverse (Libyana prefixes 092/094 — the
   libyana.ly transfer example ``*122*092/94XXXXXXX*1000#``; Al Madar
   prefixes 091/093 — wazi.almadar.ly «091/093»; en.wikipedia «Telephone
   numbers in Libya»). Production SystemConfig (SELECT 2026-09-10):
   ``balance_transfer_phone_1='0910089975'`` (Al Madar number) under the
   مدار key ✓ and ``balance_transfer_phone_2='0942119637'`` (Libyana
   number) under the ليبيانا key ✓ — the live tabs were already correct.
   These tests pin the /api/config key contract with the PRODUCTION values
   so no future "swap fix" can cross the money path (the frontend tab side
   is pinned by PaymentDialog.test.tsx «wallet network mapping»; the env
   fallback side by test_phase_b_payments.py::test_config_env_fallbacks).

2. **D3-B1 — max_rules plan limit is enforced on create** (was NEVER
   checked: a Free tenant created 8 rules live in wave 1). Gate mirrors the
   team-limit precedent (users.py v17-E-B2): get_plan_limits read, plan row
   fetch, 403 Arabic ``حد قواعد الرد لخطتك هو {n} — رقِّ خطتك``. Count
   semantics = TOTAL rules of the tenant (the «N قواعد رد» plan promise is
   the rule-book size — same doctrine as max_team counting every seat).

3. **D3-B2 — keywords that resolve to an empty list are rejected**
   (``" , , "`` used to pass the raw-string check, store ``keywords=[]``
   and become an implicit catch-all that answered EVERY comment).
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
from sqlalchemy import func, select

# Production values (SELECT-verified 2026-09-10) — the regression fixtures.
PROD_MADAR_PHONE = "0910089975"    # balance_transfer_phone_1 — 091 = Al Madar prefix
PROD_LIBYANA_PHONE = "0942119637"  # balance_transfer_phone_2 — 094 = Libyana prefix


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


def _clear_config_cache() -> None:
    from _services import api_cache
    api_cache.clear_all()


# ═══════════════════════════════════════════════════════════════════════════
# 1. Wallet network mapping — /api/config key contract (production values)
# ═══════════════════════════════════════════════════════════════════════════

async def test_config_wallet_keys_carry_production_numbers(app_client):
    """DB rows win: phone_1 (مدار key) = 0910089975, phone_2 (ليبيانا key) =
    0942119637 — each key answers with the number whose PREFIX belongs to
    that key's network (091→Al Madar, 094→Libyana). If a future change swaps
    the key→network mapping, this test (plus the frontend twin) goes red
    BEFORE any user transfers money to the wrong network."""
    from database import AsyncSessionLocal
    from models import SystemConfig

    async with AsyncSessionLocal() as db:
        for key, value in (("balance_transfer_phone_1", PROD_MADAR_PHONE),
                           ("balance_transfer_phone_2", PROD_LIBYANA_PHONE)):
            row = (await db.execute(
                select(SystemConfig).where(SystemConfig.key == key)
            )).scalar_one_or_none()
            if row is None:
                db.add(SystemConfig(key=key, value=value, is_secret=False))
            else:
                row.value = value
                row.is_secret = False
        await db.commit()
    _clear_config_cache()

    r = await app_client.get("/api/config")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    # key→network contract (see plans_config.py allowlist + admin settings labels)
    assert data["balance_transfer_phone_1"] == PROD_MADAR_PHONE      # مدار  (091…)
    assert data["balance_transfer_phone_2"] == PROD_LIBYANA_PHONE    # ليبيانا (094…)
    # prefix ground truth: the مدار-key number is an Al-Madar-prefix number,
    # the ليبيانا-key number is a Libyana-prefix number (never crossed)
    assert data["balance_transfer_phone_1"].startswith("091")
    assert data["balance_transfer_phone_2"].startswith("094")


# ═══════════════════════════════════════════════════════════════════════════
# 2. D3-B1 — max_rules plan-limit enforcement on rule creation
# ═══════════════════════════════════════════════════════════════════════════

async def _tenant_with_plan(ac: AsyncClient, max_rules: int | None):
    """Register a fresh tenant-admin, then attach a private plan row with the
    given max_rules (hermetic: tenant.plan_id → deterministic resolution via
    get_plan_limits; no dependency on any shared "Free" seed row)."""
    from database import AsyncSessionLocal
    from models import SubscriptionPlan, Tenant

    user = await _register(ac, "v22c")
    async with AsyncSessionLocal() as db:
        plan = SubscriptionPlan(
            name=f"V22C-{uuid.uuid4().hex[:6]}", name_ar="فحص v22",
            price=0, period_days=30, max_rules=max_rules, is_active=True,
        )
        db.add(plan)
        await db.flush()
        tenant = await db.get(Tenant, user["tenant_id"])
        tenant.plan_id = plan.id
        tenant.subscription_status = "PAID"
        await db.commit()
        return user, plan.id


async def _rule_count(tenant_id: int) -> int:
    from database import AsyncSessionLocal
    from models import Rule

    async with AsyncSessionLocal() as db:
        return int(await db.scalar(
            select(func.count()).select_from(Rule).where(Rule.tenant_id == tenant_id)) or 0)


async def test_rule_create_enforces_max_rules_403_arabic(app_client):
    """N=2: إنشاء قاعدتين مقبول، الثالثة → 403 برسالة الحد العربية الحرفية،
    وعدد الصفوف في القاعدة لا يتجاوز الحد (البوابة قبل الإنشاء)."""
    user, _plan_id = await _tenant_with_plan(app_client, max_rules=2)
    ac = app_client
    tid = user["tenant_id"]

    for i in range(2):  # up to the cap → 200
        r = await ac.post("/api/rules", json={
            "name": f"قاعدة {i}", "keywords": f"كلمة{i}", "reply_template": "رد",
        })
        assert r.status_code == 200, r.text
    assert await _rule_count(tid) == 2

    r = await ac.post("/api/rules", json={
        "name": "الزائدة", "keywords": "فوق", "reply_template": "رد",
    })
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == "حد قواعد الرد لخطتك هو 2 — رقِّ خطتك"
    assert await _rule_count(tid) == 2, "the gate must fire BEFORE the insert"


async def test_rule_limit_counts_disabled_rules_too(app_client):
    """الدلالة: العدّ يشمل القواعد المعطلة (حجم كتاب القواعد — نفس عقيدة
    max_team التي تعد كل المقاعد). تعطيل قاعدة لا يفتح مقعداً جديداً."""
    user, _plan_id = await _tenant_with_plan(app_client, max_rules=1)
    ac = app_client

    r = await ac.post("/api/rules", json={
        "name": "الوحيدة", "keywords": "كلمة", "reply_template": "رد",
    })
    assert r.status_code == 200, r.text
    rid = r.json()["data"]["id"]
    r = await ac.post(f"/api/rules/{rid}/toggle")
    assert r.status_code == 200 and r.json()["data"]["enabled"] is False

    r = await ac.post("/api/rules", json={
        "name": "معطلة موجودة", "keywords": "أخرى", "reply_template": "رد",
    })
    assert r.status_code == 403, r.text
    assert r.json()["detail"] == "حد قواعد الرد لخطتك هو 1 — رقِّ خطتك"


async def test_rule_limit_follows_plan_upgrade(app_client):
    """الحد يتبع صف الخطة فعلياً: رفع max_rules من 1 إلى 5 يفتح الإنشاء
    فوراً (نفس صف الخطة — مسار الترقية الحقيقي بعد الدفع)."""
    from database import AsyncSessionLocal
    from models import SubscriptionPlan

    user, plan_id = await _tenant_with_plan(app_client, max_rules=1)
    ac = app_client

    r = await ac.post("/api/rules", json={
        "name": "أولى", "keywords": "ك1", "reply_template": "رد",
    })
    assert r.status_code == 200, r.text
    r = await ac.post("/api/rules", json={
        "name": "ثانية", "keywords": "ك2", "reply_template": "رد",
    })
    assert r.status_code == 403, r.text

    async with AsyncSessionLocal() as db:
        plan = await db.get(SubscriptionPlan, plan_id)
        plan.max_rules = 5
        await db.commit()

    r = await ac.post("/api/rules", json={
        "name": "ثانية", "keywords": "ك2", "reply_template": "رد",
    })
    assert r.status_code == 200, r.text


async def test_rule_limit_fail_open_when_plan_has_no_max_rules(app_client):
    """max_rules=NULL في صف الخطة → بلا حد (fail-open — عقيدة money-core:
    لا نمنع عميل بسبب غياب قيمة حد)."""
    user, _plan_id = await _tenant_with_plan(app_client, max_rules=None)
    ac = app_client

    for i in range(3):  # beyond any seeded Free default — unlimited
        r = await ac.post("/api/rules", json={
            "name": f"بلا حد {i}", "keywords": f"بلا{i}", "reply_template": "رد",
        })
        assert r.status_code == 200, r.text


async def test_rule_update_and_delete_still_work_under_limit(app_client):
    """الحد بوابة إنشاء فقط: التعديل والحذف يعملان عند بلوغ الحد (تحرير
    كتاب القواعد الحالي ليس إنشاءً — لا يوسّع الاستهلاك)."""
    user, _plan_id = await _tenant_with_plan(app_client, max_rules=1)
    ac = app_client

    r = await ac.post("/api/rules", json={
        "name": "قبل", "keywords": "كلمة", "reply_template": "رد",
    })
    rid = r.json()["data"]["id"]
    # at the cap now — update + delete must stay open
    r = await ac.put(f"/api/rules/{rid}", json={
        "name": "بعد", "keywords": "كلمة,كلمتان", "reply_template": "رد محدث",
    })
    assert r.status_code == 200, r.text
    r = await ac.delete(f"/api/rules/{rid}")
    assert r.status_code == 200, r.text
    # the freed seat is creatable again
    r = await ac.post("/api/rules", json={
        "name": "جديدة", "keywords": "مقعد", "reply_template": "رد",
    })
    assert r.status_code == 200, r.text


# ═══════════════════════════════════════════════════════════════════════════
# 3. D3-B2 — empty/whitespace keyword lists are rejected (no implicit catch-all)
# ═══════════════════════════════════════════════════════════════════════════

async def test_rule_create_whitespace_keywords_400_arabic(app_client):
    """«، ،» بفواصل ASCII ومسافات → كانت تُخزَّن [] (catch-all ضمني) —
    الآن 400 «الكلمات المفتاحية مطلوبة» وبلا صف جديد."""
    user = await _register(app_client, "v22kw1")
    tid = user["tenant_id"]
    before = await _rule_count(tid)

    r = await app_client.post("/api/rules", json={
        "name": "فارغة", "keywords": " , , ", "reply_template": "رد",
    })
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "الكلمات المفتاحية مطلوبة"
    assert await _rule_count(tid) == before


async def test_rule_create_commas_only_400(app_client):
    await _register(app_client, "v22kw2")
    r = await app_client.post("/api/rules", json={
        "name": "فواصل فقط", "keywords": ",,,", "reply_template": "رد",
    })
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "الكلمات المفتاحية مطلوبة"


async def test_rule_create_blank_keywords_stays_422_missing(app_client):
    """حقل فارغ كلياً يبقى على عقد 422 «الحقول المطلوبة ناقصة» القائم
    (السلسلة الخام فارغة) — 400 محجوز للقائمة الفارغة بعد التقسيم."""
    await _register(app_client, "v22kw3")
    r = await app_client.post("/api/rules", json={
        "name": "بلا كلمات", "keywords": "   ", "reply_template": "رد",
    })
    assert r.status_code == 422, r.text
    assert "ناقصة" in r.json()["detail"]


async def test_rule_update_to_empty_keywords_400_keeps_old_list(app_client):
    """التحديث نفسه محروس: «، ،» على قاعدة قائمة → 400 والكلمات القديمة
    تبقى في القاعدة (لا تتحول قاعدة عاملة إلى catch-all بالتعديل)."""
    from database import AsyncSessionLocal
    from models import Rule
    from sqlalchemy import select

    await _register(app_client, "v22kw4")
    ac = app_client
    r = await ac.post("/api/rules", json={
        "name": "سليمة", "keywords": "سلام", "reply_template": "رد",
    })
    rid = r.json()["data"]["id"]

    r = await ac.put(f"/api/rules/{rid}", json={
        "name": "سليمة", "keywords": " , ,", "reply_template": "رد",
    })
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "الكلمات المفتاحية مطلوبة"

    async with AsyncSessionLocal() as db:
        row = (await db.execute(select(Rule).where(Rule.id == rid))).scalar_one()
        assert row.keywords == ["سلام"]


async def test_rule_explicit_catch_all_keyword_still_accepted(app_client):
    """الكلمة الصريحة «__catch_all__» تظل مقبولة — عقد المحرك للرد العام
    المقصود (D3-O1): المنع يستهدف القائمة الفارغة العرضية فقط، وعرض
    catch-all الواجهي المقصود مستقبلي موثَّق في تقرير v22-rules."""
    await _register(app_client, "v22kw5")
    r = await app_client.post("/api/rules", json={
        "name": "رد عام صريح", "keywords": "__catch_all__", "reply_template": "شكراً لتواصلك",
    })
    assert r.status_code == 200, r.text
    rules = await app_client.get("/api/rules")
    match = next(x for x in rules.json()["data"] if x["id"] == r.json()["data"]["id"])
    assert match["keywords"] == ["__catch_all__"]


# ═══════════════════════════════════════════════════════════════════════════
# 4. v19 dual-body contract stays intact under the new gates
# ═══════════════════════════════════════════════════════════════════════════

async def test_rule_form_body_create_still_ok_with_keywords(app_client):
    """Form-encoded (عقد الواجهة الحية) بفواصل ASCII متعددة يظل 200
    ويقسم الكلمات كما كان (test_v19 companion — under the new 400 gate)."""
    from urllib.parse import urlencode

    await _register(app_client, "v22form")
    r = await app_client.post("/api/rules", content=urlencode({
        "name": "قاعدة فورم", "keywords": "مرحبا, أهلا , صباح",
        "reply_template": "أهلاً بك", "priority": 10,
    }).encode(), headers={"content-type": "application/x-www-form-urlencoded"})
    assert r.status_code == 200, r.text
    rules = await app_client.get("/api/rules")
    match = next(x for x in rules.json()["data"] if x["id"] == r.json()["data"]["id"])
    assert match["keywords"] == ["مرحبا", "أهلا", "صباح"]
