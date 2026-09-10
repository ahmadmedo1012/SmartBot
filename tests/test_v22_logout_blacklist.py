from __future__ import annotations

"""v22 FIX-A — انحدارات الخروج/القائمة السوداء/التدقيق (W1-D1 B-1 + B-2).

RED-first: كُتب هذا الملف قبل الإصلاح (2026-09-10) واثبتَ فشلَ علتَي W1-D1
على الشيفرة الحية (الاختبارات 1/2/5/6 حمراء) ثم اخضرّ بعد الإصلاح.

B-1 (HIGH — W1-D1 البند 3): الخروج على PostgreSQL (الإنتاج، Neon) لم يكن
    يُبطل الجلسة إطلاقًا: ``routers/auth.py`` كان يُدرج datetime **واعيًا
    للمنطقة الزمنية** في ``blacklisted_tokens.expires_at`` — عمود
    ``TIMESTAMP WITHOUT TIME ZONE`` — وasyncpg يرفض هذا الربط (DataError)
    عند الـflush/commit، بينما ``except Exception: pass`` كان يبتلع الخطأ →
    لا صف أبدًا → التوكن (المسروق) يبقى صالحًا حتى 24 ساعة بعد الخروج.
    SQLite المحلي (aiosqlite) يقبل القيمتين بصمت — لهذا لم يكشفه أي اختبار
    قديم. الحل هنا: ``_guard_world`` يلفّ session.commit بحارس يحاكي عقد
    asyncpg الحي: يرفض datetime الواعي قبل الوصول للقاعدة تمامًا كما يفعل
    درايفر PG، فأصبح العطل قابلًا للاختبار محليًا.

B-2 (LOW-MED — W1-D1 البند 8): ``log_audit`` (add+flush فقط) كان يُستدعى
    بعد الـcommit الوحيد في ``change_password``/``admin_reset_password``
    بلا commit لاحق → صف التدقيق يضيع عند إغلاق الجلسة (الدليل الحي:
    تغيير كلمة مرور ناجح على الإنتاج بلا أي صف change_password).
"""

import logging
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import jwt
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from tests.conftest import V10_TEST_PASSWORD


class AsyncpgNaiveTimestampError(Exception):
    """بديل عن ``asyncpg.exceptions.DataError`` — نفس شرط التفعيل الحي:
    datetime واعٍ للمنطقة الزمنية مربوط بعمود TIMESTAMP WITHOUT TIME ZONE."""


async def _guard_world(reject_aware: bool = True, always_fail: bool = False) -> SimpleNamespace:
    """عالم اختبار مع «حارس asyncpg» يحاكي درايفر الإنتاج على نقطة واحدة:
    رفض إدراج blacklist بـdatetime واعٍ (W1-D1 B-1) أو تعطيل كتابة
    blacklist كليًا (محاكاة انقطاع الكتابة — عقد «الخروج الصادق»).

    ``seen`` يسجّل كل كائن BlacklistedToken وصل إلى محاولة الـcommit —
    أي «قيمة الإدراج» نفسها قبل أي تحويل من جانب القاعدة، وهذا ما
    يُفحص فيه شرط naive-UTC (على SQLite القيمة تُخزَّن وتُقرأ ساذجة
    حتى لو كُتبت واعية، فالفحص عبر قراءة الصف لا يكفي — الفحص هنا
    على القيمة المربوطة كما يراها الدرايفر).
    """
    from database import get_db
    from models import Base
    from runner import app

    test_engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    seen: list = []

    async def override_get_db():
        async with session_factory() as session:
            orig_commit = session.commit

            async def guarded_commit():
                from models import BlacklistedToken
                pending = [o for o in session.new if isinstance(o, BlacklistedToken)]
                seen.extend(pending)
                for obj in pending:
                    if always_fail or (reject_aware and obj.expires_at.tzinfo is not None):
                        raise AsyncpgNaiveTimestampError(
                            "invalid input for query argument $2: "
                            f"'{obj.expires_at}' (expected a naive datetime, "
                            "got a datetime with time zone) [simulated asyncpg]")
                await orig_commit()

            session.commit = guarded_commit
            yield session

    app.dependency_overrides[get_db] = override_get_db
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    return SimpleNamespace(app=app, sf=session_factory, engine=test_engine,
                           client=client, seen=seen)


async def _teardown_world(world: SimpleNamespace) -> None:
    from database import get_db
    world.app.dependency_overrides.pop(get_db, None)
    await world.client.aclose()
    await world.engine.dispose()
    try:
        from _services import api_cache
        api_cache.clear_all()
    except Exception:
        pass


async def _seed_user(sf, username: str = "v22_user") -> tuple[int, int]:
    """مستأجر + مدير جاهزان لدخول حقيقي عبر POST /api/login."""
    from _hash import hash_password
    from models import Tenant, User
    async with sf() as db:
        t = Tenant(name=f"T-{username}", subscription_status="PAID", is_active=True)
        db.add(t)
        await db.flush()
        u = User(username=username, email=f"{username}@test.ly",
                 password_hash=hash_password(V10_TEST_PASSWORD),
                 tenant_id=t.id, role="admin")
        db.add(u)
        await db.commit()
        return t.id, u.id


async def _login(world: SimpleNamespace, username: str) -> str:
    """دخول حقيقي → يعيد قيمة كوكي التوكن (محفوظة قبل الخروج لإعادة التشغيل)."""
    r = await world.client.post("/api/login", json={
        "username": username, "password": V10_TEST_PASSWORD,
    })
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = world.client.cookies.get("token")
    assert tok, "login did not set the session cookie"
    return tok


# ══════════════════════════════════════════════════════════════════════════
# B-1 — الخروج يكتب صف القائمة السوداء بقيمة naive-UTC (عقد asyncpg)
# ══════════════════════════════════════════════════════════════════════════


async def test_logout_blacklist_insert_is_naive_and_persisted_under_pg_contract():
    """الإدراج يجب أن يصل naive-UTC ويُصبح صفًا فعليًا حتى مع رفض asyncpg
    للقيم الواعية — هذا هو بالضبط ما كان يفشل على الإنتاج (W1-D1 B-1)."""
    from config import settings
    from models import BlacklistedToken

    world = await _guard_world(reject_aware=True, always_fail=False)
    try:
        await _seed_user(world.sf, "v22_naive")
        tok = await _login(world, "v22_naive")
        # GET أولًا يُصدر كوكي csrf (طبقة double-submit) — كما في الـrepro الحي
        r_me = await world.client.get("/api/me")
        assert r_me.status_code == 200, r_me.text

        r = await world.client.post("/api/logout")
        assert r.status_code == 200, f"logout failed: {r.status_code} {r.text[:200]}"

        # القيمة المربوطة للإدراج (كما يراها الدرايفر) — ساذجة ومطابقة لـexp
        assert world.seen, "blacklist insert never reached the commit attempt"
        payload = jwt.decode(tok, settings.SECRET_KEY, algorithms=["HS256"])
        expected = datetime.fromtimestamp(payload["exp"], tz=UTC).replace(tzinfo=None)
        assert world.seen[0].expires_at.tzinfo is None, (
            "tz-AWARE datetime bound for a TIMESTAMP WITHOUT TIME ZONE column — "
            "asyncpg (Neon/PG prod) rejects this bind and the row is never written (W1-D1 B-1)")
        assert world.seen[0].expires_at == expected
        assert world.seen[0].jti == payload["jti"]

        # الصف موجود فعلًا في القاعدة (لا ابتلاع صامت)
        async with world.sf() as db:
            rows = (await db.execute(select(BlacklistedToken))).scalars().all()
        assert len(rows) == 1, f"expected exactly 1 blacklist row, got {len(rows)}"
        assert rows[0].expires_at.tzinfo is None
    finally:
        await _teardown_world(world)


async def test_logout_fails_loudly_when_blacklist_write_fails(caplog):
    """فشل كتابة القائمة السوداء ≠ خروج ناجح: الاستجابة يجب ألا تكون 200
    والخطأ يجب أن يُسجَّل (لا ابتلاعًا صامتًا) — مرآة فلسفة honest-503
    لدفتر نبض الجدولة (bot.py): عملية «أنجزت ظاهريًا» بينما لم تنجز
    فعليًا هي إنذار كاذب للعميل."""
    world = await _guard_world(reject_aware=False, always_fail=True)
    try:
        await _seed_user(world.sf, "v22_loud")
        await _login(world, "v22_loud")
        await world.client.get("/api/me")

        with caplog.at_level(logging.ERROR, logger="fb-api"):
            r = await world.client.post("/api/logout")

        assert r.status_code != 200, (
            "silent-200 for a logout whose revocation write FAILED — the session "
            "stays alive up to 24h while the user believes it is closed (W1-D1 B-1)")
        assert r.status_code >= 500, f"expected honest 5xx, got {r.status_code}"
        logged = [rec for rec in caplog.records
                  if rec.levelno >= logging.ERROR and "blacklist" in rec.getMessage()]
        assert logged, (
            "the blacklist-write exception was swallowed without any ERROR-level log "
            "(old code: ``except Exception: pass``) — outages must be visible")
    finally:
        await _teardown_world(world)


# ══════════════════════════════════════════════════════════════════════════
# B-1 — السلوك القائم (SQLite) يبقى أخضر: إعادة تشغيل التوكن بعد الخروج
# ══════════════════════════════════════════════════════════════════════════


async def test_replayed_token_rejected_after_logout():
    """إعادة تشغيل كوكي التوكن القديم بعد الخروج → 401 «تم إلغاء الجلسة»
    (السلوك الموجود على SQLite — يجب أن يستمر بعد إعادة هيكلة الخروج)."""
    from models import BlacklistedToken

    world = await _guard_world(reject_aware=False, always_fail=False)
    try:
        await _seed_user(world.sf, "v22_replay")
        tok = await _login(world, "v22_replay")
        assert (await world.client.get("/api/me")).status_code == 200

        r = await world.client.post("/api/logout")
        assert r.status_code == 200, r.text

        # إعادة تشغيل التوكن المحفوظ (كوكي جديد يدويًا) — كما في الـrepro الحي
        world.client.cookies.set("token", tok)
        r_replay = await world.client.get("/api/me")
        assert r_replay.status_code == 401, (
            f"replayed token still valid after logout: {r_replay.status_code}")
        assert "تم إلغاء الجلسة" in r_replay.text, r_replay.text

        async with world.sf() as db:
            rows = (await db.execute(select(BlacklistedToken))).scalars().all()
        assert len(rows) == 1
    finally:
        await _teardown_world(world)


async def test_logout_with_expired_token_cookie_is_200_without_blacklist():
    """توكن منتهي أصلًا: لا شيء يُبطل (الانتهاء سبق الخروج) والخروج
    ينجح 200 ويبقى idempotent — إعادة الهيكلة لم تُكسر هذه الحالة."""
    from config import settings
    from models import BlacklistedToken
    from routers.auth import make_token

    world = await _guard_world(reject_aware=False, always_fail=False)
    try:
        uname = "v22_expired"
        tid, _ = await _seed_user(world.sf, uname)
        now = datetime.now(UTC)
        expired = jwt.encode(
            {"sub": uname, "tid": tid, "jti": "expired" * 4, "ver": 0,
             "iat": now - timedelta(days=2), "nbf": now - timedelta(days=2),
             "exp": now - timedelta(days=1)},
            settings.SECRET_KEY, algorithm="HS256")
        world.client.cookies.set("token", expired)
        r = await world.client.post("/api/logout")
        assert r.status_code == 200, r.text
        async with world.sf() as db:
            rows = (await db.execute(select(BlacklistedToken))).scalars().all()
        assert rows == [], "expired token blacklisted — nothing left to revoke"
        # التوكّع من make_token السليم يظل يعمل (عقد الوحدة لم يتغير)
        world.client.cookies.set("token", make_token(uname, tid))
        assert (await world.client.get("/api/me")).status_code == 200
    finally:
        await _teardown_world(world)


async def test_logout_without_cookie_is_idempotent_200():
    """خروج بلا كوكي: 200 نظيف (سلوك قائم — لا انحدار)."""
    world = await _guard_world(reject_aware=False, always_fail=False)
    try:
        r = await world.client.post("/api/logout")
        assert r.status_code == 200, r.text
    finally:
        await _teardown_world(world)


# ══════════════════════════════════════════════════════════════════════════
# B-2 — صفوف التدقيق بعد تغيير/إعادة تعيين كلمة المرور تُحفَظ فعلًا
# ══════════════════════════════════════════════════════════════════════════


async def _seed_two_users_one_tenant(sf, prefix: str) -> tuple[int, int, int]:
    """مستأجر واحد + مدير + عضو (لإعادة تعيين كلمة مرور داخل نفس المستأجر)."""
    from _hash import hash_password
    from models import Tenant, User
    async with sf() as db:
        t = Tenant(name=f"T-{prefix}", subscription_status="PAID", is_active=True)
        db.add(t)
        await db.flush()
        adm = User(username=f"{prefix}_adm", email=f"{prefix}_adm@test.ly",
                   password_hash=hash_password(V10_TEST_PASSWORD),
                   tenant_id=t.id, role="admin")
        member = User(username=f"{prefix}_usr", email=f"{prefix}_usr@test.ly",
                      password_hash=hash_password(V10_TEST_PASSWORD),
                      tenant_id=t.id, role="viewer")
        db.add_all([adm, member])
        await db.commit()
        return t.id, adm.id, member.id


async def test_change_password_writes_audit_row(v10_seed):
    """تغيير كلمة المرور (200) → صف change_password موجود في audit_logs
    (بقيم actor/tenant صحيحة) — كان يضيع صمتًا (log_audit بعد الـcommit
    الوحيد بلا commit لاحق — W1-D1 البند 8)."""
    from models import AuditLog

    uname, tid, uid = await v10_seed.tenant_user(tenant_name="V22ChgAudit")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.post("/api/auth/change-password", json={
        "current_password": V10_TEST_PASSWORD,
        "new_password": "V22FixA#2026pw",
    })
    assert r.status_code == 200, r.text

    async with v10_seed.world.sf() as db:
        rows = (await db.execute(
            select(AuditLog).where(AuditLog.action == "change_password",
                                   AuditLog.actor_id == uid)
        )).scalars().all()
    assert rows, "change_password audit row was lost (no commit after log_audit — W1-D1 B-2)"
    assert rows[0].tenant_id == tid
    assert rows[0].action == "change_password"


async def test_admin_reset_password_writes_audit_row(v10_seed):
    """إعادة تعيين كلمة مرور عضو (200) → صف reset_password موجود في
    audit_logs مع target_id صحيح — كان يضيع صمتًا (W1-D1 البند 8)."""
    from models import AuditLog

    tid, adm_id, member_id = await _seed_two_users_one_tenant(
        v10_seed.world.sf, "v22reset")
    await v10_seed.login("v22reset_adm")
    r = await v10_seed.world.client.post("/api/admin/reset-password", json={
        "user_id": member_id, "new_password": "V22FixA#2026rs",
    })
    assert r.status_code == 200, r.text

    async with v10_seed.world.sf() as db:
        rows = (await db.execute(
            select(AuditLog).where(AuditLog.action == "reset_password",
                                   AuditLog.actor_id == adm_id)
        )).scalars().all()
    assert rows, "reset_password audit row was lost (no commit after log_audit — W1-D1 B-2)"
    assert rows[0].tenant_id == tid
    assert rows[0].target_id == member_id
    assert rows[0].action == "reset_password"


@pytest.mark.parametrize("epoch_delta", [0, 3600, 86400])
async def test_logout_expiry_value_is_naive_utc_unit(epoch_delta):
    """فحص وحدة مباشر (بلا قاعدة): الدالة المسؤولة عن قيمة expires_at في
    المسار تُنتج datetime **ساذجًا** دائمًا مهما كان شكل المُدخل — يحرس
    ضد عودة الصيغة الواعية ``datetime.fromtimestamp(exp, tz=UTC)`` التي
    كسرت الإنتاج (asyncpg)."""
    from routers.auth import _logout_expiry_naive_utc

    exp = datetime.now(UTC).timestamp() + epoch_delta
    value = _logout_expiry_naive_utc(exp)
    assert isinstance(value, datetime)
    assert value.tzinfo is None, "logout expiry must be naive-UTC (asyncpg/PG contract)"
    expected = datetime.fromtimestamp(exp, tz=UTC).replace(tzinfo=None)
    assert value == expected
