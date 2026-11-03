"""P42-8a — جدار تثبيت حدود الأطوال (FIX-A، عائلة D1-H1 للأطوال).

SQLite يتجاهل حدود VARCHAR فيتجاوز أي اسم/وصف/اختصار أطول من العمود
الدخول بلا خطأ — لكن Postgres الإنتاجي (Neon) يجيب StringDataRightTruncation
→ 500 خام + تنبيه CRITICAL لخطأ كتابة عميل. الحراس الثلاثة (rules /
broadcasts / templates) تُثبَّت هنا عند حدود أعمدة القاعدة نفسها:

  rules.name String(100) · rules.description String(255)
  broadcasts.name String(200)
  reply_templates.name String(100) · category String(50) · shortcut String(20)

كل حد يُختبر على الحدين: التجاوز → 422 عربية، والحد الأقصى بالضبط → نجاح
(لا تتغير سلوكية أي مدخل صالح).
"""
from __future__ import annotations

import uuid

import pytest


@pytest.fixture
async def w8_editor(v10_seed):
    """مستخدم editor لمستأجر طازج — كل الحراس الثلاثة تتطلب صلاحية editor."""
    uname, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name=f"W8A-{uuid.uuid4().hex[:6]}")
    v10_seed.auth(uname, tid)
    return v10_seed


# ── /api/rules ─────────────────────────────────────────────────────────────


async def test_rules_name_over_column_cap_is_422(w8_editor):
    c = w8_editor.world.client
    r = await c.post("/api/rules", json={
        "name": "ط" * 101, "keywords": "سعر", "reply_template": "أهلاً",
    })
    assert r.status_code == 422, r.text
    assert "قيمة غير صالحة" in r.json()["detail"]
    assert "100" in r.json()["detail"]


async def test_rules_name_at_cap_still_created(w8_editor):
    c = w8_editor.world.client
    r = await c.post("/api/rules", json={
        "name": "ن" * 100, "keywords": "سعر", "reply_template": "أهلاً",
    })
    assert r.status_code == 200, r.text
    rid = r.json()["data"]["id"]
    names = [x["name"] for x in (await c.get("/api/rules")).json()["data"]]
    assert "ن" * 100 in names
    # التنظيف كي لا تتسرب القاعدة إلى اختبارات أخرى داخل الجلسة نفسها
    assert (await c.delete(f"/api/rules/{rid}")).status_code == 200


async def test_rules_description_over_cap_is_422_on_update(w8_editor):
    c = w8_editor.world.client
    r = await c.post("/api/rules", json={
        "name": "قاعدة قصيرة", "keywords": "سعر", "reply_template": "أهلاً",
    })
    assert r.status_code == 200, r.text
    rid = r.json()["data"]["id"]
    r = await c.put(f"/api/rules/{rid}", json={
        "name": "قاعدة قصيرة", "keywords": "سعر", "reply_template": "أهلاً",
        "description": "د" * 256,
    })
    assert r.status_code == 422, r.text
    assert "255" in r.json()["detail"]


# ── /api/broadcasts ────────────────────────────────────────────────────────


async def test_broadcast_name_over_column_cap_is_422(w8_editor):
    c = w8_editor.world.client
    r = await c.post("/api/broadcasts", json={
        "name": "ب" * 201, "message_template": "أهلاً {name}",
    })
    assert r.status_code == 422, r.text
    assert "200" in r.json()["detail"]


async def test_broadcast_name_at_cap_still_created(w8_editor):
    c = w8_editor.world.client
    r = await c.post("/api/broadcasts", json={
        "name": "ب" * 200, "message_template": "أهلاً {name}",
    })
    assert r.status_code == 200, r.text


async def test_broadcast_update_long_name_is_422(w8_editor):
    c = w8_editor.world.client
    r = await c.post("/api/broadcasts", json={
        "name": "حملة قصيرة", "message_template": "أهلاً",
    })
    assert r.status_code == 200, r.text
    bid = r.json()["data"]["id"]
    r = await c.put(f"/api/broadcasts/{bid}", json={"name": "ب" * 201})
    assert r.status_code == 422, r.text
    # التحديث بلا اسم (رسالة فقط) يبقى مسموحًا — الاسم اختياري في PUT
    r = await c.put(f"/api/broadcasts/{bid}", json={"message_template": "عيد سعيد"})
    assert r.status_code == 200, r.text


async def test_broadcast_non_string_name_is_422_not_500(w8_editor):
    """FIX-A تتمة: الاسم غير النصي (dict) كان يتخطى ``len(str(name))`` ويفشل
    INSERT بـ500 خام — الآن 422 عربية، في الإنشاء والتحديث معًا."""
    c = w8_editor.world.client
    r = await c.post("/api/broadcasts", json={"name": {"a": 1}, "message_template": "x"})
    assert r.status_code == 422, r.text
    assert "نص" in r.json()["detail"]
    # مسار التحديث: بث موجود ثم اسم غير نصي
    r = await c.post("/api/broadcasts", json={"name": "سليمة", "message_template": "أهلاً"})
    assert r.status_code == 200, r.text
    bid = r.json()["data"]["id"]
    r = await c.put(f"/api/broadcasts/{bid}", json={"name": [1, 2]})
    assert r.status_code == 422, r.text


# ── /api/templates ─────────────────────────────────────────────────────────


async def test_template_field_caps_are_422(w8_editor):
    c = w8_editor.world.client
    base = {"name": "قالب", "text": "نص القالب"}
    for field, over in (("name", "ط" * 101), ("category", "ص" * 51), ("shortcut", "خ" * 21)):
        r = await c.post("/api/templates", json={**base, field: over})
        assert r.status_code == 422, f"{field}: {r.status_code} {r.text[:200]}"
        assert "قيمة غير صالحة" in r.json()["detail"]


async def test_template_at_caps_still_created_and_updated(w8_editor):
    c = w8_editor.world.client
    r = await c.post("/api/templates", json={
        "name": "ق" * 100, "text": "نص", "category": "ت" * 50, "shortcut": "ا" * 20,
    })
    assert r.status_code == 200, r.text
    tid = r.json()["data"]["id"]
    # التحديث يتقاطع مع نفس الحارس (نقطة التحقق واحدة: _template_payload)
    r = await c.put(f"/api/templates/{tid}", json={
        "name": "ق" * 100, "text": "نص", "category": "ت" * 51,
    })
    assert r.status_code == 422, r.text
    assert "50" in r.json()["detail"]
