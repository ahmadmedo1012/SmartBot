"""Add composite indexes + partial unique index for TOCTOU fix.

Revision ID: 002

NOTE: Some indexes (ix_sub_payment_user_pending, ix_reply_tenant_created,
ix_schedpost_tenant_status_sched) are ALSO defined in model __table_args__.
Base.metadata.create_all() creates them during migration 001. This migration
uses _idempotent_ guards via pg_indexes lookup to avoid duplicate-index
errors on re-runs or when the model-level indexes were already created.
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def _index_exists(bind, index_name: str) -> bool:
    """Check if an index already exists in the public schema (PostgreSQL)."""
    result = bind.execute(
        sa.text(
            "SELECT 1 FROM pg_indexes WHERE indexname = :idx AND schemaname = 'public'"
        ),
        {"idx": index_name},
    )
    return result.fetchone() is not None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # ── Partial unique index: one pending subscription per user ──
    # Prevents TOCTOU race on subscription creation (payments.py line 107)
    # NOTE: also defined in SubscriptionPayment.__table_args__ — idempotent.
    if not _index_exists(bind, "ix_sub_payment_user_pending"):
        if dialect == "postgresql":
            op.create_index(
                "ix_sub_payment_user_pending", "subscription_payments", ["user_id"],
                unique=True, postgresql_where=sa.text("status = 'pending'"),
            )
        else:
            op.create_index(
                "ix_sub_payment_user_pending", "subscription_payments", ["user_id"],
            )

    # ── Composite index: common query pattern WHERE tenant_id = X ORDER BY created_at DESC ──
    # NOTE: also defined in Reply.__table_args__ — idempotent.
    if not _index_exists(bind, "ix_reply_tenant_created"):
        op.create_index("ix_reply_tenant_created", "replies", ["tenant_id", "created_at"])

    # ── SubscriptionPayment user_id+status and status-only indexes ──
    if not _index_exists(bind, "ix_sub_payment_user_status"):
        op.create_index("ix_sub_payment_user_status", "subscription_payments", ["user_id", "status"])
    if not _index_exists(bind, "ix_sub_payment_status"):
        op.create_index("ix_sub_payment_status", "subscription_payments", ["status"])

    # ── ScheduledPost composite with tenant_id ──
    # NOTE: also defined in ScheduledPost.__table_args__ — idempotent.
    if not _index_exists(bind, "ix_schedpost_tenant_status_sched"):
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
