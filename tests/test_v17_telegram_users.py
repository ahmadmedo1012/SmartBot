"""v17-E-B2 — تليجرام صادق + حد الفريق + حارس الدور.

المصادر: خطة v17 §E-B2 (المهام 1-4) · D5-F2 (المفاتيح الوهمية) ·
D6 (حد الفريق) · D2 §3.3#7 (crossfade الأيقونة — مغطى بصريًا في vitest/المراجعة،
عقد الحفظ هنا).

  [x] D5-F2: مفتاح «تفعيل إشعارات تليجرام» (isActive) + «الأحداث المرسلة»
        (events) كانا يُرسلان من الواجهة ولا يقرأهما الخادم (POST يقرأ
        botToken/chatId فقط، وGET يعيد hardcoded :47-48) → يعودان بعد كل
        تحديث. الآن: يُحفظان JSON داخل عمود SystemConfig.value الموجود
        (مفتاح telegram_notify_config) وGET يعيد القيم المدومة.
        اختبار: حفظ ثم قراءة = نفس القيمة (العقد الحرفي للخطة).
  [x] D6: POST /api/users بلا أي حد max_team (علم زخرفي من التسعة). الآن:
        403 عربي «حد أعضاء الفريق لخطتك هو N — رقّ خطتك لإضافة المزيد»
        عند بلوغ مقاعد الخطة (المالك محسوب — «فريق حتى N» كما تعد الأسعار).
  [x] §E-B2-4: حارس الدور — أدمن المستأجر لم يعد يمنح دور admin (POST
        وPUT معًا: PUT هو نفس ناقل الترقية)؛ مدير المنصة فقط.

Hermetic: v10_seed (قاعدة in-memory خاصة بكل اختبار + get_db مُعاد التوجيه).
"""

from __future__ import annotations

import os
import sys
import uuid

from sqlalchemy import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))

# توكن بصيغة BotFather الصحيحة: ^\d{6,12}:[A-Za-z0-9_-]{30,}$ (نفس قيم v11)
VALID_BOT_TOKEN = "123456789:AAHfiqksKZ8WmoMTsD2ky9KzR7pZ5c9c9"
VALID_CHAT_ID = "-100123456789"

MEMBER_PASSWORD = "pass123456"  # ≥8 — سياسة كلمة المرور في users.py


# ── مساعدات الزرع ──────────────────────────────────────────────────────────


async def _seed_plan(world, name: str, max_team: int) -> int:
    """صف SubscriptionPlan واحد — انظر app/startup._seed_subscription_plans."""
    from models import SubscriptionPlan
    async with world.sf() as db:
        p = SubscriptionPlan(name=name, name_ar=name, price=29, period_days=30,
                             max_replies=100, max_pages=1, max_rules=5,
                             max_team=max_team, is_active=True)
        db.add(p)
        await db.commit()
        return p.id


async def _attach_plan(world, tenant_id: int, plan_id: int) -> None:
    from models import Tenant
    async with world.sf() as db:
        t = await db.get(Tenant, tenant_id)
        t.plan_id = plan_id
        await db.commit()


def _member_form(n: int, role: str = "viewer") -> dict:
    return {"username": f"member{n}_{uuid.uuid4().hex[:6]}",
            "password": MEMBER_PASSWORD, "role": role}


# ── 1) D5-F2 — تليجرام صادق: round-trip للمفتاحين الوهميين ─────────────────


async def test_notify_config_roundtrip_save_then_read(v10_seed):
    """العقد الحرفي للخطة: حفظ ثم قراءة = نفس القيمة (لا «عودة» بعد التحديث)."""
    from models import SystemConfig

    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    c = v10_seed.world.client

    r = await c.post("/api/telegram/config", json={
        "botToken": VALID_BOT_TOKEN, "chatId": VALID_CHAT_ID,
        "isActive": False, "events": ["new_order", "payment"],
    })
    assert r.status_code == 200, r.text
    assert "telegram_notify_config" in r.json()["data"]["updated"]

    r = await c.get("/api/telegram/config")
    data = r.json()["data"]
    assert data["isActive"] is False, "المفتاح المطفأ عاد مضاءً — علّة D5-F2 القديمة"
    assert data["events"] == ["new_order", "payment"], "الأحداث عادت للhardcoded — علّ D5-F2 القديمة"

    async with v10_seed.world.sf() as db:
        row = (await db.execute(select(SystemConfig).where(
            SystemConfig.key == "telegram_notify_config"))).scalar_one()
        assert row.is_secret is False, "مفتاح/أحداث ليست سرًا — لا تُقنَّع"
        assert '"isActive":false' in row.value

    # الاتجاه المعاكس + قائمة فارغة (اختيار المستخدم، ليست «غير مضبوطة»)
    r = await c.post("/api/telegram/config", json={"isActive": True, "events": []})
    assert r.status_code == 200, r.text
    data = (await c.get("/api/telegram/config")).json()["data"]
    assert data["isActive"] is True
    assert data["events"] == [], "[] المحفوظة يجب أن تبقى [] — لا تعود للافتراض"


async def test_notify_config_partial_keys_merge(v10_seed):
    """مفتاح واحد فقط في الجسم ⇒ الباقي يبقى محفوظًا (عقد key-present، كالتوكن)."""
    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    c = v10_seed.world.client

    await c.post("/api/telegram/config", json={
        "isActive": False, "events": ["new_order", "system_alert"]})
    r = await c.post("/api/telegram/config", json={"isActive": True})
    assert r.status_code == 200, r.text
    data = (await c.get("/api/telegram/config")).json()["data"]
    assert data["isActive"] is True
    assert data["events"] == ["new_order", "system_alert"], "events غابت عن الجسم ⇒ تبقى كما حُفظت"


async def test_notify_defaults_when_never_saved(v10_seed, monkeypatch):
    """لا شيء محفوظ ⇒ نفس سلوك ما قبل v17 حرفيًا (افتراض events، isActive=وجود توكن)."""
    import routers.telegram_config as tgc
    monkeypatch.setattr(tgc, "BOT_TOKEN", "")

    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    data = (await v10_seed.world.client.get("/api/telegram/config")).json()["data"]
    assert data["events"] == ["new_order", "payment", "settings_change"]
    assert data["isActive"] is False  # bool(token) بلا توكن


async def test_notify_validation_rejects_garbage_without_writing(v10_seed):
    """قيم فاسدة ⇒ 400 عربي قبل أي كتابة (لا حفظ ناقص)."""
    from models import SystemConfig

    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    c = v10_seed.world.client

    r = await c.post("/api/telegram/config", json={"events": "payment"})
    assert r.status_code == 400 and "قائمة" in r.json()["detail"], r.text

    r = await c.post("/api/telegram/config", json={"events": ["bad event!"]})
    assert r.status_code == 400 and "غير صالح" in r.json()["detail"], r.text

    r = await c.post("/api/telegram/config", json={"isActive": "yes123"})
    assert r.status_code == 400 and "isActive" in r.json()["detail"], r.text

    async with v10_seed.world.sf() as db:
        rows = (await db.execute(select(SystemConfig).where(
            SystemConfig.key == "telegram_notify_config"))).scalars().all()
        assert rows == [], "الرفض يجب أن يسبق أي كتابة"


async def test_legacy_post_without_notify_keys_unchanged(v10_seed):
    """توافق خلفي: جسم botToken/chatId فقط ⇒ updated كما كان تمامًا (عقد v11)."""
    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    c = v10_seed.world.client
    r = await c.post("/api/telegram/config", json={
        "botToken": VALID_BOT_TOKEN, "chatId": VALID_CHAT_ID})
    assert r.status_code == 200, r.text
    assert set(r.json()["data"]["updated"]) == {"telegram_bot_token", "telegram_chat_id"}


# ── 2) D6 — حد الفريق (max_team) ──────────────────────────────────────────


async def test_team_limit_blocks_above_and_allows_within(v10_seed):
    """العقد الحرفي: داخله ينجح + فوق الحد 403 عربي بالرقم."""
    plan_id = await _seed_plan(v10_seed.world, "Premium", max_team=2)
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="TeamLim")
    await _attach_plan(v10_seed.world, tid, plan_id)
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client

    # مقعد 1 من 2 (المالك محسوب) — داخله ينجح
    r = await c.post("/api/users", data=_member_form(1))
    assert r.status_code == 200, r.text

    # المقاعد بلغت 2 → فوق الحد: 403 + الرسالة العربية بالنص
    r = await c.post("/api/users", data=_member_form(2))
    assert r.status_code == 403, r.text
    detail = r.json()["detail"]
    assert "حد أعضاء الفريق لخطتك هو 2" in detail
    assert "رقّ خطتك" in detail


async def test_team_limit_free_plan_zero_seats(v10_seed):
    """مستأجر بلا خطة ⇒ ينحل لصف Free (max_team=0) ⇒ رفض فوري (وعد «بلا فريق»)."""
    await _seed_plan(v10_seed.world, "Free", max_team=0)
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="FreeNoTeam")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.post("/api/users", data=_member_form(1))
    assert r.status_code == 403, r.text
    assert "حد أعضاء الفريق لخطتك هو 0" in r.json()["detail"]


async def test_team_limit_failopen_without_plan_rows(v10_seed):
    """لا صفوف خطط إطلاقًا ⇒ fail-open بلا حد (عقيدة money-core — لا نفقد أعضاء)."""
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="NoPlanRows")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.post("/api/users", data=_member_form(1))
    assert r.status_code == 200, r.text


async def test_team_limit_platform_tenant_unlimited(v10_seed):
    """مستأجر المنصة (tenant 0) بلا خطة ⇒ بلا حد — مدير المنصة يسكّ مستخدميه."""
    uname, _tid, _uid = await v10_seed.platform_admin()
    v10_seed.auth(uname, 0)
    c = v10_seed.world.client
    for i in range(3):
        r = await c.post("/api/users", data=_member_form(i))
        assert r.status_code == 200, f"عضو {i}: {r.status_code} {r.text[:120]}"


# ── 3) §E-B2-4 — حارس الدور ───────────────────────────────────────────────


async def test_tenant_admin_cannot_create_admin_role(v10_seed):
    """أدمن مستأجر يطلب دور admin ⇒ 403 عربي؛ editor يمر."""
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="RoleGuard")
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client

    r = await c.post("/api/users", data=_member_form(1, role="admin"))
    assert r.status_code == 403, r.text
    assert "مدير المنصة" in r.json()["detail"]

    r = await c.post("/api/users", data=_member_form(2, role="editor"))
    assert r.status_code == 200, r.text


async def test_platform_admin_can_create_admin_role(v10_seed):
    """مدير المنصة (tenant 0) هو من يمنح admin — الحارس لا يعترضه."""
    uname, _tid, _uid = await v10_seed.platform_admin()
    v10_seed.auth(uname, 0)
    r = await v10_seed.world.client.post("/api/users", data=_member_form(1, role="admin"))
    assert r.status_code == 200, r.text


async def test_tenant_admin_cannot_promote_via_put(v10_seed):
    """PUT نفس ناقل الترقية: ترقية viewer→admin ⇒ 403؛ خفضه editor ⇒ يمر؛
    إبقاء admin قائم على دوره (no-op) ⇒ يمر (لا منح صلاحية جديدة)."""
    from _hash import hash_password
    from models import User

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="PutGuard")
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client

    r = await c.post("/api/users", data=_member_form(1, role="viewer"))
    assert r.status_code == 200, r.text
    victim_id = r.json()["data"]["id"]

    r = await c.put(f"/api/users/{victim_id}", data={"role": "admin"})
    assert r.status_code == 403, r.text
    assert "مدير المنصة" in r.json()["detail"]

    r = await c.put(f"/api/users/{victim_id}", data={"role": "editor"})
    assert r.status_code == 200, r.text

    # admin قائم (مزروع مباشرة في DB) + PUT بنفس الدور = no-op مسموح
    async with v10_seed.world.sf() as db:
        peer = User(username=f"peer_{uuid.uuid4().hex[:6]}",
                    password_hash=hash_password(MEMBER_PASSWORD),
                    tenant_id=tid, role="admin")
        db.add(peer)
        await db.commit()
        peer_id = peer.id
    r = await c.put(f"/api/users/{peer_id}", data={"role": "admin"})
    assert r.status_code == 200, r.text
