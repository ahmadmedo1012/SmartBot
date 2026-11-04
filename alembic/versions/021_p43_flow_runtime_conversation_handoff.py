"""P43 — إحياء محرك المسارات + تسليم المحادثة: أعمدة التنفيذ والاستئناف والتسليم.

ما الذي يضيفه هذا (المخطط):
- flow_executions.conversation_id (INT, nullable, FK→conversations.id on
  CREATE-ALL databases) — ربط التنفيذ بمحادثته: رسائل المتابعة تقدّم
  التنفيذ النشط في محادثته فقط.
- flow_executions.resume_at (DateTime, nullable) — موقوف التأخير: النبضة
  (heartbeat/piggyback/bot-cycle) تستأنف التنفيذات التي حلّ موعدها.
- flow_executions.steps (INT, NOT NULL, server_default 0) — عدّاد العقد
  المنفَّذة (إحصاءات متوسط الخطوات + دفتر حارس الحلقات).
- messages.flow_id (INT, nullable) — نسب رسائل البوت إلى التدفق الذي
  أرسلها (rule_id يبقى NULL على رسائل المسارات) — مفتاح إحصاءات
  «الرسائل المُرسلة» لكل تدفق.
- conversations.status (VARCHAR(20), NOT NULL, server_default 'open') —
  دورة حياة بشرية: open|pending|closed بجانب مرشّحات unread القديمة.
- conversations.assignee_id (INT, nullable, FK→users.id عبر create_all) —
  عضو الفريق المسؤول؛ جدول conversation_assignees القديم يبقى كما هو
  للتوافق، هذا العمود هو مسار القراءة.
- conversations.bot_paused (BOOLEAN, NOT NULL, server_default false) —
  تسليم بشري: كل طبقات الرد الآلي (مسارات + قواعد الكلمات) تتراجع.
- conversations.first_response_at (DateTime, nullable) — طابع أول رد
  بشري من الفريق (مقياس زمن الاستجابة).

الآلية — تفويض إلى _schema_reconcile.reconcile_schema (نمط 007/014/019/020
حرفيًا): المواصفة معرَّفة مرة واحدة في النماذج (models.py)، وتُشغَّل من
المسارين اللذين يملكان حقيقة المخطط: هذه الترحيلة (السلطة — تُسجَّل في
alembic_version وتشغَّل مرة واحدة لكل بيئة مُدارة) وشبكة الإقلاع
reconcile_schema (الحزام — تضمن الحالة النهائية حتى لو تُركت السلسلة أو
فشلت؛ lifespan يبتلع فشل alembic بتحذير). كلا المسارين محروس بنفس الحارس
(فحص أعمدة الـinspector)، فنجاح أحدهما يجعل الآخر no-op.

- قاعدة create_all جديدة: الأعمدة موجودة أصلًا (001 يبني بـcreate_all وقت
  التشغيل) → الحارس يتخطى → no-op.
- قاعدة legacy عند 020 (إنتاج Neon): العمود مفقود → ADD COLUMN (مع
  DEFAULT الثابت للـstatus/bot_paused/steps، نمط users.token_ver) → ثم
  شفاء صفوف NULL القائمة في نفس المسار (backfill) → idempotent بالكامل.
- SQLite وPostgreSQL: ADD COLUMN يعمل على كلتيهما (نفس آلية 007/020).
- الفهارس الجديدة (ix_flowexec_tenant_status_resume،
  ix_conversations_tenant_status، ix_conversations_tenant_assignee،
  ix_messages_flow_id) يشفيها الحارس عبر عائلة _INDEX_HEAL (نمط 015/016)
  — القواعد الجديدة تبنيها create_all من النموذج.
- ملاحظة FK مقصودة: reconcile يضيف الأعمدة دون قيود FK على قواعد legacy
  (إنشاء FKs ملك سلسلة 015 حصرًا — عقيدة موثقة في _schema_reconcile)؛
  التحقق من ملكية المستأجر يجري على مستوى التطبيق (PATCH /api/inbox يرفض
  عضوًا من مستأجر آخر بـ422 نظيفة).

downgrade: no-op متعمَّد — سابقة 007/020 الموثقة («العمود يحمي بيانات
حية»): إسقاط resume_at يفقد تنفيذات موقوف التأجيل، وإسقاط
conversations.status/bot_paused يفقد حالة تسليم بشري جارية. لا downgrade
حقيقي.
"""
from alembic import op

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from _schema_reconcile import reconcile_schema

    added = reconcile_schema(op.get_bind())
    if added:
        # visible in `alembic upgrade` output for auditability (007 pattern)
        print(f"[021] reconciled {len(added)} columns/indexes: {', '.join(added)}")


def downgrade() -> None:
    # No-op by design — see docstring (dropping live handoff/execution state
    # re-blinds in-flight runs and human takeovers; 007's forward-only
    # precedent).
    return None
