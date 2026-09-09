"""v15 §E2 — اختبارات ترحيلة 014 (قيود التفرد + backfills + تنظيفات) + محرك التسلسل.

الميكانيكا (نمط test_v13/test_v14_migrations): دوال sync للترحيلات وasync
للمحرك، قاعدة sqlite معزولة لكل اختبار في tmp_path مع توجيه settings
singleton وos.environ معًا. الترقية عبر command.upgrade الحقيقي (نفس مسار
الإنتاج app/startup.py) — قاعدة الجنات المشتركة لا تُلمس إطلاقًا.

تغطية المهام الثماني من §E2:
1. السلسلة 013→014 سليمة على قاعدة نظيفة (قيود create_all لا تصطدم).
2. القيود السبعة + uq_reply_tenant_comment + uq_user_email_lower تعمل على
   SQLite (إدراج مكرر → IntegrityError).
3. backfill الخصم: إبقاء MAX(id) + دمج العدادات (reply_count/
   total_interactions/current_value) + إعادة أبوة tenant_id=0 (D3-H2) +
   تحييد تكرارات البريد بإبقاء MIN(id) (D12-H4).
4. server_defaults: شفاء NULL على token_ver/is_platform_admin (D3-M2 →
   C-5001 الحي على /api/login) في 014 وفي reconcile (سلطة الإنتاج).
5. التنظيفات الميكانيكية: العمودان الميتان + فهرس scheduled_posts المكرر.
6. reconcile = السلطة الفعلية: نفس الشفاء بلا alembic + idempotent.
7. محرك التسلسل: subscribe يضبط tenant_id + SAVEPOINT لا يسمم معاملة
   المستدعي (D3-H2).
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config as AlembicConfig
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from alembic import command

_REPO = Path(__file__).resolve().parent.parent
_ALEMBIC_DIR = _REPO / "alembic"
_VERSIONS_DIR = _ALEMBIC_DIR / "versions"

# ── شكل الجداول القديم (الإنتاج قبل إعادة البناء): بلا أي قيد تفرد ────────
# نفس منهجية test_v14 (bot_state legacy) معمَّمة على عائلة D3-H1.
_LEGACY_DDL = [
    """CREATE TABLE subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 0,
        fb_user_id VARCHAR(100) NOT NULL,
        name VARCHAR(200) DEFAULT '',
        reply_count INTEGER DEFAULT 0
    )""",
    """CREATE TABLE customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 0,
        fb_user_id VARCHAR(100) NOT NULL,
        total_interactions INTEGER DEFAULT 0
    )""",
    """CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 0,
        name VARCHAR(50) NOT NULL
    )""",
    """CREATE TABLE conversation_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 0,
        name VARCHAR(50) NOT NULL
    )""",
    """CREATE TABLE subscriber_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 0,
        subscriber_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL
    )""",
    """CREATE TABLE sequences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 0,
        name VARCHAR(200) NOT NULL,
        status VARCHAR(20) DEFAULT 'draft'
    )""",
    """CREATE TABLE sequence_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 0,
        subscriber_id INTEGER NOT NULL,
        sequence_id INTEGER NOT NULL,
        current_step INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active'
    )""",
    """CREATE TABLE usage_counters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        metric VARCHAR(50) NOT NULL,
        period_start DATETIME NOT NULL,
        current_value INTEGER DEFAULT 0
    )""",
    """CREATE TABLE replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 0,
        fb_comment_id VARCHAR(100) NOT NULL,
        fb_post_id VARCHAR(100) NOT NULL,
        reply_text TEXT DEFAULT ''
    )""",
    # شكل users كما أضافه reconcile القديم: الأعمدة موجودة لكن NULLable
    # بلا DEFAULT — token_ver/is_platform_admin بقيا NULL دائمًا (D3-M2).
    """CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(100) NOT NULL,
        email VARCHAR(200) DEFAULT '',
        token_ver INTEGER,
        is_platform_admin BOOLEAN
    )""",
]


def _install_legacy_tables(engine) -> None:
    with engine.begin() as conn:
        for ddl in _LEGACY_DDL:
            conn.exec_driver_sql(ddl)


# (table, columns-without-id, rows-without-id)
_LEGACY_ROWS = {
    # مجموعة (1,u1) ×3: البقاء لMAX(id)=3 بreply_count=2+3+4=9 (دمج)
    "subscribers": [("tenant_id, fb_user_id, name, reply_count"),
                    [(1, "u1", "أ", 2), (1, "u1", "ب", 3), (1, "u1", "ج", 4),
                     (2, "u2", "د", 7)]],
    # مجموعة (1,c1) ×2: البقاء لMAX(id)=2 بtotal=5+10=15
    "customers": [("tenant_id, fb_user_id, total_interactions"),
                  [(1, "c1", 5), (1, "c1", 10), (3, "c2", 1)]],
    "tags": [("tenant_id, name"), [(1, "VIP"), (1, "VIP"), (2, "عميل")]],
    "conversation_tags": [("tenant_id, name"), [(1, "مهم"), (1, "مهم"), (4, "عادي")]],
    # D3: مجموعة الخصم (subscriber_id, tag_id) فقط — أعمّ من القيد الثلاثي
    "subscriber_tags": [("tenant_id, subscriber_id, tag_id"),
                        [(1, 10, 20), (0, 10, 20), (2, 11, 21)]],
    "sequences": [("tenant_id, name, status"),
                  [(5, "ترحيب", "active"), (6, "متابعة", "active")]],
    # صففا tenant_id=0 (خلل subscribe القديم — D3-H2) + صف صحيح مكرر منطقيًا
    "sequence_subscriptions": [("tenant_id, subscriber_id, sequence_id, current_step, status"),
                               [(0, 70, 1, 0, "active"), (0, 71, 2, 0, "active"),
                                (5, 70, 1, 1, "active")]],
    # فترتان منطقيتان منقسمتان (D12-H3): الدمج SUM في الناجي
    "usage_counters": [("tenant_id, metric, period_start, current_value"),
                       [(5, "replies_used", "2026-09-01 00:00:00", 10),
                        (5, "replies_used", "2026-09-01 00:00:00", 15),
                        (5, "dms_used", "2026-09-01 00:00:00", 3)]],
    "replies": [("tenant_id, fb_comment_id, fb_post_id, reply_text"),
                [(1, "c1", "p1", "رد1"), (1, "c1", "p1", "رد1-مكرر"),
                 (2, "c9", "p2", "رد2")]],
    # تكرار lower(email) (D12-H4): البقاء لMIN(id)=1 (الحساب الذي يلتقطه
    # الدخول حتميًا) وتحييد الأحدث؛ '' خارج القيد الجزئي؛ NULL يُشفى.
    "users": [("username, email, token_ver, is_platform_admin"),
              [("alice", "A@x.com", None, None), ("bob", "a@x.com", None, None),
               ("carmen", "b@y.com", None, 1), ("dan", "", None, None)]],
}


def _seed_legacy(engine) -> None:
    with engine.begin() as conn:
        for table, (cols, rows) in _LEGACY_ROWS.items():
            col_list = cols
            for i, row in enumerate(rows, start=1):
                vals = ", ".join(
                    "NULL" if v is None else repr(v) if isinstance(v, str) else str(v)
                    for v in row
                )
                conn.exec_driver_sql(
                    f"INSERT INTO {table} (id, {col_list}) VALUES ({i}, {vals})"
                )


@pytest.fixture
def fresh_db(tmp_path, monkeypatch):
    """قاعدة sqlite معزولة + توجيه settings الفعلي والبيئة إليها."""
    from config import settings

    db_path = tmp_path / "v15_migrations.db"
    url = f"sqlite+aiosqlite:///{db_path}"
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    monkeypatch.setattr(settings, "DATABASE_POOLED_URL", "")
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DATABASE_POOLED_URL", "")
    return db_path


def _alembic_cfg() -> AlembicConfig:
    cfg = AlembicConfig()
    cfg.set_main_option("script_location", str(_ALEMBIC_DIR))
    return cfg


def _load_module(name: str):
    path = _VERSIONS_DIR / f"{name}.py"
    import importlib.util
    spec = importlib.util.spec_from_file_location(f"v15_test_{name}", path)
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


def _rows(db_path: Path, table: str, cols: str = "*") -> list[tuple]:
    con = sqlite3.connect(db_path)
    try:
        return con.execute(f"SELECT {cols} FROM {table} ORDER BY id").fetchall()
    finally:
        con.close()


def _index_sql(db_path: Path, table: str) -> dict[str, str | None]:
    con = sqlite3.connect(db_path)
    try:
        return dict(
            con.execute(
                "SELECT name, sql FROM sqlite_master "
                "WHERE type='index' AND tbl_name=?", (table,)
            ).fetchall()
        )
    finally:
        con.close()


def _columns(db_path: Path, table: str) -> set[str]:
    con = sqlite3.connect(db_path)
    try:
        return {row[1] for row in con.execute(f"PRAGMA table_info({table})").fetchall()}
    finally:
        con.close()


# ── 1) السلسلة 001→014 على قاعدة نظيفة ───────────────────────────────


def test_chain_head_is_014_on_fresh_db(fresh_db):
    """السلسلة كاملة على قاعدة نظيفة بلا أخطاء: حوارس 014 تتعرف على قيود
    create_all الجدولية (لا تصادم أسماء) وفهرس البريد التعبيري موجود.
    v16-E5: الرأس الآن 015 — حوارسه (فهرس offers + FK) تتخطى قاعدة
    create_all السليمة فلا تغيّر شيئًا هنا."""
    cfg = _alembic_cfg()
    command.upgrade(cfg, "head")
    assert _version(fresh_db) == "015"

    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        with engine.connect() as conn:
            insp = sa.inspect(conn)
            # القيود الجديدة موجودة كقيود جدول من create_all
            assert "uq_sub_tenant_fbuser" in {
                uc["name"] for uc in insp.get_unique_constraints("subscribers")}
            assert "uq_usage_tenant_metric_period" in {
                uc["name"] for uc in insp.get_unique_constraints("usage_counters")}
            assert "uq_seq_sub" in {
                uc["name"] for uc in insp.get_unique_constraints("sequence_subscriptions")}
            assert "uq_reply_tenant_comment" in {
                uc["name"] for uc in insp.get_unique_constraints("replies")}

        # فهرس البريد التعبيري: الانعكاس يتخطاه — الكتالوج يراه بـWHERE
        email_idx = _index_sql(fresh_db, "users").get("uq_user_email_lower") or ""
        assert "UNIQUE INDEX" in email_idx
        assert "lower(email)" in email_idx
        assert "email <> ''" in email_idx
    finally:
        engine.dispose()


def test_chain_constraints_enforce_on_fresh_db(fresh_db):
    """القيود تعمل فعليًا على SQLite: الإدراج المكرر يُرفض، والبريد الفارغ
    خارج النطاق الجزئي، والمستخدمون بلا بريد يتعايشون (نمط bootstrap)."""
    cfg = _alembic_cfg()
    command.upgrade(cfg, "head")

    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.exec_driver_sql("INSERT INTO subscribers (tenant_id, fb_user_id) VALUES (1, 'u1')")
                conn.exec_driver_sql("INSERT INTO subscribers (tenant_id, fb_user_id) VALUES (1, 'u1')")
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.exec_driver_sql("INSERT INTO replies (tenant_id, fb_comment_id, fb_post_id) VALUES (1, 'c1', 'p1')")
                conn.exec_driver_sql("INSERT INTO replies (tenant_id, fb_comment_id, fb_post_id) VALUES (1, 'c1', 'p1')")
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.exec_driver_sql("INSERT INTO usage_counters (tenant_id, metric, period_start) VALUES (5, 'replies_used', '2026-09-01')")
                conn.exec_driver_sql("INSERT INTO usage_counters (tenant_id, metric, period_start) VALUES (5, 'replies_used', '2026-09-01')")
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.exec_driver_sql("INSERT INTO sequence_subscriptions (tenant_id, subscriber_id, sequence_id) VALUES (5, 70, 1)")
                conn.exec_driver_sql("INSERT INTO sequence_subscriptions (tenant_id, subscriber_id, sequence_id) VALUES (5, 70, 1)")
        # البريد: نفس lower() يُرفض عبر الحالات؛ الفارغ مشروع متعددًا
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.exec_driver_sql("INSERT INTO users (username, email, password_hash, tenant_id) VALUES ('x1', 'A@x.com', 'h', 1)")
                conn.exec_driver_sql("INSERT INTO users (username, email, password_hash, tenant_id) VALUES ('x2', 'a@X.com', 'h', 2)")
        with engine.begin() as conn:
            conn.exec_driver_sql("INSERT INTO users (username, email, password_hash, tenant_id) VALUES ('x3', '', 'h', 3)")
            conn.exec_driver_sql("INSERT INTO users (username, email, password_hash, tenant_id) VALUES ('x4', '', 'h', 4)")
    finally:
        engine.dispose()


# ── 2) الترحيل 014 مباشرة على شكل legacy — الخصم/الدمج/التحييد ─────────


def test_migration_014_dedup_merge_and_neutralize_on_legacy(tmp_path):
    """قصة الإنتاج legacy: كل عائلة D3-H1/D12-H2/H4 + backfill tenant_id
    (D3-H2) + شفاء NULL (D3-M2) + idempotent (تشغيل مرتين)."""
    mod = _load_module("014_v15_integrity")
    engine = create_engine(f"sqlite:///{tmp_path / 'm14_legacy.db'}")
    try:
        _install_legacy_tables(engine)
        _seed_legacy(engine)

        # تشغيل 014 مرتين مباشرة — الحارس يجعل الثانية no-op كاملًا
        for _invocation in (1, 2):
            with engine.connect() as conn:
                ctx = MigrationContext.configure(conn)
                with Operations.context(ctx):
                    mod.upgrade()
                conn.commit()

        # الخصم بإبقاء MAX(id) + دمج العدادات (SUM) في الناجي
        assert _rows(engine.url.database, "subscribers",
                     "id, tenant_id, fb_user_id, reply_count") == [
            (3, 1, "u1", 9),   # 2+3+4 مدموجة في الأحدث
            (4, 2, "u2", 7),
        ]
        assert _rows(engine.url.database, "customers",
                     "id, tenant_id, fb_user_id, total_interactions") == [
            (2, 1, "c1", 15),  # 5+10
            (3, 3, "c2", 1),
        ]
        assert _rows(engine.url.database, "tags", "id, tenant_id, name") == [
            (2, 1, "VIP"), (3, 2, "عميل")]
        assert _rows(engine.url.database, "conversation_tags", "id, tenant_id, name") == [
            (2, 1, "مهم"), (3, 4, "عادي")]
        # مجموعة (subscriber_id, tag_id) فقط — الصفان 10/20 صارا واحدًا
        assert _rows(engine.url.database, "subscriber_tags",
                     "id, tenant_id, subscriber_id, tag_id") == [
            (2, 0, 10, 20), (3, 2, 11, 21)]

        # D3-H2: إعادة أبوة tenant_id من التسلسل + خصم التكرار الناتج
        assert _rows(engine.url.database, "sequence_subscriptions",
                     "id, tenant_id, subscriber_id, sequence_id") == [
            (2, 6, 71, 2),     # كان 0 → من sequences(6)
            (3, 5, 70, 1),     # كان صحيحًا؛ الزوج 0/70/1 المكرر حُذف
        ]

        # D12-H3: عداد الفترة المنقسمة دُمج (10+15) في الناجي MAX(id)
        assert _rows(engine.url.database, "usage_counters",
                     "id, tenant_id, metric, period_start, current_value") == [
            (2, 5, "replies_used", "2026-09-01 00:00:00", 25),
            (3, 5, "dms_used", "2026-09-01 00:00:00", 3),
        ]

        # D12-H2: ازدواج الرد على نفس التعليق خُصم
        assert _rows(engine.url.database, "replies",
                     "id, tenant_id, fb_comment_id") == [
            (2, 1, "c1"), (3, 2, "c9")]

        # D12-H4: تحييد المكرر الأحدث (البقاء لMIN(id)=1 = ما يلتقطه الدخول)
        # + D3-M2: شفاء NULL (token_ver→0, is_platform_admin→false)
        assert _rows(engine.url.database, "users",
                     "id, username, email, token_ver, is_platform_admin") == [
            (1, "alice", "A@x.com", 0, 0),
            (2, "bob", "", 0, 0),
            (3, "carmen", "b@y.com", 0, 1),
            (4, "dan", "", 0, 0),
        ]

        # القيود تعمل بعد الترحيل
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.exec_driver_sql(
                    "INSERT INTO subscribers (tenant_id, fb_user_id) VALUES (1, 'u1')")
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.exec_driver_sql(
                    "INSERT INTO users (username, email) VALUES ('eve', 'a@X.com')")

        # downgrade: الفهارس المستقلة تسقط (لا قيود create_all هنا)
        with engine.connect() as conn:
            ctx = MigrationContext.configure(conn)
            with Operations.context(ctx):
                mod.downgrade()
            conn.commit()
        users_idx = _index_sql(engine.url.database, "users")
        assert "uq_user_email_lower" not in users_idx
        subs_idx = _index_sql(engine.url.database, "subscribers")
        assert "uq_sub_tenant_fbuser" not in subs_idx
    finally:
        engine.dispose()


def test_migration_014_drops_dead_columns_and_dup_index(tmp_path):
    """D3-M5/M6: العمودان الميتان (onboarding_completed/amount_numeric)
    والفهرس الأحادي المكرر ix_schedpost_status_sched تُسقط — والثلاثي
    (tenant,status,scheduled_at) يبقى/يُنشأ مكانه."""
    mod = _load_module("014_v15_integrity")
    engine = create_engine(f"sqlite:///{tmp_path / 'm14_cleanup.db'}")
    try:
        with engine.begin() as conn:
            # جداول بأعمدة الإنتاج القديمة الزائدة + الفهرس المكرر اليدوي
            conn.exec_driver_sql(
                "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, "
                "username VARCHAR(100) NOT NULL, email VARCHAR(200) DEFAULT '', "
                "token_ver INTEGER, is_platform_admin BOOLEAN, "
                "onboarding_completed BOOLEAN DEFAULT 0)")
            conn.exec_driver_sql(
                "CREATE TABLE payment_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, "
                "amount NUMERIC(10,3), amount_numeric NUMERIC(10,3))")
            conn.exec_driver_sql(
                "CREATE TABLE scheduled_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, "
                "tenant_id INTEGER NOT NULL DEFAULT 0, status VARCHAR(20) DEFAULT 'draft', "
                "scheduled_at DATETIME)")
            conn.exec_driver_sql(
                "CREATE INDEX ix_schedpost_status_sched "
                "ON scheduled_posts (status, scheduled_at)")

        with engine.connect() as conn:
            ctx = MigrationContext.configure(conn)
            with Operations.context(ctx):
                mod.upgrade()
            conn.commit()

        assert "onboarding_completed" not in _columns(engine.url.database, "users")
        assert "amount_numeric" not in _columns(engine.url.database, "payment_requests")
        sched_idx = _index_sql(engine.url.database, "scheduled_posts")
        # الأحادي المكرر زال — وهذا هو الإصلاق: الثلاثي يُنشأه 002/النموذج
        # على قواعد السلسلة، وجدول legacy المعزول هنا ليس في قائمة شفاء
        # الفهارس (ليس من عائلة القيود) فلا يُستبدل فيه.
        assert "ix_schedpost_status_sched" not in sched_idx
    finally:
        engine.dispose()


def test_chain_drops_manual_dup_index_from_013_state(fresh_db):
    """قصة الإنتاج: النطاق حمل الأحادي من SQL يدوي → بعد 014 يسقط، والثلاثي
    (من 002/النموذج) يبقى يخدم الاستعلام الحي وحده."""
    cfg = _alembic_cfg()
    command.upgrade(cfg, "013")
    con = sqlite3.connect(fresh_db)
    try:
        con.execute(
            "CREATE INDEX IF NOT EXISTS ix_schedpost_status_sched "
            "ON scheduled_posts (status, scheduled_at)")
        con.commit()
    finally:
        con.close()

    command.upgrade(cfg, "head")
    # v16-E5: الرأس الآن 015 — خطوة 014 نفسها لم تتغير
    assert _version(fresh_db) == "015"
    sched_idx = _index_sql(fresh_db, "scheduled_posts")
    assert "ix_schedpost_status_sched" not in sched_idx
    assert "ix_schedpost_tenant_status_sched" in sched_idx

    # العمودان الميتان زالا على مسار السلسلة (004/001 أضافاهما → 014 أسقطهما)
    assert "onboarding_completed" not in _columns(fresh_db, "users")
    assert "amount_numeric" not in _columns(fresh_db, "payment_requests")


def test_production_boot_path_create_all_reconcile_then_chain(fresh_db):
    """مسار الإقلاع الحرفي (runner lifespan): create_all → reconcile →
    alembic upgrade head على قاعدة فارغة — لا تصادم بين قيود create_all
    وحوارس السلسلة، والرأس 015 والتنظيفات مطبقة، وفهرس البريد التعبيري
    يُكتشف عبر الكتالوج (لا انعكاس) فلا يُعاد إنشاؤه."""
    import warnings as _warnings

    from _schema_reconcile import reconcile_schema
    from models import Base

    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        with engine.begin() as conn:
            Base.metadata.create_all(conn)  # الخطوة 1: شكل الإقلاع
        with _warnings.catch_warnings():
            _warnings.simplefilter("error")  # أي SAWarning انعكاسي يفشل هنا
            _warnings.filterwarnings(
                "ignore", message=".*unsupported reflection of expression-based.*")
            with engine.begin() as conn:
                added = reconcile_schema(conn)  # الخطوة 2: الشبكة الأمينة
        # قاعدة كاملة القيود من create_all — لا شيء يُشفى (الفهرس التعبيري
        # يُرى عبر الكتالوج لا الانعكاس — وإلا كذب التقرير)
        assert added == [], added
    finally:
        engine.dispose()

    cfg = _alembic_cfg()
    command.upgrade(cfg, "head")  # الخطوة 3: السلسلة فوق القاعدة نفسها

    # v16-E5: الرأس الآن 015
    assert _version(fresh_db) == "015"
    assert "onboarding_completed" not in _columns(fresh_db, "users")
    assert "amount_numeric" not in _columns(fresh_db, "payment_requests")
    sched_idx = _index_sql(fresh_db, "scheduled_posts")
    assert "ix_schedpost_tenant_status_sched" in sched_idx
    assert "ix_schedpost_status_sched" not in sched_idx
    assert "uq_user_email_lower" in _index_sql(fresh_db, "users")

    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.exec_driver_sql(
                    "INSERT INTO users (username, email, password_hash, tenant_id) "
                    "VALUES ('boot_a', 'Boot@X.ly', 'h', 1)")
                conn.exec_driver_sql(
                    "INSERT INTO users (username, email, password_hash, tenant_id) "
                    "VALUES ('boot_b', 'boot@x.ly', 'h', 2)")
    finally:
        engine.dispose()


# ── 3) السلطة الفعلية للإنتاج: reconcile يشفي بلا alembic ─────────────


def test_reconcile_heals_v15_family_without_alembic(tmp_path):
    """reconcile وحده (مسار الإقلاع — lifespan) يطبق نفس مواصفة 014 على
    قاعدة legacy: القيود + الخصم/الدمج/التحييد/إعادة الأبوة/شفاء NULL،
    وهو idempotent (الاستدعاء الثاني لا يضيف شيئًا ولا يحذف)."""
    from _schema_reconcile import reconcile_schema

    engine = create_engine(f"sqlite:///{tmp_path / 'reconcile_v15.db'}")
    try:
        _install_legacy_tables(engine)
        _seed_legacy(engine)

        with engine.begin() as conn:
            added = reconcile_schema(conn)
        labels = set(added)
        assert "subscribers.uq_sub_tenant_fbuser" in labels
        assert "customers.uq_customer_tenant_fbuser" in labels
        assert "tags.uq_tag_tenant_name" in labels
        assert "conversation_tags.uq_ctag_tenant_name" in labels
        assert "subscriber_tags.uq_subscriber_tag" in labels
        assert "sequence_subscriptions.uq_seq_sub" in labels
        assert "usage_counters.uq_usage_tenant_metric_period" in labels
        assert "replies.uq_reply_tenant_comment" in labels
        assert "users.uq_user_email_lower" in labels
        # شفاء NULL مُبلَّغ (D3-M2)
        assert "users.token_ver~null" in labels
        assert "users.is_platform_admin~null" in labels

        # idempotent: الاستدعاء الثاني لا شيء (فهرس البريد التعبيري يُكتشف
        # عبر الكتالوج لا الانعكاس — وإلا لكذب التقرير كل إقلاع)
        with engine.begin() as conn:
            assert reconcile_schema(conn) == []

        # نفس عينة النتائج أعلاه — الشفاء مطابق لمسار السلسلة
        assert _rows(engine.url.database, "subscribers",
                     "id, tenant_id, fb_user_id, reply_count") == [
            (3, 1, "u1", 9), (4, 2, "u2", 7)]
        assert _rows(engine.url.database, "sequence_subscriptions",
                     "id, tenant_id, subscriber_id, sequence_id") == [
            (2, 6, 71, 2), (3, 5, 70, 1)]
        assert _rows(engine.url.database, "users",
                     "id, username, email, token_ver, is_platform_admin") == [
            (1, "alice", "A@x.com", 0, 0),
            (2, "bob", "", 0, 0),
            (3, "carmen", "b@y.com", 0, 1),
            (4, "dan", "", 0, 0),
        ]

        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.exec_driver_sql(
                    "INSERT INTO replies (tenant_id, fb_comment_id, fb_post_id) "
                    "VALUES (1, 'c1', 'p1')")
    finally:
        engine.dispose()


def test_reconcile_adds_server_default_columns_with_default(tmp_path):
    """D3-M2: العمود المفقود ذو server_default يُضاف حاملًا DEFAULT — لا
    يولد NULL أصلًا (reconcile القديم أضافه عاريًا)."""
    from _schema_reconcile import reconcile_schema

    engine = create_engine(f"sqlite:///{tmp_path / 'reconcile_defaults.db'}")
    try:
        with engine.begin() as conn:
            # جدول users شكله قبل إضافة العمودين إطلاقًا
            conn.exec_driver_sql(
                "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, "
                "username VARCHAR(100) NOT NULL, email VARCHAR(200) DEFAULT '', "
                "password_hash VARCHAR(255))")
            conn.exec_driver_sql(
                "INSERT INTO users (username, email, password_hash) "
                "VALUES ('legacy_user', 'l@t.ly', 'h')")

        with engine.begin() as conn:
            added = reconcile_schema(conn)
        assert any(a == "users.is_platform_admin" for a in added), added
        assert any(a == "users.token_ver" for a in added), added

        con = sqlite3.connect(engine.url.database)
        try:
            row = con.execute(
                "SELECT token_ver, is_platform_admin FROM users WHERE username='legacy_user'"
            ).fetchone()
        finally:
            con.close()
        # الصف القديم حصل على القيمة الافتراضية فور الإضافة — لا NULL
        assert row == (0, 0)
    finally:
        engine.dispose()


def test_constant_server_default_rendering_is_safe_literal():
    """حارس رندرة DEFAULT: السلسلة الخام تُقتبس (DEFAULT draft يُرفض
    نحوياً على SQLite ويفسَّر كمرجع عمود على PostgreSQL)، وثوابت text()
    تمر كما هي، والدوال (now()) تُرفض — فلا DEFAULT غير ثابت يُرفق."""
    from _schema_reconcile import _constant_server_default
    from sqlalchemy import Column, Integer, String, Table, text

    engine = create_engine("sqlite://")
    try:
        dialect = engine.dialect
        raw_str = Table(
            "t1", sa.MetaData(),
            Column("status", String, server_default="draft")).c.status
        assert _constant_server_default(raw_str, dialect) == "'draft'"

        quoted_escape = Table(
            "t2", sa.MetaData(),
            Column("note", String, server_default="it's")).c.note
        assert _constant_server_default(quoted_escape, dialect) == "'it''s'"

        text_zero = Table(
            "t3", sa.MetaData(),
            Column("token_ver", Integer, server_default=text("0"))).c.token_ver
        assert _constant_server_default(text_zero, dialect) == "0"

        text_false = Table(
            "t4", sa.MetaData(),
            Column("is_admin", sa.Boolean, server_default=text("false"))).c.is_admin
        assert _constant_server_default(text_false, dialect) == "false"

        func_call = Table(
            "t5", sa.MetaData(),
            Column("created_at", sa.DateTime, server_default=text("now()"))).c.created_at
        assert _constant_server_default(func_call, dialect) is None

        no_default = Table("t6", sa.MetaData(), Column("x", Integer)).c.x
        assert _constant_server_default(no_default, dialect) is None
    finally:
        engine.dispose()


# ── 4) مطابقة النموذج (D7-02 نمط test_v14) ────────────────────────────


def test_models_declare_v15_indexes():
    """النموذج يصرّح بفهرس البريد الجزئي بلهجتين وبصيغة tenant لفهرس
    scheduled_posts — بيئات create_all تولد بلا انحراف عن الإنتاج."""
    from models import ScheduledPost, User

    user_ix = {ix.name: ix for ix in User.__table__.indexes}
    email_idx = user_ix["uq_user_email_lower"]
    assert email_idx.unique
    assert email_idx.dialect_options["postgresql"]["where"] is not None
    assert email_idx.dialect_options["sqlite"]["where"] is not None

    sched_ix = {ix.name: ix for ix in ScheduledPost.__table__.indexes}
    assert "ix_schedpost_status_sched" not in sched_ix  # D3-M6: الأحادي أُزيل
    assert [c.name for c in sched_ix["ix_schedpost_tenant_status_sched"].columns] == [
        "tenant_id", "status", "scheduled_at"]

    # DDL المُرندر على SQLite يحمل WHERE الجزئي (فحص حي لا انعكاسي)
    engine = create_engine("sqlite://")
    try:
        with engine.begin() as conn:
            User.__table__.create(conn)
            ScheduledPost.__table__.create(conn)
        with engine.connect() as conn:
            sqls = dict(
                (name, sql or "") for name, sql in conn.exec_driver_sql(
                    "SELECT name, sql FROM sqlite_master WHERE type='index'"
                ).fetchall()
            )
    finally:
        engine.dispose()
    assert "WHERE email <> ''" in sqls["uq_user_email_lower"]
    assert "UNIQUE INDEX" in sqls["uq_user_email_lower"]


# ── 5) D3-H2: محرك التسلسل — tenant_id + SAVEPOINT ────────────────────


async def test_subscribe_sets_tenant_id_and_does_not_poison_caller():
    """subscribe يحمل tenant_id المُمرَّر (كان يسقط في 0 فتتخطى الخطوات)،
    والمكرر يُرجع False عبر SAVEPOINT دون rollback كامل — تغييرات المستدعي
    المعلقة تنجو ويلتزم بها (نمط _wallet.credit_wallet المجرب)."""
    from models import Base, Sequence, SequenceSubscription, Subscriber
    from sequence_engine import SequenceEngine

    engine = create_async_engine(
        "sqlite+aiosqlite://", connect_args={"check_same_thread": False},
        poolclass=StaticPool)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        sf = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with sf() as session:
            sub = Subscriber(tenant_id=5, fb_user_id="fb-77")
            session.add(sub)
            await session.flush()
            seq = Sequence(tenant_id=5, name="ترحيب", status="active")
            session.add(seq)
            await session.flush()

            eng = SequenceEngine(fb=None)  # subscribe لا يستعمل العميل

            assert await eng.subscribe(sub.id, seq.id, session, tenant_id=5) is True
            row = (await session.execute(
                sa.select(SequenceSubscription.tenant_id).where(
                    SequenceSubscription.subscriber_id == sub.id)
            )).scalar_one_or_none()
            assert row == 5  # D3-H2: لم يعد 0

            # تغيير معلق للمستدعي + اشتراك مكرر → False دون تسميم
            seq.total_sent = 42
            assert await eng.subscribe(sub.id, seq.id, session, tenant_id=5) is False
            await session.commit()

        async with sf() as session:
            n = len((await session.execute(
                sa.select(SequenceSubscription))).scalars().all())
            sent = (await session.execute(
                sa.select(Sequence.total_sent))).scalar_one()
            subscribers = (await session.execute(
                sa.select(Sequence.total_subscribers))).scalar_one()
        assert n == 1          # لا صف مكرر
        assert sent == 42      # تغيير المستدعي نجا (لم يُلغِه rollback)
        assert subscribers == 1  # العدّاد زاد مرة واحدة فقط
    finally:
        await engine.dispose()
