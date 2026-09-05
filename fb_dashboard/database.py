from __future__ import annotations
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool, StaticPool
from config import settings

# Serverless-safe pool: NullPool for Neon/Postgres — avoids stale connection issues
_IS_VERCEL = bool(os.getenv("VERCEL"))
_db_url = settings.DATABASE_POOLED_URL or settings.DATABASE_URL or ""
_is_pg = _db_url.startswith("postgresql")
_pool_args: dict = {"pool_pre_ping": True, "pool_recycle": 300}
if _IS_VERCEL or _is_pg:
    _pool_args = {"poolclass": NullPool}
# v4 (test infra): a :memory: SQLite DB exists PER CONNECTION — with a queue
# pool, a second concurrent connection sees a fresh EMPTY database (the
# flaky "no such table" mid-suite failures). StaticPool pins exactly ONE
# shared connection, the canonical SQLAlchemy recipe for in-memory testing.
# SMARTBOT_TEST_POOL=static (set by conftest) extends the same single-
# connection guarantee to the session temp FILE, avoiding "database is
# locked" under pytest-asyncio's per-test event loops. Never set in prod.
if ":memory:" in (settings.async_database_url or "") or os.getenv("SMARTBOT_TEST_POOL") == "static":
    _pool_args = {"poolclass": StaticPool}

# asyncpg needs an explicit ssl= object — query string sslmode= is stripped
# from the URL by config.async_database_url. Build a proper SSLContext only
# when production/Neon is detected.
_connect_args: dict = {}
if _is_pg:
    _connect_args = {"timeout": 15, "statement_cache_size": 0}
    if settings.db_require_ssl:
        import ssl
        # SECURITY (2026-09-05): full certificate verification (was:
        # check_hostname=False + CERT_NONE — MITM between Vercel and Neon was
        # possible). Neon presents publicly-trusted (Let's Encrypt) certs, so
        # the default context verifies fine. Escape hatch for emergencies:
        # DB_SSL_VERIFY=false restores the old behaviour.
        if os.getenv("DB_SSL_VERIFY", "true").lower() not in ("false", "0", "no"):
            _ctx = ssl.create_default_context()
        else:
            _ctx = ssl.create_default_context()
            _ctx.check_hostname = False
            _ctx.verify_mode = ssl.CERT_NONE
        _connect_args["ssl"] = _ctx

engine = create_async_engine(
    settings.async_database_url,
    echo=False,
    connect_args=_connect_args,
    **_pool_args,
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
