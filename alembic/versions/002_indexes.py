"""Add composite indexes + partial unique index for TOCTOU fix.

Revision ID: 002
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # ── Partial unique index: one pending subscription per user ──
    # Prevents TOCTOU race on subscription creation (payments.py line 107)
    if dialect == "postgresql":
        op.create_index(
            "ix_sub_payment_user_pending", "subscription_payments", ["user_id"],
            unique=True, postgresql_where=sa.text("status = 'pending'"),
        )
    else:
        # SQLite: partial unique indexes need expression support
        # Fallback: plain index (uniqueness enforced at app level)
        op.create_index("ix_sub_payment_user_pending", "subscription_payments", ["user_id"])

    # ── Composite index: common query pattern WHERE tenant_id = X ORDER BY created_at DESC ──
    op.create_index("ix_reply_tenant_created", "replies", ["tenant_id", "created_at"])

    # ── SubscriptionPayment user_id+status and status-only indexes ──
    op.create_index("ix_sub_payment_user_status", "subscription_payments", ["user_id", "status"])
    op.create_index("ix_sub_payment_status", "subscription_payments", ["status"])

    # ── ScheduledPost composite with tenant_id ──
    op.create_index(
        "ix_schedpost_tenant_status_sched",
        "scheduled_posts", ["tenant_id", "status", "scheduled_at"],
    )

    # ── FK CASCADE notes (manual for production DBs) ──
    # In PostgreSQL, run:
    #   ALTER TABLE flow_executions DROP CONSTRAINT flow_executions_flow_id_fkey,
    #       ADD CONSTRAINT flow_executions_flow_id_fkey FOREIGN KEY (flow_id)
    #       REFERENCES flows(id) ON DELETE CASCADE;
    #   ALTER TABLE flow_executions DROP CONSTRAINT flow_executions_subscriber_id_fkey,
    #       ADD CONSTRAINT flow_executions_subscriber_id_fkey FOREIGN KEY (subscriber_id)
    #       REFERENCES subscribers(id) ON DELETE CASCADE;
    #   ALTER TABLE conversation_assignees DROP CONSTRAINT ...,
    #       ADD CONSTRAINT ... FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;


def downgrade() -> None:
    op.drop_index("ix_sub_payment_user_pending", table_name="subscription_payments")
    op.drop_index("ix_reply_tenant_created", table_name="replies")
    op.drop_index("ix_sub_payment_user_status", table_name="subscription_payments")
    op.drop_index("ix_sub_payment_status", table_name="subscription_payments")
    op.drop_index("ix_schedpost_tenant_status_sched", table_name="scheduled_posts")
