"""v13 §1 L5/L6 — اختبارات سلسلة الترحيلات (E4).

dec-bot-state-unique (L5 → ترحيل 012) + dec-alembic-003 (L6 → إصلاح 003).

الميكانيكا (نمط خطة D4): دوال **sync** لأن alembic/env.py يستعمل
asyncio.run، وقاعدة sqlite معزولة لكل اختبار في tmp_path، مع توجيه
settings singleton (env.py يقرأ `settings.async_database_url` ولا
يعيد قراءة البيئة) **و** os.environ معًا. الترقية تتم عبر أمر alembic
الحقيقي (`command.upgrade`) بنفس مسار الإنتاج (app/startup.py)، ولا
تُلمس قاعدة الجنات المشتركة إطلاقًا.
"""
from __future__ import annotations

import importlib.util
import sqlite3
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config as AlembicConfig
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError

from alembic import command

_REPO = Path(__file__).resolve().parent.parent
_ALEMBIC_DIR = _REPO / "alembic"
_VERSIONS_DIR = _ALEMBIC_DIR / "versions"

# عيّنة الزرع السباعية: زوج fb_page_id مكرر عبر مستأجرين (الأقدم id=1
# يُحذف ويبقى الأحدث id=2) + فرادة id=3 + أزواج (balance / fb_fan_count)
# متطابقة القيمة عبر المستأجرين — تكرار مشروع يجب أن ينجو من الـ dedup
# ولا يمنعه الفريد الجزئي (مسار أموال/عدّادات). كل (tenant_id, key)
# فريد هنا احترامًا للقيد القائم uq_botstate_tenant_key.
_BOT_STATE_FIXTURE = [
    (1, "fb_page_id", "111"),     # id=1 — الأقدم في زوج التكرار → يُحذف
    (2, "fb_page_id", "111"),     # id=2 — الأحدث → يبقى
    (3, "fb_page_id", "222"),     # id=3 — فرادة → يبقى
    (1, "balance", "20.000"),     # id=4 — تكرار قيمة مشروع (مسار الأموال)
    (2, "balance", "20.000"),     # id=5 — تكرار قيمة مشروع
    (1, "fb_fan_count", "1500"),  # id=6 — تكرار قيمة مشروع
    (2, "fb_fan_count", "1500"),  # id=7 — تكرار قيمة مشروع
]


@pytest.fixture
def fresh_db(tmp_path, monkeypatch):
    """قاعدة sqlite معزولة + توجيه settings الفعلي والبيئة إليها."""
    from config import settings

    db_path = tmp_path / "v13_migrations.db"
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
    """تحميل وحدة ترحيل مباشرة (آلية استدعاء 003/012 دون تشغيل السلسلة)."""
    path = _VERSIONS_DIR / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"v13_test_{name}", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _seed_bot_state(db_path: Path) -> None:
    con = sqlite3.connect(db_path)
    try:
        con.executemany(
            "INSERT INTO bot_state (tenant_id, key, value) VALUES (?, ?, ?)",
            _BOT_STATE_FIXTURE,
        )
        con.commit()
    finally:
        con.close()


def _version(db_path: Path) -> str:
    con = sqlite3.connect(db_path)
    try:
        return con.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    finally:
        con.close()


def _bot_state_rows(db_path: Path) -> list[tuple]:
    con = sqlite3.connect(db_path)
    try:
        return con.execute(
            "SELECT id, tenant_id, key, value FROM bot_state ORDER BY id"
        ).fetchall()
    finally:
        con.close()


def _bot_state_index_sql(db_path: Path) -> dict[str, str | None]:
    con = sqlite3.connect(db_path)
    try:
        return dict(
            con.execute(
                "SELECT name, sql FROM sqlite_master "
                "WHERE type='index' AND tbl_name='bot_state'"
            ).fetchall()
        )
    finally:
        con.close()


def _simulate_legacy_pre_012(db_path: Path) -> None:
    """v14-E3: النموذج يصرّح الآن بـuq_botstate_key_value (D7-02) فقاعدة
    السلسلة النظيفة تحمله منذ 001 (create_all) — نُسقطه هنا لمحاكاة حالة
    الإنتاج القديم التي يعالجها 012 (تكرارات fb_page_id مسموحة قبل
    الترحيل، وهو ما يختبره هذا الملف أصلاً). لا يمس قيد الجدول
    uq_botstate_tenant_key (العيّنة تحترمه)."""
    con = sqlite3.connect(db_path)
    try:
        con.execute("DROP INDEX IF EXISTS uq_botstate_key_value")
        con.commit()
    finally:
        con.close()


# ── L5: السلسلة تصل 012 وتفرض الفريد الجزئي ────────────────────────────


def test_chain_reaches_012_and_enforces_unique(fresh_db):
    """السلسلة 001→011→012 (والرأس الآن 013): dedup يُبقي الأحدث، الأزواج
    المشروعة تنجو، والفريد الجزئي يحجب fb_page_id المكرر فقط."""
    cfg = _alembic_cfg()
    command.upgrade(cfg, "011")
    assert _version(fresh_db) == "011"

    _simulate_legacy_pre_012(fresh_db)  # v14-E3: محاكاة الإنتاج قبل 012
    _seed_bot_state(fresh_db)
    command.upgrade(cfg, "head")
    # v14-E3: الرأس أصبح 013 (dedup عام + فهارس ساخنة) — عيّنة v13 تحترم
    # فرادة (tenant,key) فلا تتأثر صفوفها بـ013
    # v15-E2: الرأس أصبح 014 (قيود التفرد + server_defaults) — حوارسه
    # تتخطى قيود create_all فلا تتأثر صفوف العيّنة
    assert _version(fresh_db) == "014"

    # dedup: الأقدم (id=1) حُذف، الأحدث (id=2) بقي، الفرادة (id=3) بقت،
    # وأزواج balance/fb_fan_count متطابقة القيمة نجت كليهما (6 صفوف)
    assert _bot_state_rows(fresh_db) == [
        (2, 2, "fb_page_id", "111"),
        (3, 3, "fb_page_id", "222"),
        (4, 1, "balance", "20.000"),
        (5, 2, "balance", "20.000"),
        (6, 1, "fb_fan_count", "1500"),
        (7, 2, "fb_fan_count", "1500"),
    ]

    # الفهرس القائم (011/النموذج) لم يُمس، والجديد موجود فريدًا وجزئيًا
    indexes = _bot_state_index_sql(fresh_db)
    assert "ix_botstate_key_value" in indexes
    assert "uq_botstate_key_value" in indexes
    uq_sql = indexes["uq_botstate_key_value"] or ""
    assert "UNIQUE INDEX" in uq_sql
    assert "fb_page_id" in uq_sql  # النطاق الجزئي WHERE key = 'fb_page_id'

    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        with engine.connect() as conn:
            reflected = {ix["name"]: ix for ix in sa.inspect(conn).get_indexes("bot_state")}
        assert reflected["uq_botstate_key_value"]["unique"]
        assert reflected["uq_botstate_key_value"]["column_names"] == ["key", "value"]
        assert not reflected["ix_botstate_key_value"]["unique"]

        # حجب التكرار: مستأجر رابع يربط الصفحة 111 (مربوطة بمستأجر آخر)
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.execute(sa.text(
                    "INSERT INTO bot_state (tenant_id, key, value) "
                    "VALUES (4, 'fb_page_id', '111')"
                ))

        # السماح بنفس القيمة لمفاتيح أخرى (النطاق الجزئي مقصود):
        with engine.begin() as conn:
            conn.execute(sa.text(
                "INSERT INTO bot_state (tenant_id, key, value) "
                "VALUES (4, 'balance', '20.000')"
            ))
    finally:
        engine.dispose()


def test_migration_012_idempotent(fresh_db):
    """استدعاء وحدة 012 مرتين مباشرة عبر Operations.context: لا خطأ
    في المرة الثانية ولا حذف إضافي (الحارس بالـ Inspector)."""
    cfg = _alembic_cfg()
    command.upgrade(cfg, "011")
    _simulate_legacy_pre_012(fresh_db)  # v14-E3: محاكاة الإنتاج قبل 012
    _seed_bot_state(fresh_db)

    mod = _load_module("012_bot_state_unique")
    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        for _invocation in (1, 2):
            with engine.connect() as conn:
                ctx = MigrationContext.configure(conn)
                with Operations.context(ctx):
                    mod.upgrade()
                conn.commit()
        with engine.connect() as conn:
            ids = conn.execute(sa.text("SELECT id FROM bot_state ORDER BY id")).scalars().all()
    finally:
        engine.dispose()

    # المرة الأولى: dedup (حذف id=1) + إنشاء الفهرس؛ الثانية: no-op كامل
    assert ids == [2, 3, 4, 5, 6, 7]


def test_012_downgrade_drops_unique_keeps_plain_index(fresh_db):
    """downgrade 012→011: الفريد يسقط وix_botstate_key_value يبقى،
    والإدراج المكرر يُقبل من جديد (هذه الحافة فقط)."""
    cfg = _alembic_cfg()
    command.upgrade(cfg, "011")
    _simulate_legacy_pre_012(fresh_db)  # v14-E3: محاكاة الإنتاج قبل 012
    _seed_bot_state(fresh_db)
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "011")

    assert _version(fresh_db) == "011"
    indexes = _bot_state_index_sql(fresh_db)
    assert "uq_botstate_key_value" not in indexes
    assert "ix_botstate_key_value" in indexes

    con = sqlite3.connect(fresh_db)
    try:
        con.execute(
            "INSERT INTO bot_state (tenant_id, key, value) VALUES (4, 'fb_page_id', '111')"
        )
        con.commit()
        dup_count = con.execute(
            "SELECT COUNT(*) FROM bot_state WHERE key = 'fb_page_id' AND value = '111'"
        ).fetchone()[0]
    finally:
        con.close()
    assert dup_count == 2


# ── L6: إصلاح 003 — الإدراج يطابق شكل الجدول الفعلي ─────────────────────


def test_003_default_tenant_insert_shapes():
    """وحدة _default_tenant_insert: عمود slug عند وجوده (الشكل القديم)،
    وبلا slug على شكل create_all — كلاهما ON CONFLICT (id) DO NOTHING."""
    mod = _load_module("003_tenants")

    legacy = mod._default_tenant_insert(
        {"id", "slug", "name", "plan", "is_active", "settings", "created_at", "updated_at"}
    )
    assert "slug" in legacy
    assert "INSERT INTO tenants" in legacy
    assert "ON CONFLICT (id) DO NOTHING" in legacy
    assert "'Default Tenant'" in legacy

    create_all_shape = mod._default_tenant_insert(
        {"id", "name", "plan", "plan_id", "subscription_status",
         "plan_start", "plan_end", "is_active", "onboarding_completed", "created_at"}
    )
    assert "slug" not in create_all_shape
    assert "INSERT INTO tenants" in create_all_shape
    assert "ON CONFLICT (id) DO NOTHING" in create_all_shape
    assert "'Default Tenant'" in create_all_shape


def test_migration_003_runs_on_create_all_shape(fresh_db):
    """استدعاء 003 مباشرة على جدول tenants بشكل النموذج (بلا slug):
    لا استثناء، والإدراج المولّد من الأعمدة الفعلية يطابق الشكل وينفَّذ
    عليه فعلًا (تغطية منطقية لفرع PostgreSQL — CI بلا PG، انظر D4)."""
    mod = _load_module("003_tenants")
    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        from models import Tenant

        # جدول tenants بشكل create_all من 001 — بلا slug
        Tenant.__table__.create(engine)

        with engine.connect() as conn:
            ctx = MigrationContext.configure(conn)
            with Operations.context(ctx):
                mod.upgrade()
            conn.commit()

            cols = {c["name"] for c in sa.inspect(conn).get_columns("tenants")}
            assert "slug" not in cols

            # الفرع المنطقي: الإدراج المولّد من الأعمدة الفعلية بلا slug،
            # وينفَّذ على الجدول الفعلي (أسماء الأعمدة كلها صالحة)
            sql = mod._default_tenant_insert(cols)
            assert "slug" not in sql
            conn.execute(sa.text(sql))
            conn.commit()

            rows = conn.execute(
                sa.text("SELECT id, name, plan FROM tenants")
            ).fetchall()
    finally:
        engine.dispose()

    assert rows == [(0, "Default Tenant", "free")]
