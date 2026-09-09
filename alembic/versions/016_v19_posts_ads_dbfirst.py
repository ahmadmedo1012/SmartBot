"""v19 Step 2 — DB-first posts + ads: the four persistence tables.

Revision ID: 016

What this fixes (v19 live-bug round, root cause 2):
- /api/posts and the three /api/ads/* endpoints were live-Graph-ONLY with no
  try/except and no DB fallback. Any Graph failure (missing ``ads_read``
  scope, partial token expiry, transient timeout) made those sections render
  EMPTY with zero error surfaced — the exact "everything is zero / looks
  empty instead of broken" class that comments (v4 §4.10) and inbox (v3 §4.2)
  already closed. This migration gives posts and ads the same persistence
  layer the comments/inbox fix enjoys.

Tables (mirroring the Comment/Conversation conventions: tenant_id + fb ids +
(uq tenant_id, fb_id) dedup + tenant-scoped indexes):
  1. fb_posts      — page feed posts (message + like/share/comment counters,
                     created_time = FB-side time, the list sort key).
  2. ad_accounts   — the tenant's ad accounts (extracted columns only).
  3. ad_campaigns  — campaigns per account; payload_json keeps the RAW Graph
                     dict so the endpoint re-serves the exact live shape.
  4. ad_items      — ads per account; payload_json for the same reason.

Idempotent: Inspector-guarded, works on SQLite and PostgreSQL (009
precedent). Fresh installs get the tables from create_all; this migration
covers legacy databases. Downgrade drops the four tables (data loss is
acceptable — every row is a re-syncable Graph cache, never a source of
truth).
"""
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

from alembic import op

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()

    # ── 1) fb_posts (DB-first page feed) ──
    if "fb_posts" not in tables:
        op.create_table(
            "fb_posts",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("tenant_id", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("fb_post_id", sa.String(128), nullable=False),
            sa.Column("message", sa.Text(), nullable=False, server_default=""),
            sa.Column("like_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("share_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("comment_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_time", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("tenant_id", "fb_post_id", name="uq_fbposts_tenant_fb"),
        )
        op.create_index("ix_fbposts_tenant", "fb_posts", ["tenant_id"])
        op.create_index("ix_fbposts_tenant_created", "fb_posts", ["tenant_id", "created_time"])

    # ── 2) ad_accounts (DB-first ads accounts) ──
    if "ad_accounts" not in tables:
        op.create_table(
            "ad_accounts",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("tenant_id", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("fb_account_id", sa.String(64), nullable=False),
            sa.Column("name", sa.String(255), nullable=False, server_default=""),
            sa.Column("account_status", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("currency", sa.String(16), nullable=False, server_default=""),
            sa.Column("amount_spent", sa.String(32), nullable=False, server_default="0"),
            sa.Column("balance", sa.String(32), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("tenant_id", "fb_account_id", name="uq_adaccounts_tenant_fb"),
        )
        op.create_index("ix_ad_accounts_tenant", "ad_accounts", ["tenant_id"])

    # ── 3) ad_campaigns (raw Graph payload per campaign) ──
    if "ad_campaigns" not in tables:
        op.create_table(
            "ad_campaigns",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("tenant_id", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("fb_account_id", sa.String(64), nullable=False, server_default=""),
            sa.Column("fb_campaign_id", sa.String(64), nullable=False),
            sa.Column("name", sa.String(255), nullable=False, server_default=""),
            sa.Column("status", sa.String(32), nullable=False, server_default=""),
            sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("tenant_id", "fb_campaign_id", name="uq_adcampaigns_tenant_fb"),
        )
        op.create_index("ix_ad_campaigns_tenant", "ad_campaigns", ["tenant_id"])
        op.create_index("ix_adcampaigns_tenant_account", "ad_campaigns", ["tenant_id", "fb_account_id"])

    # ── 4) ad_items (raw Graph payload per ad) ──
    if "ad_items" not in tables:
        op.create_table(
            "ad_items",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("tenant_id", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("fb_account_id", sa.String(64), nullable=False, server_default=""),
            sa.Column("fb_ad_id", sa.String(64), nullable=False),
            sa.Column("campaign_id", sa.String(64), nullable=False, server_default=""),
            sa.Column("name", sa.String(255), nullable=False, server_default=""),
            sa.Column("status", sa.String(32), nullable=False, server_default=""),
            sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("tenant_id", "fb_ad_id", name="uq_aditems_tenant_fb"),
        )
        op.create_index("ix_ad_items_tenant", "ad_items", ["tenant_id"])
        op.create_index("ix_aditems_tenant_account", "ad_items", ["tenant_id", "fb_account_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()
    # Reverse creation order (FK-free but keep the tidy habit).
    for table in ("ad_items", "ad_campaigns", "ad_accounts", "fb_posts"):
        if table in tables:
            op.drop_table(table)
