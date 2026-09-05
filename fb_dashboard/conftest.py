from __future__ import annotations
"""pytest config: inject dummy env vars + asyncio mode so tests can import.

v4 (test infra): a :memory: SQLite DB lives PER CONNECTION and is bound to
the event loop that created it — with pytest-asyncio giving each test its
own loop, mid-suite connections could land on a fresh EMPTY database (the
flaky "no such table" failures, same class as the flaky cron test from the
v2 session). A session-scoped TEMP FILE keeps the schema across loops and
connections, deterministically.
"""
import os
import tempfile

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
os.environ.setdefault("DEBUG", "True")

if not os.environ.get("DATABASE_URL"):
    _fd, _path = tempfile.mkstemp(prefix="smartbot_test_", suffix=".db")
    os.close(_fd)
    os.unlink(_path)  # let SQLAlchemy create it fresh
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_path}"
    # Single shared connection: no cross-connection locking, schema persists
    # in the file even if the connection is recycled across event loops.
    os.environ["SMARTBOT_TEST_POOL"] = "static"
