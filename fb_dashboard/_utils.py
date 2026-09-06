from __future__ import annotations

from datetime import UTC, datetime


def utcnow() -> datetime:
    """Return UTC-naive datetime (compatible with SQLAlchemy/Postgres timestamp)."""
    return datetime.now(UTC).replace(tzinfo=None)


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


def app_version() -> str:
    """v6+ — single canonical version source: fb_dashboard/VERSION.

    Before this, the API reported THREE different strings (/api/health said
    "2.0.1-v5canary" while /healthz and /api/health/ready said "2.0.0" —
    a monitor could not tell what was actually deployed). Every endpoint
    now reads the same file at import time with a safe fallback.
    """
    from pathlib import Path

    try:
        vf = Path(__file__).resolve().parent / "VERSION"
        return vf.read_text(encoding="utf-8").strip() or "2.1.0"
    except Exception:
        return "2.1.0"
