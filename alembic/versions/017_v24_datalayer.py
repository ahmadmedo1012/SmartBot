"""v24-C5 — data-layer hot indexes + offer-claim dedup + timestamptz drift heal.

Revision ID: 017

What this fixes (docs/reports/v24-B3-datalayer.md §2 P1 findings):

1) GLOBAL cron claim-sweep indexes (B3 §2-#2..#5). Every scheduled/async
   worker claims its row with an atomic ``UPDATE…WHERE status IN (claimable)
   RETURNING`` — the repo's claim doctrine — but those claim scans are
   CROSS-TENANT, while every existing composite on these tables leads with
   ``tenant_id`` and therefore can never serve them. Each cron beat seq-
   scanned all five tables:
   - broadcasts(status, created_at)          — outbox claim, every beat
     (broadcast_engine.py:536-539: WHERE status='pending' ORDER BY
     created_at LIMIT n — global)
   - marketing_campaigns(status, scheduled_at) — campaign claim
     (routers/marketing.py:333-338: WHERE status='scheduled' AND
     scheduled_at <= now — global)
   - scheduled_posts(status, scheduled_at)   — due sweep + stale recovery
     (content_calendar.py:420, bot.py:113-117 — global)
   - sequence_subscriptions(status)          — due scan (status='active')
     + stale-claim scan (status='sending') in sequence_engine.py
   - messages(tenant_id, created_at)         — the LARGEST table: DM-rule
     attribution (routers/analytics.py:74-80: tenant + is_from_page +
     created_at >= cutoff GROUP BY rule_id) and message-total counts
     (dashboard_stats.py:177-181) on the polled dashboard.
   All five are mirrored in models.py __table_args__ so create_all (001)
   and the chain converge on the identical set (the D6/equivalence rule);
   the guards below skip creation wherever 001 already built them.

   Naming: ``ix_schedpost_status_sched2`` — the natural name is the 002-era
   one that 014's duplicate-index cleanup dropped again; a distinct name
   avoids collisions on half-migrated lineages (B3's explicit suggestion).

2) offer_claims unique (tenant_id, offer_id, fb_user_id) (B3 §2-#8 / §5-R7).
   The OfferClaim table existed in the models since phase D, but ZERO code
   ever wrote it and no constraint guarded it: offer delivery dedup was the
   in-memory ``dict`` in offer_engine — nothing survived a restart or a
   second serverless instance, so the same user got the same offer again.
   offer_engine now INSERTs a claim row (inside a savepoint) on every
   delivery attempt and treats IntegrityError as "already delivered". This
   migration adds the constraint the engine relies on — 013's proven
   recipe: dedup legacy duplicates keeping MAX(id), then a UNIQUE index
   (create_all DBs carry it as a table constraint with the same name — the
   guard checks both shapes, so re-runs and both lineages are no-ops).

3) timestamptz drift heal, PG only (B3 §4-D4). The create_table branches of
   003 (tenants.created_at/updated_at) and 004 (users.twofa_verified_at,
   notification_preferences.updated_at, rate_limit_entries.window_end/
   created_at, report_schedules.created_at/updated_at) declare
   ``DateTime(timezone=True)`` while the models say naive ``DateTime``.
   On any PG database whose lineage ran those branches (true legacy prod),
   asyncpg returns AWARE datetimes → the naive-UTC comparisons in
   _rate_limit.py raise TypeError at runtime. Fresh create_all databases
   are naive and unaffected. The heal is self-diagnosing — no live-DB
   inspection needed: per column, read the actual type from
   information_schema; only when it is really ``timestamp with time zone``
   convert it with ``USING <col> AT TIME ZONE 'UTC'`` (keeps the UTC
   wall-clock, matching the repo-wide naive-UTC convention) and rewrite
   now()-style defaults to ``now() AT TIME ZONE 'UTC'`` so the default
   stays naive-UTC regardless of the session timezone. SQLite has no
   timezone-aware types — the branch is a no-op there by construction.

Idempotent: every step Inspector-guarded (and IF NOT EXISTS as the belt on
top — 013/015 pattern). No concurrent writer during migration (lifespan
runs alembic before the bot task). Works on SQLite (tests/dev) and
PostgreSQL (Neon) — same guard discipline as 002/010/013/015.

downgrade: drops the five hot indexes and the offer-claim unique index
(guarded — create_all table constraints are never touched); the timestamptz
heal is forward-only (013/014 doctrine — re-introducing the drift would
re-introduce the bug it fixed).
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine.reflection import Inspector

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None

# (table, index_name, columns) — the global claim-sweep + analytics indexes
# (B3 §2-#1..#5), declared with the same names in models.py __table_args__.
NEW_INDEXES = [
    ("broadcasts", "ix_broadcast_status_created", ["status", "created_at"]),
    ("marketing_campaigns", "ix_campaign_status_sched", ["status", "scheduled_at"]),
    ("scheduled_posts", "ix_schedpost_status_sched2", ["status", "scheduled_at"]),
    ("sequence_subscriptions", "ix_seqsub_status", ["status"]),
    ("messages", "ix_messages_tenant_created", ["tenant_id", "created_at"]),
]

# offer_claims dedup (B3 §2-#8) — same name as the models.py
# UniqueConstraint so create_all table constraints and the chain's unique
# index converge (013's uq_botstate_tenant_key recipe).
_OFFERCLAIM_TABLE = "offer_claims"
_OFFERCLAIM_UQ = "uq_offerclaim_tenant_offer_user"
_OFFERCLAIM_COLS = ["tenant_id", "offer_id", "fb_user_id"]

# D4 (B3 §4-D4) — the exact (table, column) pairs whose 003/004
# create_table/create-column branches declared DateTime(timezone=True) on
# PostgreSQL. Guarded per column by information_schema: converted ONLY
# where the live type is really timestamptz.
_TZ_COLUMNS = [
    ("tenants", "created_at"),
    ("tenants", "updated_at"),
    ("users", "twofa_verified_at"),
    ("notification_preferences", "updated_at"),
    ("rate_limit_entries", "window_end"),
    ("rate_limit_entries", "created_at"),
    ("report_schedules", "created_at"),
    ("report_schedules", "updated_at"),
]


def _guard_names(bind, table: str) -> tuple[set[str], set[str]]:
    """(index names, unique-constraint names) actually present on ``table``.

    A table-level UNIQUE may be built as a standalone index (this migration /
    reconcile) or as a CREATE TABLE constraint (create_all in 001) depending
    on the dialect — checking both keeps the guard correct on PostgreSQL and
    SQLite alike (013's ``_guard_names`` pattern, verbatim).
    """
    inspector = Inspector.from_engine(bind)
    indexes = {ix["name"] for ix in inspector.get_indexes(table)}
    try:
        constraints = {uc["name"] for uc in inspector.get_unique_constraints(table)}
    except Exception:
        constraints = set()  # dialect without constraint reflection — index alone is enough
    return indexes, constraints


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()

    # ── 1) Global claim-sweep + analytics indexes ────────────────────────
    # Inspector guard (skip where 001 create_all already built them from the
    # models) + CREATE INDEX IF NOT EXISTS (013/015 double belt). Both
    # dialects: plain btree, no WHERE clause — one spelling.
    for table, name, cols in NEW_INDEXES:
        if table not in tables:
            continue
        existing = {ix["name"] for ix in inspector.get_indexes(table)}
        if name in existing:
            continue
        op.execute(sa.text(
            f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({', '.join(cols)})"
        ))

    # ── 2) offer_claims unique — wire the DB-backed offer dedup ──────────
    if _OFFERCLAIM_TABLE in tables:
        indexes, constraints = _guard_names(bind, _OFFERCLAIM_TABLE)
        if _OFFERCLAIM_UQ not in indexes and _OFFERCLAIM_UQ not in constraints:
            # The table is code-unused (B3 R7) so duplicates can only come
            # from manual inserts — still dedup first (013 recipe): keep the
            # NEWEST claim (MAX(id)) per (tenant, offer, user); NOT IN is
            # safe because MAX(id) is never NULL (PK).
            op.execute(sa.text(
                "DELETE FROM offer_claims WHERE id NOT IN "
                "(SELECT MAX(id) FROM offer_claims "
                "GROUP BY tenant_id, offer_id, fb_user_id)"
            ))
            op.create_index(
                _OFFERCLAIM_UQ, _OFFERCLAIM_TABLE, _OFFERCLAIM_COLS, unique=True,
            )

    # ── 3) timestamptz drift heal (D4) — PostgreSQL only, self-diagnosing ─
    if bind.dialect.name == "postgresql":
        for table, column in _TZ_COLUMNS:
            if table not in tables:
                continue
            row = bind.execute(sa.text(
                "SELECT data_type, column_default FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = :c"
            ).bindparams(sa.bindparam("t", table), sa.bindparam("c", column))).first()
            if row is None or row[0] != "timestamp with time zone":
                continue  # create_all lineage (naive) or column gone — nothing to heal
            op.execute(sa.text(
                f'ALTER TABLE {table} ALTER COLUMN "{column}" '
                "TYPE timestamp without time zone "
                f'USING "{column}" AT TIME ZONE \'UTC\''
            ))
            # now()-style defaults keep working after the type change, but
            # the implicit timestamptz→timestamp cast applies the SESSION
            # timezone — pin them to UTC so the stored wall clock matches the
            # repo-wide naive-UTC convention on any session timezone.
            default = (row[1] or "")
            if "now()" in default:
                op.execute(sa.text(
                    f'ALTER TABLE {table} ALTER COLUMN "{column}" '
                    "SET DEFAULT (now() AT TIME ZONE 'UTC')"
                ))
            print(f"[017] healed timestamptz drift on {table}.{column}")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()

    for table, name, _cols in NEW_INDEXES:
        if table not in tables:
            continue
        existing = {ix["name"] for ix in inspector.get_indexes(table)}
        if name not in existing:
            continue
        op.execute(sa.text(f"DROP INDEX IF EXISTS {name}"))

    if _OFFERCLAIM_TABLE in tables:
        indexes, constraints = _guard_names(bind, _OFFERCLAIM_TABLE)
        # never drop a create_all table constraint — only our standalone index
        if _OFFERCLAIM_UQ in indexes and _OFFERCLAIM_UQ not in constraints:
            op.drop_index(_OFFERCLAIM_UQ, table_name=_OFFERCLAIM_TABLE)

    # timestamptz heal: forward-only (013/014 doctrine) — reverting the
    # column types would reintroduce the aware/naive TypeError drift.
