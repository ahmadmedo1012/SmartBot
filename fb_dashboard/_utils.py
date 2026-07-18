from __future__ import annotations
from datetime import datetime, timezone

def utcnow() -> datetime:
    """Return UTC-naive datetime (compatible with SQLAlchemy/Postgres timestamp)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
