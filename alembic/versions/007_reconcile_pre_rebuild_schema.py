"""Reconcile pre-rebuild schema: add missing model columns to legacy tables.

Revision ID: 007
Revises: 006

Root cause (2026-09-05, evidence: scripts/repro_plans_500.py):
  The production Neon DB predates the September 2026 rebuild. Tables created
  in the pre-rebuild era (subscription_plans, users, tenants, ...) kept their
  OLD column sets: Base.metadata.create_all never ALTERs existing tables, and
  migrations 001-006 only covered baseline->current gaps — not
  pre-rebuild->current. Production symptom: GET /api/plans -> 500
  ("no such column: subscription_plans.name_ar") while /healthz stayed 200.

Fix: delegate to fb_dashboard/_schema_reconcile.reconcile_schema — the SAME
helper the app lifespan runs at startup (belt-and-suspenders: whichever runs
first heals the schema; both are idempotent).

Idempotent, cross-dialect (SQLite + PostgreSQL), surgical: only ADDS missing
columns; never drops/renames (legacy extras like price_monthly stay, harmless).

NOTE for reviewers: env.py puts fb_dashboard/ on sys.path before revision
scripts execute, so the top-level import below resolves in every context
(app lifespan, `alembic upgrade` CLI, CI).
"""
from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    from _schema_reconcile import reconcile_schema

    added = reconcile_schema(op.get_bind())
    if added:
        # visible in `alembic upgrade` output for auditability
        print(f"[007] reconciled {len(added)} columns: {', '.join(added)}")


def downgrade() -> None:
    # Reconcile is forward-only: added columns hold data (plans name_ar/price,
    # users.phone, ...) and cannot be safely auto-dropped. No-op.
    pass
