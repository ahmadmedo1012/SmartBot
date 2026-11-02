"""W2-BOT-9 (P42-W3، تدقيق 3a) — عقود إلغاء/إعادة اشتراك المشترك من البث.

الفجوة: محرك التوزيع يستقبل status=="active" حصراً (broadcast_engine.py
fan-out + estimate) لكن لم يكن للمشترك مخرج من لوحة التاجر. العقدان
الجديدان على /api/subscribers/{id}/unsubscribe و /resubscribe:
  - العضو editor+ فقط (viewer يُرفض بصلاحيات غير كافية)
  - محصوران بالمستأجر: مشترك مستأجر آخر = 404 (لا تسريب عبر المعرفات)
  - الإلغاء من غير النشط = 400 عربية؛ وإعادة الاشتراك من النشط = 400
  - الحالة تُكتب فعلاً (يفحصها محرك التوزيع في كل بث لاحق)
"""
from __future__ import annotations

import uuid

import pytest


async def _seed_subscriber(v10_seed, *, status: str = "active", tenant_name: str = "BOT9"):
    """يزرع مشتركاً واحداً لمستأجر الاختبار ويعيد (client, sub_id)."""
    from models import Subscriber, Tenant

    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name=tenant_name)
    async with v10_seed.world.sf() as db:
        t = await db.get(Tenant, tid)
        _ = t
        sub = Subscriber(
            tenant_id=tid,
            fb_user_id=f"fb_bot9_{uuid.uuid4().hex[:8]}",
            name="زبون تجريبي",
            status=status,
        )
        db.add(sub)
        await db.commit()
        sid = sub.id
    v10_seed.auth(ua, tid)
    return v10_seed.world.client, sid, tid


@pytest.mark.asyncio
async def test_unsubscribe_sets_inactive_and_resubscribe_restores(v10_seed):
    """الدورة الكاملة: نشط → إلغاء (inactive) → إعادة (active) — الحالة
    تُقرأ من قاعدة البيانات نفسها لا من الرد وحده."""
    from models import Subscriber

    client, sid, _tid = await _seed_subscriber(v10_seed, status="active")

    r = await client.post(f"/api/subscribers/{sid}/unsubscribe")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "inactive"

    async with v10_seed.world.sf() as db:
        assert (await db.get(Subscriber, sid)).status == "inactive"

    r = await client.post(f"/api/subscribers/{sid}/resubscribe")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "active"

    async with v10_seed.world.sf() as db:
        assert (await db.get(Subscriber, sid)).status == "active"


@pytest.mark.asyncio
async def test_unsubscribe_idempotence_guard_is_arabic_400(v10_seed):
    """إلغاء مشترك غير نشط = 400 عربية (لا 500 ولا نجاح صامت)."""
    client, sid, _tid = await _seed_subscriber(v10_seed, status="inactive")

    r = await client.post(f"/api/subscribers/{sid}/unsubscribe")
    assert r.status_code == 400, r.text
    assert "ليس نشطاً" in r.json()["detail"], r.text


@pytest.mark.asyncio
async def test_resubscribe_active_subscriber_is_arabic_400(v10_seed):
    """إعادة اشتراك مشترك نشط = 400 عربية."""
    client, sid, _tid = await _seed_subscriber(v10_seed, status="active")

    r = await client.post(f"/api/subscribers/{sid}/resubscribe")
    assert r.status_code == 400, r.text
    assert "نشط بالفعل" in r.json()["detail"], r.text


@pytest.mark.asyncio
async def test_cross_tenant_subscriber_is_404(v10_seed):
    """مشترك مستأجر آخر = 404 — المعرفات لا تتسرب بين المؤسسات."""
    from models import Subscriber, Tenant

    # مستأجر الضحية + مشتركه
    _va, victim_tid, _vid = await v10_seed.tenant_user(role="admin", tenant_name="BOT9-VICTIM")
    async with v10_seed.world.sf() as db:
        sub = Subscriber(
            tenant_id=victim_tid,
            fb_user_id=f"fb_victim_{uuid.uuid4().hex[:8]}",
            name="ضحية",
            status="active",
        )
        db.add(sub)
        await db.commit()
        victim_sid = sub.id

    # مستأجر المهاجم يحاول إلغاء اشتراك مشترك الضحية
    ua, attacker_tid, _aid = await v10_seed.tenant_user(role="admin", tenant_name="BOT9-ATTACK")
    v10_seed.auth(ua, attacker_tid)

    r = await v10_seed.world.client.post(f"/api/subscribers/{victim_sid}/unsubscribe")
    assert r.status_code == 404, r.text

    # المشترك لم يُمس
    async with v10_seed.world.sf() as db:
        assert (await db.get(Subscriber, victim_sid)).status == "active"
        _ = Tenant  # استيراد مرجعي فقط


@pytest.mark.asyncio
async def test_viewer_role_cannot_unsubscribe(v10_seed):
    """viewer يتلقى 403 صلاحيات — الكتابة لعائلة editor. (المستخدم يُزرع
    مباشرة في مستأجر الاختبار نفسه؛ tenant_user يفتح مستأجرًا جديدًا
    لكل استدعاء فلا يصلح لمشاهد «عضو في نفس المنظمة».)"""
    from models import Subscriber, User

    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="BOT9-V")
    async with v10_seed.world.sf() as db:
        sub = Subscriber(
            tenant_id=tid,
            fb_user_id=f"fb_v_{uuid.uuid4().hex[:8]}",
            status="active",
        )
        db.add(sub)
        viewer_name = f"viewer_{uuid.uuid4().hex[:8]}"
        db.add(User(username=viewer_name, email=f"{viewer_name}@test.ly", password_hash="x",
                    tenant_id=tid, role="viewer"))
        await db.commit()
        sid = sub.id

    v10_seed.auth(viewer_name, tid)
    r = await v10_seed.world.client.post(f"/api/subscribers/{sid}/unsubscribe")
    assert r.status_code == 403, r.text
    assert "صلاحيات" in r.json()["detail"], r.text
