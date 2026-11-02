"""P42-W6 (تدقيق 6-a — موثّوقية الخلفية): اختبارات الانحدار للإصلاحين.

الجرد الكامل في agent-ctx/P42-6a-smartbot-backend-audit.md — هذا الملف
يثبّت الإصلاحين المقبولين فقط (سياسة الموجة: أصلح ما تيقّن منه ووثّق الباقي):

1. كنس حذف المستأجر كان يفوّت جداول v19 Step 2 الأربعة
   (fb_posts/ad_accounts/ad_campaigns/ad_items) — كلها تحمل tenant_id
   فتبقى منشورات المستأجر المحذوف وحملاته الإعلانية وحمولاتها الخام
   (payload_json) إلى الأبد بعد «حذف كامل» (فئة تسريب v12-E2.6 نفسها:
   القائمة المُصلِحة لاحقًا من v19 لم تُضف إلى الكنس).
   admin_routes.py delete_tenant — الإصلاح أضاف الجداول الأربعة.

2. POST /api/admin/reset-password بـ user_id غير رقمي كان يرفع
   ValueError خامًا → 500 + إنذار CRITICAL (تليجرام/Sentry) على خطأ
   كتابة من أدمن — آخر بقايا عائلة D1-H1 (كل المواقع الأخرى حُوّلت
   إلى 422 عبر _as_int وأخواتها). auth.py — الإصلاح يحوّلها 422 عربية.

Fixtures: tests/conftest.py (v10_seed — قاعدة معزولة لكل اختبار).
"""
from __future__ import annotations

import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))

from sqlalchemy import func, select  # noqa: E402


async def _seed_tenant_with_v19_rows(world) -> tuple[int, int, int, int, int]:
    """مستأجر مزوّد بصف واحد في كل جدول من جداول v19 Step 2 الأربعة.

    يعيد (tenant_id, post_id, ad_account_id, ad_campaign_id, ad_item_id).
    """
    from models import AdAccount, AdCampaign, AdItem, Post, Tenant

    suffix = uuid.uuid4().hex[:8]
    async with world.sf() as db:
        t = Tenant(name=f"W6-V19-{suffix}", subscription_status="PAID", is_active=True)
        db.add(t)
        await db.flush()
        post = Post(tenant_id=t.id, fb_post_id=f"post_{suffix}",
                    message="منشور مستأجر الحذف", created_time=None)
        account = AdAccount(tenant_id=t.id, fb_account_id=f"act_{suffix}",
                            name="حساب إعلاني للحذف")
        campaign = AdCampaign(tenant_id=t.id, fb_account_id=f"act_{suffix}",
                              fb_campaign_id=f"cmp_{suffix}",
                              name="حملة إعلانية للحذف",
                              payload_json='{"name": "حملة الحذف"}')
        ad = AdItem(tenant_id=t.id, fb_account_id=f"act_{suffix}",
                    fb_ad_id=f"ad_{suffix}", campaign_id=f"cmp_{suffix}",
                    name="إعلان للحذف", payload_json='{"adset": {}}')
        db.add_all([post, account, campaign, ad])
        await db.commit()
        return t.id, post.id, account.id, campaign.id, ad.id


async def _count_where(world, model, **filters) -> int:
    async with world.sf() as db:
        stmt = select(func.count()).select_from(model)
        for col, val in filters.items():
            stmt = stmt.where(getattr(model, col) == val)
        return (await db.execute(stmt)).scalar_one()


# ── الإصلاح 1: كنس جداول v19 Step 2 عند حذف المستأجر ─────────────────────────


async def test_delete_tenant_sweeps_v19_posts_and_ads_tables(v10_seed):
    """أدمن المنصة يحذف مستأجرًا → صفوف fb_posts/ad_accounts/ad_campaigns/
    ad_items الخاصة به تُكنس معه (قبل الإصلاح كانت تنجو كلها)."""
    from models import AdAccount, AdCampaign, AdItem, Post, Tenant

    puname, _ptid, _puid = await v10_seed.platform_admin()
    tid, post_id, acc_id, cmp_id, ad_id = await _seed_tenant_with_v19_rows(v10_seed.world)
    await v10_seed.login(puname)

    r = await v10_seed.world.client.delete(f"/api/admin/tenants/{tid}")
    assert r.status_code == 200, r.text

    world = v10_seed.world
    assert await _count_where(world, Tenant, id=tid) == 0, "tenant row survived"
    assert await _count_where(world, Post, id=post_id) == 0, (
        "fb_posts row survived a \"complete\" tenant deletion (P42-W6 fix regressed)"
    )
    assert await _count_where(world, AdAccount, id=acc_id) == 0, "ad_accounts row survived"
    assert await _count_where(world, AdCampaign, id=cmp_id) == 0, "ad_campaigns row survived"
    assert await _count_where(world, AdItem, id=ad_id) == 0, "ad_items row survived"


async def test_delete_tenant_v19_sweep_spares_other_tenants(v10_seed):
    """الكنس الجديد tenant-scoped بالضبط: جداول v19 لمستأجر آخر تبقى
    كاملة بعد حذف الجار (لا DELETE بلا WHERE)."""
    from models import AdCampaign, Post, Tenant

    puname, _ptid, _puid = await v10_seed.platform_admin()
    victim_tid, _vp, _va, _vc, _vd = await _seed_tenant_with_v19_rows(v10_seed.world)
    keeper_tid, keeper_post, _ka, keeper_cmp, _kd = await _seed_tenant_with_v19_rows(v10_seed.world)
    await v10_seed.login(puname)

    r = await v10_seed.world.client.delete(f"/api/admin/tenants/{victim_tid}")
    assert r.status_code == 200, r.text

    world = v10_seed.world
    assert await _count_where(world, Tenant, id=keeper_tid) == 1, "keeper tenant must survive"
    assert await _count_where(world, Post, id=keeper_post) == 1, "keeper posts must survive"
    assert await _count_where(world, AdCampaign, id=keeper_cmp) == 1, (
        "keeper ad campaigns must survive"
    )


# ── الإصلاح 2: reset-password بمعرّف غير رقمي → 422 لا 500 ───────────────────


async def test_admin_reset_password_non_numeric_user_id_is_422(v10_seed):
    """user_id="abc" → 422 عربية نظيفة (كان ValueError → 500 خام + إنذار
    CRITICAL على خطأ كتابة من أدمن — آخر بقايا عائلة D1-H1)."""
    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="W6-RP-422")
    v10_seed.auth(ua, tid)

    r = await v10_seed.world.client.post("/api/admin/reset-password", json={
        "user_id": "abc",
        "new_password": "NewPass123!",
    })
    assert r.status_code == 422, (
        f"non-numeric user_id must answer 422 (D1-H1 family), got {r.status_code}: {r.text[:150]}"
    )
    assert "user_id" in r.json()["detail"], r.text


async def test_admin_reset_password_bool_user_id_is_422(v10_seed):
    """user_id=true (bool — int subclass، الفخ الكلاسيكي في _as_int) → 422،
    لا query بمعرّف 1 يحوّل الطلب إلى إعادة تعيين كلمة مرور المستخدم رقم 1."""
    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="W6-RP-BOOL")
    v10_seed.auth(ua, tid)

    r = await v10_seed.world.client.post("/api/admin/reset-password", json={
        "user_id": True,
        "new_password": "NewPass123!",
    })
    assert r.status_code == 422, (
        f"bool user_id must answer 422, got {r.status_code}: {r.text[:150]}"
    )


async def test_admin_reset_password_numeric_user_id_still_works(v10_seed):
    """الحارس لم يكسر المسار السليم: user_id رقمي (الشكل الذي ترسله
    الواجهة) يمر كما كان — إعادة التعيين تحدث فعلًا وتُرفع token_ver."""
    from _hash import hash_password, verify_password
    from models import User

    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="W6-RP-OK")
    # الضحية داخل مساحة الأدمن نفسها (عقد المسار: أدمن المستأجر يعيد
    # تعيين كلمات مرور مستأجره فقط).
    victim_uname = f"w6victim_{uuid.uuid4().hex[:8]}"
    async with v10_seed.world.sf() as db:
        victim = User(username=victim_uname, email=f"{victim_uname}@test.ly",
                      password_hash=hash_password("OldPass123!"),
                      tenant_id=tid, role="viewer")
        db.add(victim)
        await db.commit()
        victim_uid = victim.id
    v10_seed.auth(ua, tid)

    r = await v10_seed.world.client.post("/api/admin/reset-password", json={
        "user_id": victim_uid,
        "new_password": "FreshPass123!",
    })
    assert r.status_code == 200, r.text

    async with v10_seed.world.sf() as db:
        row = (await db.execute(
            select(User).where(User.id == victim_uid))).scalar_one()
        assert verify_password("FreshPass123!", row.password_hash), (
            "numeric user_id path must still reset the password"
        )
        assert int(getattr(row, "token_ver", 0) or 0) >= 1, (
            "reset must bump token_ver (v12-E2.4 contract preserved)"
        )
