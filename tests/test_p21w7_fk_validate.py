"""P21-W7-F (D-05) — اختبارات ترحيلة 019: VALIDATE لقيود FK من 015.

الميكانيكا (نمط test_v13/test_v15/test_v16_migrations): دوال **sync**
للترحيلات (v13 Convention #4 — alembic/env.py يستعمل asyncio.run)، قاعدة
sqlite معزولة لكل اختبار في tmp_path مع توجيه settings singleton
**و** os.environ معًا — قاعدة الجنات المشتركة لا تُلمس إطلاقًا.

فرع PostgreSQL بلا خادم PG محليًا (نفس نهج «التغطية المنطقية لفرع PG»
في اختبارات 003/014): bind مزيف يجيب كتالوج pg_constraint بسيناريوهات
معدّة (NOT VALID / VALID / قيد مفقود) ويلتقط كل عبارة تُنفَّذ — يثبت أن
المواصفة الواحدة (v21 _FK_VALIDATE في _schema_reconcile، التي تفوّض
إليها ترحيلة 019 بنمط 007/014) تصدر VALIDATE لقيد 015 حصرًا، وتتخطى
كل حالة محروسّة.
"""
from __future__ import annotations

import importlib.util
import sqlite3
from pathlib import Path
from types import SimpleNamespace

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

    db_path = tmp_path / "p21w7_fk_validate.db"
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
    """تحميل وحدة ترحيل/مخطط مباشرة دون تشغيل السلسلة (آلية 003/012/015)."""
    path = _VERSIONS_DIR / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"p21w7_test_{name}", path)
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


class _FakeResult:
    """إجابة .first() معدّة السيناريو: صف أو None (قيد مفقود)."""

    def __init__(self, row):
        self._row = row

    def first(self):
        return self._row


class _FakePGBind:
    """bind يجيب كتالوج pg_constraint بسيناريو معطى ويلتقط كل المنفَّذ.

    convalidated: True  → القيد موجود NOT VALID (يجب أن يُصدَر VALIDATE)
                 False → القيد موجود VALID (تخطٍ — حالة ما بعد نجاح 019)
                 None  → لا قيد بالاسم (تخطٍ — إنشاء القيد ملك 015)
    """

    def __init__(self, convalidated, dialect_name: str = "postgresql"):
        self.dialect = SimpleNamespace(name=dialect_name)
        self._convalidated = convalidated
        self.executed: list[str] = []

    def execute(self, clause, *args, **kwargs):
        sql = str(clause)
        self.executed.append(sql)
        if "pg_constraint" in sql:
            row = (self._convalidated,) if self._convalidated is not None else None
            return _FakeResult(row)
        return _FakeResult(None)


# ── 1: السلسلة تصل 019 — والمسار SQLite no-op محروس ──────────────────────


def test_chain_reaches_019_and_sqlite_path_is_guarded_noop(fresh_db):
    """السلسلة 001→head على قاعدة sqlite نظيفة: الرأس 019، ولا يمس حارس
    SQLite شكل FK 015 إطلاقًا (لا إسقاط، لا إضافة، SET NULL كما هو)."""
    command.upgrade(_alembic_cfg(), "head")
    # P21-W7-F: ترحيلة 019 (VALIDATE لقيد 015) أصبحت الرأس
    assert _version(fresh_db) == "020"  # W7-I-A: 020 (extra_data لمراجع نسخ تليجرام في payment_requests)

    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        with engine.connect() as conn:
            fks = [fk for fk in sa.inspect(conn).get_foreign_keys("telegram_approvers")
                   if fk.get("constrained_columns") == ["added_by_id"]]
    finally:
        engine.dispose()
    assert len(fks) == 1  # شكل 015/النموذج كما هو — لا أثر لـ019 على SQLite
    rule = fks[0].get("ondelete") or fks[0].get("options", {}).get("ondelete")
    assert rule == "SET NULL"
    assert fks[0]["referred_table"] == "users"


def test_migration_019_idempotent_on_sqlite(fresh_db):
    """تشغيل وحدة 019 مرتين مباشرة عبر Operations.context على SQLite:
    حارس اللهجة يجعل كلتاهما no-op — لا خطأ، ولا تغيير في الإصدار/الشكل
    (نمط اختبار 015 المزدوج)."""
    command.upgrade(_alembic_cfg(), "head")
    assert _version(fresh_db) == "020"  # W7-I-A: 020 (extra_data لمراجع نسخ تليجرام في payment_requests)

    mod = _load_module("019_p21w7_fk_validate")
    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        for _invocation in (1, 2):
            with engine.connect() as conn:
                ctx = MigrationContext.configure(conn)
                with Operations.context(ctx):
                    mod.upgrade()
                conn.commit()
        with engine.connect() as conn:
            fk_count = len(sa.inspect(conn).get_foreign_keys("telegram_approvers"))
    finally:
        engine.dispose()
    assert _version(fresh_db) == "020"  # W7-I-A: 020 (extra_data لمراجع نسخ تليجرام في payment_requests)
    assert fk_count == 1


# ── 2: المواصفة واحدة — العائلة تغطي قيد 015 حصرًا، بالبنية ──────────────


def test_fk_validate_family_covers_exactly_the_015_not_valid_fks():
    """الربط بالبنية: عائلة _FK_VALIDATE في reconcile تطابق حرفيًا ثوابت
    015 (_FK_TABLE/_FK_NAME) — القيد الوحيد الذي أنشأته 015 NOT VALID.
    إن أضاف مالك مستقبلي قيدًا آخر NOT VALID في 015، يفشل هذا الاختبار
    حتى تُوسَّع العائلة (فلا تنحرف الشبكة عن السلسلة يومًا)."""
    import _schema_reconcile as rec

    migration_015 = _load_module("015_v16_data")

    family = [(table, name) for table, name, _heals in rec._FK_VALIDATE]
    assert family == [(migration_015._FK_TABLE, migration_015._FK_NAME)]

    # والترحيلة 019 تفوّض إلى المواصفة نفسها (لا نسخة ثانية فيها):
    src = (_VERSIONS_DIR / "019_p21w7_fk_validate.py").read_text(encoding="utf-8")
    assert "_validate_not_valid_fks" in src
    # والشبكة (reconcile_schema) تستدعي العائلة عند كل إقلاع:
    rec_src = (_REPO / "fb_dashboard" / "_schema_reconcile.py").read_text(encoding="utf-8")
    assert "added.extend(_validate_not_valid_fks(bind))" in rec_src


# ── 3: فرع PostgreSQL — يصدر VALIDATE للقيد المعلَّق حصرًا ───────────────


def test_pg_dialect_path_emits_validate_for_the_not_valid_fk():
    """سيناريو إنتاج Neon القديم (015 طبّقت، VALIDATE لم تُطبَّق): الحارس
    يرى convalidated=false → شفاء اليتم (دلالة SET NULL) ثم VALIDATE
    واحد بالضبط لقيد 015 — ولا شيء آخر."""
    import _schema_reconcile as rec

    bind = _FakePGBind(convalidated=True)  # SELECT NOT convalidated → True
    validated = rec._validate_not_valid_fks(bind)

    assert validated == [
        "telegram_approvers.telegram_approvers_added_by_id_fkey~validated"
    ]
    # الحارس أولاً ثم الشفاء (يعكس دلالة القيد نفسه) ثم VALIDATE واحد بالضبط
    assert len(bind.executed) == 3, bind.executed
    heal_sql = bind.executed[1]
    assert "UPDATE telegram_approvers SET added_by_id = NULL" in heal_sql
    assert "NOT EXISTS" in heal_sql
    validate_statements = [s for s in bind.executed if "VALIDATE CONSTRAINT" in s]
    assert validate_statements == [
        'ALTER TABLE telegram_approvers VALIDATE CONSTRAINT '
        '"telegram_approvers_added_by_id_fkey"'
    ]


def test_pg_dialect_path_skips_valid_or_missing_constraint():
    """التخطّي المحروس على PG: قيد VALID أصلًا (convalidated=true — حالة
    قواعد create_all وما بعد نجاح 019 = إعادة التشغيل no-op) وقيد
    مفقود (إنشاؤه ملك 015) — لا عبارات إطلاقًا. ولهجة غير PG (SQLite)
    لا تلمس الكتالوج أصلًا."""
    import _schema_reconcile as rec

    already_valid = _FakePGBind(convalidated=False)  # SELECT NOT convalidated → False
    assert rec._validate_not_valid_fks(already_valid) == []
    assert len(already_valid.executed) == 1, (
        "حارس convalidated يُقرأ ثم يُتخطى — لا شفاء ولا VALIDATE"
    )
    assert "VALIDATE CONSTRAINT" not in already_valid.executed[0]

    missing = _FakePGBind(convalidated=None)  # لا صف في pg_constraint
    assert rec._validate_not_valid_fks(missing) == []
    assert len(missing.executed) == 1, "حارس الوجود يُقرأ ثم يُتخطى — لا شيء بعده"
    assert "VALIDATE CONSTRAINT" not in missing.executed[0]

    sqlite_bind = _FakePGBind(convalidated=True, dialect_name="sqlite")
    assert rec._validate_not_valid_fks(sqlite_bind) == []
    assert sqlite_bind.executed == [], "فرع SQLite no-op بالبنية — لا كتالوج PG"


def test_reconcile_net_wires_the_validate_family(monkeypatch, tmp_path):
    """شبكة الإقلاع (reconcile_schema) تشغّل العائلة على قاعدة حقيقية —
    الوصل بالبنية: نرقّع الدالة ونسجّل الاستدعاء؛ على SQLite هي no-op
    محروس فتعيد reconcile تقريرها المعتاد (لا أعمدة/فهارس على قاعدة
    create_all سليمة)."""
    import _schema_reconcile as rec
    from models import Base

    calls: list[object] = []

    def _record(bind):
        calls.append(bind)
        return []

    monkeypatch.setattr(rec, "_validate_not_valid_fks", _record)
    engine = create_engine(f"sqlite:///{tmp_path / 'net.db'}")
    try:
        with engine.begin() as conn:
            Base.metadata.create_all(conn)
        with engine.begin() as conn:
            added = rec.reconcile_schema(conn)
    finally:
        engine.dispose()
    assert calls, "reconcile_schema يجب أن تستدعي عائلة VALIDATE"
    assert added == [], added


def test_reconcile_rehearses_validate_once_then_noop_on_pg_dialect():
    """بروفة الإقلاع على إنتاج Neon (لهجة PG، قيد معلَّق): الشبكة وحدها
    تُصل الحالة (VALIDATE يصدر) — ثم الإقلاع التالي يرى convalidated=true
    فلا يصدر شيئًا (الترحيلة 019 بعدها no-op كذلك)."""
    import _schema_reconcile as rec

    boot_one = _FakePGBind(convalidated=True)
    boot_two = _FakePGBind(convalidated=False)

    assert rec._validate_not_valid_fks(boot_one) == [
        "telegram_approvers.telegram_approvers_added_by_id_fkey~validated"
    ]
    assert rec._validate_not_valid_fks(boot_two) == []
    assert not [s for s in boot_two.executed if "VALIDATE" in s], (
        "الإقلاع الثاني يجب أن يكون no-op كاملًا"
    )
