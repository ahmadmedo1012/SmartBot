# v24-C5 — Data Layer Fixes Verification Report

> **Agent:** C5-DATALAYER (implementation) + orchestrator (verification completion after agent context-timeout)
> **Scope:** hot indexes (migration 017) · OfferClaim DB dedup · sequence due-scan rewrite · timestamptz drift heal
> **Status:** ALL IMPLEMENTED · VERIFIED GREEN

## Implementation summary (all tagged `# v24-C5`)

| # | Task | Files | Status |
|---|---|---|---|
| 1 | **Migration 017** — 5 global cron claim-sweep + analytics indexes: `broadcasts(status,created_at)`, `marketing_campaigns(status,scheduled_at)`, `scheduled_posts(status,scheduled_at)`, `sequence_subscriptions(status)`, `messages(tenant_id,created_at)` — mirrored in `models.py __table_args__` (53 tables converge) | `alembic/versions/017_v24_datalayer.py`, `fb_dashboard/models.py` | ✅ |
| 2 | **OfferClaim DB dedup** — every delivery attempt INSERTs a claim row inside a savepoint; `IntegrityError` (unique `uq_offerclaim_tenant_offer_user`) = already delivered → next candidate; memory dict demoted to fast-path hint | `fb_dashboard/offer_engine.py` | ✅ |
| 3 | **Sequence due-scan rewrite** — O(2N+1) → **ONE joined query** (steps + subscriber joined, `status='active'` + due-ness pushed into SQL per-dialect: julianday arithmetic on SQLite, interval arithmetic on PG; NULL entered_at filtered in SQL; duplicate step_order deduped by (step_order, id); `tenant_id` returned in-row) | `fb_dashboard/sequence_engine.py` | ✅ |
| 4 | **timestamptz drift heal (D4)** — self-diagnosing, PG-only: reads actual type from `information_schema`, converts ONLY true `timestamp with time zone` columns (003/004 lineage) to naive UTC via `AT TIME ZONE 'UTC'`, rewrites `now()` defaults | `alembic/versions/017_v24_datalayer.py` | ✅ |
| 5 | **offer_claims unique constraint** — dedup legacy rows (keep MAX(id)) then unique index; guarded for both create_all + migration lineages (013 recipe) | migration 017 | ✅ |

## Verification gates

| Gate | Result |
|---|---|
| `tests/test_v24_datalayer.py` (15 tests incl. offer-dedup race, due-scan contract, index presence) | **15 passed** |
| Alembic chain 001→017 on fresh SQLite (`scripts/verify_alembic_chain.py`) | **PASS — 53 tables match create_all lineage; all 5 hot indexes present in both** |
| Full backend suite (run by orchestrator, post-integration) | see v24-00 final gates |
| Ruff | **clean** |

## Notes

- The due-scan keeps the exact previous return contract (+ `tenant_id` in-row — removes the extra per-row re-fetch noted in B3 §3).
- The SQLite julianday approximation (~4e-5 s slack) is 6 orders of magnitude below the 60 s poll granularity.
- Migration 017 is idempotent-guarded (skips whatever a lineage already has — both create_all and legacy migration paths converge).
- **Owner pending (no live DB this round, by user directive):** applying 017 to production Neon happens at next deploy/startup reconciliation — the chain's startup path handles it; timestamptz heal will self-diagnose on first run.
