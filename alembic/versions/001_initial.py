"""Initial migration: create all tables + add migration columns.

Idempotent: uses Inspector to check table/column existence before acting.
Works on both SQLite and PostgreSQL.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)

    # Create all tables — checkfirst=True means SQLAlchemy skips existing.
    from models import Base
    Base.metadata.create_all(bind=bind)

    # Column existence cache: table_name -> set of column names
    _col_cache: dict[str, set[str]] = {}

    def _has_col(table: str, col: str) -> bool:
        if table not in _col_cache:
            _col_cache[table] = {c["name"] for c in inspector.get_columns(table)}
        return col in _col_cache[table]

    def _add_if_missing(table: str, *columns: sa.Column):
        """Add each column only if it does not already exist on the table."""
        for column in columns:
            if not _has_col(table, column.name):
                op.add_column(table, column)

    # ── rules ──
    _add_if_missing("rules",
        sa.Column("priority", sa.Integer, server_default="999"),
        sa.Column("bot_type", sa.String(20), server_default="reply"),
        sa.Column("dm_template", sa.Text, server_default=""),
        sa.Column("tenant_id", sa.Integer, nullable=False, server_default="0"),
    )
    # ── scheduled_posts ──
    _add_if_missing("scheduled_posts",
        sa.Column("platform", sa.String(20), server_default="facebook"),
        sa.Column("fb_post_id", sa.String(100), server_default=""),
        sa.Column("tenant_id", sa.Integer, nullable=False, server_default="0"),
    )
    # ── users ──
    _add_if_missing("users",
        sa.Column("email", sa.String(200), server_default=""),
        sa.Column("tenant_id", sa.Integer, nullable=False, server_default="0"),
        sa.Column("plan", sa.String(50), server_default="free"),
        sa.Column("email_verified", sa.Boolean, server_default=sa.text("0")),
        sa.Column("reset_token", sa.String(100), server_default=""),
        sa.Column("name", sa.String(200), server_default=""),
        sa.Column("subscription_status", sa.String(20), server_default="UNPAID"),
        sa.Column("plan_id", sa.Integer),
        sa.Column("last_login_at", sa.DateTime),
        sa.Column("telegram_chat_id", sa.String(100)),
    )
    # ── tenant_id on all multi-tenant tables ──
    for tbl in ("replies", "bot_logs", "bot_state", "reply_templates",
                "ai_suggestions", "conversation_tags", "conversation_labels",
                "analytics_events", "bot_alerts", "offers", "offer_claims",
                "subscribers", "tags", "subscriber_tags", "flows",
                "flow_executions", "sequences", "sequence_steps",
                "sequence_subscriptions", "broadcasts", "broadcast_recipients",
                "conversation_notes", "conversation_assignees", "audit_logs",
                "brand_config", "customers", "report_schedules"):
        _add_if_missing(tbl,
            sa.Column("tenant_id", sa.Integer, nullable=False, server_default="0"))
    # ── tenants ──
    _add_if_missing("tenants",
        sa.Column("plan_id", sa.Integer),
        sa.Column("subscription_status", sa.String(20), server_default="UNPAID"),
        sa.Column("plan_start", sa.DateTime),
        sa.Column("plan_end", sa.DateTime),
    )
    # ── payment_requests ──
    _add_if_missing("payment_requests",
        sa.Column("amount_numeric", sa.Numeric(10, 3)))

    # ── missing tenant_id on tables added after initial schema ──
    for tbl in ("subscription_payments", "usage_counters", "payment_requests"):
        _add_if_missing(tbl,
            sa.Column("tenant_id", sa.Integer, nullable=False, server_default="0"))


def downgrade() -> None:
    # ponytail: no downgrade — reversing column adds risks data loss
    pass
