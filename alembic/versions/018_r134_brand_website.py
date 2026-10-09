"""r134 (R134-W1-SB2a2) — brand_config.website stale-URL data heal.

One-line data migration:

    UPDATE brand_config
       SET website = 'https://menu.smart-link.ly'
     WHERE website = 'https://smart-menu-sigma.vercel.app'

Why: the column default (models.py BrandConfig.website) AND the
GET /api/brand auto-seed (brand_routes.py) both shipped Smart-Menu's old
PREVIEW domain (smart-menu-sigma.vercel.app), and the auto-seed PERSISTED
it into the DB on the first call — so rows already seeded keep serving a
dead link in the dashboard footer even after the default changed
(create_all never ALTERs existing tables; nothing else ever rewrites an
existing brand row). The default and seed now share the single
BrandConfig.DEFAULT_WEBSITE constant (r134); this migration heals the
rows the old seed froze.

Idempotent: the WHERE clause makes re-runs no-ops, and rows the owner
customized (any other value) are never touched. Inspector-guarded for
DB lineages that lack the table (brand_config ships in 001's create_all
so this only fires on exotic splits) — the 015/016 guard pattern.

downgrade: deliberately does NOT resurrect the stale URL (016's
documented precedent: a data downgrade that restores a known-bad value
is a regression, not a rollback). The reverse UPDATE is in the comment
below if an operator ever truly needs it.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None

_OLD_URL = "https://smart-menu-sigma.vercel.app"
_NEW_URL = "https://menu.smart-link.ly"

# The documented reverse (NOT executed by downgrade — see docstring):
#   UPDATE brand_config SET website = '{_OLD_URL}' WHERE website = '{_NEW_URL}'


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    if "brand_config" not in inspector.get_table_names():
        return
    op.execute(sa.text(
        f"UPDATE brand_config SET website = '{_NEW_URL}' "
        f"WHERE website = '{_OLD_URL}'"
    ))


def downgrade() -> None:
    # No-op by design — see the docstring (restoring a known-dead preview
    # URL is a regression, not a rollback).
    return None
