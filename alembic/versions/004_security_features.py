"""Add 2FA columns, onboarding_completed, NotificationPreference, RateLimitEntry.

Revision ID: 004

Tables / columns added:
  - users: twofa_enabled, twofa_secret_enc, twofa_backup_codes_hash,
           twofa_verified_at, onboarding_completed
  - notification_preferences: new table (per-user notification settings)
  - rate_limit_entries: new table (DB-backed rate limiting)
  - report_schedules: new table (scheduled PDF reports)

Idempotent: uses Inspector to check existence before acting.
Works on both SQLite and PostgreSQL.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)

    def _has_table(table: str) -> bool:
        return table in inspector.get_table_names()

    def _has_col(table: str, col: str) -> bool:
        try:
            return col in {c["name"] for c in inspector.get_columns(table)}
        except Exception:
            return False

    def _add_col(table: str, column: sa.Column) -> None:
        if not _has_col(table, column.name):
            op.add_column(table, column)

    # ── Users: 2FA columns ──────────────────────────────────────────────────────
    if not _has_col("users", "twofa_enabled"):
        op.add_column("users", sa.Column("twofa_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    if not _has_col("users", "twofa_secret_enc"):
        op.add_column("users", sa.Column("twofa_secret_enc", sa.String(512), nullable=True))
    if not _has_col("users", "twofa_backup_codes_hash"):
        op.add_column("users", sa.Column("twofa_backup_codes_hash", sa.Text, nullable=True))
    if not _has_col("users", "twofa_verified_at"):
        op.add_column("users", sa.Column("twofa_verified_at", sa.DateTime(timezone=True), nullable=True))
    if not _has_col("users", "onboarding_completed"):
        op.add_column("users", sa.Column("onboarding_completed", sa.Boolean(), server_default=sa.text("false"), nullable=False))

    # ── NotificationPreference table ───────────────────────────────────────────
    if not _has_table("notification_preferences"):
        op.create_table(
            "notification_preferences",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), nullable=False, index=True),
            sa.Column("tenant_id", sa.Integer(), nullable=False, server_default=sa.text("0"), index=True),
            sa.Column("preferences", sa.JSON(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("user_id", name="uq_notif_pref_user"),
        )

    # ── RateLimitEntry table ───────────────────────────────────────────────────
    if not _has_table("rate_limit_entries"):
        op.create_table(
            "rate_limit_entries",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("key", sa.String(100), nullable=False, index=True),
            sa.Column("window_end", sa.DateTime(timezone=True), nullable=False),
            sa.Column("count", sa.Integer(), server_default=sa.text("1"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        )

    # ── ReportSchedule table ──────────────────────────────────────────────────
    if not _has_table("report_schedules"):
        op.create_table(
            "report_schedules",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("tenant_id", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("report_type", sa.String(50), nullable=False, server_default="monthly"),
            sa.Column("email", sa.String(200), nullable=True),
            sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    op.drop_table("report_schedules")
    op.drop_table("rate_limit_entries")
    op.drop_table("notification_preferences")
    op.drop_column("users", "onboarding_completed")
    op.drop_column("users", "twofa_verified_at")
    op.drop_column("users", "twofa_backup_codes_hash")
    op.drop_column("users", "twofa_secret_enc")
    op.drop_column("users", "twofa_enabled")
