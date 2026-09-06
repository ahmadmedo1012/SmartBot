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
3. resets process-global state at each module boundary (api_cache store,
   cached bot engines, SSE registry, DB-backed rate limiter) so the suite
   is green in ANY file order (forward / reverse / random).
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
_TEST_DB_FILE = _path  # for the synchronous limiter wipe below
# v11: the whole suite shares ONE client IP — the per-IP mutate limiter
# (30/60s in prod) would make later files nondeterministically 429
# (the middleware writes through the shared static-pool engine, whose
# aiosqlite connection is loop-bound — success varies with file order).
# Route-level limits (login/topup 429 tests) use the overridden get_db
# (fresh per-test DB) and stay fully testable. Middleware cap: off.
os.environ["SMARTBOT_MUTATE_RATE_LIMIT"] = "100000"

import pytest  # noqa: E402  (env must be forced before app imports)


# ── 3. cross-file global-state isolation (v5 §0) ──────────────────────
# The suite shares ONE temp-file DB for speed, so files that ran earlier can
# leave PROCESS-GLOBAL state behind (api_cache store, cached bot engines
# with 120s rule caches, SSE connection registry, DB rate-limit rows). Each
# test FILE must start from a clean process-global slate — the module
# boundary is the isolation boundary. (Within a file, tests may legitimately
# build on each other.)
@pytest.fixture(autouse=True, scope="module")
def _reset_process_global_state():
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
    # DB-backed rate limiter: all tests share one client host/IP, so login/
    # register attempts accumulate across files and later files would see
    # 429s in non-forward orders — wipe the limiter table at each module
    # boundary.
    # v11: the old wipe ran on a dedicated asyncio loop, but aiosqlite
    # binds each pooled connection to the loop it was created on — after
    # the first module used the engine, the dedicated-loop wipe failed
    # SILENTLY (swallowed except) and limiter rows survived module
    # boundaries (live failure: telegram + broadcast_sequence → the later
    # file's POSTs crossed the mutate-limit 30 → 429 → envelope assertions
    # KeyError). A synchronous sqlite3 DELETE on the temp FILE is loop-
    # independent and deterministic.
    try:
        import sqlite3 as _sqlite3

        _conn = _sqlite3.connect(_TEST_DB_FILE)
        try:
            _conn.execute("DELETE FROM rate_limit_entries")
            _conn.commit()
        finally:
            _conn.close()
    except Exception:
        pass
    yield
