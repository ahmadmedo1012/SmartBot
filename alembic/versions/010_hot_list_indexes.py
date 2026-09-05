"""v5 §4 — hot-path indexes for tenant-scoped list endpoints.

Revision ID: 010

What this fixes (measured against the actual queries in the code):
- /api/audience (SubscriberEngine.list): ORDER BY last_interaction_at DESC
  filtered by tenant — was seq-scanning (existing index is (tenant_id, id)).
- /api/comments: ORDER BY created_at DESC filtered by tenant — was
  seq-scanning (existing index is (tenant_id, fb_post_id)).
- /api/analytics/* daily + hourly: Reply grouped by created_at filtered by
  tenant — only (rule_id, created_at) and (fb_post_id, created_at) existed.

Idempotent: guards with Inspector. Works on SQLite and PostgreSQL.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None

# (table, index_name, columns)
NEW_INDEXES = [
    ("subscribers", "ix_sub_tenant_last_interaction", ["tenant_id", "last_interaction_at"]),
    ("comments", "ix_comment_tenant_created", ["tenant_id", "created_at"]),
    ("replies", "ix_reply_tenant_created", ["tenant_id", "created_at"]),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()
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
