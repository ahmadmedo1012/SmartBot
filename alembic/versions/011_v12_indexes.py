"""v12 §1 (E1.7/E1.8) — فهارس المسارات الساخنة + عمود users.token_ver.

Revision ID: 011

ما الذي يصلحه هذا (مطابق لـ D9 index audit):
- bot_state(key, value): كل حدث webhook فيسبوك يحلّ المستأجر عبر
  WHERE key='fb_page_id' AND value=:page_id (app/webhooks.py) — كان مسحًا
  تسلسليًا (الفريد القائم (tenant_id,key) لا يخدم الاستعلام).
- ai_suggestions(tenant_id, created_at): الجدول كان بلا أي فهرس مع
  استعلامات تحليلات/ودجت تفلتر بالعميل وتجمّع/ترتب بـ created_at.
- payment_requests(tenant_id, created_at): سجل الدفعات بلا أي فهرس.
- subscription_payments(tenant_id, status, created_at): مسار الإدارة
  يفلتر (tenant, status) ويرتب بـ created_at — لم يكن هناك غير فهرس
  user_id الجزئي.
- broadcasts(tenant_id, created_at): قائمة البث داخل المستأجر.
- bot_alerts(tenant_id, resolved, created_at): قائمة التنبيهات.
- subscribers(tenant_id, platform, status): تقسيم الجمهور.
- users.token_ver (E1.8): رقم إصدار الرمز — يُرفع عند تغيير/إعادة تعيين
  كلمة المرور فتُرفض رموز JWT القديمة فورًا. التوصيل في auth.py (E2).

Idempotent: guards with Inspector (same pattern as 010). Works on SQLite
and PostgreSQL.

مقايضة الأقفال (PG): op.create_index بلا CONCURRENTLY — يأخذ قفل كتابة
قصيرًا لكل جدول (الجداول هنا صغيرة/متوسطة الحجم). البديل CONCURRENTLY
غير قابل للاستعمال داخل معاملة alembic الافتراضية وغير مدعوم في SQLite،
فوثّقت المقايضة هنا بدل تعطيل الترحيل.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None

# (table, index_name, columns)
NEW_INDEXES = [
    ("bot_state", "ix_botstate_key_value", ["key", "value"]),
    ("ai_suggestions", "ix_ai_suggestion_tenant_created", ["tenant_id", "created_at"]),
    ("payment_requests", "ix_payment_request_tenant_created", ["tenant_id", "created_at"]),
    ("subscription_payments", "ix_sub_payment_tenant_status_created",
     ["tenant_id", "status", "created_at"]),
    ("broadcasts", "ix_broadcast_tenant_created", ["tenant_id", "created_at"]),
    ("bot_alerts", "ix_bot_alert_tenant_resolved_created",
     ["tenant_id", "resolved", "created_at"]),
    ("subscribers", "ix_sub_tenant_platform_status", ["tenant_id", "platform", "status"]),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()

    # E1.8 — users.token_ver (server_default '0' يعبّئ الصفوف القائمة)
    if "users" in tables:
        cols = {c["name"] for c in inspector.get_columns("users")}
        if "token_ver" not in cols:
            op.add_column(
                "users",
                sa.Column("token_ver", sa.Integer(), nullable=False, server_default=sa.text("0")),
            )

    for table, name, cols in NEW_INDEXES:
        if table not in tables:
            continue
        existing = {ix["name"] for ix in inspector.get_indexes(table)}
        if name in existing:
            continue
        op.create_index(name, table, cols)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()

    for table, name, cols in NEW_INDEXES:
        if table not in tables:
            continue
        existing = {ix["name"] for ix in inspector.get_indexes(table)}
        if name not in existing:
            continue
        op.drop_index(name, table_name=table)

    if "users" in tables:
        cols = {c["name"] for c in inspector.get_columns("users")}
        if "token_ver" in cols:
            op.drop_column("users", "token_ver")
