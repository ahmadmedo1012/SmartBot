"""v4 radical plan §4/§5 — comments persistence + message enrichment.

Revision ID: 009

Root causes being fixed (radical plan v4):
- Webhook feed comments were never stored anywhere; /api/comments fetched live
  Graph data via the GLOBAL env client → always empty in production (G1).
  A tenant-scoped `comments` table makes the section DB-first and alive.
- Messenger DM auto-replies were not attributable to rules (stats undercount);
  `messages.rule_id` closes that gap (§5.19).
- Attachments/stickers arrived with empty text → invisible bubbles in the
  inbox; `attachment_type`/`attachment_url` persist the real content (§4.11).

Idempotent: guards with Inspector. Works on SQLite and PostgreSQL.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()

    # ── comments table (DB-first comment pipeline) ──
    if "comments" not in tables:
        op.create_table(
            "comments",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("tenant_id", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("fb_comment_id", sa.String(128), nullable=False),
            sa.Column("fb_post_id", sa.String(128), nullable=False, server_default=""),
            sa.Column("commenter_id", sa.String(64), nullable=False, server_default=""),
            sa.Column("commenter_name", sa.String(255), nullable=False, server_default=""),
            sa.Column("comment_text", sa.Text(), nullable=False, server_default=""),
            sa.Column("reply_text", sa.Text(), nullable=False, server_default=""),
            sa.Column("replied_by_bot", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("tenant_id", "fb_comment_id", name="uq_comments_tenant_fb"),
        )
        op.create_index("ix_comments_tenant", "comments", ["tenant_id"])
        op.create_index("ix_comments_created", "comments", ["created_at"])
        op.create_index("ix_comments_tenant_post", "comments", ["tenant_id", "fb_post_id"])

    # ── messages enrichment (idempotent column adds) ──
    if "messages" in tables:
        cols = {c["name"] for c in inspector.get_columns("messages")}
        if "rule_id" not in cols:
            op.add_column("messages", sa.Column("rule_id", sa.Integer(), nullable=True))
        if "attachment_type" not in cols:
            op.add_column("messages", sa.Column("attachment_type", sa.String(32), nullable=False, server_default=""))
        if "attachment_url" not in cols:
            op.add_column("messages", sa.Column("attachment_url", sa.String(512), nullable=False, server_default=""))
        if "postback_payload" not in cols:
            op.add_column("messages", sa.Column("postback_payload", sa.String(255), nullable=False, server_default=""))
        if "source" not in cols:
            op.add_column("messages", sa.Column("source", sa.String(16), nullable=False, server_default="messenger"))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()
    if "messages" in tables:
        cols = {c["name"] for c in inspector.get_columns("messages")}
        for col in ("rule_id", "attachment_type", "attachment_url", "postback_payload", "source"):
            if col in cols:
                op.drop_column("messages", col)
    if "comments" in tables:
        op.drop_table("comments")
