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
exceptions.

Documented exceptions (v12-E3.7 recount — was 6 in the v11 report):
  * ``/healthz``  — PERMANENT infra exemption (E2.13): uptime monitors and
                    Vercel probes parse its literal ``{"success", "data"}``
                    JSONResponse shape; it is machine contract, never rendered.
  * ``/api/analytics/export?format=json`` (routers/analytics.py) — machine
                    contract: a raw JSON array consumed as a downloadable
                    export artifact (zero UI consumers; v13-D7 audit). Never
                    rendered by the frontend; keep raw JSONResponse here.
  * Telegram webhook returns (``{"ok": true}``) — the Telegram Bot API
                    contract (app/telegram.py), not a browser-facing endpoint.
The other five former exceptions (the extended envelopes: ``/api/me``
``authenticated`` flag, marketing ``total`` shape, onboarding ×3
test-connection shapes) were unified to ``ok()`` in v12 (E2.10/E2.11/E2.12) —
the frontend consumers were updated in the same round, so no extended
envelope may be introduced again without a new documented reason.
"""

from typing import Any


def ok(data: Any = None) -> dict:
    """Envelope a successful payload."""
    return {"success": True, "data": data}


def fail(error: str, data: Any = None) -> dict:
    """Envelope a business-level failure (HTTP 200 by design)."""
    return {"success": False, "data": data, "error": error}


__all__ = ["fail", "ok"]
