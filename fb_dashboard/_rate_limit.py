"""DB-backed rate limiter — works across Vercel serverless instances."""
from datetime import datetime, timedelta
from sqlalchemy import select, func, delete
from models import RateLimitEntry


async def check_rate_limit(db, key: str, max_attempts: int = 10, window_seconds: int = 60) -> bool:
    """Returns True if within limit, False if exceeded."""
    now = datetime.utcnow()
    window_start = now - timedelta(seconds=window_seconds)

    # cleanup stale entries for this key
    await db.execute(
        delete(RateLimitEntry).where(
            RateLimitEntry.key == key,
            RateLimitEntry.window_end <= now,
        )
    )

    # record attempt
    db.add(RateLimitEntry(key=key, window_end=now + timedelta(seconds=window_seconds)))
    await db.flush()

    # count in current window
    count = await db.scalar(
        select(func.count(RateLimitEntry.id)).where(
            RateLimitEntry.key == key,
            RateLimitEntry.window_end > now,
        )
    ) or 0

    return count <= max_attempts
