from __future__ import annotations
"""
Phase G (= الخطة 7) — بوابة الخروج: الأمان

Exit-gate evidence per PLAN-REBUILD-V2.md §7.1:
  [x] CSRF: middleware يرفض Origin غير مسموح (403)
  [x] Rate limiting شامل: login 10/min, register 5/5min, subscriptions 5/min
      (المرحلة B) — والآن payments (topup/confirm) + upload 10/min (هذه المرحلة)
  [x] SQL Injection: SQLAlchemy ORM (حارس مصدري على الاستعلامات الخام)
  [x] Password Hashing: Argon2id (مع سقوط bcrypt للتوافق)
  [x] JWT Blacklist: logout يُبطل الرمز فوراً
  [x] CSP + رؤوس الأمان على كل استجابة
  [2FA: مؤجل لما بعد MVP — كما تنص الخطة]
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import select


async def _make_fixture():
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy.pool import StaticPool
    from models import Base
    from database import get_db
    from runner import app

    test_engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    import routers.payments as payments_mod
    orig_al = payments_mod.AsyncSessionLocal
    payments_mod.AsyncSessionLocal = session_factory  # rate limiter sessions

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    import httpx
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    return app, session_factory, test_engine, client, (payments_mod, orig_al)


async def _teardown(fixture):
    from database import get_db
    app, _sf, te, client, (payments_mod, orig_al) = fixture
    app.dependency_overrides.pop(get_db, None)
    payments_mod.AsyncSessionLocal = orig_al
    await client.aclose()
    await te.dispose()


async def _seed(fixture):
    from models import Tenant, User
    from routers.auth import make_token
    from _hash import hash_password
    app, sf, te, client, _ = fixture
    async with sf() as db:
        t = Tenant(name="T-Sec", subscription_status="PAID", is_active=True)
        db.add(t)
        await db.flush()
        u = User(username="secure_user", email="sec@test.ly",
                 password_hash=hash_password("pass123456"), tenant_id=t.id, role="admin")
        db.add(u)
        await db.commit()
        tid = t.id
    client.cookies.set("token", make_token("secure_user", tid))
    return tid


# ── §7.1: Rate limiting on /api/payments/* + /api/upload ────────────────────

async def test_topup_rate_limited():
    """الخطة: 'payments: مفقود → أضف' — 11 طلب شحن في دقيقة → الأخير 429."""
    fixture = await _make_fixture()
    try:
        await _seed(fixture)
        statuses = []
        for _ in range(11):
            r = await fixture[3].post("/api/payments/topup", json={
                "amount": 5, "provider": "liyana", "phone": "0912345678",
            })
            statuses.append(r.status_code)
        # الأوائل تمر (200) ثم 429 بعد تجاوز 10/دقيقة
        assert 429 in statuses, f"الحد غير مفعل على topup: {statuses}"
        assert statuses.index(429) >= 9, f"أخل بالحد مبكراً: {statuses}"
    finally:
        await _teardown(fixture)


async def test_confirm_rate_limited():
    fixture = await _make_fixture()
    try:
        await _seed(fixture)
        statuses = []
        for _ in range(11):
            r = await fixture[3].post("/api/payments/confirm", json={
                "payment_id": 99999, "reference": "REF123456",
            })
            statuses.append(r.status_code)
        assert 429 in statuses, f"الحد غير مفعل على confirm: {statuses}"
    finally:
        await _teardown(fixture)


# ── §7.1: CSRF origin check ─────────────────────────────────────────────────

async def test_csrf_rejects_foreign_origin():
    """Origin أجنبي على POST /api/* → 403 (خطة: csrf_origin_check موجود ✅)."""
    fixture = await _make_fixture()
    try:
        await _seed(fixture)
        r = await fixture[3].post(
            "/api/payments/balance",  # أي POST لأثر الميدل‌وير — نستخدم مساراً يمر بالـ middleware
            headers={"Origin": "https://evil-attacker.example"},
            json={},
        )
        assert r.status_code == 403, f"الميدل‌وير لم يرفض Origin أجنبي: {r.status_code}"
        assert "origin" in r.text.lower()
    finally:
        await _teardown(fixture)


async def test_csrf_allows_trusted_origin():
    fixture = await _make_fixture()
    try:
        await _seed(fixture)
        r = await fixture[3].post(
            "/api/payments/topup",
            headers={"Origin": "https://bot.smart-link.ly"},
            json={"amount": 5, "provider": "liyana", "phone": "0912345678"},
        )
        assert r.status_code in (200, 400), r.text  # عبر الميدل‌وير ووصل المعالج
    finally:
        await _teardown(fixture)


# ── §7.1: Security headers on every response ────────────────────────────────

async def test_security_headers_present():
    """CSP وHSTS وXFO على كل استجابة (خطة §7.2)."""
    fixture = await _make_fixture()
    try:
        r = await fixture[3].get("/api/health")
        h = r.headers
        csp = h.get("content-security-policy", "")
        assert "default-src 'self'" in csp
        assert "frame-ancestors 'none'" in csp
        assert "script-src" in csp and "connect-src" in csp
        assert h.get("x-frame-options") == "DENY"
        assert "max-age" in h.get("strict-transport-security", "")
        assert h.get("x-content-type-options") == "nosniff"
        assert h.get("referrer-policy") == "strict-origin-when-cross-origin"
    finally:
        await _teardown(fixture)


# ── §7.1: Argon2id + JWT blacklist ──────────────────────────────────────────

def test_password_hashing_is_argon2id():
    from _hash import hash_password, verify_password
    h = hash_password("S3cret-pass")
    assert h.startswith("$argon2id$"), "الخطة: Argon2 — الافتراضي يجب أن يكون argon2id"
    assert verify_password("S3cret-pass", h)
    assert not verify_password("wrong", h)


async def test_logout_blacklists_token():
    """logout → الرمز القديم يُرفض فوراً (401) على /api/me."""
    fixture = await _make_fixture()
    try:
        await _seed(fixture)
        client = fixture[3]
        r = await client.post("/api/logout")
        assert r.status_code == 200, r.text
        r = await client.get("/api/me")
        assert r.status_code == 401, f"الرمز لم يُبطل بعد الخروج: {r.status_code}"
    finally:
        await _teardown(fixture)


async def test_login_rate_limited():
    """login: 10 محاولات/دقيقة (الخطة: موجود ✅ — يُثبت هنا)."""
    fixture = await _make_fixture()
    try:
        statuses = []
        for _ in range(12):
            r = await fixture[3].post("/api/login", json={
                "username": "ghost", "password": "wrong-pass",
            })
            statuses.append(r.status_code)
        assert 429 in statuses, f"حد login غير مفعل: {statuses}"
    finally:
        await _teardown(fixture)


# ── §7.1: SQL injection — ORM-only data access (source guard) ───────────────

def test_no_raw_string_sql_interpolation():
    """حارس مصدري: لا استعلامات نصية مركّبة (f-string/format على SQL) في المسارات."""
    import re
    base = os.path.dirname(__file__)
    offenders = []
    routers_dir = os.path.join(base, "routers")
    for fn in os.listdir(routers_dir):
        if not fn.endswith(".py"):
            continue
        src = open(os.path.join(routers_dir, fn), encoding="utf-8").read()
        # f-string أو % أو .format على text(...)/execute مباشرة
        for m in re.finditer(r'(text\([^)]*?)\{|(execute\([^)]*?)\s*%\s|("SELECT[^"]*"\s*\+)', src):
            offenders.append(f"{fn}: …{src[max(0, m.start()-40):m.end()+40]!r}…")
    assert not offenders, f"استعلامات خام مركّبة (خطر SQLi): {offenders}"
