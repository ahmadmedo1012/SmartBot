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
import asyncio
import os
import sys
import tempfile
from pathlib import Path

# ── 1. import path: fb_dashboard package root ────────────────────────
_FB_DIR = str(Path(__file__).resolve().parent / "fb_dashboard")
if _FB_DIR not in sys.path:
    sys.path.insert(0, _FB_DIR)

# ── 2. hermetic environment (v5 §0) ───────────────────────────────────
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
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
    # boundary. Uses a short-lived dedicated loop (sync fixture context;
    # aiosqlite binds each operation to the running loop).
    try:
        from sqlalchemy import delete as _sa_delete
        from models import RateLimitEntry
        from database import AsyncSessionLocal as _ASL

        async def _wipe():
            async with _ASL() as db:
                await db.execute(_sa_delete(RateLimitEntry))
                await db.commit()

        _loop = asyncio.new_event_loop()
        try:
            _loop.run_until_complete(_wipe())
        finally:
            _loop.close()
    except Exception:
        pass
    yield
