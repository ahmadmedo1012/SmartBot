"""v14 §E3 (C-DATA1) — فرادة bot_state(tenant_id, key) العامة + فهارس المسارات الساخنة.

Revision ID: 013

ما الذي يصلحه هذا (D7-01 الحرجة + D7-07):
- القيد المركب (tenant_id, key) مصرّح به في النموذج (models.py) منذ
  تعدد المستأجرين، لكن لا ترحيلة تنشئه: 002_saas_migration.sql (اليدوي)
  أضاف لبot_state فهرس tenant أحاديًا فقط، و012 عالجت حافة
  key='fb_page_id' وحدها. النتيجة في الإنتاج (Neon، ما قبل إعادة البناء):
  غياب القيد → قرضا «أول» متزامنان كلاهما يرى rowcount=0 في كلاهما يدرج
  صف balance (يبتلع _wallet.py:109-115 مسار IntegrityError الميت) → صفّا
  رصيد، وكل قيد لاحق يزيد الصفين معًا، والقراءة scalar() ترجع أحدهما →
  رصيد مغلوط. كما أن _get_or_create_conversation/_tenant_state/
  get_tenant_fb_client كلها scalar_one_or_none على (tenant,key) →
  MultipleResultsFound = 500.

الخطوات (لأن فريدًا مباشرًا سيفشل على الصفوف المكررة القائمة):
1) dedup عام: DELETE FROM bot_state WHERE id NOT IN (SELECT MAX(id)
   FROM bot_state GROUP BY tenant_id, key) — إبقاء الأحدث فقط لكل زوج
   (لا عمود زمني في الجدول، فـ«الأحدث» = MAX(id) حصرًا — نفس منطق 012).
   هذا تعميم لdedup 012 الذي عمل على key='fb_page_id' فقط؛ أزواج
   balance/fb_fan_count عبر مستأجرين مختلفين تنجو (مجموعات مختلفة).
   NOT IN آمن لأن MAX(id) غير معدوم (المفتاح الأساسي).
2) CREATE UNIQUE INDEX uq_botstate_tenant_key على (tenant_id, key)
   — فريد جدولي كامل بلا WHERE، بلهجتي PostgreSQL وSQLite معًا (لا
   شرط جزئي هنا فالبنية واحدة).
3) فهارس المسارات الساخنة الموثقة في D7 §2 (كلها CREATE INDEX IF NOT
   EXISTS — مدعومة في PostgreSQL 9.5+ وSQLite):
   - bot_logs(tenant_id, created_at): ودجت السجلات يفرز مسحًا في الإنتاج
     (widgets_routes.py:28) — النموذج يصرّح بها ولا ترحيلة تنشئها هناك.
   - rules(tenant_id, enabled): فلتر كل دورة بوت — الإنتاج يحمل ix_rules_tenant
     الأحادي (SQL يدوي) فقط.
   - messages(rule_id): عمود أضيف في 009 بلا فهرس.
   - comments(commenter_id): عمود النموذج index=True بلا ترحيلة له.

حارس الاكتشاف (نمط 012 حرفيًا) + إضافته: الاسم قد يوجد كفهرس أو كقيد
جدول — قواعد create_all النظيفة (001) تبني uq_botstate_tenant_key
كـUniqueConstraint داخل CREATE TABLE (على PostgreSQL يظهر كفهرس قيدي
بالاسم نفسه في get_indexes؛ وعلى SQLite يظهر في get_unique_constraints
فقط). كلا الشكلين يحقق الضمان → نتخطى الإنشاء كليًا (لا فهرس مكرر ولا
تصادم أسماء على PG). الإنتاج القديم لا يملك أياً منهما → dedup + إنشاء.

ON CONFLICT-safe: لا كود في المستودع يستعمل INSERT..ON CONFLICT على
bot_state (فحص grep — الكتّاب كلهم check-then-insert مع معالجة
IntegrityError كما في _wallet.py)، والفهرس الفريد هو بالضبط ما يجعل
مسار begin_nested+IntegrityError في credit_wallet يعمل كما صُمم.

Idempotent: الحارس بالـ Inspector يجعل الإعادة no-op كاملًا (لا إنشاء
ولا dedup إضافي). لا كاتب متزامن أثناء الترحيل (lifespan يشغّل alembic
قبل مهمة البوت وقبل البذور/الطلبات). downgrade: حارس + drop للفهرس
والفهارس الساخنة فقط (الـ dedup forward-only كنمط 007/012) — ولا يُسقط
القيد إذا كان شكله TableConstraint من create_all.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None

# نفس اسم قيد النموذج (models.py UniqueConstraint) — عن قصد: الفهرس
# المستقل على قواعد legacy يطابق اسم القيد الذي تحمله قواعد create_all.
INDEX_NAME = "uq_botstate_tenant_key"

# (table, index_name, columns) — المسارات الساخنة (D7-07)، بأسماء النموذج
HOT_INDEXES = [
    ("bot_logs", "ix_botlog_tenant_created", ["tenant_id", "created_at"]),
    ("rules", "ix_rule_tenant_enabled", ["tenant_id", "enabled"]),
    ("messages", "ix_messages_rule_id", ["rule_id"]),
    ("comments", "ix_comments_commenter_id", ["commenter_id"]),
]


def _guard_names(bind, table: str) -> tuple[set[str], set[str]]:
    """(أسماء الفهارس، أسماء قيود التفرد) الموجودة فعلاً على الجدول.

    الفريد الجدولي قد يُبنى كفهرس مستقل (هذه الترحيلة / reconcile) أو
    كقيد داخل CREATE TABLE (create_all في 001) — حسب اللهجة؛ الفحصان
    معًا يجعلان الحارس صحيحًا على PostgreSQL وSQLite على حد سواء.
    """
    inspector = Inspector.from_engine(bind)
    indexes = {ix["name"] for ix in inspector.get_indexes(table)}
    try:
        constraints = {uc["name"] for uc in inspector.get_unique_constraints(table)}
    except Exception:
        constraints = set()  # لهجات بلا انعكاس قيود — الفهرس وحده يكفي
    return indexes, constraints


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    if "bot_state" in inspector.get_table_names():
        indexes, constraints = _guard_names(bind, "bot_state")
        if INDEX_NAME not in indexes and INDEX_NAME not in constraints:
            # 1) dedup عام: إبقاء الأحدث (MAX(id)) لكل (tenant_id, key)
            op.execute(sa.text(
                "DELETE FROM bot_state WHERE id NOT IN "
                "(SELECT MAX(id) FROM bot_state GROUP BY tenant_id, key)"
            ))
            # 2) الفهرس الفريد الجدولي — بلا شرط جزئي فاللهجتان متطابقتان
            op.create_index(INDEX_NAME, "bot_state", ["tenant_id", "key"], unique=True)

    # 3) فهارس المسارات الساخنة — IF NOT EXISTS بلهجتي PostgreSQL وSQLite
    for table, name, cols in HOT_INDEXES:
        if table not in inspector.get_table_names():
            continue
        op.execute(sa.text(
            f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({', '.join(cols)})"
        ))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()

    # لا نسقط قيد create_all — فقط الفهرس المستقل الذي أنشأته هذه الترحيلة
    if "bot_state" in tables:
        indexes, constraints = _guard_names(bind, "bot_state")
        if INDEX_NAME in indexes and INDEX_NAME not in constraints:
            op.drop_index(INDEX_NAME, table_name="bot_state")

    for table, name, _cols in HOT_INDEXES:
        if table not in tables:
            continue
        op.execute(sa.text(f"DROP INDEX IF EXISTS {name}"))
