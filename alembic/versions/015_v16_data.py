"""v16 §E5 (D6) — فهرس المسار الساخن لـ offers + FK حذف المستخدم.

Revision ID: 015

ما الذي يصلحه هذا:
1) offers(tenant_id, is_active) (D6 فقرة فهارس tenant): اختيار العرض
   لكل رسالة واردة يفلتر (tenant_id, is_active) (offer_engine.py:41-43
   عبر pipeline.py:331/333) — الجدول كان بلا أي فهرس tenant → مسح
   تسلسلي لكل رسالة (مسار ساخن). النموذج يصرّح بالفهرس الآن
   (models.py Offer.__table_args__) فيبنيه create_all للقواعد الجديدة؛
   هذه الترحيلة تنشئه على قواعد legacy القائمة (Inspector-guard +
   CREATE INDEX IF NOT EXISTS — نمط 011/013 حرفيًا، بلهجتي
   PostgreSQL وSQLite).

2) telegram_approvers.added_by_id (D6-H2): آخر FK في النموذج بلا
   ON DELETE — حذف المستخدم (DELETE /api/users/{id}) كان يرتد بـ500
   على PostgreSQL (RESTRICT ضمني). العمود nullable أصلًا فالصيغة
   الصحيحة SET NULL: يُحفظ سجل الموافق التاريخي بلا كاتب.
   على PostgreSQL فقط: إسقاط القيد الموجود (باسمه المنعكس — قد
   يختلف عن الاسم القانوني) وإعادة بنائه بـON DELETE SET NULL
   (NOT VALID: لا مسح تحقق للجدول ولا فشل إن وُجدت صفوف يتيمة
   تاريخية — القيد يُطبَّق على الكتابات الجديدة فورًا)، محروسًا
   بالـInspector (إعادة التشغيل no-op: القاعدة الجديدة تُبنى من
   create_all/001 بالشكل الجديد فيتخطى الحارس).
   SQLite: إعادة بناء الجدول (copy-and-swap) مبالغة — SQLite لا
   يفعّل FKs إلا مع PRAGMA foreign_keys=ON، والقيد بالصيغة الجديدة
   يصل عبر تعادل create_all (001 يبني telegram_approvers بشكل
   النموذج الحالي بـON DELETE SET NULL). اختبارات SQLite تفعّل
   الـPRAGMA الآن (tests/conftest.py — E5 مهمة 5) فيثبت سلوك
   SET NULL فعليًا هناك.

مقايضة الأقفال (PG): ALTER TABLE ... DROP/ADD CONSTRAINT يأخذ قفل
ACCESS EXCLUSIVE قصيرًا على جدول صغير (الموافقون قلائل) — بلا كاتب
متزامن أثناء الترحيل (lifespan يشغّل alembic قبل مهمة البوت).

Idempotent بالكامل: كل خطوة محروسة (Inspector/فهرس موجود). downgrade
يعكس الفهرس والقيد (best-effort، نمط 011).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None

# (table, index_name, columns) — المسار الساخن (D6)
NEW_INDEXES = [
    ("offers", "ix_offer_tenant_active", ["tenant_id", "is_active"]),
]

# القيد القانوني الذي تعيده هذه الترحيلة على PostgreSQL
_FK_TABLE = "telegram_approvers"
_FK_COLUMN = "added_by_id"
_FK_NAME = "telegram_approvers_added_by_id_fkey"


def _fks_on_column(bind, table: str, column: str) -> list[dict]:
    """عائلة الـFK المعرَّفة فعلاً على (table.column) بالانعكاس."""
    inspector = Inspector.from_engine(bind)
    try:
        return [
            fk for fk in inspector.get_foreign_keys(table)
            if fk.get("constrained_columns") == [column]
        ]
    except Exception:
        return []


def _fk_ondelete(fk: dict) -> str | None:
    """قاعدة ondelete المنعكسة — PG يضعها مفتاحًا مباشرًا، SQLite داخل
    options (نفس التفاوت الذي يغطيه الحارس في الاختبارات)."""
    return fk.get("ondelete") or fk.get("options", {}).get("ondelete")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()

    # ── 1) فهرس المسار الساخن: offers (tenant_id, is_active) ──────────
    # Inspector-guard + IF NOT EXISTS معًا (نمط 013): الحارس يتخطى قواعد
    # create_all التي تحمله منذ 001، وIF NOT EXISTS حزام إضافي للسباقات.
    for table, name, cols in NEW_INDEXES:
        if table not in tables:
            continue
        existing = {ix["name"] for ix in inspector.get_indexes(table)}
        if name in existing:
            continue
        op.execute(sa.text(
            f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({', '.join(cols)})"
        ))

    # ── 2) FK حذف المستخدم (PostgreSQL فقط) ───────────────────────────
    # SQLite: بلا فرع — ALTER TABLE DROP CONSTRAINT غير مدعوم، وإعادة
    # بناء الجدول overkill (انظر docstring: القيد يصل عبر create_all
    # والسلوك يثبت عبر PRAGMA في الاختبارات).
    if bind.dialect.name == "postgresql" and _FK_TABLE in tables:
        fks = _fks_on_column(bind, _FK_TABLE, _FK_COLUMN)
        # no-op فقط حين يوجد FK واحد على الأقل وكلها SET NULL بالفعل
        # (قاعدة جديدة بناها create_all) — غياب القيد كليًا يعني الإضافة.
        if fks and all(_fk_ondelete(fk) == "SET NULL" for fk in fks):
            pass
        else:
            for fk in fks:
                name = fk.get("name")
                if name:
                    op.execute(sa.text(
                        f'ALTER TABLE {_FK_TABLE} DROP CONSTRAINT "{name}"'
                    ))
            # NOT VALID: بلا مسح تحقق للجدول ولا فشل على صفوف يتيمة
            # تاريخية — القيد يُطبَّق على الكتابات الجديدة فورًا (القيم
            # غير الـNULL القائمة تشير لمستخدمين موجودين وإلا كان إدراجها
            # قد رُفض أصلاً على قواعد تحرس الـFK).
            op.execute(sa.text(
                f"ALTER TABLE {_FK_TABLE} ADD CONSTRAINT {_FK_NAME} "
                f"FOREIGN KEY ({_FK_COLUMN}) REFERENCES users (id) "
                "ON DELETE SET NULL NOT VALID"
            ))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()

    for table, name, _cols in NEW_INDEXES:
        if table not in tables:
            continue
        existing = {ix["name"] for ix in inspector.get_indexes(table)}
        if name not in existing:
            continue
        op.execute(sa.text(f"DROP INDEX IF EXISTS {name}"))

    if bind.dialect.name == "postgresql" and _FK_TABLE in tables:
        fks = _fks_on_column(bind, _FK_TABLE, _FK_COLUMN)
        for fk in fks:
            name = fk.get("name")
            if name:
                op.execute(sa.text(
                    f'ALTER TABLE {_FK_TABLE} DROP CONSTRAINT "{name}"'
                ))
        # الشكل ما قبل 015: FK بلا ON DELETE (RESTRICT ضمني)
        op.execute(sa.text(
            f"ALTER TABLE {_FK_TABLE} ADD CONSTRAINT {_FK_NAME} "
            f"FOREIGN KEY ({_FK_COLUMN}) REFERENCES users (id) NOT VALID"
        ))
