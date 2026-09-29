"""v28 (D-05) — FK CASCADE على قاعدة الإنتاج القديمة + VALIDATE قيد 015.

Revision ID: 018

ما الذي يصلحه هذا (ENGINEERING_STATE §3 D-05 / §7.1 — أعلى أولوية
موثقة للجولة):
1) عشرة قيود FK معلنة في النماذج بـON DELETE CASCADE لكنها غير موجودة
   على قاعدة الإنتاج القديمة (migrations/002_saas_migration.sql هذّبت
   29 جدولاً موجودة سلفاً — وcreate_all لا يعدّل الجداول القائمة، فقط
   ينشئ الغائبة): حذف مشترك/وسم/تدفق/تسلسل/بث/مستخدم كان يترك أيتاماً
   في الإنتاج (أو يرتد 500 إن وُجد FK بلا ondelete — RESTRICT ضمني؛
   قصة telegram_approvers نفسها قبل 015 — audit-reports/v16-D6-data.md).
   PostgreSQL فقط: لكل عمود — تنظيف الأيتام أولاً (ما كان CASCADE
   سيحذفه لحظة الحذف الأصلي)، ثم إسقاط القيود المنعكسة بأسمائها، ثم
   إعادة البناء بالاسم القانوني ON DELETE CASCADE NOT VALID.
   messages.conversation_id انضم حزماً (خط دم 008 يحمله CASCADE منذ
   إنشائه؛ الحارس no-op هناك ويغطي فقط أنساباً غريبة فقده).
2) قيد 015 (telegram_approvers.added_by_id ON DELETE SET NULL) بقي
   NOT VALID منذ v16 — أول VALIDATE CONSTRAINT في المستودع: تصفير
   الأيتام التاريخيين (SET NULL دلالةً — يُحفظ سجل الموافق التاريخي
   بلا كاتب، قرار 015 نفسه) ثم ALTER TABLE ... VALIDATE CONSTRAINT.

الأقفال (PG): DROP/ADD CONSTRAINT يأخذان ACCESS EXCLUSIVE قصيرين
(عمليات كتالوج) — بلا كاتب متزامن أثناء الترحيل (lifespan يشغّل
alembic قبل مهمة البوت). VALIDATE يأخذ SHARE UPDATE EXCLUSIVE فقط —
لا يحجب الكتابات المتزامنة، وبعد تنظيف الأيتام لا يفشل إلا بيتيم
متزامن جديد، وNOT VALID يمنعه أصلاً على الكتابات الجديدة.

Idempotent بالكامل: كل خطوة محروسة بالانعكاس (no-op حين تكون القاعدة
بشكل النموذج — create_all/001/008). SQLite: بلا فرع — القيود تصل عبر
create_all (شكل النموذج) والسلوك يُثبت عبر PRAGMA foreign_keys=ON في
الاختبارات (نمط 015 حرفياً؛ batch_alter_table/إعادة بناء الجدول
مرفوضان صراحة هناك). downgrade: عكسي best-effort (نمط 011/015) —
إسقاط قيودنا القانونية دون إعادة إنتاج عيب الـRESTRICT.
"""
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

from alembic import op

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None

# (table, column, parent_table) — كلها → parent.id ON DELETE CASCADE
# كما يصرّح النموذج الحالي (models.py)؛ الحارس يتخطى ما هو CASCADE أصلاً.
CASCADE_FKS = [
    ("subscriber_tags", "subscriber_id", "subscribers"),
    ("subscriber_tags", "tag_id", "tags"),
    ("flow_executions", "flow_id", "flows"),
    ("flow_executions", "subscriber_id", "subscribers"),
    ("sequence_steps", "sequence_id", "sequences"),
    ("sequence_subscriptions", "subscriber_id", "subscribers"),
    ("sequence_subscriptions", "sequence_id", "sequences"),
    ("broadcast_recipients", "broadcast_id", "broadcasts"),
    ("broadcast_recipients", "subscriber_id", "subscribers"),
    ("conversation_assignees", "user_id", "users"),
    # حزام الأنساب الغريبة (008 يبنيه CASCADE دائماً — الحارس no-op):
    ("messages", "conversation_id", "conversations"),
]

# 015 تركه NOT VALID؛ 018 يصفّر أيتامه التاريخيين ثم يتحقق منه.
_VALIDATE_TABLE = "telegram_approvers"
_VALIDATE_COLUMN = "added_by_id"
_VALIDATE_NAME = "telegram_approvers_added_by_id_fkey"


def _fks_on_column(bind, table: str, column: str) -> list[dict]:
    """عائلة الـFK المعرفة فعلاً على (table.column) بالانعكاس (نمط 015)."""
    inspector = Inspector.from_engine(bind)
    try:
        return [
            fk for fk in inspector.get_foreign_keys(table)
            if fk.get("constrained_columns") == [column]
        ]
    except Exception:
        return []


def _fk_ondelete(fk: dict) -> str | None:
    """قاعدة ondelete المنعكسة — PG مفتاح مباشر، SQLite داخل options."""
    return fk.get("ondelete") or fk.get("options", {}).get("ondelete")


def _canonical(table: str, column: str) -> str:
    """الاسم القانوني الذي تسميه PG تلقائياً للقيد المعاد بناؤه."""
    return f"{table}_{column}_fkey"


def _validate(bind, table: str, column: str, name: str | None = None) -> None:
    """VALIDATE CONSTRAINT إن وُجد بالاسم القانوني (no-op إن غاب).

    SHARE UPDATE EXCLUSIVE فقط — لا يحجب الكتابات؛ بعد تنظيف الأيتام
    في upgrade() لا يمكن أن يفشل إلا بيتيم متزامن جديد وNOT VALID
    يمنعه على الكتابات الجديدة أصلاً.
    """
    constraint = name or _canonical(table, column)
    try:
        row = bind.execute(sa.text(
            "SELECT 1 FROM pg_constraint WHERE conname = :n AND contype = 'f'"
        ).bindparams(sa.bindparam("n", constraint))).first()
    except Exception:
        return  # ليست PG أو انعكاس فشل — لا شيء نتحقق منه
    if row is None:
        return
    op.execute(sa.text(
        f'ALTER TABLE {table} VALIDATE CONSTRAINT "{constraint}"'
    ))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()

    if bind.dialect.name != "postgresql":
        # SQLite (اختبارات/تطوير): القيود بصيغة CASCADE تصل عبر create_all
        # (شكل النموذج) والسلوك يثبت عبر PRAGMA في tests/conftest.py —
        # نمط 015: ALTER TABLE DROP/VALIDATE غير مدعومين أصلاً هناك.
        return

    # ── 1) تنظيف الأيتام ثم إعادة بناء قيود CASCADE ──────────────────
    for table, column, parent in CASCADE_FKS:
        if table not in tables or parent not in tables:
            continue
        fks = _fks_on_column(bind, table, column)
        # no-op فقط حين يوجد FK واحد على الأقل وكلها CASCADE أصلاً
        # (قاعدة بناها create_all/008 بشكل النموذج الحالي).
        if fks and all(_fk_ondelete(fk) == "CASCADE" for fk in fks):
            continue
        # تنظيف الأيتام قبل القيد: NOT VALID يتسامح مع القدمى لكننا نتحقق
        # (VALIDATE) بعده مباشرة — وهذا ما كان CASCADE سيحذفه أصلاً.
        op.execute(sa.text(
            f"DELETE FROM {table} WHERE {column} IS NOT NULL "
            f"AND {column} NOT IN (SELECT id FROM {parent})"
        ))
        for fk in fks:
            name = fk.get("name")
            if name:
                op.execute(sa.text(
                    f'ALTER TABLE {table} DROP CONSTRAINT "{name}"'
                ))
        op.execute(sa.text(
            f"ALTER TABLE {table} ADD CONSTRAINT {_canonical(table, column)} "
            f"FOREIGN KEY ({column}) REFERENCES {parent} (id) "
            "ON DELETE CASCADE NOT VALID"
        ))

    # ── 2) تصفير أيتام 015 التاريخيين (SET NULL دلالةً — قرار 015) ────
    if _VALIDATE_TABLE in tables:
        op.execute(sa.text(
            f"UPDATE {_VALIDATE_TABLE} SET {_VALIDATE_COLUMN} = NULL "
            f"WHERE {_VALIDATE_COLUMN} IS NOT NULL "
            f"AND {_VALIDATE_COLUMN} NOT IN (SELECT id FROM users)"
        ))

    # ── 3) VALIDATE: كل قيودنا + قيد 015 المعلق ───────────────────────
    for table, column, _parent in CASCADE_FKS:
        if table not in tables:
            continue
        _validate(bind, table, column)
    if _VALIDATE_TABLE in tables:
        _validate(bind, _VALIDATE_TABLE, _VALIDATE_COLUMN, name=_VALIDATE_NAME)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()
    # عكسي best-effort (نمط 011/015): إسقاط قيودنا القانونية فقط —
    # إعادة إنتاج RESTRICT/غياب القيد (العيب الأصلي) بلا معنى.
    for table, column, _parent in CASCADE_FKS:
        if table not in tables:
            continue
        op.execute(sa.text(
            f'ALTER TABLE {table} DROP CONSTRAINT IF EXISTS '
            f'"{_canonical(table, column)}"'
        ))
