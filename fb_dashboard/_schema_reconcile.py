"""Self-healing schema reconcile: add missing model columns to existing tables.

Why this exists (root-caused 2026-09-05, evidence in scripts/repro_plans_500.py):
  The production Neon DB predates the September 2026 rebuild. Core tables
  (subscription_plans, users, tenants, ...) were created with the PRE-rebuild
  schema. ``Base.metadata.create_all`` only creates MISSING tables — it never
  ALTERs existing ones — and no Alembic migration covered the pre-rebuild →
  current column gap. Result in production: ``SELECT`` with current model
  columns raised "column does not exist" → 500 on ``/api/plans`` while
  ``/healthz`` (count-only) stayed green.

Invoked from BOTH (belt-and-suspenders, both idempotent):
  - runner lifespan — right after create_all, BEFORE Alembic (heals even if
    the Alembic step is skipped or fails on a legacy DB)
  - Alembic revision 007 — keeps the migration chain the single source of
    truth for fresh/managed environments

Properties:
  - idempotent: re-running adds nothing
  - cross-dialect: SQLite (dev/E2E) and PostgreSQL (Neon prod)
  - surgical: only ADDS missing columns; never drops/renames. Legacy extra
    columns (e.g. subscription_plans.price_monthly) are left in place —
    harmless to the ORM, kept for data safety.
  - adds columns as NULLABLE (SQLite cannot ADD COLUMN with non-constant
    defaults); Python-side model defaults fill values on new INSERTs, and
    the canonical seed upsert repairs legacy rows.

NOT covered (documented limits): DB-level constraints/indexes on legacy
tables (unique/index/FK). App-level checks already guard these paths; see
docs/design-system.md and CLAUDE.md rules.
"""
from __future__ import annotations

import logging

import sqlalchemy as sa

log = logging.getLogger("smartbot.schema")


def reconcile_schema(bind) -> list[str]:
    """Ensure every Base.metadata column exists on its existing table.

    Args:
        bind: a synchronous SQLAlchemy Connection (e.g. inside
              ``conn.run_sync(...)`` or Alembic's ``op.get_bind()``).

    Returns:
        List of "<table>.<column>" strings for every column added
        (empty when the schema already matches — the common case).
    """
    from models import Base  # local import: no circularity (models imports nothing back)

    added: list[str] = []
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # fresh table — create_all handles it
        existing_cols = {c["name"] for c in inspector.get_columns(table.name)}
        for col in table.columns:
            if col.name in existing_cols:
                continue
            if col.primary_key:
                # cannot ADD a PK to an existing table; legacy PKs already match
                log.warning("reconcile: skip PK column %s.%s", table.name, col.name)
                continue
            col_type = col.type.compile(bind.dialect)
            stmt = f'ALTER TABLE {table.name} ADD COLUMN "{col.name}" {col_type}'
            bind.execute(sa.text(stmt))
            existing_cols.add(col.name)
            added.append(f"{table.name}.{col.name}")
            log.info("reconcile: added %s.%s", table.name, col.name)

    return added
