"""S-06 (P21-W7-F) — سياسة عرض كلمة المرور: طول + حرف + رقم.

قبل W7-F كانت البوابة الوحيدة عند الضبط/التغيير/الإعادة هي الطول
(`len < 8`). هذه المجموعة تثبت المواقع الخمسة كلها (register،
create_user، update_user، admin reset-password، change-password) على
سياسة `_hash.password_policy_error` الموحدة، وتثبت العقد الأهم: تسجيل
الدخول لا يُقيَّم أبدًا — كلمة مرور قائمة ضعيفة تُغيَّر بقرار مالكها
ولا يُحبس صاحبها خارج حسابه.

عيّنات الجنات الحية («Str0ngPass!ly»/«pass123456»/«secret123»…) تعبر
السياسة كلها — اختبارات (positive) الموجودة تبقى خضراء بلا أي تعديل.
"""
from __future__ import annotations

import pytest

# إيجابيات: كل أشكال الاستخدام الحية (لاتينية/رموز/عربية+أرقام هندية)
_VALID = ["Str0ngPass!ly", "pass123456", "12345678a", "أبجد12345", "Test12345!"]
# سلبيات: الطول القديم كان يمرر الثلاث الأولى حرفيًا — هذه الثغرة نفسها
_INVALID = [
    "abcdefghij",  # 10 حروف بلا رقم — كانت تمر
    "12345678",    # 8 أرقام بلا حرف — كانت تمر
    "short",       # الطول وحده — الرفض القديم يبقى
    "",            # فارغة
    "        ",    # 8 مسافات — لا حرف ولا رقم
    None,          # JSON حرفي null
    12345678,      # JSON رقم — كانت ترمي TypeError (500) في register
    ["p4ssword"],  # نوع حاوية — الرسالة لا التفجير
]


# ── 1: المدقق نفسه (وحدة) ──────────────────────────────────────────────────


def test_policy_error_accepts_breadth_passwords():
    from _hash import password_policy_error

    for pw in _VALID:
        assert password_policy_error(pw) is None, pw


def test_policy_error_rejects_length_only_survivors():
    from _hash import PASSWORD_POLICY_MSG, password_policy_error

    for pw in _INVALID:
        assert password_policy_error(pw) == PASSWORD_POLICY_MSG, pw


def test_policy_message_is_arabic_and_states_the_whole_contract():
    from _hash import PASSWORD_MIN_LEN, PASSWORD_POLICY_MSG

    # الرسالة تقول العقد كاملًا (الطول + الحرف + الرقم) بالعربية —
    # لا رسالة نصف عقد تدفع المستخدم إلى رفضٍ غير مفهوم.
    assert str(PASSWORD_MIN_LEN) in PASSWORD_POLICY_MSG
    assert "حرف" in PASSWORD_POLICY_MSG and "رقم" in PASSWORD_POLICY_MSG


# ── 2: register — السياسة عند الإنشاء، والدخول لا يُقيَّم أبدًا ───────────────


async def test_register_rejects_breadth_violations_with_400_arabic(v10_world):
    ac = v10_world.client
    base = {"email": "breadth@t.ly", "name": "b"}

    for i, weak in enumerate(("abcdefghij", "12345678", "short")):
        r = await ac.post("/api/register", json={
            "username": f"weakreg{i}", "password": weak, **base,
        })
        assert r.status_code == 400, (weak, r.status_code, r.text[:200])
        assert "كلمة المرور" in r.json()["detail"]

    # قيمة غير نصية: 400 عربي لا TypeError خام (500) — تحصين W7-F
    r = await ac.post("/api/register", json={
        "username": "weakregnum", "email": "bre2@t.ly",
        "password": 12345678, "name": "b",
    })
    assert r.status_code == 400, r.text[:200]
    assert "كلمة المرور" in r.json()["detail"]


async def test_register_accepts_compliant_password(v10_world):
    r = await v10_world.client.post("/api/register", json={
        "username": "goodreg", "email": "goodreg@t.ly",
        "password": "Libya2026pw", "name": "g",
    })
    assert r.status_code == 200, r.text[:200]
    assert r.json()["success"] is True


async def test_login_never_evaluates_policy_for_existing_weak_password(v10_world):
    """العقد الأهم: مستخدم قديم كلمة مروره «abcdefghij» (حروف فقط — كانت
    مشروعة يوم إنشائها) يدخل بحرية؛ السياسة تُطبَّق عند الضبط الجديد
    فقط، لا كقفل رجعي على حسابات قائمة."""
    from _hash import hash_password
    from models import Tenant, User

    async with v10_world.sf() as db:
        t = Tenant(name="legacy-tenant", subscription_status="PAID", is_active=True)
        db.add(t)
        await db.flush()
        db.add(User(username="legacy_weak", email="legacy@t.ly",
                    password_hash=hash_password("abcdefghij"),
                    tenant_id=t.id, role="admin"))
        await db.commit()

    r = await v10_world.client.post("/api/login", json={
        "username": "legacy_weak", "password": "abcdefghij",
    })
    assert r.status_code == 200, r.text[:200]


# ── 3: create_user / update_user (users.py) ────────────────────────────────


async def test_create_user_enforces_breadth(v10_seed):
    world = v10_seed.world
    admin_name, tid, _uid = await v10_seed.tenant_user(role="admin")
    v10_seed.auth(admin_name, tid)

    for i, weak in enumerate(("abcdefghij", "12345678")):
        r = await world.client.post("/api/users", data={
            "username": f"weakmate{i}", "password": weak, "role": "viewer",
        })
        assert r.status_code == 400, (weak, r.text[:200])
        assert "كلمة المرور" in r.json()["detail"]

    r = await world.client.post("/api/users", data={
        "username": "goodmate", "password": "Teammate2026", "role": "viewer",
    })
    assert r.status_code == 200, r.text[:200]
    assert r.json()["data"]["id"]


async def test_update_user_enforces_breadth_only_when_password_set(v10_seed):
    world = v10_seed.world
    admin_name, tid, _uid = await v10_seed.tenant_user(role="admin")
    v10_seed.auth(admin_name, tid)

    # عضو داخل مستأجر الأدمن نفسه (المسار يفلتر بنطاق المستأجر):
    r = await world.client.post("/api/users", data={
        "username": "polmember", "password": "Member2026pw", "role": "viewer",
    })
    assert r.status_code == 200, r.text[:200]
    member_id = r.json()["data"]["id"]

    # بلا كلمة مرور: تحديث دور فقط — لا سياسة (السلوك القائم محفوظ)
    r = await world.client.put(f"/api/users/{member_id}", data={"role": "editor"})
    assert r.status_code == 200, r.text[:200]

    # كلمة مرور حروف فقط: رفض
    r = await world.client.put(f"/api/users/{member_id}", data={
        "role": "viewer", "password": "abcdefghij",
    })
    assert r.status_code == 400, r.text[:200]
    assert "كلمة المرور" in r.json()["detail"]

    # كلمة مرور مطيعة: قبول
    r = await world.client.put(f"/api/users/{member_id}", data={
        "role": "viewer", "password": "Rotated2026x",
    })
    assert r.status_code == 200, r.text[:200]


# ── 4: admin reset-password (auth.py) ──────────────────────────────────────


async def test_admin_reset_password_enforces_breadth(v10_seed):
    world = v10_seed.world
    plat_name, _zero, _pid = await v10_seed.platform_admin()
    v10_seed.auth(plat_name, 0)
    _victim_name, tid, victim_id = await v10_seed.tenant_user(role="viewer")

    for weak in ("12345678", "abcdefghij", 12345678):
        r = await world.client.post("/api/admin/reset-password", json={
            "user_id": victim_id, "new_password": weak,
        })
        assert r.status_code == 400, (weak, r.text[:200])
        assert "كلمة المرور" in r.json()["detail"]

    r = await world.client.post("/api/admin/reset-password", json={
        "user_id": victim_id, "new_password": "AdminReset2026",
    })
    assert r.status_code == 200, r.text[:200]
    assert r.json()["data"] == {"updated": True}


# ── 5: change-password (auth.py) — الجديدة فقط، الحالية إثبات هوية ──────────


async def test_change_password_enforces_breadth_on_new_password(v10_seed):
    world = v10_seed.world
    uname, tid, _uid = await v10_seed.tenant_user(role="admin")
    await v10_seed.login(uname)

    for weak in ("abcdefghij", "12345678"):
        r = await world.client.post("/api/auth/change-password", json={
            "current_password": "pass123456", "new_password": weak,
        })
        assert r.status_code == 400, (weak, r.text[:200])
        assert "كلمة المرور" in r.json()["detail"]

    r = await world.client.post("/api/auth/change-password", json={
        "current_password": "pass123456", "new_password": "Rotated2026ok",
    })
    assert r.status_code == 200, r.text[:200]

    # الدخول بالجديدة يعمل، والقديمة ماتت (token_ver رُفع — عقد v12-E2.4)
    v10_seed.logout()
    r = await world.client.post("/api/login", json={
        "username": uname, "password": "Rotated2026ok",
    })
    assert r.status_code == 200, r.text[:200]
    r = await world.client.post("/api/login", json={
        "username": uname, "password": "pass123456",
    })
    assert r.status_code == 401, r.text[:200]


@pytest.mark.parametrize("password", _VALID)
async def test_existing_battery_passwords_still_pass_the_policy(password):
    """حزام رجوعي: كل كلمات مرور الجنات الحية تعبر — لم يُعدَّل أي عيّنة
    موجودة في البطارية (اختيار السياسة وثّق هذا الشرط صراحة)."""
    from _hash import password_policy_error

    assert password_policy_error(password) is None
