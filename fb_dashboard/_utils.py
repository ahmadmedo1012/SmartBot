from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path


def private_upload_dir(category: str = "") -> Path:
    """v24-R3 (B2 H-1): directory for NON-public uploads — OUTSIDE ``/static``.

    Receipts (bank payment evidence) and agent images used to land under
    ``STATIC_DIR/uploads/…``, which runner.py mounts at ``/static`` with NO
    authentication: on single-server deployments anyone holding the URL could
    read payment receipts (PII — bank transfer evidence). The private root is
    deliberately outside that mount; the bytes are served only through
    authenticated routes (payments/approvals.py ``GET /api/payments/receipt/
    {id}`` resolves via routers/payments/bank.resolve_receipt_path).

    Location rules (evaluated lazily — env/VERCEL may be set after import):
      * ``SMARTBOT_PRIVATE_UPLOAD_DIR`` env override (ops knob);
      * Vercel: the function FS is read-only except /tmp → /tmp/smartbot-uploads
        (uploaders there embed ``data:`` URIs and never write anyway);
      * otherwise (single-server / local dev): a SIBLING of ``static/`` —
        ``fb_dashboard/data/uploads`` — writable next to the static export.

    TODO v24-R3 (for the orchestrator — file NOT owned by this agent):
    ``routers/ai.py`` agent-interpret uploads (agent_{token}.jpg, written to
    ``STATIC_DIR / "uploads"`` with a public ``/static/uploads/…`` URL on
    non-Vercel) should adopt this helper + a private marker to close the same
    exposure for agent images.
    """
    override = os.getenv("SMARTBOT_PRIVATE_UPLOAD_DIR", "").strip()
    if override:
        root = Path(override)
    elif os.getenv("VERCEL"):
        root = Path("/tmp/smartbot-uploads")
    else:
        root = Path(__file__).resolve().parent / "data" / "uploads"
    return root / category if category else root


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
