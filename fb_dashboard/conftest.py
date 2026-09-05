from __future__ import annotations
"""pytest config: inject dummy env vars + asyncio mode so tests can import.

v4 (test infra): a :memory: SQLite DB lives PER CONNECTION and is bound to
the event loop that created it — with pytest-asyncio giving each test its
own loop, mid-suite connections could land on a fresh EMPTY database (the
flaky "no such table" failures, same class as the flaky cron test from the
v2 session). A session-scoped TEMP FILE keeps the schema across loops and
connections, deterministically.

v5 (§0 hermetic): the suite now FORCES its own temp-file SQLite URL and
pool mode instead of trusting ambient env. Root cause found live: a sandbox
`DATABASE_URL=file:/home/z/my-project/db/custom.db` leaked into pytest,
(1) made conftest skip its own setup entirely ("if not DATABASE_URL") →
collection crashed with "Could not parse SQLAlchemy URL", and (2) when
overridden with `:memory:` from the CLI the designed temp-FILE recipe was
bypassed → 6 mid-suite "no such table" failures. A hermetic suite must
never inherit the host's DATABASE_URL / DATABASE_POOLED_URL.
"""
import os
import tempfile

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
os.environ.setdefault("DEBUG", "True")
os.environ.setdefault("FERNET_KEY", "")  # not required in DEBUG mode

# ── FORCE the test database — ignore host pollution (v5 §0) ──
_fd, _path = tempfile.mkstemp(prefix="smartbot_test_", suffix=".db")
os.close(_fd)
os.unlink(_path)  # let SQLAlchemy create it fresh
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_path}"
os.environ["DATABASE_POOLED_URL"] = ""  # never inherit a pooled prod URL
# Single shared connection: no cross-connection locking, schema persists
# in the file even if the connection is recycled across event loops.
os.environ["SMARTBOT_TEST_POOL"] = "static"


# ── v5 §0: cross-file global-state isolation ─────────────────────────
# The suite shares ONE temp-file DB for speed, so files that ran earlier can
# leave PROCESS-GLOBAL state behind (api_cache store, cached bot engines
# with 120s rule caches, SSE connection registry). Each test FILE must start
# from a clean process-global slate — module boundary = isolation boundary.
# (Within a file, tests may legitimately build on each other.)
import pytest


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
    # 429s — wipe the limiter table at the module boundary. Uses a short-lived
    # dedicated loop (sync fixture context, aiosqlite binds per-operation).
    try:
        from sqlalchemy import delete as _sa_delete
        from models import RateLimitEntry
        from database import AsyncSessionLocal as _ASL
        import asyncio as _asyncio

        async def _wipe():
            async with _ASL() as db:
                await db.execute(_sa_delete(RateLimitEntry))
                await db.commit()

        _loop = _asyncio.new_event_loop()
        try:
            _loop.run_until_complete(_wipe())
        finally:
            _loop.close()
    except Exception:
        pass
    yield
