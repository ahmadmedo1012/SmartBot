"""v24-C5 — data-layer fixes: migration 017, offer-claim DB dedup, sequence due-scan.

Covers the three implementation tasks of v24-C5 (docs/reports/v24-B3-datalayer.md):

1. Migration 017 on the REAL chain (``command.upgrade`` — the production
   path app/startup.py uses, test_v13/v14/v15 migration-test mechanics):
   - head lands on 017, double-run is a no-op (Inspector guards);
   - the five global claim-sweep / analytics indexes exist after the chain;
   - offer_claims carries uq_offerclaim_tenant_offer_user and a duplicate
     claim INSERT is rejected;
   - legacy lineage: a pre-017 offer_claims table WITHOUT the constraint and
     WITH duplicate rows is deduped (MAX(id) survives — the 013 recipe) and
     then guarded.
2. models.py mirror: create_all (what tests/dev/fresh installs run) builds
   the same five indexes + the offer-claim constraint — chain and metadata
   converge (the D6 equivalence rule).
3. OfferEngine (B3 §5-R7): delivery dedup is DB-backed —
   - a second attempt for the same (tenant, user, offer) is skipped
     (IntegrityError inside the savepoint → claim lost);
   - get_best_offer excludes already-claimed offers from the DB (a FRESH
     engine with empty memory — restart / second serverless instance —
     still refuses to re-deliver: the DB is the source of truth);
   - with multiple unclaimed offers the engine advances to the next one
     instead of re-delivering the claimed one;
   - no user_id → no dedup key → offer returned, nothing claimed.
4. SequenceEngine.get_due_subscriptions (B3 §3): ONE query regardless of N
   (statement counter on the engine), the exact return contract is intact
   (keys, ORM step object, subscriber fields, + tenant_id), delay semantics
   unchanged (days + hours, not-yet-due excluded), missing-step rows drop,
   NULL entered_at drops, duplicate step_order rows dedupe to one entry.
"""
from __future__ import annotations

import sqlite3
import uuid
from datetime import timedelta
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config as AlembicConfig
from sqlalchemy import create_engine, event, select

from alembic import command

_REPO = Path(__file__).resolve().parent.parent
_ALEMBIC_DIR = _REPO / "alembic"

# (table, index_name) — migration 017 §1, mirrored in models.py __table_args__
NEW_INDEXES = [
    ("broadcasts", "ix_broadcast_status_created"),
    ("marketing_campaigns", "ix_campaign_status_sched"),
    ("scheduled_posts", "ix_schedpost_status_sched2"),
    ("sequence_subscriptions", "ix_seqsub_status"),
    ("messages", "ix_messages_tenant_created"),
]

# The five claim-sweep queries these indexes serve (B3 §2 evidence lines)


# ── chain bootstrap (test_v13/v14/v15 mechanics, verbatim) ──────────────────


@pytest.fixture
def fresh_db(tmp_path, monkeypatch):
    from config import settings

    db_path = tmp_path / "v24_c5.db"
    url = f"sqlite+aiosqlite:///{db_path}"
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    monkeypatch.setattr(settings, "DATABASE_POOLED_URL", "")
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DATABASE_POOLED_URL", "")
    return db_path


def _alembic_cfg() -> AlembicConfig:
    cfg = AlembicConfig()
    cfg.set_main_option("script_location", str(_ALEMBIC_DIR))
    return cfg


def _version(db_path: Path) -> str:
    con = sqlite3.connect(db_path)
    try:
        return con.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    finally:
        con.close()


def _index_names(db_path: Path, table: str) -> set[str]:
    con = sqlite3.connect(db_path)
    try:
        return {
            row[0] for row in con.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=?",
                (table,),
            )
        }
    finally:
        con.close()


def _unique_constraint_names(engine, table: str) -> set[str]:
    with engine.connect() as conn:
        return {uc["name"] for uc in sa.inspect(conn).get_unique_constraints(table)}


# ── 1) migration 017 on the chain ────────────────────────────────────────────


def test_chain_head_is_017_and_hot_indexes_exist(fresh_db):
    """Full chain 001→017 runs clean; the five global claim-sweep indexes
    land (guarded — create_all already built them from the models, so 017's
    guards skip and the SETS still match, not duplicate)."""
    command.upgrade(_alembic_cfg(), "head")
    assert _version(fresh_db) == "017"

    for table, name in NEW_INDEXES:
        assert name in _index_names(fresh_db, table), f"{name} missing on {table}"

    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        uqs = _unique_constraint_names(engine, "offer_claims")
        assert "uq_offerclaim_tenant_offer_user" in uqs
    finally:
        engine.dispose()


def test_017_double_run_is_noop(fresh_db):
    """Idempotency: a second upgrade at head must not touch anything
    (Inspector guards — the 010/013/015 discipline)."""
    command.upgrade(_alembic_cfg(), "head")
    command.upgrade(_alembic_cfg(), "head")
    assert _version(fresh_db) == "017"
    for table, name in NEW_INDEXES:
        assert name in _index_names(fresh_db, table)


def test_017_offerclaim_unique_enforced_on_chain_db(fresh_db):
    """The dedup the offer engine relies on actually rejects duplicates on
    a chain-built database."""
    command.upgrade(_alembic_cfg(), "head")

    con = sqlite3.connect(fresh_db)
    try:
        con.execute(
            "INSERT INTO offer_claims (tenant_id, offer_id, fb_user_id) "
            "VALUES (1, 5, 'u1')"
        )
        con.commit()
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO offer_claims (tenant_id, offer_id, fb_user_id) "
                "VALUES (1, 5, 'u1')"
            )
            con.commit()
    finally:
        con.close()


def test_017_heals_legacy_offer_claims_without_constraint(fresh_db):
    """Legacy lineage: a pre-017 offer_claims table with NO constraint and
    duplicate rows (manual inserts — the table was code-unused, B3 R7) is
    deduped keeping MAX(id) (013 recipe) and then guarded by the unique
    index. The chain (001 create_all skips existing tables) preserves the
    legacy shape until 017 heals it."""
    con = sqlite3.connect(fresh_db)
    try:
        con.execute(
            "CREATE TABLE offer_claims ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "tenant_id INTEGER NOT NULL DEFAULT 0, "
            "offer_id INTEGER NOT NULL, "
            "fb_user_id VARCHAR(100) NOT NULL, "
            "user_name VARCHAR(200) DEFAULT '', "
            "claimed_at DATETIME)"
        )
        # duplicate triple (1, 5, 'u1') ×2 + a distinct triple
        con.execute(
            "INSERT INTO offer_claims (id, tenant_id, offer_id, fb_user_id) "
            "VALUES (1, 1, 5, 'u1'), (2, 1, 5, 'u1'), (3, 2, 9, 'u2')"
        )
        con.commit()
    finally:
        con.close()

    command.upgrade(_alembic_cfg(), "head")
    assert _version(fresh_db) == "017"

    con = sqlite3.connect(fresh_db)
    try:
        rows = con.execute(
            "SELECT id FROM offer_claims ORDER BY id"
        ).fetchall()
        assert [r[0] for r in rows] == [2, 3], "dedup must keep MAX(id) per triple"
        with pytest.raises(sqlite3.IntegrityError):
            con.execute(
                "INSERT INTO offer_claims (tenant_id, offer_id, fb_user_id) "
                "VALUES (1, 5, 'u1')"
            )
            con.commit()
    finally:
        con.close()


# ── 2) models.py mirror (create_all parity) ─────────────────────────────────


async def test_create_all_builds_the_same_indexes_and_constraint(v10_world):
    """create_all (fresh installs, test worlds, dev) builds the same five
    indexes + the offer-claim unique constraint — the chain and the
    metadata converge on the identical set (the D6 equivalence rule)."""

    def _reflect(sync_conn):
        insp = sa.inspect(sync_conn)
        index_names = {
            name: {ix["name"] for ix in insp.get_indexes(table)}
            for table, name in NEW_INDEXES
        }
        uqs = {uc["name"] for uc in insp.get_unique_constraints("offer_claims")}
        return index_names, uqs

    async with v10_world.engine.connect() as conn:
        index_names, uqs = await conn.run_sync(_reflect)
    for table, name in NEW_INDEXES:
        assert name in index_names[name], f"{name} missing on {table} (models mirror)"
    assert "uq_offerclaim_tenant_offer_user" in uqs


# ── 3) OfferEngine — DB-backed delivery dedup (B3 §5-R7) ────────────────────


async def _seed_offers(sf, tenant_id: int, titles: list[str]) -> list[int]:
    from models import Offer

    ids: list[int] = []
    async with sf() as db:
        for title in titles:
            offer = Offer(tenant_id=tenant_id, title=title, code="", is_active=True)
            db.add(offer)
            await db.flush()
            ids.append(offer.id)
        await db.commit()
    return ids


async def test_offer_second_attempt_for_same_user_offer_is_skipped(v10_world):
    """The task's core pin: two delivery attempts for the same
    (tenant, user, offer) — the second insert loses to the unique
    constraint inside the savepoint (record_claim → False) and never
    poisons the caller's transaction."""
    from models import OfferClaim
    from offer_engine import OfferEngine

    tid, _u, _uid = await _seed_tenant(v10_world)
    offer_ids = await _seed_offers(v10_world.sf, tid, ["خصم 20%"])
    engine = OfferEngine()

    async with v10_world.sf() as db:
        first = await engine.record_claim(db, "u1", offer_ids[0], tenant_id=tid)
        assert first is True
        # second attempt — same tenant/user/offer: IntegrityError → skipped
        second = await engine.record_claim(db, "u1", offer_ids[0], tenant_id=tid)
        assert second is False
        await db.commit()
        # caller's transaction survived the savepoint rollback intact
        rows = (await db.execute(select(OfferClaim))).scalars().all()
        assert len(rows) == 1
        assert rows[0].tenant_id == tid
        assert rows[0].offer_id == offer_ids[0]
        assert rows[0].fb_user_id == "u1"


async def test_offer_get_best_offer_skips_delivered_after_restart(v10_world):
    """DB is the source of truth: a FRESH engine (empty memory — restart or
    a second serverless instance) refuses to re-deliver an offer whose
    claim is already committed."""
    from offer_engine import OfferEngine

    tid, _u, _uid = await _seed_tenant(v10_world)
    offer_ids = await _seed_offers(v10_world.sf, tid, ["عرض أول"])

    engine_a = OfferEngine()
    async with v10_world.sf() as db:
        offer = await engine_a.get_best_offer(db, "u1", "welcome", tenant_id=tid)
        assert offer is not None and offer["id"] == offer_ids[0]
        await db.commit()

    engine_b = OfferEngine()  # cold start: memory dict empty
    assert not engine_b.has_received("u1", offer_ids[0])
    async with v10_world.sf() as db:
        again = await engine_b.get_best_offer(db, "u1", "welcome", tenant_id=tid)
    assert again is None, "claimed offer must not be re-delivered to the same user"


async def test_offer_get_best_offer_advances_to_next_unclaimed(v10_world):
    """With several active offers the second attempt moves to the NEXT
    unclaimed one instead of re-delivering the claimed one; a third
    attempt (everything claimed) returns None."""
    from offer_engine import OfferEngine

    tid, _u, _uid = await _seed_tenant(v10_world)
    offer_ids = await _seed_offers(v10_world.sf, tid, ["عرض أول", "عرض ثانٍ"])

    engine = OfferEngine()
    async with v10_world.sf() as db:
        first = await engine.get_best_offer(db, "u1", "welcome", tenant_id=tid)
        assert first["id"] == offer_ids[0]
        second = await engine.get_best_offer(db, "u1", "welcome", tenant_id=tid)
        assert second["id"] == offer_ids[1], "must advance to the unclaimed offer"
        third = await engine.get_best_offer(db, "u1", "welcome", tenant_id=tid)
        assert third is None
        await db.commit()

    # a different user starts clean (claim rows are per (tenant, offer, user))
    async with v10_world.sf() as db:
        other = await engine.get_best_offer(db, "u2", "welcome", tenant_id=tid)
        assert other is not None


async def test_offer_get_best_offer_without_user_claims_nothing(v10_world):
    """No user_id → no dedup key → the offer is returned and NOTHING is
    written to offer_claims (anonymous selection, unchanged semantics)."""
    from models import OfferClaim
    from offer_engine import OfferEngine

    tid, _u, _uid = await _seed_tenant(v10_world)
    await _seed_offers(v10_world.sf, tid, ["عرض عام"])

    engine = OfferEngine()
    async with v10_world.sf() as db:
        offer = await engine.get_best_offer(db, None, "", tenant_id=tid)
        assert offer is not None
        rows = (await db.execute(select(OfferClaim))).scalars().all()
        assert rows == []


async def _seed_tenant(world):
    from _hash import hash_password
    from models import Tenant, User

    async with world.sf() as db:
        t = Tenant(name=f"T-{uuid.uuid4().hex[:8]}", subscription_status="PAID",
                   is_active=True)
        db.add(t)
        await db.flush()
        u = User(username=f"u_{uuid.uuid4().hex[:8]}",
                 email=f"{uuid.uuid4().hex[:8]}@test.ly",
                 password_hash=hash_password("pass123456"),
                 tenant_id=t.id, role="admin")
        db.add(u)
        await db.commit()
        return t.id, u.username, u.id


# ── 4) SequenceEngine.get_due_subscriptions — the O(2N+1) → 1 rewrite ───────


async def _seed_sequence_world(sf, n_due: int = 2, n_future: int = 1):
    """Tenants + sequences + steps + subscribers + subscriptions.

    Returns (world facts) — every due sub: step 0 delay 0, entered_at
    yesterday; future sub: delay 3 days, entered 2 days ago."""
    from _utils import utcnow
    from models import Sequence, SequenceStep, SequenceSubscription, Subscriber, Tenant

    facts = {"due": [], "future": [], "tenant_ids": []}
    async with sf() as db:
        for i in range(n_due):
            t = Tenant(name=f"T{i}-{uuid.uuid4().hex[:6]}")
            db.add(t)
            await db.flush()
            facts["tenant_ids"].append(t.id)
            seq = Sequence(tenant_id=t.id, name=f"seq{i}", status="active")
            db.add(seq)
            await db.flush()
            db.add(SequenceStep(tenant_id=t.id, sequence_id=seq.id, step_order=0,
                                delay_days=0, delay_hours=0,
                                message_template=f"خطوة 0 تسلسل {i}"))
            sub = Subscriber(tenant_id=t.id, fb_user_id=f"fb_{uuid.uuid4().hex[:6]}",
                             name=f"مشترك {i}", first_name=f"م{i}",
                             platform="messenger", status="active")
            db.add(sub)
            await db.flush()
            ssub = SequenceSubscription(
                tenant_id=t.id, subscriber_id=sub.id, sequence_id=seq.id,
                current_step=0, status="active",
                entered_at=utcnow() - timedelta(days=1),
            )
            db.add(ssub)
            await db.flush()
            facts["due"].append((ssub.id, seq.id, sub.id, t.id))

        # a not-yet-due subscription: delay 3 days, entered 2 days ago
        t = Tenant(name=f"TF-{uuid.uuid4().hex[:6]}")
        db.add(t)
        await db.flush()
        seq = Sequence(tenant_id=t.id, name="seqF", status="active")
        db.add(seq)
        await db.flush()
        db.add(SequenceStep(tenant_id=t.id, sequence_id=seq.id, step_order=0,
                            delay_days=3, delay_hours=0,
                            message_template="خطوة مستقبلية"))
        sub = Subscriber(tenant_id=t.id, fb_user_id=f"fb_{uuid.uuid4().hex[:6]}",
                         name="مشترك مستقبلي", first_name="مستقبلي",
                         platform="messenger", status="active")
        db.add(sub)
        await db.flush()
        ssub = SequenceSubscription(
            tenant_id=t.id, subscriber_id=sub.id, sequence_id=seq.id,
            current_step=0, status="active",
            entered_at=utcnow() - timedelta(days=2),
        )
        db.add(ssub)
        await db.flush()
        facts["future"].append((ssub.id, seq.id, sub.id, t.id))
        await db.commit()
    return facts


async def test_due_scan_is_one_query_regardless_of_n(v10_world):
    """B3 §3 pin: the scan issues exactly ONE statement for any number of
    active subscriptions (the old code ran 2N+1 — per-sub steps + subscriber
    fetches). Counted on the sync engine under the async session."""
    from sequence_engine import SequenceEngine

    facts = await _seed_sequence_world(v10_world.sf, n_due=3, n_future=1)
    eng = SequenceEngine(None)

    statements: list[str] = []

    def _count(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(v10_world.engine.sync_engine, "before_cursor_execute", _count)
    try:
        async with v10_world.sf() as db:
            due = await eng.get_due_subscriptions(db)
    finally:
        event.remove(v10_world.engine.sync_engine, "before_cursor_execute", _count)

    assert len(due) == len(facts["due"])
    # Target (B3 §3 / task): ≤ 2 statements regardless of N. The scan itself
    # is ONE joined SELECT; the optional +1 is the ORM's bounded selectin
    # batch for Subscriber.tags (lazy="selectin") — a single IN(...) query,
    # whereas the OLD code ran it per subscriber on every session.get.
    assert len(statements) <= 2, (
        f"due scan must be ≤2 queries, ran {len(statements)}: {statements}"
    )
    scan_statements = [
        s for s in statements
        if "sequence_subscriptions" in s and "sequence_steps" in s
    ]
    assert len(scan_statements) == 1, (
        f"exactly one due-scan join expected, got {scan_statements}"
    )


async def test_due_scan_contract_and_semantics(v10_world):
    """The exact return contract survived the rewrite: same keys (plus
    tenant_id), step is the ORM SequenceStep, delay semantics unchanged
    (days + hours, not-yet-due excluded), subscriber fields attached."""
    from models import SequenceStep
    from sequence_engine import SequenceEngine

    facts = await _seed_sequence_world(v10_world.sf, n_due=1, n_future=1)
    eng = SequenceEngine(None)

    async with v10_world.sf() as db:
        due = await eng.get_due_subscriptions(db)

    assert len(due) == 1, "the delay-3-days subscription must NOT be due"
    item = due[0]
    expected_keys = {
        "sub_id", "seq_id", "step_index", "step", "subscriber_id",
        "subscriber_platform", "subscriber_fb_id", "subscriber_name",
        "subscriber_first_name", "message_template", "tenant_id",
    }
    assert set(item.keys()) == expected_keys
    sub_id, seq_id, subscriber_id, tid = facts["due"][0]
    assert item["sub_id"] == sub_id
    assert item["seq_id"] == seq_id
    assert item["step_index"] == 0
    assert item["subscriber_id"] == subscriber_id
    assert item["tenant_id"] == tid
    assert isinstance(item["step"], SequenceStep)
    assert item["step"].id is not None
    assert item["message_template"] == "خطوة 0 تسلسل 0"
    assert item["subscriber_platform"] == "messenger"
    assert item["subscriber_fb_id"]
    assert item["subscriber_name"] == "مشترك 0"


async def test_due_scan_respects_delay_hours_boundary(v10_world):
    """delay_hours participates in the pushed-down due arithmetic: entered
    3h ago with a 2-hour delay is due; entered 30 minutes ago with a 2-hour
    delay is not."""
    from _utils import utcnow
    from models import Sequence, SequenceStep, SequenceSubscription, Subscriber, Tenant
    from sequence_engine import SequenceEngine

    eng = SequenceEngine(None)
    async with v10_world.sf() as db:
        t = Tenant(name="TH")
        db.add(t)
        await db.flush()
        seq = Sequence(tenant_id=t.id, name="seqH", status="active")
        db.add(seq)
        await db.flush()
        db.add(SequenceStep(tenant_id=t.id, sequence_id=seq.id, step_order=0,
                            delay_days=0, delay_hours=2,
                            message_template="ساعتان"))
        s_old = Subscriber(tenant_id=t.id, fb_user_id="old", name="قديم",
                           platform="messenger", status="active")
        s_new = Subscriber(tenant_id=t.id, fb_user_id="new", name="جديد",
                           platform="messenger", status="active")
        db.add_all([s_old, s_new])
        await db.flush()
        db.add(SequenceSubscription(
            tenant_id=t.id, subscriber_id=s_old.id, sequence_id=seq.id,
            current_step=0, status="active",
            entered_at=utcnow() - timedelta(hours=3)))
        db.add(SequenceSubscription(
            tenant_id=t.id, subscriber_id=s_new.id, sequence_id=seq.id,
            current_step=0, status="active",
            entered_at=utcnow() - timedelta(minutes=30)))
        await db.commit()

    async with v10_world.sf() as db:
        due = await eng.get_due_subscriptions(db)
    assert len(due) == 1
    # only the 3h-old entry, not the 30-minute one
    assert due[0]["subscriber_fb_id"] == "old"


async def test_due_scan_drops_missing_step_and_null_entered_at(v10_world):
    """Inner-join semantics = the old per-row skips: a subscription whose
    current_step matches NO step drops out; a NULL entered_at fails the
    due comparison (the old TypeError-skip)."""
    from _utils import utcnow
    from models import Sequence, SequenceStep, SequenceSubscription, Subscriber
    from sequence_engine import SequenceEngine

    eng = SequenceEngine(None)
    async with v10_world.sf() as db:
        from models import Tenant
        t = Tenant(name="TE")
        db.add(t)
        await db.flush()
        seq = Sequence(tenant_id=t.id, name="seqE", status="active")
        db.add(seq)
        await db.flush()
        # step exists at order 1 — the orphan subscription points at order 7
        db.add(SequenceStep(tenant_id=t.id, sequence_id=seq.id, step_order=1,
                            delay_days=0, delay_hours=0, message_template="x"))
        s_ok = Subscriber(tenant_id=t.id, fb_user_id="ok", name="سليم",
                          platform="messenger", status="active")
        s_orphan = Subscriber(tenant_id=t.id, fb_user_id="orphan", name="يتيم",
                              platform="messenger", status="active")
        s_null = Subscriber(tenant_id=t.id, fb_user_id="null", name="فارغ",
                            platform="messenger", status="active")
        db.add_all([s_ok, s_orphan, s_null])
        await db.flush()
        db.add(SequenceSubscription(
            tenant_id=t.id, subscriber_id=s_ok.id, sequence_id=seq.id,
            current_step=1, status="active",
            entered_at=utcnow() - timedelta(days=1)))
        db.add(SequenceSubscription(
            tenant_id=t.id, subscriber_id=s_orphan.id, sequence_id=seq.id,
            current_step=7, status="active",
            entered_at=utcnow() - timedelta(days=1)))
        db.add(SequenceSubscription(
            tenant_id=t.id, subscriber_id=s_null.id, sequence_id=seq.id,
            current_step=1, status="active",
            entered_at=utcnow() - timedelta(days=1)))
        await db.flush()
        # ORM attribute None would fall back to the Python default — go
        # through a Core UPDATE to store a real NULL (the legacy-row shape)
        await db.execute(
            sa.update(SequenceSubscription)
            .where(SequenceSubscription.subscriber_id == s_null.id)
            .values(entered_at=None)
        )
        await db.commit()

    async with v10_world.sf() as db:
        due = await eng.get_due_subscriptions(db)
    assert len(due) == 1
    assert due[0]["subscriber_fb_id"] == "ok"


async def test_due_scan_dedupes_duplicate_step_order(v10_world):
    """Pathological data: two steps sharing step_order — the scan returns
    ONE entry for the subscription (the first by (step_order, id)), the
    same row the old per-row loop would have picked."""
    from _utils import utcnow
    from models import Sequence, SequenceStep, SequenceSubscription, Subscriber, Tenant
    from sequence_engine import SequenceEngine

    eng = SequenceEngine(None)
    async with v10_world.sf() as db:
        t = Tenant(name="TD")
        db.add(t)
        await db.flush()
        seq = Sequence(tenant_id=t.id, name="seqD", status="active")
        db.add(seq)
        await db.flush()
        db.add(SequenceStep(tenant_id=t.id, sequence_id=seq.id, step_order=0,
                            delay_days=0, delay_hours=0,
                            message_template="الأول"))
        db.add(SequenceStep(tenant_id=t.id, sequence_id=seq.id, step_order=0,
                            delay_days=0, delay_hours=0,
                            message_template="الثاني"))
        sub = Subscriber(tenant_id=t.id, fb_user_id="dupe", name="مكرر",
                         platform="messenger", status="active")
        db.add(sub)
        await db.flush()
        db.add(SequenceSubscription(
            tenant_id=t.id, subscriber_id=sub.id, sequence_id=seq.id,
            current_step=0, status="active",
            entered_at=utcnow() - timedelta(days=1)))
        await db.commit()

    async with v10_world.sf() as db:
        due = await eng.get_due_subscriptions(db)
    assert len(due) == 1
    assert due[0]["message_template"] == "الأول"


async def test_due_dicts_carry_tenant_id_for_the_sweep(v10_world):
    """process_due_sequence_steps no longer runs the extra IN(...) tenant
    annotation query — the due dicts arrive pre-annotated from the joined
    subscription row (field the sweep's claim marker + per-tenant client
    resolution read)."""
    from sequence_engine import SequenceEngine

    facts = await _seed_sequence_world(v10_world.sf, n_due=1, n_future=0)
    async with v10_world.sf() as db:
        due = await SequenceEngine(None).get_due_subscriptions(db)
    assert due, "one seeded due subscription"
    assert int(due[0].get("tenant_id") or 0) == facts["tenant_ids"][0]
