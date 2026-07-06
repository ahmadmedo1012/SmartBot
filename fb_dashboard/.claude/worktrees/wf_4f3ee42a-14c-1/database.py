from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from config import settings

engine = create_async_engine(
    settings.async_database_url,
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_timeout=30,
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
