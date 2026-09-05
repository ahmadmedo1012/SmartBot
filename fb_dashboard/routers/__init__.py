"""SmartBot routers package.

API response contract (latest_plan.md Track A): every endpoint in every
router MUST return the envelope ``{"success": bool, "data": ..., "error"?: str}``
via the central helpers in ``fb_dashboard/_responses.py`` (``ok`` / ``fail``).
HTTP-level failures use ``HTTPException``. The only exceptions are
byte-stream endpoints (CSV/PDF ``Response`` objects) — see
``analytics.py`` and ``reports_routes.py``.
"""
