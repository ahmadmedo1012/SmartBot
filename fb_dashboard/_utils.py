from __future__ import annotations
from datetime import datetime, timezone


def utcnow() -> datetime:
    """Return UTC-naive datetime (compatible with SQLAlchemy/Postgres timestamp)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso_z(dt: datetime | None) -> str | None:
    """Serialize a naive-UTC datetime with an explicit Z suffix.

    The API convention is naive-UTC columns; plain .isoformat() emits no zone
    and JS `new Date(...)` then parses it as LOCAL time — every displayed
    timestamp was off by the viewer's UTC offset (Libya: 2h). Appending Z
    makes the string an unambiguous UTC instant.
    """
    if dt is None:
        return None
    s = dt.isoformat()
    return s if (s.endswith("Z") or "+" in s[10:]) else s + "Z"
