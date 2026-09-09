# v16-E5 — Data: Hot Index, FK, 003 setval, Parity (2026-09-09)

> Agent E5's connection dropped after completing ALL code work; the coordinator verified every task below. No task rejected.

## Task 1 — offers hot-path index: DONE (models.py __table_args__ + 015 + reconcile)
`Index("ix_offer_tenant_active", "tenant_id", "is_active")` (+ a second ix_offer_active_expires consolidation) — closes the full-scan-per-inbound-message hot path (offer_engine.py:41-43 via pipeline.py:331/333). Migration 015: dual-dialect, Inspector-guarded, CREATE INDEX IF NOT EXISTS (011/013 pattern verbatim).

## Task 2 — user-delete FK: DONE (models.py + 015 + users.py:69-80)
telegram_approvers.added_by_id → ondelete="SET NULL" (nullable already; historical approver records keep their row). 015: PG-only drop+rebuild constraint with ON DELETE SET NULL (NOT VALID — no table scan, applies to new writes; Inspector-guarded, idempotent). users.py delete route sweeps NotificationPreference rows (uq would orphan-block). The PG 500-on-delete is closed.

## Task 3 — 003 setval guard: DONE (003_tenants.py, in-place — v13 precedent)
setval only when MAX(id) > 0, via extracted `_setval_sql(max_id)` helper (logic documented: a virgin sequence nextval=1 never collides with seeded id=0). Fresh-PG chain no longer dies at 003.

## Task 4 — chain ≡ create_all parity: DONE
002's two orphan indexes (ix_sub_payment_status, ix_sub_payment_user_status) now declared in models __table_args__ (both schema paths agree; 002's Inspector guard skips re-creation). Reconcile heal-list extended (_INDEX_HEAL_V16 + users-username neutralization backfill keeping MIN(id) — the login's deterministic order_by(id).limit(1) account — and suffixing duplicates with #<id>, idempotent, both dialects).

## Task 5 — PRAGMA foreign_keys=ON: DONE (tests/conftest.py)
SQLite test engine now enforces FKs via connect listener (StaticPool: one connection, set before any DDL/INSERT). FK behavior (CASCADE/SET NULL) is finally exercised in tests — was PG-only and untested before. One test proves SET NULL on user delete.

## Gates (coordinator-run)
tests/test_v16_migrations.py (chain to head on fresh SQLite, idempotency, parity assertions, user-delete) → part of the 35-test green run with test_v16_prod_truth.py; test_v13_migrations + test_v15_migrations + test_schema_reconcile + phase_b_payments → 108 passed; full suite 836/0.
