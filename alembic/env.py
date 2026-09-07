import asyncio
import os
import sys
from os.path import abspath, dirname, join

# Bypass config.py module-level guards (SECRET_KEY/CRON_SECRET checks)
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "alembic-runner")

# Add fb_dashboard to sys.path so imports work
# NOTE: NOT inserting _project_root — its alembic/ dir shadows pip's alembic package
_project_root = dirname(dirname(abspath(__file__)))
sys.path.insert(0, join(_project_root, 'fb_dashboard'))

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

from config import settings
from models import Base

target_metadata = Base.metadata
config = context.config


def run_migrations_offline():
    """Run migrations in 'offline' mode (just emit SQL to a string)."""
    url = settings.async_database_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    """Create an async engine on the configured URL and run migrations.

    v14-E3 (D7-05): the engine construction now MIRRORS fb_dashboard/database.py
    exactly (SSL context for postgresql+asyncpg / Neon, connect_args, pool
    class). The old bare ``create_async_engine(url)`` had no SSL and no
    connect_args — an ``alembic upgrade`` against Neon (which refuses
    plaintext) failed, and startup.py swallowed the exception with a warning
    → the chain silently stopped while deploys looked green. Keep this in
    sync with database.py when that file changes.
    """
    url = settings.async_database_url

    # ── mirror of database.py (pool selection) ──────────────────────────
    import os

    _is_vercel = bool(os.getenv("VERCEL"))
    _db_url = settings.DATABASE_POOLED_URL or settings.DATABASE_URL or ""
    _is_pg = _db_url.startswith("postgresql")
    _pool_args: dict = {"pool_pre_ping": True, "pool_recycle": 300}
    if _is_vercel or _is_pg:
        _pool_args = {"poolclass": pool.NullPool}
    if ":memory:" in (url or "") or os.getenv("SMARTBOT_TEST_POOL") == "static":
        _pool_args = {"poolclass": pool.StaticPool}

    # ── mirror of database.py (SSL + asyncpg connect_args) ──────────────
    _connect_args: dict = {}
    if url.startswith("postgresql"):
        _connect_args = {"timeout": 15, "statement_cache_size": 0}
        if settings.db_require_ssl:
            import ssl
            # SECURITY (2026-09-05): full certificate verification — Neon
            # presents publicly-trusted (Let's Encrypt) certs. Escape hatch:
            # DB_SSL_VERIFY=false restores no-verification (emergencies).
            if os.getenv("DB_SSL_VERIFY", "true").lower() not in ("false", "0", "no"):
                _ctx = ssl.create_default_context()
            else:
                _ctx = ssl.create_default_context()
                _ctx.check_hostname = False
                _ctx.verify_mode = ssl.CERT_NONE
            _connect_args["ssl"] = _ctx

    connectable = create_async_engine(
        url,
        echo=False,
        connect_args=_connect_args,
        **_pool_args,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online():
    """Run migrations in 'online' mode (connect to the actual database)."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
