"""v14 §E3 — اختبارات سلسلة الترحيلات 001→013 + الكاش + سقوف القوائم.

C-DATA1 (D7-01 الحرجة): ترحيلة 013 — dedup عام (tenant_id, key) بإبقاء
MAX(id) + فهرس فريد uq_botstate_tenant_key + فهارس المسارات الساخنة
(D7-07) + مطابقة النموذج (D7-02/D7-03) + شفاء _schema_reconcile
(السلطة الفعلية للإنتاج) + كاش /api/public/stats (D10 §8) + سقوف
القوائم (D10 §6).

الميكانيكا (نمط test_v13_migrations): دوال sync للترحيلات وasync للـHTTP،
قاعدة sqlite معزولة لكل اختبار في tmp_path مع توجيه settings singleton
وos.environ معًا. الترقية عبر command.upgrade الحقيقي (نفس مسار الإنتاج
app/startup.py) — قاعدة الجنات المشتركة لا تُلمس إطلاقًا.
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

# شكل bot_state القديم (الإنتاج قبل إعادة البناء): لا قيد ولا فهرس فريد —
# 001's create_all يتخطى الجداول الموجودة فتبقى بهذا الشكل حتى تشفّيه
# الترحيلات/reconcile. نفس محاكاة «legacy» التي يعتمدها اختبار v13.
_LEGACY_DDL = """
CREATE TABLE bot_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL DEFAULT 0,
    key VARCHAR(100) NOT NULL,
    value TEXT DEFAULT ''
)
"""

# عيّنة legacy: (id ترتيبي 1..8)
#   id=1/2 — نفس قيمة fb_page_id عبر مستأجرين (نطاق dedup 012 — الأقدم يُحذف)
#   id=4/5 — زوج (tenant,key) مكرر داخل المستأجر 1 (نطاق dedup 013 — الأقدم يُحذف)
#   id=6..8 — تكرار قيم مشروع عبر مستأجرين لمفاتيح غير fb_page_id (يبقى كله)
_LEGACY_ROWS = [
    (1, "fb_page_id", "111"),
    (2, "fb_page_id", "111"),
    (3, "fb_page_id", "222"),
    (1, "balance", "20.000"),
    (1, "balance", "35.000"),
    (2, "balance", "20.000"),
    (1, "fb_fan_count", "1500"),
    (2, "fb_fan_count", "1500"),
]


@pytest.fixture
def fresh_db(tmp_path, monkeypatch):
    """قاعدة sqlite معزولة + توجيه settings الفعلي والبيئة إليها."""
    from config import settings

    db_path = tmp_path / "v14_migrations.db"
    url = f"sqlite+aiosqlite:///{db_path}"
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    monkeypatch.setattr(settings, "DATABASE_POOLED_URL", "")
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DATABASE_POOLED_URL", "")
    return db_path


def _alembic_cfg() -> AlembicConfig:
    """Config بموقع السكربت فقط — URL يأتي من settings عبر env.py."""
    cfg = AlembicConfig()
    cfg.set_main_option("script_location", str(_ALEMBIC_DIR))
    return cfg


def _load_module(name: str):
    """تحميل وحدة ترحيل مباشرة (آلية استدعاء 012/013 دون تشغيل السلسلة)."""
    path = _VERSIONS_DIR / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"v14_test_{name}", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _install_legacy_bot_state(db_path: Path) -> None:
    con = sqlite3.connect(db_path)
    try:
        con.execute(_LEGACY_DDL)
        con.executemany(
            "INSERT INTO bot_state (tenant_id, key, value) VALUES (?, ?, ?)",
            _LEGACY_ROWS,
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


# ── C-DATA1: السلسلة 001→013 على قاعدة نظيفة ──────────────────────────


def test_chain_head_is_013_on_fresh_db(fresh_db):
    """السلسلة كاملة على قاعدة نظيفة (001 create_all → 013) بلا أخطاء:
    حارس 013 يتعرف على قيد create_all (uq_botstate_tenant_key كقيد جدول
    لا فهرس مستقل) فلا يصطدم بإنشاء مكرر، والفهارس الساخنة كلها موجودة."""
    cfg = _alembic_cfg()
    command.upgrade(cfg, "head")
    # v15-E2: الرأس أصبح 014 — حوارس قيود v15 تتخطى قيود create_all
    assert _version(fresh_db) == "014"

    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        with engine.connect() as conn:
            insp = sa.inspect(conn)
            # القيد موجود كقيد جدول من create_all (وليس فهارسنا المستقلة)
            uq_constraints = {uc["name"] for uc in insp.get_unique_constraints("bot_state")}
            assert "uq_botstate_tenant_key" in uq_constraints
            # الفريد الجزئي (012/النموذج) موجود كفهرس فريد
            reflected = {ix["name"]: ix for ix in insp.get_indexes("bot_state")}
            assert reflected["uq_botstate_key_value"]["unique"]
            assert reflected["uq_botstate_key_value"]["column_names"] == ["key", "value"]
            # فهارس المسارات الساخنة (D7-07) بأسماء النموذج وأعمدته
            for table, name, cols in (
                ("bot_logs", "ix_botlog_tenant_created", ["tenant_id", "created_at"]),
                ("rules", "ix_rule_tenant_enabled", ["tenant_id", "enabled"]),
                ("messages", "ix_messages_rule_id", ["rule_id"]),
                ("comments", "ix_comments_commenter_id", ["commenter_id"]),
            ):
                idx = {ix["name"]: ix for ix in insp.get_indexes(table)}
                assert name in idx, f"{name} مفقود على {table}"
                assert idx[name]["column_names"] == cols
    finally:
        engine.dispose()


def test_chain_downgrade_013_keeps_create_all_constraint(fresh_db):
    """downgrade 013→012 على قاعدة create_all: يُسقط فهارسه المستقلة فقط
    (الساخنة) ولا يمس قيد الجدول — التماثل مضمون على القواعد النظيفة."""
    cfg = _alembic_cfg()
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "012")
    assert _version(fresh_db) == "012"

    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        with engine.connect() as conn:
            insp = sa.inspect(conn)
            for table, name in (
                ("bot_logs", "ix_botlog_tenant_created"),
                ("rules", "ix_rule_tenant_enabled"),
                ("messages", "ix_messages_rule_id"),
                ("comments", "ix_comments_commenter_id"),
            ):
                assert name not in {ix["name"] for ix in insp.get_indexes(table)}
            # قيد الجدول باقٍ — التفرد مستمر حتى بعد downgrade
            uq = {uc["name"] for uc in insp.get_unique_constraints("bot_state")}
            assert "uq_botstate_tenant_key" in uq
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "INSERT INTO bot_state (tenant_id, key, value) VALUES (1, 'balance', '5.000')"
            )
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.exec_driver_sql(
                    "INSERT INTO bot_state (tenant_id, key, value) VALUES (1, 'balance', '9.000')"
                )
    finally:
        engine.dispose()


# ── C-DATA1: محاكاة الإنتاج legacy — الترحيل 013 مباشرة ─────────────────


def test_migration_013_dedup_and_unique_on_legacy_shape(tmp_path):
    """013 على جدول legacy بلا قيد: dedup عام (tenant,key) يبقي MAX(id)
    فقط (id=4 يُحذف، id=5 يبقى)، تكرار fb_page_id عبر المستأجرين (نطاق
    012) يبقى سالمًا، والفهرس الفريد يرفض الإدراج المكرر بعد الترحيل."""
    mod = _load_module("013_bot_state_tenant_unique_hot_indexes")
    engine = create_engine(f"sqlite:///{tmp_path / 'm13_legacy.db'}")
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql(_LEGACY_DDL)
        with engine.connect() as conn:
            for row in _LEGACY_ROWS:
                conn.exec_driver_sql(
                    "INSERT INTO bot_state (tenant_id, key, value) VALUES (?, ?, ?)",
                    row,
                )
            conn.commit()

        # تشغيل 013 مرتين مباشرة — idempotent (الحارس بالـ Inspector)
        for _invocation in (1, 2):
            with engine.connect() as conn:
                ctx = MigrationContext.configure(conn)
                with Operations.context(ctx):
                    mod.upgrade()
                conn.commit()

        with engine.connect() as conn:
            ids = conn.exec_driver_sql("SELECT id FROM bot_state ORDER BY id").scalars().all()
        # dedup (tenant,key): حُذف id=4 (الأقدم لزوج balance في المستأجر 1)؛
        # id=1 نجا (زوجه (1,fb_page_id) فريد — نطاق 012 ليس نطاق 013)
        assert ids == [1, 2, 3, 5, 6, 7, 8]

        # الفهرس الفريد يرفض تكرار (tenant_id, key)
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.exec_driver_sql(
                    "INSERT INTO bot_state (tenant_id, key, value) VALUES (1, 'balance', '99.000')"
                )
        # زوج جديد يُقبل
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "INSERT INTO bot_state (tenant_id, key, value) VALUES (3, 'balance', '9.000')"
            )

        # downgrade: الفهرس يُسقط → المكرر يُقبل مجددًا (dedup forward-only)
        with engine.connect() as conn:
            ctx = MigrationContext.configure(conn)
            with Operations.context(ctx):
                mod.downgrade()
            conn.commit()
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "INSERT INTO bot_state (tenant_id, key, value) VALUES (1, 'balance', '99.000')"
            )
            n = conn.exec_driver_sql(
                "SELECT COUNT(*) FROM bot_state WHERE tenant_id=1 AND key='balance'"
            ).scalar()
        assert n == 2
    finally:
        engine.dispose()


# ── C-DATA1: السلسلة كاملة على جدول legacy (قصة الإنتاج end-to-end) ────


def test_chain_heals_legacy_bot_state_end_to_end(fresh_db):
    """قصة الإنتاج: جدول bot_state موجود مسبقًا بشكل legacy (create_all
    يتخطاه) + صفوف مكررة → السلسلة (reconcile في 007 + 012/013) تشفيه:
    كلا dedup يُطبَّق، القيدان موجودان، والإدراج المكرر مرفوض بعدها."""
    _install_legacy_bot_state(fresh_db)

    cfg = _alembic_cfg()
    command.upgrade(cfg, "head")
    assert _version(fresh_db) == "014"  # v15-E2: الرأس أصبح 014

    # كلا dedup: id=1 (نطاق 012 — قيمة fb_page_id مكررة عبر مستأجرين)
    # وid=4 (نطاق 013 — زوج tenant/key مكرر) حُذفا؛ الباقي سليم
    assert _bot_state_rows(fresh_db) == [
        (2, 2, "fb_page_id", "111"),
        (3, 3, "fb_page_id", "222"),
        (5, 1, "balance", "35.000"),
        (6, 2, "balance", "20.000"),
        (7, 1, "fb_fan_count", "1500"),
        (8, 2, "fb_fan_count", "1500"),
    ]

    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        # القيد الجدولي (tenant,key) يرفض المكرر
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.exec_driver_sql(
                    "INSERT INTO bot_state (tenant_id, key, value) VALUES (1, 'balance', '99')"
                )
        # الفريد الجزئي (012) يرفض ربط صفحة مربوطة بمستأجر آخر
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.exec_driver_sql(
                    "INSERT INTO bot_state (tenant_id, key, value) VALUES (4, 'fb_page_id', '111')"
                )
    finally:
        engine.dispose()


# ── السلطة الفعلية للإنتاج: _schema_reconcile يشفي القيود والفهارس ──────


def test_reconcile_heals_legacy_constraints_and_hot_indexes(tmp_path):
    """reconcile على جدول legacy: يشفي القيدين (مع dedup) + فهرس ساخن
    مفقود، وidempotent (الاستدعاء الثاني لا يضيف شيئًا ولا يحذف)."""
    from _schema_reconcile import reconcile_schema
    from models import Base

    engine = create_engine(f"sqlite:///{tmp_path / 'reconcile.db'}")
    try:
        with engine.begin() as conn:
            Base.metadata.create_all(conn)
        with engine.begin() as conn:
            # جدول legacy + إسقاط فهرس ساخن واحد لمحاكاة غيابه في الإنتاج
            conn.exec_driver_sql("DROP TABLE bot_state")
            conn.exec_driver_sql(_LEGACY_DDL)
            conn.exec_driver_sql("DROP INDEX IF EXISTS ix_botlog_tenant_created")
        with engine.connect() as conn:
            for row in _LEGACY_ROWS:
                conn.exec_driver_sql(
                    "INSERT INTO bot_state (tenant_id, key, value) VALUES (?, ?, ?)", row)
            conn.commit()

        with engine.begin() as conn:
            added = reconcile_schema(conn)
        assert "bot_state.uq_botstate_key_value" in added
        assert "bot_state.uq_botstate_tenant_key" in added
        assert "bot_logs.ix_botlog_tenant_created" in added

        # idempotent: الاستدعاء الثاني = لا شيء
        with engine.begin() as conn:
            assert reconcile_schema(conn) == []

        # كلا dedup طُبّق (id=1 وid=4 حُذفا)
        with engine.connect() as conn:
            ids = conn.exec_driver_sql("SELECT id FROM bot_state ORDER BY id").scalars().all()
        assert ids == [2, 3, 5, 6, 7, 8]

        # القيدان يعملان: مكرر (tenant,key) مرفوض، وربط صفحة مربوطة مرفوض
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.exec_driver_sql(
                    "INSERT INTO bot_state (tenant_id, key, value) VALUES (1, 'balance', '99')"
                )
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.exec_driver_sql(
                    "INSERT INTO bot_state (tenant_id, key, value) VALUES (4, 'fb_page_id', '111')"
                )
        # نطاق الجزئية: تكرار القيمة لمفاتيح غير fb_page_id مشروع عبر المستأجرين
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "INSERT INTO bot_state (tenant_id, key, value) VALUES (3, 'balance', '20.000')"
            )
    finally:
        engine.dispose()


# ── مطابقة النموذج (D7-02/D7-03) ──────────────────────────────────────


def test_models_declare_v14_constraints_and_partial_where():
    """النموذج يصرّح بالقيد الجزئي (012) وبـsqlite_where للفهارس الجزئية
    (D7-03) — كي لا تولد بيئات create_all بلا ضمان التفرد أو بدلالة
    منحرفة عن الإنتاج."""
    from models import BotState, SubscriptionPayment

    # (أ) uq_botstate_key_value: فريد جزئي بلهجتين (D7-02)
    bot_ix = {ix.name: ix for ix in BotState.__table__.indexes}
    uq = bot_ix["uq_botstate_key_value"]
    assert uq.unique
    assert [c.name for c in uq.columns] == ["key", "value"]
    assert uq.dialect_options["postgresql"]["where"] is not None
    assert uq.dialect_options["sqlite"]["where"] is not None

    # (ب) قيد الجدول (tenant,key) لا يزال مصرّحًا به (create_all يبنيه)
    uq_names = {c.name for c in BotState.__table__.constraints
                if isinstance(c, sa.UniqueConstraint)}
    assert "uq_botstate_tenant_key" in uq_names

    # (ج) ix_sub_payment_user_pending: sqlite_where مطابقة (D7-03)
    pay_ix = {ix.name: ix for ix in SubscriptionPayment.__table__.indexes}
    pend = pay_ix["ix_sub_payment_user_pending"]
    assert pend.unique
    assert pend.dialect_options["sqlite"]["where"] is not None
    assert pend.dialect_options["postgresql"]["where"] is not None

    # (د) DDL المُرندر على SQLite يحمل WHERE (كان فريدًا كاملًا بلا شرط)
    engine = create_engine("sqlite://")
    try:
        with engine.begin() as conn:
            BotState.__table__.create(conn)
            SubscriptionPayment.__table__.create(conn)
        with engine.connect() as conn:
            sqls = dict(
                (name, sql or "") for name, sql in conn.exec_driver_sql(
                    "SELECT name, sql FROM sqlite_master WHERE type='index'"
                ).fetchall()
            )
    finally:
        engine.dispose()
    assert "WHERE key = 'fb_page_id'" in sqls["uq_botstate_key_value"]
    assert "UNIQUE INDEX" in sqls["uq_botstate_key_value"]
    assert "WHERE status = 'pending'" in sqls["ix_sub_payment_user_pending"]
    assert "UNIQUE INDEX" in sqls["ix_sub_payment_user_pending"]


def test_env_py_engine_mirrors_database_py():
    """حارس مصدري (D7-05): env.py يبني محركه بنمط database.py — SSL
    كامل + connect_args لasyncpg + اختيار pool — لا محرك «أعزل» يفشل
    صامتًا ضد Neon (CI بلا PG → حارس مصدري كنمط test_phase_c)."""
    src = (_ALEMBIC_DIR / "env.py").read_text(encoding="utf-8")
    for needle in (
        "db_require_ssl",           # نفس شرط SSL
        "create_default_context",   # تحقق الشهادات الكامل
        "DB_SSL_VERIFY",            # باب الطوارئ الموثّق
        "statement_cache_size",     # pgbouncer transaction-mode
        "timeout",                  # asyncpg connect timeout
        "NullPool",                 # PG/Vercel
        "StaticPool",               # memory/test
        "pool_recycle",             # فرع non-PG
    ):
        assert needle in src, f"env.py فقد مرآة database.py: {needle}"


# ── كاش /api/public/stats (D10 §8) ─────────────────────────────────────


async def test_public_stats_second_call_served_from_cache():
    """استدعاءان متتاليان: الثاني من الكاش — عداد استدعاءات db.scalar
    يثبت أن الثاني لم يلمس القاعدة (العدّ الفوري كان 2 للعدّادين)."""
    from api_cache import _cache_locks, _cache_store

    _cache_store.clear()
    _cache_locks.clear()
    try:
        from routers.plans_config import public_stats

        class _CountingDb:
            def __init__(self):
                self.calls = 0

            async def scalar(self, *_a, **_k):
                self.calls += 1
                return 7

        db = _CountingDb()
        r1 = await public_stats(db=db)
        r2 = await public_stats(db=db)
        assert r1 == r2
        assert r1["success"] is True
        assert r1["data"]["activeTenants"] == 7
        assert r1["data"]["totalReplies"] == 7
        # الاستدعاء الأول: عدّان (tenants + replies)؛ الثاني: من الكاش — صفر
        assert db.calls == 2
    finally:
        _cache_store.clear()
        _cache_locks.clear()


async def test_public_stats_route_still_200_over_http(v10_world):
    """الدخول عبر التطبيق: 200 مرتين متتاليتين بنفس الجسم (غلاف الكاش
    المسجَّل تحت router.get — نفس نمط /api/plans)."""
    r1 = await v10_world.client.get("/api/public/stats")
    r2 = await v10_world.client.get("/api/public/stats")
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json() == r2.json()
    assert r1.json()["success"] is True


# ── سقوف القوائم (D10 §6) ──────────────────────────────────────────────


async def test_subscribers_per_page_capped(v10_seed):
    """/api/subscribers: per_page>200 أو <1 أو page<1 → 422؛ القيمة
    الحدية 200 مقبولة (كان بلا ge/le → ?per_page=100000 يسحب الجدول)."""
    uname, tid, _uid = await v10_seed.tenant_user()
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client
    assert (await c.get("/api/subscribers?per_page=201")).status_code == 422
    assert (await c.get("/api/subscribers?per_page=0")).status_code == 422
    assert (await c.get("/api/subscribers?page=0")).status_code == 422
    r = await c.get("/api/subscribers?per_page=200&page=1")
    assert r.status_code == 200
    assert r.json()["success"] is True


async def test_crm_customers_per_page_capped(v10_seed):
    """/api/crm/customers: نفس القيود (كان page=0 يعطي offset سالباً)."""
    uname, tid, _uid = await v10_seed.tenant_user()
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client
    assert (await c.get("/api/crm/customers?per_page=201")).status_code == 422
    assert (await c.get("/api/crm/customers?per_page=0")).status_code == 422
    assert (await c.get("/api/crm/customers?page=0")).status_code == 422
    r = await c.get("/api/crm/customers?per_page=200&page=1")
    assert r.status_code == 200
    assert r.json()["success"] is True


async def test_broadcasts_limit_capped_and_default_50(v10_seed):
    """/api/broadcasts: كانت بلا سقف (صف لكل حملة قط + استطلاع 30ث) —
    الآن limit افتراضي 50 ومقيد 1..200، ويُحترم في الاستجابة."""
    from models import Broadcast

    uname, tid, _uid = await v10_seed.tenant_user()
    v10_seed.auth(uname, tid)
    sf = v10_seed.world.sf
    async with sf() as db:
        db.add_all([
            Broadcast(name=f"حملة {i}", tenant_id=tid, status="draft")
            for i in range(55)
        ])
        await db.commit()

    c = v10_seed.world.client
    assert (await c.get("/api/broadcasts?limit=201")).status_code == 422
    assert (await c.get("/api/broadcasts?limit=0")).status_code == 422
    assert (await c.get("/api/broadcasts?limit=-5")).status_code == 422

    r_default = await c.get("/api/broadcasts")
    assert r_default.status_code == 200
    assert len(r_default.json()["data"]) == 50  # السقف الافتراضي

    r_all = await c.get("/api/broadcasts?limit=55")
    assert r_all.status_code == 200
    assert len(r_all.json()["data"]) == 55  # القيمة المطلوبة ضمن الحد

    # عزل المستأجر مع السقف: مستأجر آخر لا يرى شيئًا
    uname2, tid2, _uid2 = await v10_seed.tenant_user()
    v10_seed.auth(uname2, tid2)
    r_other = await c.get("/api/broadcasts")
    assert r_other.status_code == 200
    assert r_other.json()["data"] == []
