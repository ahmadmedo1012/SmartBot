"""Unified API response contract — latest_plan.md Track A.

Every router MUST return ``{"success": bool, "data": ..., "error"?: str}``.
Central helpers so the contract lives in exactly one place:

- ``ok(data)``          → ``{"success": True, "data": data}``
- ``fail(msg, code)``   → ``{"success": False, "data": None, "error": msg}`` (HTTP 200,
                           business-level failure — the frontend ``unwrapApi`` throws on it)

HTTP-level failures keep using ``HTTPException`` (transport errors: 401/403/404/429…).
``fail()`` is for domain-level refusals the client should render as a message
(e.g. "اسم المستخدم موجود مسبقاً") rather than as a transport error.

Rule (CLAUDE.md / latest_plan.md §3 Track A): any NEW router imports these
helpers — raw dict/list returns are forbidden outside the documented
exceptions in docs/design-system-adjacent API docs.
"""

from typing import Any, Optional


def ok(data: Any = None) -> dict:
    """Envelope a successful payload."""
    return {"success": True, "data": data}


def fail(error: str, data: Any = None) -> dict:
    """Envelope a business-level failure (HTTP 200 by design)."""
    return {"success": False, "data": data, "error": error}


__all__ = ["ok", "fail"]
