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

v14-E3 (C-DATA1 + D7-07): INDEX/CONSTRAINT healing. The column pass above
never covered DB-level constraints/indexes on legacy tables — production
relied on manual SQL (migrations/002_saas_migration.sql) that added only a
plain tenant index on bot_state. Without ``uq_botstate_tenant_key`` the
wallet credit race inserts duplicate balance rows (silent money corruption,
D7-01) and without ``uq_botstate_key_value`` webhook tenant resolution can
hit MultipleResultsFound. The heal list below runs the SAME dedup statements
as migrations 012/013 (keep MAX(id)) and then issues cross-dialect
``CREATE [UNIQUE] INDEX IF NOT EXISTS`` for both constraints and the four
hot-path indexes no migration ever created on legacy tables. DDL failures are
logged and swallowed — reconcile must never take startup down; the alembic
chain (012/013) remains the authoritative healer.

NOT covered (documented limits): other unique/index/FK drift beyond the list
below. App-level checks already guard these paths; see docs/design-system.md
and CLAUDE.md rules.
"""
from __future__ import annotations

import logging

import sqlalchemy as sa

log = logging.getLogger("smartbot.schema")

# (label, pre-DDL dedup statements, DDL) — label is "<table>.<index>".
# Dedup runs ONLY when the constraint is actually missing (guarded below),
# is idempotent (keeps MAX(id) per group — same SQL as migrations 012/013),
# and both statements work verbatim on SQLite and PostgreSQL.
_INDEX_HEAL: list[tuple[str, tuple[str, ...], str]] = [
    (
        # migration 012 semantics: one page binding per page id value
        "bot_state.uq_botstate_key_value",
        (
            "DELETE FROM bot_state WHERE key = 'fb_page_id' "
            "AND id NOT IN (SELECT MAX(id) FROM bot_state "
            "WHERE key = 'fb_page_id' GROUP BY value)",
        ),
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_botstate_key_value "
        "ON bot_state (key, value) WHERE key = 'fb_page_id'",
    ),
    (
        # migration 013 semantics (C-DATA1): one row per (tenant_id, key)
        "bot_state.uq_botstate_tenant_key",
        (
            "DELETE FROM bot_state WHERE id NOT IN "
            "(SELECT MAX(id) FROM bot_state GROUP BY tenant_id, key)",
        ),
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_botstate_tenant_key "
        "ON bot_state (tenant_id, key)",
    ),
    # D7-07 hot paths — declared in models, never created on legacy tables
    ("bot_logs.ix_botlog_tenant_created", (),
     "CREATE INDEX IF NOT EXISTS ix_botlog_tenant_created "
     "ON bot_logs (tenant_id, created_at)"),
    ("rules.ix_rule_tenant_enabled", (),
     "CREATE INDEX IF NOT EXISTS ix_rule_tenant_enabled "
     "ON rules (tenant_id, enabled)"),
    ("messages.ix_messages_rule_id", (),
     "CREATE INDEX IF NOT EXISTS ix_messages_rule_id ON messages (rule_id)"),
    ("comments.ix_comments_commenter_id", (),
     "CREATE INDEX IF NOT EXISTS ix_comments_commenter_id "
     "ON comments (commenter_id)"),
]


def _exists_as_index_or_constraint(inspector, table: str, name: str) -> bool:
    """True when `name` is already an index OR a unique constraint.

    Fresh create_all DBs declare uq_botstate_tenant_key as a table-level
    UniqueConstraint (on PostgreSQL it surfaces in get_indexes as the
    constraint-backed index; on SQLite only in get_unique_constraints) —
    either form already guarantees uniqueness, so nothing to heal.
    """
    try:
        if name in {ix["name"] for ix in inspector.get_indexes(table)}:
            return True
    except Exception:
        return False
    try:
        if name in {uc["name"] for uc in inspector.get_unique_constraints(table)}:
            return True
    except Exception:
        pass  # dialect without constraint reflection — index check was enough
    return False


def reconcile_schema(bind) -> list[str]:
    """Ensure every Base.metadata column exists on its existing table.

    Args:
        bind: a synchronous SQLAlchemy Connection (e.g. inside
              ``conn.run_sync(...)`` or Alembic's ``op.get_bind()``).

    Returns:
        List of "<table>.<column>" strings for every column added, plus
        "<table>.<index>" labels for every healed index/constraint
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

    # v14-E3: constraint/index healing on legacy tables (see module docstring).
    # Defensive by design: a failure logs a warning and moves on — the
    # alembic chain is the authoritative path; this is the safety net.
    for label, pre_stmts, ddl in _INDEX_HEAL:
        table, name = label.split(".", 1)
        if table not in existing_tables:
            continue
        try:
            if _exists_as_index_or_constraint(inspector, table, name):
                continue
            for stmt in pre_stmts:
                bind.execute(sa.text(stmt))
            bind.execute(sa.text(ddl))
            added.append(label)
            log.info("reconcile: ensured %s", label)
        except Exception:
            log.warning(
                "reconcile: could not ensure %s — leaving it to the alembic chain",
                label, exc_info=True,
            )

    return added
