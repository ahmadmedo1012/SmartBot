"""Add trial_days to subscription_plans (plan §2.5 — Trial Period).

Revision ID: 005

Column added:
  - subscription_plans.trial_days (Integer, default 0)

Idempotent: uses Inspector to check existence before acting.
Works on both SQLite and PostgreSQL.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)

    def _has_col(table: str, col: str) -> bool:
        try:
            return col in {c["name"] for c in inspector.get_columns(table)}
        except Exception:
            return False

    if "subscription_plans" in inspector.get_table_names():
        if not _has_col("subscription_plans", "trial_days"):
            op.add_column(
                "subscription_plans",
                sa.Column("trial_days", sa.Integer(), nullable=False, server_default="0"),
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    try:
        cols = {c["name"] for c in inspector.get_columns("subscription_plans")}
    except Exception:
        cols = set()
    if "trial_days" in cols:
        op.drop_column("subscription_plans", "trial_days")
