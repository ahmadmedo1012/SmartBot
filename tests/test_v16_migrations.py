"""v16 §E5 — اختبارات الترحيلة 015 + حراسة setval في 003 + FK الحذف + تعادل السلسلة.

الميكانيكا (نمط test_v13/test_v15_migrations): دوال **sync** للترحيلات
وقاعدة sqlite معزولة لكل اختبار في tmp_path، مع توجيه settings
singleton (env.py يقرأ `settings.async_database_url` ولا يعيد قراءة
البيئة) **و** os.environ معًا — قاعدة الجنات المشتركة لا تُلمس إطلاقًا.
اختبارا حذف المستخدم async عبر v10_world (محركه الخاص المعزول) —
محرك اختبارات SQLite يفعّل الآن PRAGMA foreign_keys=ON (conftest)
فتُفحص قيود ondelete فعليًا بدل أن تبقى سلوك-PG غير مُختبَر.

تغطية مهام §E5 الخمس:
1. السلسلة تصل 015 على قاعدة نظيفة: فهرس offers الساخن موجود،
   FK المنعكس ondelete=SET NULL، وفهرسا 002 اليتيمان في المخطط.
2. 015 idempotent: فرع الإنشاء يشفى (إسقاط الفهرس ← الترقية)،
   والتشغيل المزدوج المباشر no-op.
3. 003: حارس setval — MAX=0 (PG نظيفة بصف البذرة id=0 وحده) يتخطى
   (setval(seq,0) خارج النطاق)؛ MAX>0 يرفع السلسلة.
4. تعادل السلسلة ≡ create_all+reconcile: مجموعات فهارس offers و
   subscription_payments متطابقة بين المسارين (بلا فهارس يتيمة بعد
   إعلان فهرسي 002 في النموذج)، وreconcile على create_all نظيفة = []
   مع كل مدخلات الشفاء الجديدة موجودة (Inspector/كتالوج).
5. FK: PRAGMA مفعّلة على محرك الاختبار؛ حذف مستخدم يمس موافقًا →
   SET NULL بلا خطأ، والمسار HTTP يكتسف notification_preferences
   ويعيد 200 ok().
6. الشفاء على شكل legacy: المدخلات الجديدة تُنشأ فعلاً (offers/
   users/subscription_payments بأشكال قديمة) مع خصم محافظ على
   الأموال (verified/cancelled وuser_id NULL لا يُمسّان) وتحييد
   اسم المستخدم بلا حذف حسابات — وإعادة التشغيل no-op.
"""
from __future__ import annotations

import importlib.util
import sqlite3
import warnings
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config as AlembicConfig
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine

from alembic import command

_REPO = Path(__file__).resolve().parent.parent
_ALEMBIC_DIR = _REPO / "alembic"
_VERSIONS_DIR = _ALEMBIC_DIR / "versions"


@pytest.fixture
def fresh_db(tmp_path, monkeypatch):
    """قاعدة sqlite معزولة + توجيه settings الفعلي والبيئة إليها."""
    from config import settings

    db_path = tmp_path / "v16_migrations.db"
    url = f"sqlite+aiosqlite:///{db_path}"
    # env.py يبني محركه من settings.async_database_url — الـ singleton
    # لا يعيد قراءة os.environ، فيجب ترقيع الصفتين مباشرة:
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    monkeypatch.setattr(settings, "DATABASE_POOLED_URL", "")
    # ولأي مسار يقرأ البيئة مباشرة:
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DATABASE_POOLED_URL", "")
    return db_path


def _alembic_cfg() -> AlembicConfig:
    """Config بموقع السكربت فقط — URL يأتي من settings عبر env.py."""
    cfg = AlembicConfig()
    cfg.set_main_option("script_location", str(_ALEMBIC_DIR))
    return cfg


def _load_module(name: str):
    """تحميل وحدة ترحيل مباشرة (آلية استدعاء 003/015 دون تشغيل السلسلة)."""
    path = _VERSIONS_DIR / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"v16_test_{name}", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _version(db_path: Path) -> str:
    con = sqlite3.connect(db_path)
    try:
        return con.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    finally:
        con.close()


def _index_names(db_path: Path, table: str) -> list[str]:
    """أسماء كل فهارس الجدول من الكتالوج مباشرة (يشمل الجزئية/الفريدة)."""
    con = sqlite3.connect(db_path)
    try:
        return [r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type = 'index' "
            "AND tbl_name = ? AND name NOT LIKE 'sqlite_autoindex%' "
            "ORDER BY name", (table,)
        ).fetchall()]
    finally:
        con.close()


def _drop_index(db_path: Path, name: str) -> None:
    con = sqlite3.connect(db_path)
    try:
        con.execute(f"DROP INDEX IF EXISTS {name}")
        con.commit()
    finally:
        con.close()


# ── 1: السلسلة تصل 015 — الفهرس الساخن + FK + فهارس 002 ─────────────────


def test_chain_reaches_015_hot_index_fk_and_002_parity(fresh_db):
    """السلسلة 001→015 على قاعدة نظيفة: فهرس offers(tenant_id,is_active)
    موجود (أنشأه 001/create_all وحرس 015 يتخطاه)، FK added_by_id
    المنعكس ondelete=SET NULL، وفهرسا 002 اليتيمان في المخطط."""
    command.upgrade(_alembic_cfg(), "head")
    assert _version(fresh_db) == "015"

    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        with engine.connect() as conn:
            insp = sa.inspect(conn)
            offers_ix = {ix["name"] for ix in insp.get_indexes("offers")}
            assert "ix_offer_tenant_active" in offers_ix
            # الأعمدة بالترتيب — فهرس المسار الساخن (offer_engine.py:41-43)
            hot = {ix["name"]: ix for ix in insp.get_indexes("offers")}
            assert hot["ix_offer_tenant_active"]["column_names"] == ["tenant_id", "is_active"]

            # FK حذف المستخدم: SET NULL عبر create_all في 001 (شكل النموذج)
            # (SQLite يعكس ondelete داخل options؛ PostgreSQL كمفتاح مباشر)
            fks = [fk for fk in insp.get_foreign_keys("telegram_approvers")
                   if fk.get("constrained_columns") == ["added_by_id"]]
            assert len(fks) == 1
            rule = fks[0].get("ondelete") or fks[0].get("options", {}).get("ondelete")
            assert rule == "SET NULL"
            assert fks[0]["referred_table"] == "users"

            # فهرسا 002 اليتيمان صارا في النموذج → حاضران بلا جهة السلسلة
            sp_ix = {ix["name"] for ix in insp.get_indexes("subscription_payments")}
            assert {"ix_sub_payment_user_status", "ix_sub_payment_status"} <= sp_ix
    finally:
        engine.dispose()


def test_migration_015_heals_missing_index_and_is_idempotent(fresh_db):
    """فرع الإنشاء في 015: بعد 014 نُسقط الفهرس (محاكاة legacy بلا فهرس
    tenant) فتبنيه الترقية إلى head؛ ثم تشغيل الوحدة مرتين مباشرة عبر
    Operations.context — لا خطأ ولا تكرار (الحارس + IF NOT EXISTS)."""
    cfg = _alembic_cfg()
    command.upgrade(cfg, "014")
    _drop_index(fresh_db, "ix_offer_tenant_active")
    command.upgrade(cfg, "head")
    assert _version(fresh_db) == "015"
    assert "ix_offer_tenant_active" in _index_names(fresh_db, "offers")

    mod = _load_module("015_v16_data")
    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        for _invocation in (1, 2):
            with engine.connect() as conn:
                ctx = MigrationContext.configure(conn)
                with Operations.context(ctx):
                    mod.upgrade()
                conn.commit()
        # SQLite تخطّت فرع الـFK (لهجة PG فقط) — والفهرس واحد لا يتكرر
        with engine.connect() as conn:
            fk_count = len(sa.inspect(conn).get_foreign_keys("telegram_approvers"))
    finally:
        engine.dispose()
    assert _index_names(fresh_db, "offers").count("ix_offer_tenant_active") == 1
    assert fk_count == 1


# ── 2: حارس setval في 003 (PG نظيفة) ─────────────────────────────────────


def test_003_setval_guard_fresh_pg_invariant():
    """MAX(id)=0 (PG نظيفة: صف البذرة id=0 وحده) → تخطّي setval —
    setval(seq,0) خارج النطاق على سلسلة صاعدة، والسلسلة العذراء
    (nextval=1) لا تتصادم مع id=0 أصلًا. MAX>0 → رفع إلى MAX."""
    mod = _load_module("003_tenants")

    assert mod._setval_sql(0) is None
    assert mod._setval_sql(None) is None
    assert mod._setval_sql(-3) is None

    sql = mod._setval_sql(7)
    assert sql is not None
    assert "setval(" in sql
    assert "pg_get_serial_sequence('tenants', 'id')" in sql
    assert "7" in sql

    # setval في upgrade يمر عبر الحارس فقط (لا صيغة غير مشروطة متبقية)
    src = (_VERSIONS_DIR / "003_tenants.py").read_text(encoding="utf-8")
    assert "_setval_sql(max_id)" in src


# ── 3: تعادل السلسلة ≡ create_all + reconcile ────────────────────────────


def test_index_parity_chain_vs_create_all_reconcile(fresh_db):
    """مسارا المخطط متطابقان: السلسلة إلى head مقابل create_all+reconcile
    على قاعدة ثانية — مجموعتا فهارس offers وsubscription_payments
    متساويتان (فهرسا 002 لم يعودا يتيمين)، وreconcile على create_all
    نظيفة = [] (كل مدخلات الشفاء الجديدة موجودة أصلًا)."""
    from _schema_reconcile import reconcile_schema
    from models import Base

    command.upgrade(_alembic_cfg(), "head")

    create_all_path = fresh_db.parent / "v16_create_all.db"
    engine = create_engine(f"sqlite:///{create_all_path}")
    try:
        with engine.begin() as conn:
            Base.metadata.create_all(conn)
        with engine.begin() as conn:
            added = reconcile_schema(conn)
        assert added == [], added

        with engine.connect() as conn:
            insp = sa.inspect(conn)

            def _ix(table: str, name: str) -> bool:
                with warnings.catch_warnings():
                    warnings.filterwarnings(
                        "ignore", message=".*unsupported reflection.*")
                    return name in {ix["name"] for ix in insp.get_indexes(table)}

            def _uq(table: str, name: str) -> bool:
                try:
                    return name in {uc["name"]
                                    for uc in insp.get_unique_constraints(table)}
                except Exception:
                    return False

            # مدخلات الشفاء الجديدة كلها موجودة على مسار create_all:
            # الفهارس المستقلة تنعكس في get_indexes، وقيود الجدول
            # (شكل create_all للـ uq_*) في get_unique_constraints —
            # SQLite يخزن الأخيرة كـsqlite_autoindex بلا الاسم في
            # الكتالوج لكن الانعكاس يقرأه من نص CREATE TABLE.
            for table, name in (
                ("offers", "ix_offer_tenant_active"),
                ("subscription_payments", "ix_sub_payment_user_pending"),
                ("bot_state", "ix_botstate_key_value"),
                ("ai_suggestions", "ix_ai_suggestion_tenant_created"),
                ("payment_requests", "ix_payment_request_tenant_created"),
                ("subscription_payments", "ix_sub_payment_tenant_status_created"),
                ("broadcasts", "ix_broadcast_tenant_created"),
                ("bot_alerts", "ix_bot_alert_tenant_resolved_created"),
                ("subscribers", "ix_sub_tenant_platform_status"),
                ("subscribers", "ix_sub_tenant_last_interaction"),
                ("comments", "ix_comment_tenant_created"),
                ("replies", "ix_reply_tenant_created"),
            ):
                assert _ix(table, name), f"{table}.{name}"
            for table, name in (
                ("users", "uq_user_tenant_username"),
                ("conversations", "uq_conversations_tenant_fb"),
                ("messages", "uq_messages_tenant_fb"),
                ("comments", "uq_comments_tenant_fb"),
            ):
                assert _uq(table, name), f"{table}.{name}"
    finally:
        engine.dispose()

    for table in ("offers", "subscription_payments"):
        assert _index_names(fresh_db, table) == _index_names(create_all_path, table), table


# ── 4: FK — PRAGMA على محرك الاختبار + مسار الحذف HTTP ──────────────────


async def test_sqlite_fk_pragma_enforces_set_null(v10_world):
    """PRAGMA foreign_keys مفعّلة على محرك v10_world — إنشاء موافق يشير
    لمستخدم ثم حذف المستخدم عبر ORM ينجو (SET NULL) ويُفرّغ المرجع؛
    بدونه كان SQLite يتجاهل الـFK فيبقى المرجع معلقًا بعد الحذف."""
    from _hash import hash_password
    from models import TelegramApprover, User

    async with v10_world.sf() as db:
        u = User(username="fk_probe", email="fk_probe@test.ly",
                 password_hash=hash_password("pass12345678"),
                 tenant_id=0, role="admin")
        db.add(u)
        await db.flush()
        db.add(TelegramApprover(telegram_id="555001", label="فحص",
                                added_by_id=u.id))
        await db.commit()
        uid = u.id

    async with v10_world.sf() as db:
        # الدليل المباشر: الـPRAGMA تعود 1 على اتصال محرك الاختبار
        enabled = (await db.execute(sa.text("PRAGMA foreign_keys"))).scalar()
        assert enabled == 1

    async with v10_world.sf() as db:
        user = await db.get(User, uid)
        await db.delete(user)
        await db.commit()  # بلا PRAGMA كان ينجو ويترك مرجعًا معلقًا؛
        # بلا ondelete كان يفشل بـIntegrityError — الآن SET NULL

    async with v10_world.sf() as db:
        approver = (await db.execute(sa.select(TelegramApprover).where(
            TelegramApprover.telegram_id == "555001"))).scalar_one()
        assert approver.added_by_id is None


async def test_user_delete_route_sweeps_prefs_and_nulls_approver(v10_seed):
    """DELETE /api/users/{id} بموافق وتفضيلات للمحذوف: 200 بمظروف ok،
    added_by_id تصبح NULL (FK SET NULL)، وnotification_preferences
    مكتسفة (uq_notif_pref_user لا يحجب إدراجًا لاحقًا لنفس المعرف)."""
    from models import NotificationPreference, TelegramApprover, User

    world = v10_seed.world
    admin_name, tid, _admin_id = await v10_seed.tenant_user(role="admin")

    # الضحية داخل مستأجر الأدمن نفسه (المسار يفلتر بنطاق المستأجر)
    async with world.sf() as db:
        victim = User(username="victim_user", email="victim_user@test.ly",
                      password_hash="x" * 60, tenant_id=tid, role="viewer")
        db.add(victim)
        await db.flush()
        victim_id = victim.id
        db.add(NotificationPreference(
            user_id=victim_id, tenant_id=tid,
            preferences={"new_comments": True}))
        db.add(TelegramApprover(telegram_id="990011", label="موافق",
                                added_by_id=victim_id))
        await db.commit()

    v10_seed.auth(admin_name, tid)
    r = await world.client.delete(f"/api/users/{victim_id}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert body["data"] == {"ok": True}

    async with world.sf() as db:
        approver = (await db.execute(sa.select(TelegramApprover).where(
            TelegramApprover.telegram_id == "990011"))).scalar_one()
        assert approver.added_by_id is None
        prefs = (await db.execute(sa.select(NotificationPreference).where(
            NotificationPreference.user_id == victim_id))).scalars().all()
        assert prefs == []
        assert await db.get(User, victim_id) is None

    # إدراج تفضيلات لمستخدم جديد بنفس المعرف المحرر (SQLite يعيد
    # استخدام rowid المحرّر) لم يعد محجوبًا بالقيود المتبقية
    async with world.sf() as db:
        new_u = User(username="reborn_user", email="reborn_user@test.ly",
                     password_hash="x" * 60, tenant_id=tid, role="viewer")
        db.add(new_u)
        await db.flush()
        db.add(NotificationPreference(user_id=new_u.id, tenant_id=tid,
                                      preferences={}))
        await db.commit()
        assert new_u.id == victim_id


# ── 5: الشفاء على شكل legacy (قائمة v16 الجديدة) ─────────────────────────

# جداول بأشكال ما قبل الترحيلات: بلا الفهرس الساخن، بلا قيد اسم
# المستخدم، بلا قيد الدفعة المعلقة الواحدة.
_LEGACY_V16_DDL = [
    """CREATE TABLE offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 0,
        title VARCHAR(200) NOT NULL DEFAULT '',
        is_active BOOLEAN DEFAULT 1
    )""",
    """CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 0,
        username VARCHAR(100) NOT NULL
    )""",
    """CREATE TABLE subscription_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        status VARCHAR(20) DEFAULT 'pending'
    )""",
]

# (user_id, status): دفعتان معلقتان لنفس المستخدم (الأحدث id=2 يبقى)،
# وverified/cancelled له (تاريخ أموال لا يُمس)، وNULL-user معلقة
# (الفهرس يسمح بها على PG)، ومعلقة لمستخدم آخر (تبقى).
_LEGACY_PAYMENTS = [
    (10, "pending"),    # id=1 — المعلقة المتجاوزة (الأقدم) → تُخصم
    (10, "pending"),    # id=2 — الأحدث → تبقى
    (10, "verified"),   # id=3 — تاريخ أموال → تبقى
    (10, "cancelled"),  # id=4 — تاريخ أموال → تبقى
    (None, "pending"),  # id=5 — user_id NULL → تبقى
    (11, "pending"),    # id=6 — مستخدم آخر → تبقى
]


def test_reconcile_heals_v16_entries_on_legacy_shape(fresh_db):
    """reconcile (سلطة الشفاء عند موت السلسلة) على جداول legacy:
    المدخلات الجديدة تُنشأ + الخصم محافظ على الأموال + تحييد اسم
    المستخدم بلا حذف حسابات + القيد يمنع معلقة ثانية — والإعادة no-op."""
    from _schema_reconcile import reconcile_schema

    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        with engine.begin() as conn:
            for ddl in _LEGACY_V16_DDL:
                conn.exec_driver_sql(ddl)
            conn.exec_driver_sql(
                "INSERT INTO users (tenant_id, username) VALUES "
                "(1, 'admin'), (1, 'admin'), (2, 'admin')")
            conn.exec_driver_sql(
                "INSERT INTO subscription_payments (user_id, status) "
                "VALUES (?, ?)", _LEGACY_PAYMENTS)
            conn.exec_driver_sql(
                "INSERT INTO offers (tenant_id, title, is_active) "
                "VALUES (7, 'عرض', 1)")

        with engine.begin() as conn:
            added = reconcile_schema(conn)

        # المدخلات الجديدة شُفيت فعلاً (لا مجرد تخطّي الحارس)
        for label in (
            "offers.ix_offer_tenant_active",
            "users.uq_user_tenant_username",
            "subscription_payments.ix_sub_payment_user_pending",
            "subscription_payments.ix_sub_payment_tenant_status_created",
        ):
            assert label in added, label

        with engine.connect() as conn:
            # خصم المعلقات: الأحدث فقط لمستخدم 10؛ الأموال والـNULL سليمة
            rows = conn.execute(sa.text(
                "SELECT id, user_id, status FROM subscription_payments "
                "ORDER BY id")).fetchall()
            assert rows == [
                (2, 10, "pending"),
                (3, 10, "verified"),
                (4, 10, "cancelled"),
                (5, None, "pending"),
                (6, 11, "pending"),
            ]

            # تحييد اسم المستخدم: الأقدم (id=1) يبقى كما هو (الدخول
            # حتميًا يلتقطه)، الأحدث (id=2) يلوَّن بلاحقة فريدة،
            # والمستأجر الآخر (id=3) لم يُمس — ولا حساب حُذف
            users = conn.execute(sa.text(
                "SELECT id, tenant_id, username FROM users ORDER BY id"
            )).fetchall()
            assert users == [
                (1, 1, "admin"),
                (2, 1, "admin#2"),
                (3, 2, "admin"),
            ]

        # القيد يعمل: معلقة ثانية لنفس المستخدم → IntegrityError
        from sqlalchemy.exc import IntegrityError
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.execute(sa.text(
                    "INSERT INTO subscription_payments (user_id, status) "
                    "VALUES (10, 'pending')"))

        # verified إضافية لنفس المستخدم تمر (القيد جزئي على pending)
        with engine.begin() as conn:
            conn.execute(sa.text(
                "INSERT INTO subscription_payments (user_id, status) "
                "VALUES (10, 'verified')"))

        # الإعادة no-op: لا أعمدة/فهارس/قيود جديدة
        with engine.begin() as conn:
            second = reconcile_schema(conn)
        assert second == [], second
    finally:
        engine.dispose()
