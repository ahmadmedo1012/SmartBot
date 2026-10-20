"""P21-W7-F (D-05) — VALIDATE لقيود FK التي أنشأتها السلسلة NOT VALID.

Revision ID: 019

ما الذي يصلحه هذا (D-05 — آخر بند HIGH مفتوح في دفتر الحالة):
- الترحيلة 015 أعادت بناء FK حذف المستخدم (telegram_approvers.added_by_id
  → users.id، ON DELETE SET NULL) بصيغة NOT VALID: لا مسح للصفوف القائمة
  عند الإنشاء ولا فشل على يتامى تاريخيين — لكن لا خطوة VALIDATE في أي
  مكان من السلسلة 001–018، فبقي القيد معلَّقًا (NOT VALID) على إنتاج
  Neon القديم إلى الأبد. قوائم FK هذه الترحيلة (إحصاء حرفي من 015 —
  القيود المُنشأة NOT VALID، بما فيها فرع downgrade الذي يعيد الشكل):
  1. telegram_approvers.telegram_approvers_added_by_id_fkey
     (added_by_id → users.id، ON DELETE SET NULL)

الآلية — تفويض إلى _schema_reconcile (نمط 007/014 حرفيًا): المواصفة
  معرَّفة مرة واحدة في _FK_VALIDATE + _validate_not_valid_fks هناك،
  وتُشغَّل من المسارين اللذين يملكان حقيقة المخطط: هذه الترحيلة (السلطة
  — تُسجَّل في alembic_version وتشغَّل مرة واحدة لكل بيئة) وشبكة الإقلاع
  reconcile_schema (تضمن الحالة النهائية حتى لو تُركت السلسلة أو فشلت —
  lifespan يبتلع فشل alembic بتحذير). كلا المسارين محروس بنفس الحارس،
  فنجاح أحدهما يجعل الآخر no-op.

الحارس + الشفاء (قبل VALIDATE): استعلام كتالوج مباشر (pg_constraint ⋈
  pg_class) — لا صف يعني جدولًا/قيدًا غير موجود (الإنشاء ملك 015 حصرًا)
  أو قيدًا VALID أصلًا (قواعد create_all الجديدة لا تعرف NOT VALID)،
  وكلاهما تخطٍ → idempotent بالكامل. قبل الفحص نفسه يُشفى اليتم
  التاريخي بذات دلالة القيد (SET NULL لمرجع لا أب له) — وإلا فشل
  VALIDATE، والسلسلة تتعطل عند 019 إلى الأبد لأن فشل الترحيلات يظهر
  كتحذير إقلاع لا كخطأ مرئي.

SQLite: no-op مقصود (حارس لهجة + هذا التعليق) — «NOT VALID» مفهوم
  PostgreSQL حصرًا؛ SQLite يطبّق الـFK على كل كتابة أصلًا، ومحرك
  الاختبار يفعّل PRAGMA foreign_keys=ON منذ v16-E5 فالسلوك نفسه مُختبَر
  هناك فعليًا (tests/test_v16_migrations.py). لا يوجد فرع SQLite غير
  محروس في أي مسار.

نطاق القفل (PG): ALTER TABLE ... VALIDATE CONSTRAINT يأخذ SHARE UPDATE
  EXCLUSIVE على جدول القيد (لا يحجب القراءة ولا الكتابة — فقط
  VALIDATE/VACUUM/CREATE INDEX المتزامنة على الجدول نفسه) وROW SHARE على
  الجدول المرجعي (users). جدول الموافقين صغير بحجم الإنتاج، والخطوة
  تُشغَّل مرة واحدة، فالحمل آمن للنشر الحي.

downgrade: no-op متعمَّد — سابقة 018 الموثقة: «downgrade يعيد قيمة معروفة
  الفساد ليس تراجعًا بل انتكاسًا». PostgreSQL لا يملك INVALIDATE معاكسًا
  أصلًا، و«استرجاع» شكل NOT VALID يعني DROP CONSTRAINT (نافذة بلا FK
  إطلاقًا + قفل ACCESS EXCLUSIVE) فقط لإعادة القيد أضعف مما صار.
"""
from alembic import op

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    # SQLite (وقواعد create_all الجديدة كلها): لا خطوة — انظر docstring.
    if bind.dialect.name != "postgresql":
        return
    # نمط 007/014: تفويض إلى المواصفة الواحدة (_FK_VALIDATE في
    # _schema_reconcile) — السلسلة والشبكة تتطابقان بالبنية لا بالنسخ.
    from _schema_reconcile import _validate_not_valid_fks

    validated = _validate_not_valid_fks(bind)
    for label in validated:
        print(f"[019] VALIDATE applied: {label}")


def downgrade() -> None:
    # No-op by design — see docstring (018's documented precedent: a
    # downgrade that restores a known-bad state is a regression, and PG has
    # no INVALIDATE verb — "restoring" 015's NOT VALID shape would mean a
    # DROP CONSTRAINT window with ZERO FK enforcement just to re-add the
    # constraint weaker than it already is).
    return None
