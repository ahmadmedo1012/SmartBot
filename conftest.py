from __future__ import annotations

"""Root pytest conftest — v5 §1 repo organization.

Test files live in ``tests/`` (moved out of the ``fb_dashboard/`` package root
in the v5 organization round); the application code stays flat inside
``fb_dashboard/``. This conftest makes that layout work:

1. puts ``fb_dashboard/`` on ``sys.path`` BEFORE any test module imports
   ``from database import ...`` (pytest's prepend import mode only adds the
   test file's own directory, which is now ``tests/``);
2. forces a hermetic test environment (v5 §0): temp-file SQLite + static
   pool, never trusting the host's DATABASE_URL / DATABASE_POOLED_URL —
   the exact pollution that caused 15 collection errors and 6 mid-suite
   "no such table" failures;
3. gives every test FILE its own fresh temp-file database and resets
   process-global state (api_cache store, cached bot engines, SSE
   registry, loop-bound httpx client, AI singletons) at each module
   boundary — the suite is green in ANY file order (forward / reverse /
   random; r134: the per-module DB removed the shared-DB row leaks the
   old wipes only patched over).
"""
import os
import sys
import tempfile
from pathlib import Path

# ── 1. import path: fb_dashboard package root ────────────────────────
_FB_DIR = str(Path(__file__).resolve().parent / "fb_dashboard")
if _FB_DIR not in sys.path:
    sys.path.insert(0, _FB_DIR)

# ── 2. hermetic environment (v5 §0) ───────────────────────────────────
# FORCE the canonical test values — setdefault is NOT enough: a CI job or
# host env that sets its own CRON_SECRET/SECRET_KEY silently changes app
# behavior while tests hardcode the canonical tokens (the live CI failure
# of 2026-09-06: workflow set CRON_SECRET=ci-cron-secret → heartbeat tests
# 403). A hermetic suite pins its world.
os.environ["SECRET_KEY"] = "test-secret-key-not-for-prod"
os.environ["CRON_SECRET"] = "test-cron-secret"
os.environ["FB_ACCESS_TOKEN"] = "test-token"
os.environ["FB_PAGE_ID"] = "0"
# v6+ — Sentry OFF for the whole suite: the app now ships a committed
# DEFAULT_SENTRY_DSN (public send-only key) so "unset" would mean ACTIVE
# and app-startup tests would emit real events. A hermetic suite never
# touches the network; tests that exercise the default path use a fake
# sentry_sdk module (tests/test_v6_observability.py §C1).
os.environ["SENTRY_DSN"] = "off"
os.environ["SENTRY_BOOT_CANARY"] = "off"
os.environ.setdefault("FACEBOOK_APP_SECRET", "test-app-secret")
os.environ.setdefault("DEBUG", "True")
os.environ.setdefault("FERNET_KEY", "")  # not required in DEBUG mode
# v21 (T4-a): the piggyback-beat middleware (app/piggyback.py) activates on
# the VERCEL env marker — a CI job or host env that sets it would flip the
# beat ON for every authenticated test request in the suite. A hermetic
# suite pins its world: VERCEL is forced OFF (the dedicated piggyback tests
# patch the module flag directly).
os.environ.pop("VERCEL", None)

# FORCE the test database — ignore host pollution (v5 §0).
# Root cause found live: a sandbox `DATABASE_URL=file:/...` leaked into
# pytest, (1) made the old "if not DATABASE_URL" guard skip its own setup →
# collection crashed with "Could not parse SQLAlchemy URL", and (2) an
# explicit `:memory:` override bypassed the temp-FILE recipe → 6 mid-suite
# "no such table" failures. A hermetic suite never inherits the host's DB.
_fd, _path = tempfile.mkstemp(prefix="smartbot_test_", suffix=".db")
os.close(_fd)
os.unlink(_path)  # let SQLAlchemy create it fresh
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_path}"
os.environ["DATABASE_POOLED_URL"] = ""  # never inherit a pooled prod URL
# Single shared connection: no cross-connection locking, schema persists
# in the file even if the connection is recycled across event loops.
os.environ["SMARTBOT_TEST_POOL"] = "static"
# v11: the whole suite shares ONE client IP — the per-IP mutate limiter
# (30/60s in prod) would make later files nondeterministically 429.
# Route-level limits (login/topup 429 tests) use the overridden get_db
# (fresh per-test DB) and stay fully testable. Middleware cap: off.
os.environ["SMARTBOT_MUTATE_RATE_LIMIT"] = "100000"
# r134: this PRISTINE engine only exists so ``import database`` has a valid
# URL to build at collection time — the per-module fixture below rebinds
# it to a fresh temp-file DB before any test runs. Keep the URL hermetic
# regardless (an imported helper must never touch the host's DB).
import pytest  # noqa: E402  (env must be forced before app imports)


# ── 3a. per-test engine-connection disposal (2026-10-07) ──────────────
# pytest-asyncio (auto mode) runs EVERY test on a fresh event loop, but the
# shared StaticPool engine holds ONE aiosqlite connection bound to the loop
# it was first created on — every later test died with SQLAlchemy's
# "Lock ... is bound to a different event loop" (26 red tests, CI red since
# 2026-09-05). Disposing the engine after each test closes that loop-bound
# connection; the next test creates a fresh one ON ITS OWN LOOP. The temp
# FILE database keeps all rows across connections, so within-file
# build-on-each-other semantics are preserved. Production is unaffected
# (fixture never runs outside pytest). Cheap: one sqlite reconnect per test.
@pytest.fixture(autouse=True)
async def _dispose_engine_per_test():
    yield
    # r136 (CI-red root cause, pre-existing since r133): pytest-asyncio closes
    # the loop right after each test, but spawn()ed fire-and-forget tasks
    # (_track_event's analytics _write is THE hot one — it opens its OWN
    # AsyncSessionLocal session and INSERTs) can still be mid-flight. When the
    # loop dies under them, the aiosqlite write transaction is never committed
    # nor returned → the temp-FILE DB stays write-locked → the NEXT test's
    # INSERT exhausts busy_timeout=5000 → "database is locked" → message
    # "not stored" → the cooldown test's replied=False (test_radical_v4:331,
    # red on slow CI runners 4/4, green on fast local boxes only by timing
    # luck). Drain CURRENT-loop tasks to completion (capped) BEFORE the
    # dispose; zombie tasks from earlier (closed) loops can never run again —
    # cancel + drop the strong registry ref so GC reclaims them.
    try:
        import asyncio as _aio

        from _async import _bg_tasks

        loop = _aio.get_running_loop()
        live = [t for t in list(_bg_tasks) if not t.done()]
        if live:
            mine = [t for t in live if t.get_loop() is loop]
            for t in live:
                if t.get_loop() is not loop:
                    t.cancel()
                    _bg_tasks.discard(t)
            if mine:
                _done, pending = await _aio.wait(mine, timeout=1)
                for t in pending:
                    t.cancel()
    except Exception:
        pass
    try:
        from database import engine

        await engine.dispose()
    except Exception:
        pass


# ── 3. cross-file global-state isolation (v5 §0; r134 per-module DB) ──
# r134 (R134-W2-SB-PY #9 — bounded, conftest-level ONLY): each test FILE now
# gets a FRESH temp-file SQLite (generalizing the in-tree broadcast_race_db
# recipe, tests/conftest.py:59-100, to the whole suite). Cross-module row
# leaks are structurally gone — the per-file uuid-prefix self-defense and
# the sync rate-limit wipe the shared DB forced are retired with it. The 25
# module-scoped fixture files are NOT migrated this round (documented debt);
# this fixture only rebinds what the module boundary already owned.


def reset_app_state():
    """One consolidated reset of every process-global the app caches.

    Was 5 inline wipes scattered through the module-boundary fixture
    (v5 §0: api_cache/_services/ws_manager; r133: loop-bound fb_client._http
    + the sync rate-limit DELETE that per-module DBs made obsolete). r134
    folds them into ONE function and extends the reset to the AI
    singletons: refresh_ai_from_db rebuilds ai_service._openai/_google and
    invalidates agent_brain._ai from SystemConfig, so a module that seeds
    AI keys must not leave its clients behind for later modules (None =
    the documented "rebuild lazily" state for all three).
    """
    try:
        from api_cache import _cache_store
        _cache_store.clear()
    except Exception:
        pass
    try:
        from _services import reset_bot_engines
        reset_bot_engines()
    except Exception:
        pass
    try:
        from ws_manager import manager as _ws_manager
        _ws_manager.active.clear()
    except Exception:
        pass
    # r133 (order-dependence, exposed by CI D2 timeout fix): fb_client's
    # module-global httpx.AsyncClient is created ONCE on the first test's
    # event loop and reused by every later module. pytest-asyncio (auto
    # mode) gives each test a fresh loop, so after the creating loop closes,
    # every later module's FB calls die with "Event loop is closed" → the
    # messenger flow degrades → order-dependent failures. Abandon the stale
    # client at each module boundary (its transport is on a dead loop —
    # nothing to close); the next caller re-creates it on ITS OWN loop via
    # _ensure_client().
    try:
        import fb_client as _fb_client

        _fb_client._http = None
    except Exception:
        pass
    # r134: AI singletons — same boundary contract as the engines above.
    try:
        import ai_service as _ai_service

        _ai_service._openai = None
        _ai_service._google = None
    except Exception:
        pass
    try:
        import agent_brain as _agent_brain

        _agent_brain._ai = None
    except Exception:
        pass


def _rebind_db_references(old_pair, new_pair) -> list:
    """Repoint every loaded module that bound the old (engine, sessionmaker)
    pair — by IDENTITY, so import-time aliases (``from database import
    engine as db_engine``) are caught too — to the new pair.

    Deferred imports inside functions resolve ``database.*`` dynamically and
    pick the rebind up for free; this scan covers the module-level
    ``from database import ...`` bindings (app modules AND test modules).
    Returns the touched [(module, name, old_value)] list for exact restore.
    """
    import sys

    touched = []
    for mod in list(sys.modules.values()):
        d = getattr(mod, "__dict__", None)
        if not isinstance(d, dict):
            continue
        for k, v in list(d.items()):
            if v is old_pair[0] or v is old_pair[1]:
                d[k] = new_pair[0] if v is old_pair[0] else new_pair[1]
                touched.append((mod, k, v))
    return touched


@pytest.fixture(autouse=True, scope="module")
def _per_module_db():
    """Fresh temp-file SQLite per test FILE + reset_app_state() (r134 #9).

    Why: the whole suite shared ONE StaticPool temp-file DB — every module's
    rows leaked into the next file's queries (order-dependent failures; the
    r133-documented debt). Now each module starts from an empty database:
    cross-file leaks are structurally impossible and the old defensive wipes
    (sync sqlite3 rate-limit DELETE, uuid prefixes in assertions) retire.

    Mechanics (conftest-level only — no test-file changes):
      * the schema is created with the SYNC sqlite driver, so setup touches
        no event loop; the async engine connects lazily on each test's own
        loop (the per-test dispose fixture 3a below keeps working — it
        imports database.engine at run time and gets THIS module's engine);
      * database.engine/AsyncSessionLocal + every identity-bound reference
        in loaded modules are rebound for the module's lifetime and exactly
        restored at teardown;
      * the busy_timeout PRAGMA mirrors database.py's SQLite listener
        (r133: writers wait ≤5s instead of failing on cross-transaction
        contention).
    """
    from models import Base
    from sqlalchemy import create_engine as _sync_create_engine
    from sqlalchemy import event as _sa_event
    from sqlalchemy.ext.asyncio import (
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )
    from sqlalchemy.pool import StaticPool as _StaticPool

    fd, path = tempfile.mkstemp(prefix="smartbot_mod_", suffix=".db")
    os.close(fd)
    os.unlink(path)  # let the engines create it fresh

    # sync schema build — loop-free, deterministic
    _sync = _sync_create_engine(f"sqlite:///{path}")
    try:
        Base.metadata.create_all(_sync)
    finally:
        _sync.dispose()

    new_engine = create_async_engine(
        f"sqlite+aiosqlite:///{path}",
        connect_args={"timeout": 30},
        poolclass=_StaticPool,
    )

    @_sa_event.listens_for(new_engine.sync_engine, "connect")
    def _sqlite_lock_tolerant(dbapi_conn, _record):
        cursor = dbapi_conn.cursor()
        try:
            cursor.execute("PRAGMA busy_timeout=5000")
        finally:
            cursor.close()

    new_sf = async_sessionmaker(new_engine, class_=AsyncSession, expire_on_commit=False)

    import database as _db_mod

    _orig_pair = (_db_mod.engine, _db_mod.AsyncSessionLocal)
    _new_pair = (new_engine, new_sf)
    _touched = _rebind_db_references(_orig_pair, _new_pair)

    reset_app_state()
    try:
        yield
    finally:
        # exact restore of every recorded binding…
        for mod, k, v in reversed(_touched):
            setattr(mod, k, v)
        # …plus anything imported DURING the module that bound the pair
        _rebind_db_references(_new_pair, _orig_pair)
        try:
            import asyncio as _asyncio

            # best-effort: fixture 3a already disposed the connection after
            # the last test — this only releases the (usually empty) pool
            _asyncio.run(new_engine.dispose())
        except Exception:
            pass
        try:
            os.unlink(path)
        except OSError:
            pass
