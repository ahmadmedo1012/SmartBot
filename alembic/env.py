import asyncio
import os
import sys
from os.path import abspath, dirname, join

# Bypass config.py module-level guards (SECRET_KEY/CRON_SECRET checks)
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "alembic-runner")

# Add fb_dashboard to sys.path so imports work
_project_root = dirname(dirname(abspath(__file__)))
sys.path.insert(0, join(_project_root, 'fb_dashboard'))
sys.path.insert(0, _project_root)

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
    """Create an async engine on the configured URL and run migrations."""
    connectable = create_async_engine(
        settings.async_database_url,
        poolclass=pool.NullPool,
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
