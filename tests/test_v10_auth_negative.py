"""v10-W5 — G2: شبكة الانحدار السالبة للمصادقة/الصلاحيات (backlog S1 #1).

نمط الـprobe الأخضر من tmp_v10/s1-testing/test_probe_401.py مرفوع إلى بوابة
انحدار دائمة:

  [x] 401 sweep: كل مسارات GET المحمية الرئيسية (rules, inbox, comments,
        broadcasts, analytics, team, payments, support-tickets,
        scheduled-posts, notifications, marketing, crm, offers, templates,
        ads, reports, subscribers, tags, brand, calendar, widgets, telegram,
        admin, diagnostics, publisher, users, audit, agent-memory …) بلا
        كوكي/توكن → 401 (ليس 200/500/422). أي راوتر جديد محمي يُضاف للقائمة
        يصير حارسًا دائمًا: إزالة require-الحارس تكسر الاختبار.
  [x] توكنات فاسدة: مهملة (garbage) → 401، منتهية الصلاحية → 401 برسالة
        «انتهت صلاحية الجلسة»، بتوقيع خاطئ → 401 «رمز غير صالح».
  [x] 403: أدمن مستأجر (role=admin, tenant≠0) على مسارات أدمن المنصة
        (admin config/platform users/cron/telegram/logs) → 403.
  [x] 403: viewer على مسارات تتطلب editor (rules/broadcasts/sequences/
        ai/publisher) → 403.
  [x] POST بلا مصادقة → 401 (نفس الحارس على الطرق غير GET).
"""

from __future__ import annotations

import os
import secrets
import sys
from datetime import UTC, datetime, timedelta

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))

# ── القائمة الأساسية: مسارات GET محمية (كلها 401 اليوم — القياس مباشر) ──────
# القائمة = مسارا الـprobe الأخضر من S1 (32) + التوسعة إلى راوترات v10
# (scheduled-posts/subscribers/tags/reports/team/alerts/commerce/health/
# notifications-settings/widgets/telegram/platform-users/cron/setup/audit/
# agent-memory/marketing-audience…).
PROTECTED_GETS = [
    # analytics + dashboard
    "/api/analytics/overview",
    "/api/analytics/dashboard",
    "/api/dashboard/bundle",
    # rules + replies + comments + inbox
    "/api/replies",
    "/api/comments",
    "/api/rules",
    "/api/inbox/conversations",
    # flows + sequences + broadcasts + scheduled
    "/api/flows",
    "/api/sequences",
    "/api/broadcasts",
    "/api/scheduled-posts",
    # payments + subscriptions
    "/api/subscriptions/status",
    "/api/payments/balance",
    # facebook + posts + messages + ads
    "/api/facebook/settings",
    "/api/posts",
    "/api/messages",
    "/api/ads/accounts",
    # crm + offers + templates + calendar
    "/api/crm/customers",
    "/api/offers",
    "/api/templates",
    "/api/calendar",
    # support + notifications + team
    "/api/support/tickets",
    "/api/notifications",
    "/api/notifications/settings",
    "/api/team/role-summary",
    "/api/team/members",
    # marketing + widgets + brand
    "/api/marketing/campaigns",
    "/api/marketing/audience-size",
    "/api/widgets/recent-activity",
    "/api/widgets/ai-insights",
    "/api/widgets/sentiment-trend",
    "/api/brand",
    # subscribers + tags
    "/api/subscribers",
    "/api/subscribers/1",
    "/api/tags",
    # reports + publisher + diagnostics + logs
    "/api/reports/status",
    "/api/publisher/status",
    "/api/diagnostics/status",
    "/api/logs/stats",
    # admin/platform surfaces
    "/api/admin/config",
    "/api/admin/platform/users",
    "/api/admin/template-vars",
    "/api/cron/status",
    "/api/telegram/config",
    "/api/admin/telegram/approvers",
    "/api/setup-status",
    "/api/audit/logs",
    # users + agent memory
    "/api/users",
    "/api/agent/memory",
]


@pytest.fixture(scope="module")
async def anon_client():
    """عميل بلا أي كوكي — على التطبيق الحقيقي بقاعدة الاختبار المعزولة
    (نفس وصفة الـprobe؛ الجداول تُنشأ على محرك التطبيق مرة واحدة للوحدة)."""
    from database import engine as db_engine
    from models import Base
    from runner import app

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    import httpx
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                 base_url="http://test") as ac:
        yield ac


@pytest.mark.parametrize("path", PROTECTED_GETS)
async def test_unauthenticated_get_is_401(anon_client, path):
    """مسار محمي بلا كوكي/توكن → 401 (إزالة الحارس تكسر الانحدار فورًا)."""
    r = await anon_client.get(path)
    assert r.status_code == 401, (
        f"UNAUTHENTICATED LEAK: GET {path} → {r.status_code} (expected 401)"
    )


# ── توكنات فاسدة ────────────────────────────────────────────────────────────


async def test_garbage_token_is_401(anon_client):
    """كوكي توكن مهمل → 401 «رمز غير صالح» (ليس 500)."""
    anon_client.cookies.set("token", "this-is-not-a-jwt-at-all")
    r = await anon_client.get("/api/dashboard/bundle")
    assert r.status_code == 401, r.text
    assert "غير صالح" in r.json()["detail"], r.text
    anon_client.cookies.clear()


async def test_expired_token_is_401_arabic(anon_client):
    """توكن منتهي الصلاحية → 401 برسالة «انتهت صلاحية الجلسة»."""
    import jwt as pyjwt
    from config import settings

    now = datetime.now(UTC)
    expired = pyjwt.encode(
        {"sub": "ghost_user", "tid": 1, "jti": secrets.token_hex(16),
         "iat": now - timedelta(hours=25), "nbf": now - timedelta(hours=25),
         "exp": now - timedelta(hours=1)},
        settings.SECRET_KEY, algorithm="HS256",
    )
    anon_client.cookies.set("token", expired)
    r = await anon_client.get("/api/dashboard/bundle")
    assert r.status_code == 401, r.text
    assert "انتهت صلاحية" in r.json()["detail"], r.text
    anon_client.cookies.clear()


async def test_wrong_signature_token_is_401(anon_client):
    """توكن موقّع بمفتاح آخر → 401 (فشل التحقق لا 500)."""
    import jwt as pyjwt

    now = datetime.now(UTC)
    forged = pyjwt.encode(
        {"sub": "ghost_user", "tid": 1, "jti": secrets.token_hex(16),
         "iat": now, "nbf": now, "exp": now + timedelta(hours=1)},
        "attacker-controlled-secret-key-0123456789", algorithm="HS256",
    )
    anon_client.cookies.set("token", forged)
    r = await anon_client.get("/api/rules")
    assert r.status_code == 401, r.text
    anon_client.cookies.clear()


async def test_unauthenticated_post_is_401(anon_client):
    """نفس الحارس على الطرق غير GET: POST بلا كوكي → 401 (ليس 422/500)."""
    r = await anon_client.post("/api/rules", data={"name": "x", "keywords": "x",
                                                   "reply_template": "x"})
    assert r.status_code == 401, f"POST without auth → {r.status_code}: {r.text[:200]}"


# ── 403: أدمن المستأجر ليس أدمن المنصة ──────────────────────────────────────

PLATFORM_ADMIN_GETS = [
    "/api/admin/config",            # بيانات الحسابات/الدفع العامة
    "/api/admin/platform/users",    # مستخدمو كل المستأجرين
    "/api/cron/status",             # لوحة نبض المنصة
    "/api/telegram/config",         # توكن تلغرام العام
    "/api/admin/telegram/approvers",
    "/api/logs/stats",              # البافر العام بلا علامة مستأجر
]


@pytest.mark.parametrize("path", PLATFORM_ADMIN_GETS)
async def test_tenant_admin_forbidden_on_platform_admin_routes(v10_seed, path):
    """أدمن مستأجر (role=admin لكن tenant≠0) على مسارات أدمن المنصة → 403 —
    صلاحية مساحة عمله لا تمنحه سلطة عامة (جذر اكتشافات 2026-09-05)."""
    uname, _tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="TAdmin")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.get(path)
    assert r.status_code == 403, (
        f"tenant admin reached platform surface GET {path} → {r.status_code}: {r.text[:150]}"
    )


async def test_tenant_admin_forbidden_on_repair_post(v10_seed):
    """POST /api/repair (إصلاح DB/seed عام) لأدمن مستأجر → 403."""
    uname, _tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="TAdmin-R")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.post("/api/repair")
    assert r.status_code == 403, f"POST /api/repair → {r.status_code}: {r.text[:150]}"


async def test_tenant_admin_forbidden_on_config_post(v10_seed):
    """POST /api/admin/config (توجيه مدفوعات المنصة) لأدمن مستأجر → 403 —
    كان يستطيع تحويل مدفوعات كل المستأجرين لمحفظته (2026-09-05)."""
    uname, _tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="TAdmin-C")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.post("/api/admin/config", json={
        "config": {"bank_transfer_bank_name": "حساب المهاجم"},
    })
    assert r.status_code == 403, r.text


# ── 403: viewer دون مستوى editor ─────────────────────────────────────────────

VIEWER_FORBIDDEN_POSTS = [
    ("/api/rules", {"name": "x", "keywords": "x", "reply_template": "x"}),
    ("/api/broadcasts", {"name": "x", "message_template": "x"}),
    ("/api/sequences", {"name": "x"}),
    ("/api/ai/generate-reply", {"comment_text": "x"}),
    ("/api/publisher/publish", {"content": "x"}),
]


@pytest.mark.parametrize("path,payload", VIEWER_FORBIDDEN_POSTS)
async def test_viewer_forbidden_on_editor_posts(v10_seed, path, payload):
    """viewer على مسارات editor (كتابة قواعد/حملات/نشر) → 403 — بوابة
    require_role قبل أي تحقق للجسم (لا 422)."""
    uname, _tid, _uid = await v10_seed.tenant_user(role="viewer", tenant_name="Viewer")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.post(path, json=payload)
    assert r.status_code == 403, (
        f"viewer passed editor gate POST {path} → {r.status_code}: {r.text[:150]}"
    )
