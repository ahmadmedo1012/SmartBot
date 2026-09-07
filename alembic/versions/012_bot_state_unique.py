"""v13 §1 L5 (E4) — فرادة bot_state(key,value) لمفتاح fb_page_id.

Revision ID: 012

ما الذي يصلحه هذا (محفز dec-bot-state-unique في سجل القرارات):
- ترحيل 011 أضاف فهرس bot_state(key, value) غير فريد؛ القيد القائم
  (tenant_id, key) لا يمنع تكرار (key, value) عبر المستأجرين، فكل
  حدث webhook فيسبوك يحلّ المستأجر عبر scalar_one_or_none على
  key='fb_page_id'+value (app/webhooks.py) → MultipleResultsFound
  عند وجود تكرار (حافة D5-P3 المسجلة في الدفتر).

الخطوتان (لأن فريدًا مباشرًا سيفشل على الصفوف المكررة القائمة):
1) dedup قبل الفهرس: DELETE FROM bot_state WHERE key = 'fb_page_id'
   AND id NOT IN (SELECT MAX(id) FROM bot_state WHERE key =
   'fb_page_id' GROUP BY value) — إبقاء الأحدث لكل قيمة (لا عمود
   زمني في الجدول، فـ«الأحدث» = MAX(id) حصرًا). متوافق لهجتين؛
   NOT IN آمن لأن MAX(id) غير معدوم؛ NULL تتجمع مجموعة واحدة في
   GROUP BY ولا تقيّدها الفهارس الفريدة لاحقًا.
2) فهرس فريد جزئي uq_botstate_key_value على (key, value)
   WHERE key = 'fb_page_id' بكلتا اللهجتين (postgresql_where +
   sqlite_where معًا). الاسم مختلف عن ix_botstate_key_value
   القائم (المثبت في النموذج/الاختبارات).

لماذا جزئي وليس جدوليًا: التكرار عبر المستأجرين مشروع لمفاتيح أخرى —
balance (مسار أموال: _wallet.py يبتلع IntegrityError على begin_nested
ثم يعيد UPDATE صفٍّ غير موجود → الوديعة تضيع صمتًا لو كان الفريد
جدوليًا)، fb_fan_count (bot.py)، fb_page_name (onboarding)، وجلسات
agent_memory — فالفريد الجدولي يحذف صفوفًا مشروعة في dedup ويكسر
الكتابة المشروعة (المحفظة أولًا). الحافة المسجلة كلها fb_page_id.

أثر الكتّاب: صفر تغييرات مطلوبة. السلوك الجديد الوحيد (مقصود):
مستأجر ثانٍ يربط صفحة مربوطة → IntegrityError عند الـcommit في
connect-page/update-settings بدل التكرار الصامت.

Idempotent: حارس بالـ Inspector (نمط 011) — وجود الفهرس يتخطى
الـ dedup والإنشاء معًا. لا كاتب متزامن أثناء الترحيل (lifespan
يشغّل alembic قبل مهمة البوت وقبل البذور/الطلبات). downgrade:
حارس + drop_index فقط (الـ dedup forward-only كنمط 007).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None

# اسم مختلف عمدًا عن ix_botstate_key_value القائم (011/النموذج)
INDEX_NAME = "uq_botstate_key_value"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    if "bot_state" not in inspector.get_table_names():
        return

    existing = {ix["name"] for ix in inspector.get_indexes("bot_state")}
    if INDEX_NAME in existing:
        # الحارس يجعل الإعادة no-op: لا إنشاء ولا dedup إضافي
        return

    # 1) dedup: إبقاء الأحدث (MAX(id)) لكل قيمة fb_page_id مكررة
    op.execute(sa.text(
        "DELETE FROM bot_state WHERE key = 'fb_page_id' "
        "AND id NOT IN (SELECT MAX(id) FROM bot_state "
        "WHERE key = 'fb_page_id' GROUP BY value)"
    ))

    # 2) فهرس فريد جزئي — النطاق fb_page_id حصرًا (انظر أعلاه: لماذا ليس جدليًا)
    op.create_index(
        INDEX_NAME,
        "bot_state",
        ["key", "value"],
        unique=True,
        postgresql_where=sa.text("key = 'fb_page_id'"),
        sqlite_where=sa.text("key = 'fb_page_id'"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    if "bot_state" not in inspector.get_table_names():
        return

    existing = {ix["name"] for ix in inspector.get_indexes("bot_state")}
    if INDEX_NAME not in existing:
        return

    # dedup forward-only: الصفوف الأقدم حُذفت ولا يمكن استرجاعها —
    # نُسقط القيد فقط (ix_botstate_key_value القائم يبقى كما هو)
    op.drop_index(INDEX_NAME, table_name="bot_state")
