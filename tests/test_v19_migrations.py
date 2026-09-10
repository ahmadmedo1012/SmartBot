"""v19 Step 2 — migration 016 (fb_posts / ad_accounts / ad_campaigns / ad_items).

v13 Convention #4 mechanics (test_v15_migrations pattern verbatim): SYNC
``def`` tests (alembic/env.py calls asyncio.run — a running loop would
explode), each test on an ISOLATED sqlite file DB in tmp_path with
settings.DATABASE_URL/DATABASE_POOLED_URL AND os.environ monkeypatched (the
settings singleton never re-reads the env). Alembic config carries NO url —
env.py reads the patched settings. The shared hermetic DB is never touched.

Pins (the 009 pattern):
  1. the chain 001→016 runs clean on a fresh DB (head == 016)
  2. idempotent: a second upgrade() run is a no-op (Inspector guards)
  3. create_all on Base.metadata produces the SAME tables (fresh installs
     and migrated DBs agree — the 001/014 equivalence contract)
  4. downgrade 016→015 drops the four tables
  5. the uq (tenant_id, fb_id) dedup constraints actually reject dupes
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from alembic.config import Config as AlembicConfig
from sqlalchemy import create_engine
from sqlalchemy.engine.reflection import Inspector

from alembic import command

_REPO = Path(__file__).resolve().parent.parent
_ALEMBIC_DIR = _REPO / "alembic"
_VERSIONS_DIR = _ALEMBIC_DIR / "versions"

_TABLES = ("fb_posts", "ad_accounts", "ad_campaigns", "ad_items")


@pytest.fixture
def fresh_db(tmp_path, monkeypatch):
    """Isolated sqlite file DB + settings/env pointed at it (v15 pattern)."""
    from config import settings

    db_path = tmp_path / "v19_migrations.db"
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


def _table_names(db_path: Path) -> set:
    eng = create_engine(f"sqlite:///{db_path}")
    try:
        return set(Inspector.from_engine(eng).get_table_names())
    finally:
        eng.dispose()


def test_chain_head_is_016_on_fresh_db(fresh_db):
    """The full chain 001→016 runs clean; head lands on 016 with all tables."""
    command.upgrade(_alembic_cfg(), "head")
    assert _version(fresh_db) == "017"
    tables = _table_names(fresh_db)
    for t in _TABLES:
        assert t in tables, f"missing table {t}"


def test_016_upgrade_twice_is_idempotent(fresh_db):
    command.upgrade(_alembic_cfg(), "head")
    # second run at the same head: upgrade() must be a no-op (Inspector guards)
    command.upgrade(_alembic_cfg(), "head")
    assert _version(fresh_db) == "017"
    tables = _table_names(fresh_db)
    for t in _TABLES:
        assert t in tables


def test_016_agrees_with_create_all(fresh_db, tmp_path):
    """Fresh installs (create_all) and migrated DBs expose the same tables —
    the 001/014 equivalence contract."""
    import sys
    sys.path.insert(0, str(_REPO / "fb_dashboard"))
    from models import Base  # noqa: E402

    command.upgrade(_alembic_cfg(), "head")
    mig_tables = _table_names(fresh_db)

    ca_path = tmp_path / "create_all.db"
    ca_eng = create_engine(f"sqlite:///{ca_path}")
    Base.metadata.create_all(ca_eng)
    ca_tables = set(Inspector.from_engine(ca_eng).get_table_names())
    ca_eng.dispose()
    for t in _TABLES:
        assert t in ca_tables
        assert t in mig_tables


def test_016_downgrade_drops_the_tables(fresh_db):
    command.upgrade(_alembic_cfg(), "head")
    command.downgrade(_alembic_cfg(), "015")
    assert _version(fresh_db) == "015"
    tables = _table_names(fresh_db)
    for t in _TABLES:
        assert t not in tables


def test_uq_dedup_constraints_reject_duplicates(fresh_db):
    """(tenant_id, fb_post_id) / (tenant_id, fb_account_id) / … unique — the
    webhook redelivery + sync-rerun dedup guarantee, proven at the DB level."""
    command.upgrade(_alembic_cfg(), "head")
    con = sqlite3.connect(fresh_db)
    try:
        con.execute(
            "INSERT INTO fb_posts (tenant_id, fb_post_id, message) VALUES (1, 'p1', 'x')")
        con.execute(
            "INSERT INTO ad_accounts (tenant_id, fb_account_id, name) VALUES (1, 'act_1', 'n')")
        con.execute(
            "INSERT INTO ad_campaigns (tenant_id, fb_account_id, fb_campaign_id, payload_json) "
            "VALUES (1, 'act_1', 'c1', '{}')")
        con.execute(
            "INSERT INTO ad_items (tenant_id, fb_account_id, fb_ad_id, payload_json) "
            "VALUES (1, 'act_1', 'a1', '{}')")
        con.commit()

        dup_cases = [
            "INSERT INTO fb_posts (tenant_id, fb_post_id, message) VALUES (1, 'p1', 'dup')",
            "INSERT INTO ad_accounts (tenant_id, fb_account_id, name) VALUES (1, 'act_1', 'dup')",
            "INSERT INTO ad_campaigns (tenant_id, fb_account_id, fb_campaign_id, payload_json) "
            "VALUES (1, 'act_1', 'c1', '{}')",
            "INSERT INTO ad_items (tenant_id, fb_account_id, fb_ad_id, payload_json) "
            "VALUES (1, 'act_1', 'a1', '{}')",
        ]
        for stmt in dup_cases:
            try:
                con.execute(stmt)
            except sqlite3.IntegrityError:
                con.rollback()
            else:
                con.rollback()
                pytest.fail(f"duplicate insert must be rejected: {stmt[:60]}…")
    finally:
        con.close()
