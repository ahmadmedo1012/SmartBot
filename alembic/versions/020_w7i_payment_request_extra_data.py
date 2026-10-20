"""W7-I-A — payment_requests.extra_data: مراجع رسائل تليجرام الإدارية.

ما الذي يضيفه هذا (المخطط):
- payment_requests.extra_data (JSON, nullable, default={}) — يخزّن
  ``{"tg_msgs": [{"chat_id": X, "message_id": Y}, ...]}`` كما أعادها
  sendMessage لحظة إرسال أزرار الموافقة/الرفض، فتصبح نسخ الأدمن قابلة
  للتحرير عندما يُحسم الطلب من قناة أخرى (لوحة الإدارة). SubscriptionPayment
  كان يملك العمود منذ الأصل — هذا يقفل انحراف pay_.

الآلية — تفويض إلى _schema_reconcile.reconcile_schema (نمط 007/014/019
حرفيًا): المواصفة معرَّفة مرة واحدة في النماذج (models.py PaymentRequest)،
وتُشغَّل من المسارين اللذين يملكان حقيقة المخطط: هذه الترحيلة (السلطة —
تُسجَّل في alembic_version وتشغَّل مرة واحدة لكل بيئة مُدارة) وشبكة الإقلاع
reconcile_schema (الحزام — تضمن الحالة النهائية حتى لو تُركت السلسلة أو
فشلت؛ lifespan يبتلع فشل alembic بتحذير). كلا المسارين محروس بنفس الحارس
(فحص أعمدة الـinspector)، فنجاح أحدهما يجعل الآخر no-op.

- قاعدة create_all جديدة: العمود موجود أصلًا (001 يبني بـcreate_all وقت
  التشغيل) → الحارس يتخطى → no-op.
- قاعدة legacy عند 019 (إنتاج Neon): العمود مفقود → ADD COLUMN extra_data
  JSON (nullable بلا server_default — قيمة العمود تُملأ من default النموذج
  عند الإدراجات الجديدة؛ الصفوف القديمة تقرأ NULL والقارئ يستخدم
  ``row.extra_data or {}``) → idempotent بالكامل.
- SQLite وPostgreSQL: ADD COLUMN JSON يعمل على كلتيهما (نفس آلية 007).

downgrade: no-op متعمَّد — سابقة 007 الموثقة («العمود يحمي بيانات حية»):
إسقاط extra_data يفقد مراجع النسخ الإدارية فيصير أي حسم لاحق من اللوحة أعمى
من جديد. لا downgrade حقيقي.
"""
from alembic import op

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from _schema_reconcile import reconcile_schema

    added = reconcile_schema(op.get_bind())
    if added:
        # visible in `alembic upgrade` output for auditability (007 pattern)
        print(f"[020] reconciled {len(added)} columns: {', '.join(added)}")


def downgrade() -> None:
    # No-op by design — see docstring (dropping a column that holds live
    # message refs re-blinds every future panel resolution; 007's
    # forward-only precedent).
    return None
