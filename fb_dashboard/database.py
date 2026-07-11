import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool
from config import settings

# Serverless-safe pool: NullPool for Neon/Postgres — avoids stale connection issues
_IS_VERCEL = bool(os.getenv("VERCEL"))
_is_pg = settings.DATABASE_URL.startswith("postgresql")
_pool_args = {"pool_pre_ping": True, "pool_recycle": 300}
if _IS_VERCEL or _is_pg:
    _pool_args = {"poolclass": NullPool}

engine = create_async_engine(
    settings.async_database_url,
    echo=False,
    connect_args={"timeout": 15} if _is_pg else {},
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
