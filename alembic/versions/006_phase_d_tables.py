"""Add Notification, SupportTicket, SupportTicketReply, MarketingCampaign (plan §4).

Revision ID: 006

Tables added (dashboard pages that were stubs now persist real data):
  - notifications          (in-app feed, plan §4.2)
  - support_tickets        (ticket system, plan §4.3)
  - support_ticket_replies (admin/user replies, plan §4.3)
  - marketing_campaigns    (campaign builder, plan §4.4)

Idempotent: guards with Inspector. Works on SQLite and PostgreSQL.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()

    if "notifications" not in tables:
        op.create_table(
            "notifications",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("tenant_id", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("type", sa.String(20), nullable=False, server_default="system"),
            sa.Column("title", sa.String(200), nullable=False, server_default=""),
            sa.Column("body", sa.Text(), nullable=False, server_default=""),
            sa.Column("link", sa.String(255), nullable=False, server_default=""),
            sa.Column("read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_notif_tenant_created", "notifications", ["tenant_id", "created_at"])
        op.create_index("ix_notif_tenant_unread", "notifications", ["tenant_id", "read"])

    if "support_tickets" not in tables:
        op.create_table(
            "support_tickets",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("tenant_id", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("email", sa.String(200), nullable=False, server_default=""),
            sa.Column("subject", sa.String(200), nullable=False, server_default=""),
            sa.Column("body", sa.Text(), nullable=False, server_default=""),
            sa.Column("priority", sa.String(10), nullable=False, server_default="medium"),
            sa.Column("status", sa.String(12), nullable=False, server_default="open"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_ticket_tenant_status", "support_tickets", ["tenant_id", "status"])

    if "support_ticket_replies" not in tables:
        op.create_table(
            "support_ticket_replies",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("ticket_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_ticket_reply_ticket", "support_ticket_replies", ["ticket_id", "created_at"])

    if "marketing_campaigns" not in tables:
        op.create_table(
            "marketing_campaigns",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("tenant_id", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("name", sa.String(150), nullable=False),
            sa.Column("message", sa.Text(), nullable=False, server_default=""),
            sa.Column("audience", sa.String(20), nullable=False, server_default="all"),
            sa.Column("status", sa.String(12), nullable=False, server_default="draft"),
            sa.Column("scheduled_at", sa.DateTime(), nullable=True),
            sa.Column("sent_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("delivered_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("opened_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("clicked_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("sent_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_campaign_tenant_created", "marketing_campaigns", ["tenant_id", "created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()
    for t in ("notifications", "support_ticket_replies", "support_tickets", "marketing_campaigns"):
        if t in tables:
            op.drop_table(t)
