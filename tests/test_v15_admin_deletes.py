"""v15-E9 (D7-H3/F4) — سطح الحذف: مستخدم/مستأجر كان بلا أي اختبار HTTP.

جرد D7-F4: 21 نقطة نهاية تحمل DELETE في الكود، المختبر منها ~6 فقط عبر
HTTP — و **صفر اختبارات** لأخطرها:

  - ``DELETE /api/users/{user_id}``      (routers/users.py:69)
  - ``DELETE /api/admin/tenants/{tenant_id}``  (routers/admin_routes.py)

انحدار في حذف المستأجر (تسريب بيانات بعد «حذف كامل»، BOLA، عدم تتالي) لا
يلتقطه أي اختبار. هذا الملف يثبّت العقد من الجانبين — الموجب والسالب —
بعدّ الصفوف في القاعدة نفسها (لا الاكتفاء بحالة 200):

  /api/users/{id}:
    [+] أدمن المستأجر يحذف مستخدماً في مساحته → 200 + الصف ذهب فعلاً
    [-] viewer/editor → 403 (والمستخدم لم يُحذف)
    [-] أدمن المستأجر A يحذف مستخدم المستأجر B → 404 (BOLA: الفلتر
        tenant_id == current يعمل — لا كشف وجود مستخدمين الآخرين)
    [-] حذف النفس → 400 «لا يمكنك حذف حسابك»
    [-] معرّف غير موجود → 404

  /api/admin/tenants/{id}:
    [+] أدمن المنصة يحذف مستأجراً مزروعاً ببيانات → 200 + الصفوف المحورية
        (tenant · users · subscriber · tag · bot_log) كلها ذهبت — لا يتامى
        (D7 «orphan deletion»: حذف المستأجر يترك صفوفاً بلا مستأجر؟)
    [+] بقية المستأجرين سالمون تماماً (الكنس tenant-scoped لا يتجاوز)
    [-] أدمن مستأجر A يحذف مستأجر B → 403 «لا يمكنك حذف مستأجر آخر»
    [-] viewer (بلا صلاحية admin) → 403
    [-] معرّف مستأجر غير موجود → 404

Fixtures: tests/conftest.py (v10_world + v10_seed — قاعدة معزولة لكل اختبار).
"""
from __future__ import annotations

import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))

from sqlalchemy import func, select  # noqa: E402


async def _seed_user_in_tenant(world, tenant_id: int, role: str = "viewer") -> int:
    """زرع مستخدم إضافي داخل مستأجر قائم (بلا إنشاء مستأجر جديد)."""
    from _hash import hash_password
    from models import User

    uname = f"del_{uuid.uuid4().hex[:8]}"
    async with world.sf() as db:
        u = User(username=uname, email=f"{uname}@t.ly",
                 password_hash=hash_password("DeleteMe12345!"),
                 tenant_id=tenant_id, role=role)
        db.add(u)
        await db.commit()
        return u.id


async def _user_exists(world, user_id: int) -> bool:
    from models import User

    async with world.sf() as db:
        found = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        return found is not None


# ═══════════════════════════════════════════════════════════════════════════
# DELETE /api/users/{user_id} — الصلاحية + العزل + الحذف الفعلي
# ═══════════════════════════════════════════════════════════════════════════


async def test_delete_user_positive_admin_deletes_in_own_tenant(v10_seed):
    """أدمن المستأجر يحذف مستخدماً في مساحته: 200 + مظروف ok() + الصف ذهب
    من القاعدة فعلاً (لا 200 كاذبة تترك الصف حياً)."""
    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="DEL-POS")
    victim_id = await _seed_user_in_tenant(v10_seed.world, tid, role="viewer")
    v10_seed.auth(ua, tid)

    r = await v10_seed.world.client.delete(f"/api/users/{victim_id}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("success") is True, body
    assert body.get("data", {}).get("ok") is True, body

    assert not await _user_exists(v10_seed.world, victim_id), "user row survived a 200 delete"


async def test_delete_user_requires_admin_role(v10_seed):
    """viewer لا يستطيع الحذف → 403، والصف لم يُلمس (حرس الصلاحية سالباً)."""
    uv, tid, _uid = await v10_seed.tenant_user(role="viewer", tenant_name="DEL-V403")
    victim_id = await _seed_user_in_tenant(v10_seed.world, tid, role="viewer")
    v10_seed.auth(uv, tid)

    r = await v10_seed.world.client.delete(f"/api/users/{victim_id}")
    assert r.status_code == 403, r.text
    assert await _user_exists(v10_seed.world, victim_id), "403 must not delete anything"


async def test_delete_user_tenant_isolation_bola(v10_seed):
    """BOLA: أدمن المستأجر A يحذف مستخدم المستأجر B → 404 (فلتر tenant_id
    في الاستعلام — لا كشف ولا حذف عبر الحدود)."""
    ua, tid_a, _uid = await v10_seed.tenant_user(role="admin", tenant_name="DEL-ISO-A")
    ub, tid_b, _uid_b = await v10_seed.tenant_user(role="admin", tenant_name="DEL-ISO-B")
    victim_b = await _seed_user_in_tenant(v10_seed.world, tid_b, role="viewer")
    v10_seed.auth(ua, tid_a)

    r = await v10_seed.world.client.delete(f"/api/users/{victim_b}")
    assert r.status_code == 404, (
        f"cross-tenant delete must 404 (scoped WHERE), got {r.status_code}: {r.text[:150]}"
    )
    assert await _user_exists(v10_seed.world, victim_b), "tenant B user must survive"


async def test_delete_user_self_forbidden(v10_seed):
    """حذف النفس مرفوض → 400 (لا أدمن يبتر الجلسة/المساحة بنفسه)."""
    ua, tid, uid = await v10_seed.tenant_user(role="admin", tenant_name="DEL-SELF")
    v10_seed.auth(ua, tid)

    r = await v10_seed.world.client.delete(f"/api/users/{uid}")
    assert r.status_code == 400, r.text
    assert "حسابك" in r.json()["detail"], r.text
    assert await _user_exists(v10_seed.world, uid)


async def test_delete_user_missing_404(v10_seed):
    """معرّف غير موجود → 404 (لا 500 خام على db.get(None))."""
    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="DEL-404")
    v10_seed.auth(ua, tid)

    r = await v10_seed.world.client.delete("/api/users/999999")
    assert r.status_code == 404, r.text


# ═══════════════════════════════════════════════════════════════════════════
# DELETE /api/admin/tenants/{tenant_id} — platform-admin + كنس بلا يتامى
# ═══════════════════════════════════════════════════════════════════════════


async def _seed_full_tenant(world) -> tuple[int, int, int, int]:
    """مستأجر كامل ببيانات محورية: مستخدمان + مشترك + وسم + سجل بوت."""
    from _hash import hash_password
    from models import BotLog, Subscriber, Tag, Tenant, User

    async with world.sf() as db:
        t = Tenant(name=f"DEL-TEN-{uuid.uuid4().hex[:6]}",
                   subscription_status="PAID", is_active=True)
        db.add(t)
        await db.flush()
        uname = f"ten_admin_{uuid.uuid4().hex[:6]}"
        u = User(username=uname, email=f"{uname}@t.ly",
                 password_hash=hash_password("TenantAdmin123!"),
                 tenant_id=t.id, role="admin")
        sub = Subscriber(tenant_id=t.id, fb_user_id=f"fb_{uuid.uuid4().hex[:6]}",
                         name="مشترك الحذف", status="active")
        tag = Tag(tenant_id=t.id, name=f"وسم-{uuid.uuid4().hex[:4]}")
        log_row = BotLog(tenant_id=t.id, level="info", message="del-seed")
        db.add_all([u, sub, tag, log_row])
        await db.commit()
        return t.id, u.id, sub.id, tag.id


async def _count_where(world, model, **filters) -> int:
    async with world.sf() as db:
        stmt = select(func.count()).select_from(model)
        for col, val in filters.items():
            stmt = stmt.where(getattr(model, col) == val)
        return (await db.execute(stmt)).scalar_one()


async def test_delete_tenant_by_platform_admin_cleans_all_scoped_rows(v10_seed):
    """الموجب الكامل: أدمن المنصة يحذف مستأجراً → 200، والصفوف المحورية
    (tenant · users · subscribers · tags · bot_logs) كلها ذهبت — «حذف يتيم»
    مستحيل: لا صف محوري يبقى بلا مستأجره."""
    from models import BotLog, Subscriber, Tag, Tenant, User

    puname, _ptid, _puid = await v10_seed.platform_admin()
    tid, uid, sub_id, tag_id = await _seed_full_tenant(v10_seed.world)
    await v10_seed.login(puname)

    r = await v10_seed.world.client.delete(f"/api/admin/tenants/{tid}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("success") is True, body
    assert body.get("data", {}).get("deleted_tenant_id") == tid, body

    world = v10_seed.world
    assert await _count_where(world, Tenant, id=tid) == 0, "tenant row survived"
    assert await _count_where(world, User, tenant_id=tid) == 0, "users orphaned/survived"
    assert await _count_where(world, Subscriber, tenant_id=tid) == 0, "subscribers orphaned"
    assert await _count_where(world, Tag, tenant_id=tid) == 0, "tags orphaned"
    assert await _count_where(world, BotLog, tenant_id=tid) == 0, "bot_logs orphaned"


async def test_delete_tenant_sweep_does_not_touch_other_tenants(v10_seed):
    """الكنس المحوري tenant-scoped بالضبط: مستأجر آخر ببيانات مطابقة يبقى
    كاملاً بعد حذف الجار (لا DELETE بلا WHERE على مستوى الجدول)."""
    from models import Subscriber, Tenant, User

    puname, _ptid, _puid = await v10_seed.platform_admin()
    victim_tid, _vuid, _vsub, _vtag = await _seed_full_tenant(v10_seed.world)
    keeper_tid, _kuid, keeper_sub, _ktag = await _seed_full_tenant(v10_seed.world)
    await v10_seed.login(puname)

    r = await v10_seed.world.client.delete(f"/api/admin/tenants/{victim_tid}")
    assert r.status_code == 200, r.text

    world = v10_seed.world
    assert await _count_where(world, Tenant, id=keeper_tid) == 1
    assert await _count_where(world, User, tenant_id=keeper_tid) >= 1
    assert await _count_where(world, Subscriber, id=keeper_sub) == 1


async def test_delete_tenant_cross_tenant_forbidden_for_tenant_admin(v10_seed):
    """سالبي: أدمن المستأجر A يحذف المستأجر B → 403 (حارس «لا يمكنك حذف
    مستأجر آخر»)، وB سليم تماماً."""
    from models import Tenant

    ua, tid_a, _uid = await v10_seed.tenant_user(role="admin", tenant_name="DEL-X-A")
    tid_b, _uid_b, _sub_b, _tag_b = await _seed_full_tenant(v10_seed.world)
    v10_seed.auth(ua, tid_a)

    r = await v10_seed.world.client.delete(f"/api/admin/tenants/{tid_b}")
    assert r.status_code == 403, r.text
    assert "مستأجر آخر" in r.json()["detail"], r.text
    assert await _count_where(v10_seed.world, Tenant, id=tid_b) == 1, "B must survive the 403"


async def test_delete_tenant_viewer_role_forbidden(v10_seed):
    """viewer لا يملك require_role(admin) → 403 (ولا كنس)."""
    from models import Tenant

    uv, tid, _uid = await v10_seed.tenant_user(role="viewer", tenant_name="DEL-X-V")
    v10_seed.auth(uv, tid)

    r = await v10_seed.world.client.delete(f"/api/admin/tenants/{tid}")
    assert r.status_code == 403, r.text
    assert await _count_where(v10_seed.world, Tenant, id=tid) == 1


async def test_delete_tenant_missing_404(v10_seed):
    """مستأجر غير موجود → 404 لأدمن المنصة نفسه (لا 500 على db.get(None))."""
    puname, _ptid, _puid = await v10_seed.platform_admin()
    await v10_seed.login(puname)

    r = await v10_seed.world.client.delete("/api/admin/tenants/999999")
    assert r.status_code == 404, r.text
    assert "غير موجودة" in r.json()["detail"], r.text


async def test_delete_tenant_own_tenant_by_its_admin_is_the_documented_contract(v10_seed):
    """العقد الفعلي الموثق (admin_routes.py docstring): الحارس يمنع حذف
    مستأجر **الآخرين** فقط — أدمن المستأجر يستطيع حذف مساحته هو (كنس كامل
    يشمل حسابه). يُثبّت هنا بوصفه السلوك المقصود، مع راية منتج للمنسّق:
    هذا «تدمير ذاتي» لمساحة عمل بضغطة واحدة بلا خطوة تأكيد ثانية."""
    from models import Tenant

    ua, tid, uid = await v10_seed.tenant_user(role="admin", tenant_name="DEL-OWN")
    v10_seed.auth(ua, tid)

    r = await v10_seed.world.client.delete(f"/api/admin/tenants/{tid}")
    assert r.status_code == 200, r.text
    world = v10_seed.world
    assert await _count_where(world, Tenant, id=tid) == 0, "own tenant must be gone"
    assert not await _user_exists(world, uid), "own user must be gone with it"
