"""v22 FIX-E (W1-D9) — domain 9 red→green tests.

F1 (P1): availability probe must survive the Vercel OSError (missing pango
         system libs) → /api/reports/* degrade honestly (200 status with
         available=false / clean 503) instead of 500 ×5 in production.
F2 (P2): cross-tenant fan_count/connected bleed — global env credentials
         (the OWNER's page) must never serve a real tenant's dashboard
         bundle; fan_count/connected derive from the TENANT's own BotState,
         same source as /api/analytics/overview (consistency everywhere).
F5 (P4): ``days`` query param bounded (ge=1, le=365) — -1/0/366 → 422.
"""
from __future__ import annotations

import pytest

# ════════════════════════════════════════════════════════════════════════════
# Fixtures
# ════════════════════════════════════════════════════════════════════════════


@pytest.fixture(scope="module", autouse=True)
async def real_db():
    """جداول على محرك التطبيق الحقيقي — محرك PDF يفتح جلساته عبر
    AsyncSessionLocal مباشرة (نفس نمط test_v14_engines)."""
    from database import engine as db_engine
    from models import Base
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@pytest.fixture
def break_weasyprint(monkeypatch):
    """Factory: حاكِ زمن تشغيل Vercel — ``import weasyprint`` يرفع OSError
    (مكتبات pango/cairo غائبة عن صورة السيرفرلس).

    يعيد تحميل pdf_reports_engine ليعاد تشغيل فحص التوفر تحت الاستيراد
    المكسور، ثم يستعيد الوحدة السليمة عند الخروج (بقية الجناح تعتمد
    عليها). break_fpdf=True يحاكي الإنتاج أيضاً (fpdf2 غير مثبت هناك).
    """
    made = {"broken": False}

    def _break(break_fpdf: bool = True):
        import builtins
        import importlib

        import pdf_reports_engine as pre

        real_import = builtins.__import__

        def fake_import(name, *args, **kwargs):
            if name == "weasyprint":
                raise OSError("cannot load library 'libpango-1.0-0': "
                              "no such file or directory")
            if break_fpdf and name == "fpdf":
                raise ImportError("No module named 'fpdf'")
            return real_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", fake_import)
        importlib.reload(pre)
        made["broken"] = True
        return pre

    yield _break
    if made["broken"]:
        monkeypatch.undo()
        import importlib

        import pdf_reports_engine as pre
        importlib.reload(pre)


# ════════════════════════════════════════════════════════════════════════════
# F1 — probe survives OSError → honest degradation, never 500
# ════════════════════════════════════════════════════════════════════════════


async def test_probe_reports_unavailable_when_import_raises_oserror(break_weasyprint):
    """Vercel: OSError عند الاستيراد → المحرك «غير متاح» (كان: استثناء
    غير ملتقط ينفجر في كل مسار /api/reports/*)."""
    pre = break_weasyprint(break_fpdf=True)
    engine = pre.PdfReportsEngine()
    assert engine.is_available() is False
    assert engine.engine_name == "none"
    # التشخيص ظاهر للمراقبة دون قراءة سجلات Vercel
    assert "OSError" in engine.probe_error()
    assert "pango" in engine.probe_error()


async def test_reports_status_200_engine_unavailable_not_500(v10_seed, break_weasyprint):
    """GET /api/reports/status مع محرك مكسور → 200 {available:false,
    engine:"none"} (كان 500 في الإنتاج — عقد الواجهة: زر معطّل بنص صادق)."""
    break_weasyprint(break_fpdf=True)
    uname, _tid, _uid = await v10_seed.tenant_user(tenant_name="V22-PDF-Stat")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/reports/status")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert body["data"]["available"] is False
    assert body["data"]["engine"] == "none"
    assert "pango" in body["data"]["probe_error"]


async def test_reports_generate_503_when_engine_unavailable_not_500(v10_seed, break_weasyprint):
    """POST /api/reports/generate مع محرك مكسور → 503 برسالة عربية نظيفة
    (كان 500 — الاستيراد الكسول كان ينفجر قبل أي منطق)."""
    break_weasyprint(break_fpdf=True)
    uname, _tid, _uid = await v10_seed.tenant_user(tenant_name="V22-PDF-Gen")
    await v10_seed.login(uname)
    await v10_seed.world.client.get("/api/analytics/overview")  # يُصدر كوكي CSRF
    r = await v10_seed.world.client.post("/api/reports/generate",
                                         json={"type": "monthly", "days": 30})
    assert r.status_code == 503, r.text
    assert "محرك التقارير غير متاح" in r.json()["detail"]
    # نفس العقد للنوع المجهول: لا 500 أبداً
    r2 = await v10_seed.world.client.post("/api/reports/generate",
                                          json={"type": "bogus", "days": 30})
    assert r2.status_code == 503, r2.text


async def test_reports_generate_renders_via_fpdf_fallback(v10_seed, break_weasyprint):
    """الاحتياط fpdf2 محلياً: weasyprint مكسور (OSError) لكن fpdf مثبت →
    المحرك «fpdf» والتوليد يعيد PDF فعلياً (مسار الاحتياط كان ميتاً —
    fpdf2 يعيد bytearray و .encode('latin-1') كان يرفع AttributeError)."""
    pre = break_weasyprint(break_fpdf=False)
    engine = pre.PdfReportsEngine()
    assert engine.is_available() is True
    assert engine.engine_name == "fpdf"
    uname, _tid, _uid = await v10_seed.tenant_user(tenant_name="V22-PDF-Fb")
    await v10_seed.login(uname)
    await v10_seed.world.client.get("/api/analytics/overview")
    r = await v10_seed.world.client.post("/api/reports/generate",
                                        json={"type": "monthly", "days": 7})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.content[:5] == b"%PDF-"


async def test_reports_generate_weasyprint_local_still_renders(v10_seed):
    """المسار الرئيسي (البيئة المحلية فيها pango): weasyprint متاح والتقرير
    يتولد فعلياً — التعديل على الفحص لا يكسر المسار السليم."""
    import pdf_reports_engine as pre
    assert pre.PdfReportsEngine().is_available() is True
    assert pre.PdfReportsEngine().engine_name == "weasyprint"
    uname, _tid, _uid = await v10_seed.tenant_user(tenant_name="V22-PDF-Ok")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/reports/status")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["available"] is True
    assert r.json()["data"]["engine"] == "weasyprint"
    await v10_seed.world.client.get("/api/analytics/overview")  # كوكي CSRF
    g = await v10_seed.world.client.post("/api/reports/generate",
                                         json={"type": "monthly", "days": 7})
    assert g.status_code == 200, g.text
    assert g.headers["content-type"].startswith("application/pdf")
    assert g.content[:5] == b"%PDF-"


# ════════════════════════════════════════════════════════════════════════════
# F2 — cross-tenant fan_count / connected bleed
# ════════════════════════════════════════════════════════════════════════════


async def test_bundle_and_overview_consistent_zero_for_unconnected_tenant(
        v10_seed, monkeypatch):
    """الإنتاج: اعتمادات env موجودة (صفحة المالك، 5 معجبين) + مستأجر جديد
    بلا حالة → الحزمة والتحليلات كلاهما fan=0 / connected=false (كان:
    الحزمة تعرض 5 + «متصل» بينما overview يعرض 0 — رقمان مختلفان لنفس
    المستأجر على صفحتين)."""
    import routers.dashboard_stats as ds_mod

    owner_calls: list[int] = []

    class OwnerPageFB:  # عميل المنصة العام — لا يجوز أن يُستدعى أبداً
        async def get_page_fan_count(self):
            owner_calls.append(1)
            return 5

    async def no_tenant_fb(_tid):
        return None

    # نفس شروط الإنتاج: has_global_fb_credentials() → True
    monkeypatch.setattr(ds_mod, "fb", OwnerPageFB())
    monkeypatch.setattr(ds_mod, "get_tenant_fb_client", no_tenant_fb)
    monkeypatch.setattr(ds_mod, "has_global_fb_credentials", lambda: True)
    import _services
    monkeypatch.setattr(_services, "get_tenant_fb_client", no_tenant_fb)

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="V22-Bleed")
    await v10_seed.login(uname)

    r = await v10_seed.world.client.get("/api/dashboard/bundle")
    assert r.status_code == 200, r.text
    bundle = r.json()["data"]
    assert owner_calls == [], "platform env client served a tenant bundle (bleed)"
    assert bundle["stats"]["fan_count"] == 0, bundle["stats"]
    assert bundle["connection"]["connected"] is False, bundle["connection"]

    o = await v10_seed.world.client.get("/api/analytics/overview")
    assert o.status_code == 200, o.text
    assert o.json()["data"]["fan_count"] == 0
    # المصدر واحد الآن: رقمان متسقان لنفس المستأجر على الصفحتين


async def test_bundle_and_overview_consistent_own_snapshot(v10_seed, monkeypatch):
    """مستأجر مربوط بحالته الخاصة → كلا المسارين يعرضان قيمته هو
    (snapshot للنبضة/الربط) — لا قيمة المالك."""
    import _services
    import routers.dashboard_stats as ds_mod
    from models import BotState

    class OwnPageFB:
        async def get_page_fan_count(self):
            return 777

    async def own_tenant_fb(_tid):
        return OwnPageFB()

    monkeypatch.setattr(ds_mod, "get_tenant_fb_client", own_tenant_fb)
    monkeypatch.setattr(_services, "get_tenant_fb_client", own_tenant_fb)

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="V22-Own")
    sf = v10_seed.world.sf
    async with sf() as db:
        db.add_all([
            BotState(tenant_id=tid, key="fb_page_id", value="12345"),
            BotState(tenant_id=tid, key="fb_fan_count", value="777"),
            BotState(tenant_id=tid, key="fb_page_name", value="صفحة المستأجر"),
        ])
        await db.commit()
    await v10_seed.login(uname)

    r = await v10_seed.world.client.get("/api/dashboard/bundle")
    assert r.status_code == 200, r.text
    bundle = r.json()["data"]
    assert bundle["connection"]["connected"] is True
    assert bundle["stats"]["fan_count"] == 777
    assert bundle["connection"]["page_name"] == "صفحة المستأجر"

    o = await v10_seed.world.client.get("/api/analytics/overview")
    assert o.status_code == 200, o.text
    assert o.json()["data"]["fan_count"] == 777  # نفس القيمة، نفس المصدر


# ════════════════════════════════════════════════════════════════════════════
# F5 — days query param bounded
# ════════════════════════════════════════════════════════════════════════════


async def test_days_param_out_of_range_is_422(v10_seed):
    """days=-1 / 0 / 366 → 422 قبل أي استعلام (كان يمر: 200 مع نافذة
    مستقبلية صامتة فارغة). القيم الصالحة تبقى 200."""
    uname, _tid, _uid = await v10_seed.tenant_user(tenant_name="V22-Days")
    await v10_seed.login(uname)
    bad = (
        "/api/analytics/overview?days=-1",
        "/api/analytics/overview?days=0",
        "/api/analytics/overview?days=366",
        "/api/analytics/daily-trend?days=-5",
        "/api/analytics/period-comparison?days=400",
    )
    for path in bad:
        r = await v10_seed.world.client.get(path)
        assert r.status_code == 422, f"{path} → {r.status_code} (expected 422)"
    ok_paths = (
        "/api/analytics/overview?days=30",
        "/api/analytics/overview?days=1",
        "/api/analytics/overview?days=365",
    )
    for path in ok_paths:
        r = await v10_seed.world.client.get(path)
        assert r.status_code == 200, f"{path} → {r.status_code} (expected 200)"
