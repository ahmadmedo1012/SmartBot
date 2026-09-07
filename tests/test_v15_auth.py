"""v15 §E2 — اختبارات المصادقة: 409 التسجيل المكرر + سقف change-password +
الافتراضيات على قاعدة قديمة الشكل (C-5001).

الميكانيكا (نمط tests/conftest.py v10_world/v10_seed): تطبيق حقيقي + قاعدة
in-memory معزولة لكل اختبار + AsyncClient عبر ASGITransport، مع استبدال
dependency get_db — قاعدة الجنات المشتركة لا تُلمس.

تغطية مهام §E2:
- D12-H4: تسجيل بنفس البريد (عبر حالة الأحرف — يعبر الفحص التطبيقي الحساس
  ويصطدم بقيد uq_user_email_lower) → 409 «البريد الإلكتروني مسجل مسبقاً»
  بلا حساب زومبي وبلا مستأجر يتيم؛ والدخول يبقى حتميًا وغير حساس للحالة.
- D6-M4: سقف 5 محاولات/ساعة لكل مستخدم على change-password → 429 عربية،
  والمستخدم الآخر غير متأثر (المفتاح per-user)، والتغيير الناجح يعمل.
- D3-M2/C-5001: قاعدة «قديمة الشكل» (users بtoken_ver/is_platform_admin
  NULLable وقيمهما NULL) → reconcile يشفي → الدخول 200 (كان 500 حيًا:
  int(None) في make_token) — وmake_token نفسه يحتمل None حرفيًا.
"""
from __future__ import annotations

import pytest
import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from tests.conftest import V10_TEST_PASSWORD


def _create_legacy_users_table(sync_conn, User):
    """جدول users بشكل «الإنتاج القديم» (D3-M2): كل أعمدة النموذج لكن
    عمودَي server_default NULLable — كما أنشأهما reconcile القديم بلا
    DEFAULT، فبقيت قيمهما NULL رغم عقد النموذج (nullable=False)."""
    inspector = sa.inspect(sync_conn)
    if "users" in inspector.get_table_names():
        sync_conn.exec_driver_sql("DROP TABLE users")
    col_defs = ['"id" INTEGER PRIMARY KEY AUTOINCREMENT']
    for c in User.__table__.columns:
        if c.name == "id":
            continue
        col_type = c.type.compile(sync_conn.dialect)
        if c.name in ("token_ver", "is_platform_admin"):
            col_defs.append(f'"{c.name}" {col_type}')
        elif not c.nullable:
            col_defs.append(f'"{c.name}" {col_type} NOT NULL')
        else:
            col_defs.append(f'"{c.name}" {col_type}')
    sync_conn.exec_driver_sql("CREATE TABLE users (" + ", ".join(col_defs) + ")")


async def _make_world(users_legacy: bool = False):
    """تطبيق + محرك معزول + عميل HTTP (نفس وصفة v10_world)."""
    from database import get_db
    from models import Base, User
    from runner import app

    test_engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    if users_legacy:
        async with test_engine.begin() as conn:
            await conn.run_sync(
                Base.metadata.create_all,
                tables=[t for t in Base.metadata.sorted_tables if t.name != "users"])
        async with test_engine.begin() as conn:
            await conn.run_sync(_create_legacy_users_table, User)
    else:
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://t")
    return app, session_factory, client, test_engine


@pytest.fixture
async def world():
    """عالم اختبار نظيف + تفكيك موثوق (نفس ضمانات v10_world)."""
    from database import get_db

    app, sf, client, engine = await _make_world()
    try:
        yield type("W", (), {"app": app, "sf": sf, "client": client,
                             "engine": engine})()
    finally:
        app.dependency_overrides.pop(get_db, None)
        await client.aclose()
        await engine.dispose()


async def _register(client, username: str, email: str,
                    password: str = V10_TEST_PASSWORD):
    return await client.post("/api/register", json={
        "username": username, "email": email, "password": password,
    })


async def _seed_user(sf, username: str) -> int:
    """مستأجر + مستخدم مباشرة عبر الجلسة (بلا مسار register)."""
    from _hash import hash_password
    from models import Tenant, User

    async with sf() as db:
        t = Tenant(name=f"T-{username}", subscription_status="PAID", is_active=True)
        db.add(t)
        await db.flush()
        u = User(username=username, email=f"{username}@t.ly",
                 password_hash=hash_password(V10_TEST_PASSWORD),
                 tenant_id=t.id, role="admin")
        db.add(u)
        await db.commit()
        return u.id


# ── D12-H4: 409 التسجيل المكرر — لا حساب زومبي ────────────────────────


async def test_register_duplicate_email_returns_409_no_zombie(world):
    """التسجيل بنفس البريد بحالة أحرف مختلفة يعبر الفحص التطبيقي الحساس
    للحالة ويصطدم بقيد uq_user_email_lower → 409 عربية، بلا صف مستخدم
    ثانٍ وبلا مستأجر يتيم (rollback كامل قبل الرد)."""
    r1 = await _register(world.client, "owner1", "Ali@SmartBot.ly")
    assert r1.status_code == 200, r1.text

    # نفس lower(email) — الفحص الحساس للحالة لا يراه، القيد يراه
    r2 = await _register(world.client, "owner2", "ali@smartbot.ly")
    assert r2.status_code == 409, r2.text
    assert r2.json()["detail"] == "البريد الإلكتروني مسجل مسبقاً"

    async with world.sf() as db:
        users = (await db.execute(sa.text("SELECT COUNT(*) FROM users"))).scalar()
        tenants = (await db.execute(sa.text("SELECT COUNT(*) FROM tenants"))).scalar()
    assert users == 1   # لا حساب زومبي ثانٍ
    assert tenants == 1  # مستأجر owner2 المُفلوش لم يبقَ يتيمًا


async def test_register_same_username_still_400(world):
    """مسار الفحص التطبيقي المباشر (نفس الاسم حرفيًا) يبقى 400 — الـ409
    مخصص لما يعبر الفحص (عقد §2: نص محدد لكل سياق)."""
    await _register(world.client, "owner1", "Ali@SmartBot.ly")
    r = await _register(world.client, "owner1", "other@smartbot.ly")
    assert r.status_code == 400, r.text
    assert "موجود مسبقاً" in r.json()["detail"]


async def test_login_deterministic_and_email_case_insensitive(world):
    """الدخول يبقى حتميًا: بالاسم → 200، وبالبريد بحالة مختلفة → 200
    (القيد الفريد على lower(email) يضمن نتيجة واحدة)، وكلمة مرور خاطئة
    → 401 دائمًا."""
    await _register(world.client, "owner1", "Ali@SmartBot.ly")

    r_name = await world.client.post("/api/login", json={
        "username": "owner1", "password": V10_TEST_PASSWORD})
    assert r_name.status_code == 200, r_name.text

    r_email = await world.client.post("/api/login", json={
        "username": "ali@smartbot.ly", "password": V10_TEST_PASSWORD})
    assert r_email.status_code == 200, r_email.text

    r_wrong = await world.client.post("/api/login", json={
        "username": "owner1", "password": "wrong-password-1"})
    assert r_wrong.status_code == 401


# ── D3-M2/C-5001: قاعدة قديمة الشكل — الدخول 200 بدل 500 ──────────────


async def test_login_on_legacy_null_defaults_db():
    """قصة الـ500 الحي (D14): قاعدة أضافت token_ver/is_platform_admin عبر
    reconcile القديم بلا DEFAULT فبقيت NULL — int(None) في make_token كسر
    الدخول. الشفاء (reconcile، سلطة الإنتاج) يملأ NULL ثم الدخول 200."""
    from _schema_reconcile import reconcile_schema

    app, sf, client, engine = await _make_world(users_legacy=True)
    try:
        from _hash import hash_password

        # الإدراج خامًا: الصف القديم سُلق قبل النموذج الحالي — ORM يطبّع
        # None إلى default=0 عند الإدراج، بينما الإنتاج القديم خزّن NULL
        # فعلًا (reconcile القديم أضاف العمودين بلا DEFAULT).
        async with sf() as db:
            await db.execute(sa.text(
                "INSERT INTO users (username, email, password_hash, tenant_id, "
                "role, token_ver, is_platform_admin) "
                "VALUES ('legacy_user', 'legacy@t.ly', :pw, 1, 'admin', NULL, NULL)"
            ).bindparams(pw=hash_password(V10_TEST_PASSWORD)))
            await db.commit()
            nulls = (await db.execute(sa.text(
                "SELECT COUNT(*) FROM users "
                "WHERE token_ver IS NULL AND is_platform_admin IS NULL"
            ))).scalar()
            assert nulls == 1  # الحالة القديمة مثبتة قبل الشفاء

        # مسار الإقلاع: reconcile يشفاء NULL (backfill D3-M2)
        async with engine.begin() as conn:
            added = await conn.run_sync(reconcile_schema)
        assert "users.token_ver~null" in added, added
        assert "users.is_platform_admin~null" in added, added

        r = await client.post("/api/login", json={
            "username": "legacy_user", "password": V10_TEST_PASSWORD})
        assert r.status_code == 200, r.text  # كان 500 حرفيًا (int(None))

        async with sf() as db:
            vals = (await db.execute(sa.text(
                "SELECT token_ver, is_platform_admin FROM users"))).all()
        assert vals == [(0, 0)]
    finally:
        from database import get_db
        app.dependency_overrides.pop(get_db, None)
        await client.aclose()
        await engine.dispose()


async def test_make_token_tolerates_none_token_ver():
    """حزام make_token: token_ver=None (صف قديم قبل الشفاء) يُطبَّع إلى 0
    بدل TypeError — نفس عائلة الـ500 الحي على /api/login."""
    import jwt as pyjwt
    from config import settings
    from routers.auth import make_token

    token = make_token("ghost", 7, None)
    payload = pyjwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    assert payload["ver"] == 0


# ── D6-M4: سقف change-password — 5 محاولات/ساعة لكل مستخدم ────────────


async def test_change_password_rate_limit_5_per_hour(world):
    """5 محاولات (فاشلة) تجتاز؛ السادسة → 429 عربية حتى لو كانت بياناتها
    صحيحة — والسقف per-user: مستخدم آخر غير متأثر إطلاقًا."""
    await _seed_user(world.sf, "ceiling_user")
    r_login = await world.client.post("/api/login", json={
        "username": "ceiling_user", "password": V10_TEST_PASSWORD})
    assert r_login.status_code == 200

    # 5 محاولات بكلمة مرور حالية خاطئة → 401 لكل واحدة (كلها تُحتسب)
    for i in range(5):
        r = await world.client.post("/api/auth/change-password", json={
            "current_password": f"wrong-{i}", "new_password": "NewPass123!",
        })
        assert r.status_code == 401, f"attempt {i + 1}: {r.status_code} {r.text[:120]}"

    # السادسة — صحيحة البيانات — محجوبة بالسقف
    r6 = await world.client.post("/api/auth/change-password", json={
        "current_password": V10_TEST_PASSWORD, "new_password": "NewPass123!",
    })
    assert r6.status_code == 429, r6.text
    assert "تغيير كلمة المرور" in r6.json()["detail"]

    # المفتاح per-user: مستخدم آخر يبدأ بحصة سليمة
    await _seed_user(world.sf, "free_user")
    r_login2 = await world.client.post("/api/login", json={
        "username": "free_user", "password": V10_TEST_PASSWORD})
    assert r_login2.status_code == 200
    r_other_attempt = await world.client.post("/api/auth/change-password", json={
        "current_password": "nope-wrong", "new_password": "NewPass456!",
    })
    assert r_other_attempt.status_code == 401  # 401 لا 429 — حصته سليمة


async def test_change_password_success_within_limit(world):
    """داخل الحصة: تغيير ناجح → 200، القديمة تُرفض والجديدة تعمل —
    الدخول يبقى حتميًا بعد التغيير (عقد v12-E2.4: token_ver يرتفع)."""
    await _seed_user(world.sf, "changer")
    r_login = await world.client.post("/api/login", json={
        "username": "changer", "password": V10_TEST_PASSWORD})
    assert r_login.status_code == 200

    r = await world.client.post("/api/auth/change-password", json={
        "current_password": V10_TEST_PASSWORD, "new_password": "BrandNew123!",
    })
    assert r.status_code == 200, r.text

    world.client.cookies.clear()
    r_old = await world.client.post("/api/login", json={
        "username": "changer", "password": V10_TEST_PASSWORD})
    assert r_old.status_code == 401  # القديمة مرفوضة
    r_new = await world.client.post("/api/login", json={
        "username": "changer", "password": "BrandNew123!"})
    assert r_new.status_code == 200  # الجديدة تعمل
