"""Add Conversation + Message tables — Messenger persistence (world-class plan v3 §4.3).

Revision ID: 008

Root cause being fixed: POST /webhook handled only feed comments; Messenger
messages were never stored, so the inbox/stats were empty and auto-replies
never fired for private messages. These tables persist conversations +
messages (inbound + bot replies) for every tenant.

Idempotent: guards with Inspector. Works on SQLite and PostgreSQL.
Also runs reconcile_schema-style column guards for legacy DBs.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()

    if "conversations" not in tables:
        op.create_table(
            "conversations",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("tenant_id", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("fb_conversation_id", sa.String(128), nullable=False),
            sa.Column("fb_user_id", sa.String(64), nullable=False, server_default=""),
            sa.Column("user_name", sa.String(255), nullable=False, server_default=""),
            sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("unread_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_message_text", sa.Text(), nullable=False, server_default=""),
            sa.Column("last_message_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("tenant_id", "fb_conversation_id", name="uq_conversations_tenant_fb"),
        )
        op.create_index("ix_conversations_tenant", "conversations", ["tenant_id"])
        op.create_index("ix_conversations_fb_conversation_id", "conversations", ["fb_conversation_id"])
        op.create_index("ix_conversations_tenant_last_msg", "conversations", ["tenant_id", "last_message_at"])
        op.create_index("ix_conversations_fb_user_id", "conversations", ["fb_user_id"])

    if "messages" not in tables:
        op.create_table(
            "messages",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("tenant_id", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("fb_message_id", sa.String(128), nullable=False),
            sa.Column("fb_conversation_id", sa.String(128), nullable=False, server_default=""),
            sa.Column("sender_id", sa.String(64), nullable=False, server_default=""),
            sa.Column("sender_name", sa.String(255), nullable=False, server_default=""),
            sa.Column("text", sa.Text(), nullable=False, server_default=""),
            sa.Column("is_from_page", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("replied_by_bot", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("tenant_id", "fb_message_id", name="uq_messages_tenant_fb"),
        )
        op.create_index("ix_messages_tenant", "messages", ["tenant_id"])
        op.create_index("ix_messages_conversation", "messages", ["conversation_id", "created_at"])
        op.create_index("ix_messages_fb_conversation_id", "messages", ["fb_conversation_id"])

    # Self-heal legacy DBs: reconcile any missing columns on both tables
    try:
        from _schema_reconcile import reconcile_schema
        added = reconcile_schema(bind)
        if added:
            op.get_context().bind  # keep connection warm
    except Exception:
        pass


def downgrade() -> None:
    op.drop_table("messages")
    op.drop_table("conversations")
