"""v28 (D-05) — اختبارات الترحيلة 018: FK CASCADE + VALIDATE قيد 015.

الميكانيكا (نمط test_v16_migrations حرفياً): دوال **sync** للترحيلات
(alembic/env.py يستدعي asyncio.run — حلقة جارية تنفجر) وقاعدة sqlite
معزولة لكل اختبار في tmp_path مع توجيه settings singleton **و**
os.environ معاً (env.py يبني محركه من settings.async_database_url ولا
يعيد قراءة البيئة) — قاعدة الجنات المشتركة لا تُلمس إطلاقاً.

التغطية:
1. السلسلة تصل 018 على قاعدة نظيفة: الرأس 018، وكل أعمدة CASCADE_FKS
   تعكس ondelete=CASCADE عبر create_all (شكل النموذج؛ SQLite يضعها
   داخل options — نفس تفاوت 015)، وtelegram_approvers لا يزال SET NULL.
2. 018 idempotent: تشغيل الوحدة مرتين مباشرة (Operations.context) —
   لا خطأ ولا تكرار (فرع PG فقط؛ SQLite no-op).
3. حارس اللهجة + عقد 018 المصري: فرع postgresql فقط يحيط بكل DDL
   القيود؛ VALIDATE CONSTRAINT موجود؛ تنظيف الأيتام يسبق ADD؛
   الأسماء القانونية <table>_<column>_fkey.
4. شفاء reconcile: _FK_HEAL مطابقة لقائمة 018 (نفس الجدول/العمود/
   الأصل)؛ reconcile_schema على قاعدة sqlite create_all نظيفة = []
   (فرع FK محروس باللهجة — لا يحاول ALTER على SQLite أبداً).
5. رؤوس الجولات السابقة رُقّيت في ملفاتها الأصلية (017→018).
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

from alembic import command

_REPO = Path(__file__).resolve().parent.parent
_ALEMBIC_DIR = _REPO / "alembic"
_VERSIONS_DIR = _ALEMBIC_DIR / "versions"


@pytest.fixture
def fresh_db(tmp_path, monkeypatch):
    """قاعدة sqlite معزولة + توجيه settings الفعلي والبيئة إليها."""
    from config import settings

    db_path = tmp_path / "v28_fk_cascade.db"
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
    """تحميل وحدة ترحيل مباشرة (نمط test_v16_migrations)."""
    path = _VERSIONS_DIR / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"v28_test_{name}", path)
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


def _fk_rule(fk: dict) -> str | None:
    return fk.get("ondelete") or fk.get("options", {}).get("ondelete")


# ── 1: السلسلة تصل 018 — كل قيود CASCADE منعكسة ─────────────────────────


def test_chain_reaches_018_all_cascade_fks_reflect(fresh_db):
    """السلسلة 001→018 على قاعدة نظيفة: كل عمود في CASCADE_FKS يعكس
    ondelete=CASCADE (شكل النموذج عبر create_all) مع الأصل الصحيح،
    وtelegram_approvers لا يزال SET NULL (015 سليم لم يُمس)."""
    command.upgrade(_alembic_cfg(), "head")
    assert _version(fresh_db) == "018"  # v28 (D-05): FK CASCADE + VALIDATE

    mod = _load_module("018_v28_fk_cascade")
    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        with engine.connect() as conn:
            insp = sa.inspect(conn)
            tables = set(insp.get_table_names())
            for table, column, parent in mod.CASCADE_FKS:
                assert table in tables, f"{table} missing from chain schema"
                fks = [fk for fk in insp.get_foreign_keys(table)
                       if fk.get("constrained_columns") == [column]]
                assert len(fks) == 1, (
                    f"{table}.{column}: expected exactly 1 FK, got {len(fks)}")
                assert _fk_rule(fks[0]) == "CASCADE", (
                    f"{table}.{column}: ondelete={_fk_rule(fks[0])!r}, want CASCADE")
                assert fks[0]["referred_table"] == parent

            # 015 لم يُمس: لا يزال SET NULL (وأصبح مُتحقَّقًا منه على PG)
            tg = [fk for fk in insp.get_foreign_keys("telegram_approvers")
                  if fk.get("constrained_columns") == ["added_by_id"]]
            assert len(tg) == 1
            assert _fk_rule(tg[0]) == "SET NULL"
            assert tg[0]["referred_table"] == "users"
    finally:
        engine.dispose()


# ── 2: 018 idempotent (تشغيل مزدوج مباشر) ────────────────────────────────


def test_migration_018_is_idempotent(fresh_db):
    """تشغيل وحدة 018 مرتين مباشرة عبر Operations.context — لا خطأ ولا
    تكرار (SQLite: فرع PG no-op؛ الحارس + الأسماء القانونية يمنعان
    التكرار على PG نفسها)."""
    command.upgrade(_alembic_cfg(), "head")
    assert _version(fresh_db) == "018"

    mod = _load_module("018_v28_fk_cascade")
    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        for _invocation in (1, 2):
            with engine.connect() as conn:
                ctx = MigrationContext.configure(conn)
                with Operations.context(ctx):
                    mod.upgrade()
                conn.commit()
        with engine.connect() as conn:
            insp = sa.inspect(conn)
            fk_counts = {t: len(insp.get_foreign_keys(t)) for t in
                         ("subscriber_tags", "sequence_steps",
                          "broadcast_recipients", "telegram_approvers")}
    finally:
        engine.dispose()
    # لم تتغير أي عائلة قيود (no-op كامل على SQLite)
    assert fk_counts["subscriber_tags"] == 2
    assert fk_counts["sequence_steps"] == 1
    assert fk_counts["broadcast_recipients"] == 2
    assert fk_counts["telegram_approvers"] == 1


# ── 3: حارس اللهجة + عقد 018 المصري ──────────────────────────────────────


def test_migration_018_pg_only_gate_and_contract():
    """فرع postgresql فقط يحيط بـDDL القيود؛ VALIDATE موجود؛ تنظيف
    الأيتام يسبق ADD CONSTRAINT؛ الأسماء القانونية <table>_<column>_fkey
    (نمط test_003_setval_guard — تأكيدات مصدرية)."""
    mod = _load_module("018_v28_fk_cascade")
    src = (_VERSIONS_DIR / "018_v28_fk_cascade.py").read_text(encoding="utf-8")

    # الحارس: أول ما يفعله upgrade هو قصر العمل على PG
    assert 'bind.dialect.name != "postgresql"' in src
    # أول VALIDATE CONSTRAINT في المستودع (D-05: النصف المعلق من العنوان)
    assert "VALIDATE CONSTRAINT" in src
    # NOT VALID عند البناء (لا مسح تحقق عند الإضافة) — نمط 015
    assert "ON DELETE CASCADE NOT VALID" in src
    # تنظيف الأيتام قبل إضافة القيد (VALIDATE بعده يلزمه)
    assert src.index("DELETE FROM {table}") < src.index("ADD CONSTRAINT {_canonical")
    # الأسماء القانونية
    for table, column, _parent in mod.CASCADE_FKS:
        assert mod._canonical(table, column) == f"{table}_{column}_fkey"
    # تصفير أيتام 015 (SET NULL دلالةً — قرار 015 محفوظ) — بالنص الحرفي
    # للـf-string في المصدر (القيم تُحلّ وقت التشغيل):
    assert "UPDATE {_VALIDATE_TABLE} SET {_VALIDATE_COLUMN} = NULL" in src


# ── 4: شفاء reconcile — _FK_HEAL مطابقة لقائمة 018 + no-op على sqlite ───


def test_reconcile_fk_heal_matches_migration_and_noop_on_sqlite(fresh_db):
    """_FK_HEAL تحمل نفس (table, column, parent) التي تبنيها 018 —
    الشبكة والسلسلة وجهان لنفس العقد (belt-and-suspenders). وreconcile_schema
    على قاعدة create_all نظيفة (sqlite) يرجع [] — فرع FK محروس باللهجة
    ولا يلمس SQLite أبداً (لا ALTER TABLE DROP CONSTRAINT هناك)."""
    mod = _load_module("018_v28_fk_cascade")
    import _schema_reconcile as rec

    migration_set = {(t, c, p) for t, c, p in mod.CASCADE_FKS}
    heal_set = {(t, c, p) for _lbl, t, c, p, _rule in rec._FK_HEAL}
    assert heal_set == migration_set, (
        f"reconcile/migration drift: {heal_set ^ migration_set}")
    # كلها CASCADE
    assert all(rule == "CASCADE" for _l, _t, _c, _p, rule in rec._FK_HEAL)

    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        from models import Base
        with engine.begin() as conn:
            Base.metadata.create_all(conn)
        with engine.connect() as conn:
            added = rec.reconcile_schema(conn)
    finally:
        engine.dispose()
    # قاعدة بشكل النموذج: لا أعمدة/فهارس/قيود تُشفى — والفرع الجديد
    # محروس باللهجة فلا يظهر أي تسمية ~cascade على SQLite.
    assert added == [], f"expected clean no-op, healed: {added}"
