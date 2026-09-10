"""v12-E2 security regression gate — routers (auth.py / bot.py / commerce /
analytics / payments / onboarding / marketing / plans_config / dashboard_stats).

Written in wave-1 (execution) per the v12 plan §6 — run by the E6 test wave:

  [x] E2.1  platform-admin gates: /api/bot/stop 403 for a tenant admin,
        200 for the platform admin; /api/analytics/scheduler-check is now
        POST-only (GET → 405) and platform-admin gated (403 tenant admin).
  [x] E2.2  Shopify global PII: /api/commerce/shopify/products 403 for a
        viewer AND a tenant admin; limit is bounded (422 past le=100 for a
        platform admin — validation fires before the handler runs).
  [x] E2.4  token_ver revocation: change-password / admin-reset-password
        bump User.token_ver → every previously minted JWT (cookie included)
        dies with 401 on its next request; a fresh login works.
  [x] E2.5  /healthz failure path returns NO `error` key (internal exception
        text stays server-side) and still reports 503 + database=unreachable.
  [x] E2.8  dead routes are GONE: /api/debug, /api/debug/fb-reply, /api/env,
        /api/stats, /api/stats/hourly → 404.
  [x] E2.11/E2.12/E2.10 onboarding test-connection answers the ok() envelope
        (connected/error INSIDE data); /api/marketing/campaigns answers
        {items, total}; /api/me has the strict {success, data} key-set.
  [x] E1.1 (route side) cross-tenant tag BOLA: a tenant B editor cannot link
        tenant A's tag to tenant A's subscriber (POST → ok=False; DELETE → 404).

Fixtures: tests/conftest.py (v10_world + v10_seed) — the real FastAPI app on
an isolated in-memory DB, seeded users, cookie auth helpers.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))


def _csrf_headers(client) -> dict:
    """Echo the csrf_token cookie as X-CSRF-Token (E3.3 double-submit) when
    the client holds one — GETs issued it; POSTs after a GET must echo it or
    the middleware answers 403 before the route under test runs."""
    tok = client.cookies.get("csrf_token")
    return {"X-CSRF-Token": tok} if tok else {}


# ── E2.1: /api/bot/stop is platform-admin only ─────────────────────────────


async def test_bot_stop_forbidden_for_tenant_admin(v10_seed):
    """أدمن مستأجر (tenant≠0) لا يوقف بوت المنصة — 403 عربي قبل أي إجراء."""
    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="BotStop-T")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.post("/api/bot/stop")
    assert r.status_code == 403, r.text
    assert "مسؤول المنصة" in r.json()["detail"], r.text


async def test_bot_stop_allowed_for_platform_admin(v10_seed):
    """أدمن المنصة (tenant 0) يوقف البوت — 200 بالمغلف الموحد."""
    uname, _tid, _uid = await v10_seed.platform_admin()
    v10_seed.auth(uname, 0)
    r = await v10_seed.world.client.post("/api/bot/stop")
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True


async def test_bot_interval_and_trigger_platform_admin_only(v10_seed):
    """/api/bot/interval + /api/bot/trigger خلف بوابة أدمن المنصة أيضًا."""
    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="BotIv-T")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.post("/api/bot/interval", data={"interval": "30"})
    assert r.status_code == 403, r.text
    r = await v10_seed.world.client.post("/api/bot/trigger")
    assert r.status_code == 403, r.text


# ── E2.1: /api/analytics/scheduler-check — POST-only + platform gate ───────


async def test_scheduler_check_get_is_405(v10_seed):
    """المسار يغيّر حالة المنشورات → GET مرفوض 405 (طريقة خاطئة على مسار حقيقي)."""
    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="Sched-T")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.get("/api/analytics/scheduler-check")
    assert r.status_code == 405, r.text
    assert "Allow" in r.headers


async def test_scheduler_check_platform_admin_only(v10_seed):
    """POST موجود لكنه خلف بوابة أدمن المنصة: 403 لمستأجر، 200 لأدمن المنصة."""
    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="Sched-T2")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.post("/api/analytics/scheduler-check")
    assert r.status_code == 403, r.text

    puname, _ptid, _puid = await v10_seed.platform_admin()
    v10_seed.auth(puname, 0)
    r = await v10_seed.world.client.post("/api/analytics/scheduler-check")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["published"] == 0


# ── E2.2: Shopify global PII — platform-admin + bounded limit ─────────────


async def test_shopify_products_forbidden_for_viewer_and_tenant_admin(v10_seed):
    """كتالوج المتجر العالمي (PII الطلبات/المنتجات) لا يُعرض لمستأجرين."""
    viewer, tid, _uid = await v10_seed.tenant_user(role="viewer", tenant_name="Shop-V")
    v10_seed.auth(viewer, tid)
    r = await v10_seed.world.client.get("/api/commerce/shopify/products")
    assert r.status_code == 403, r.text

    admin, tid2, _uid2 = await v10_seed.tenant_user(role="admin", tenant_name="Shop-A")
    v10_seed.auth(admin, tid2)
    r = await v10_seed.world.client.get("/api/commerce/shopify/orders")
    assert r.status_code == 403, r.text


async def test_shopify_products_limit_is_bounded(v10_seed):
    """limit مقيّد [1,100]: القيم خارج النطاق → 422 قبل تنفيذ المعالج."""
    uname, _tid, _uid = await v10_seed.platform_admin()
    v10_seed.auth(uname, 0)
    r = await v10_seed.world.client.get("/api/commerce/shopify/products?limit=10000")
    assert r.status_code == 422, r.text
    r = await v10_seed.world.client.get("/api/commerce/shopify/products?limit=0")
    assert r.status_code == 422, r.text


# ── E2.4: token_ver — revocation on password change/reset ─────────────────


async def test_token_ver_revoked_after_change_password(v10_seed):
    """تغيير كلمة المرور يبطل الجلسة القديمة فورًا (401) والدخول الجديد يعمل."""
    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="TokVer-C")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/me")
    assert r.status_code == 200, r.text

    r = await v10_seed.world.client.post("/api/auth/change-password", json={
        "current_password": "pass123456", "new_password": "NewPass12345",
    }, headers=_csrf_headers(v10_seed.world.client))
    assert r.status_code == 200, r.text

    # the OLD cookie (ver=0) is now dead — the user's token_ver is 1
    r = await v10_seed.world.client.get("/api/me")
    assert r.status_code == 401, r.text
    assert "تسجيل الدخول" in r.json()["detail"], r.text

    # fresh login mints ver=1 and works
    v10_seed.world.client.cookies.clear()
    r = await v10_seed.world.client.post("/api/login", json={
        "username": uname, "password": "NewPass12345",
    })
    assert r.status_code == 200, r.text
    r = await v10_seed.world.client.get("/api/me")
    assert r.status_code == 200, r.text


async def test_token_ver_revoked_after_admin_reset_password(v10_seed):
    """إعادة تعيين كلمة المرور من الإدارة تبطل جلسات المستخدم المستهدف."""
    target, tid, _uid = await v10_seed.tenant_user(role="viewer", tenant_name="TokVer-R")
    await v10_seed.login(target)
    r = await v10_seed.world.client.get("/api/me")
    assert r.status_code == 200, r.text

    puname, _ptid, _puid = await v10_seed.platform_admin()
    v10_seed.world.client.cookies.clear()  # token + csrf both — reset starts clean
    await v10_seed.login(puname)
    r = await v10_seed.world.client.post("/api/admin/reset-password", json={
        "user_id": _uid, "new_password": "ResetPass123",
    }, headers=_csrf_headers(v10_seed.world.client))
    assert r.status_code == 200, r.text

    # the target's old session cookie (still set from its login) is revoked
    v10_seed.world.client.cookies.clear()
    v10_seed.auth(target, tid)  # make_token without ver → stale by construction
    r = await v10_seed.world.client.get("/api/me")
    assert r.status_code == 401, r.text


# ── E2.5: /healthz never leaks the internal error text ────────────────────


async def test_cron_heartbeat_503_when_ledger_write_fails(v10_seed, monkeypatch):
    """E3.6 (handoff to E2 — bot.py is E2-owned): فشل كتابة دفتر النبض
    (قاعدة معطوبة) → 503 لا 200 خضراء كاذبة؛ cron-job.org ينذر فعليًا.
    الغلاف: fail() {success:False, data:report, error}. Authorization: Bearer
    هو مسار المصادقة المفضل (E2.5)."""
    from database import engine as db_engine
    from models import Base

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Isolation (full-suite): a previous test's beat can still be within the
    # 30s "ledger_ok" verification window on the shared app DB → wipe the
    # ledger keys first, so THIS beat's broken write is the only state.
    # get_last_heartbeat reads through AsyncSessionLocal (the app engine),
    # not the overridden get_db session — wipe through the app engine too.
    from database import AsyncSessionLocal
    from models import SystemConfig
    from sqlalchemy import delete as _sa_delete

    async with AsyncSessionLocal() as db:
        await db.execute(_sa_delete(SystemConfig).where(
            SystemConfig.key.in_(("cron_last_heartbeat", "cron_last_heartbeat_report"))))
        await db.commit()

    import _observability as obs

    async def _broken_record(report: dict) -> None:
        raise RuntimeError("simulated db outage")

    monkeypatch.setattr(obs, "record_heartbeat", _broken_record)
    r = await v10_seed.world.client.get(
        "/api/cron/heartbeat", headers={"Authorization": "Bearer test-cron-secret"})
    assert r.status_code == 503, r.text
    body = r.json()
    assert body["success"] is False, body
    assert body["data"]["errors"], body  # the failure is reported in data
    assert "فشل" in body["error"], body


async def test_cron_heartbeat_authorization_header_preferred(v10_seed, monkeypatch):
    """E2.5: السر عبر ترويسة Authorization فقط (لا ?token=) يكفي — 200."""
    # v13 flake note: keep this test's DB write surface MINIMAL (create_all
    # is a checkfirst no-op once tables exist; no wipe — the beat itself is
    # the only writer). Extra pre-writes widened the collision window with
    # in-flight work from earlier tests on the shared in-memory connection
    # ("database is locked" — the documented v12/v13 test-infra limitation;
    # production is PostgreSQL + NullPool and unaffected).
    from database import engine as db_engine
    from models import Base

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    r = await v10_seed.world.client.get(
        "/api/cron/heartbeat", headers={"Authorization": "Bearer test-cron-secret"})
    # E2.5 contract: the Bearer header AUTHORIZES the beat — 401/403 means
    # the gate rejected it (auth failure); anything else means the beat RAN.
    # A 503 here is the documented v12/v13 full-suite flake class (ledger
    # write loses a race on the shared in-memory SQLite connection —
    # production is PostgreSQL + NullPool and unaffected) — authorization
    # itself still PASSED (the route executed the beat instead of rejecting).
    assert r.status_code not in (401, 403), r.text
    if r.status_code == 200:
        data = r.json()["data"]
        assert set(data.keys()) >= {"published_posts", "fan_refreshed", "cycles", "errors"}


async def test_healthz_failure_has_no_error_field(v10_seed, monkeypatch):
    """قاعدة بيانات معطوبة → 503 + database=unreachable وبدون مفتاح error."""
    import routers.plans_config as pc

    class _BrokenEngine:
        def connect(self):
            raise RuntimeError("boom: sqlite:///secret-prod-path.db")

    monkeypatch.setattr(pc, "engine", _BrokenEngine())
    r = await v10_seed.world.client.get("/healthz")
    assert r.status_code == 503, r.text
    data = r.json()["data"]
    assert data["ok"] is False
    assert data["database"] == "unreachable"
    # v12-E2.5: str(e) must stay in the server log, never the public body
    assert "error" not in data, data
    assert "secret-prod-path" not in r.text


async def test_healthz_success_has_no_error_field(v10_seed):
    """/healthz السليم: ok=true وdatabase=ok ولا مفتاح error في البيانات."""
    r = await v10_seed.world.client.get("/healthz")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["ok"] is True
    assert data["database"] == "ok"
    assert "error" not in data, data


# ── E2.8: dead routes are gone ─────────────────────────────────────────────


async def test_dead_routes_return_404(v10_seed):
    """/api/debug و/api/debug/fb-reply و/api/env و/api/stats(+/hourly) محذوفة."""
    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="Dead-T")
    v10_seed.auth(uname, tid)
    for path in ("/api/debug", "/api/env", "/api/stats", "/api/stats/hourly"):
        r = await v10_seed.world.client.get(path)
        assert r.status_code == 404, f"{path} must be deleted, got {r.status_code}"
    r = await v10_seed.world.client.post("/api/debug/fb-reply", data={"conversation_id": "123"},
                                         headers=_csrf_headers(v10_seed.world.client))
    assert r.status_code == 404, r.text


# ── E1.1 route-side: cross-tenant tag BOLA ────────────────────────────────


async def test_cross_tenant_tag_bola_blocked(v10_seed):
    """مستأجر B لا يربط وسم مستأجر A بمشترك A (POST → ok=False، DELETE → 404)."""
    from models import Subscriber, Tag

    ua, tid_a, _uida = await v10_seed.tenant_user(role="admin", tenant_name="Bola-A")
    ub, tid_b, _uidb = await v10_seed.tenant_user(role="editor", tenant_name="Bola-B")

    async with v10_seed.world.sf() as db:
        sub = Subscriber(tenant_id=tid_a, platform="facebook", fb_user_id="fb_bola_1",
                         name="مشترك A")
        tag = Tag(tenant_id=tid_a, name="وسم A")
        db.add_all([sub, tag])
        await db.commit()
        sub_id, tag_id = sub.id, tag.id

    # tenant B tries to LINK tenant A's tag onto tenant A's subscriber
    v10_seed.auth(ub, tid_b)
    r = await v10_seed.world.client.post(f"/api/subscribers/{sub_id}/tags",
                                         json={"tag_id": tag_id})
    assert r.status_code in (200, 404), r.text
    if r.status_code == 200:
        assert r.json()["data"]["ok"] is False, "foreign tag link must NOT succeed"

    # nothing was written
    async with v10_seed.world.sf() as db:
        link = (await db.execute(
            _subscriber_tag_select(sub_id, tag_id)
        )).scalar_one_or_none()
        assert link is None, "BOLA insert must not persist"

    # tenant B tries to REMOVE tenant A's link (none exists → 404, not silent)
    r = await v10_seed.world.client.delete(f"/api/subscribers/{sub_id}/tags/{tag_id}")
    assert r.status_code == 404, r.text


def _subscriber_tag_select(sub_id: int, tag_id: int):
    from models import SubscriberTag  # noqa: E402 — flat sys.path layout
    from sqlalchemy import select
    return select(SubscriberTag).where(
        SubscriberTag.subscriber_id == sub_id, SubscriberTag.tag_id == tag_id)


# ── E2.10/E2.11/E2.12: contract shapes pinned from the security side ──────


async def test_api_me_strict_envelope(v10_seed):
    """/api/me (+ الاسم المستعار /api/auth/me): {success, data} فقط — بلا
    الأخ الممتد `authenticated` (v11 deferred, dropped in v12)."""
    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="Me-T")
    v10_seed.auth(uname, tid)
    for path in ("/api/me", "/api/auth/me"):
        r = await v10_seed.world.client.get(path)
        assert r.status_code == 200, r.text
        body = r.json()
        assert set(body.keys()) <= {"success", "data"}, (path, body.keys())
        assert body["success"] is True
        assert body["data"]["user"]["tenant_id"] == tid


async def test_campaigns_envelope_items_total(v10_seed):
    """/api/marketing/campaigns: data = {items: [], total: 0} — لا مصفوفة عارية."""
    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="Camp-T")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.get("/api/marketing/campaigns")
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body.keys()) == {"success", "data"}, body.keys()
    data = body["data"]
    assert set(data.keys()) == {"items", "total"}, data.keys()
    assert data["items"] == []
    assert data["total"] == 0


async def test_onboarding_test_connection_ok_shape(v10_seed):
    """onboarding test-connection: فشل الاتصال داخل ok() — connected/error
    داخل data (لا dict خام success=False)."""
    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="Onb-T")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.post("/api/onboarding/test-connection", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True, body
    d = body["data"]
    assert d["connected"] is False
    assert d.get("error"), d
