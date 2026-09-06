from __future__ import annotations

"""SPA index serving + route-table catch-alls (v11-A1 extraction).

Routes registered in runner.py: ``GET /`` (dashboard_page), ``GET /{path:path}``
(spa_catch_all) and the non-GET catch-all (unknown_method_catch_all) — the
latter two MUST stay the last registrations so real routes always win.
"""

import logging
from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse

log = logging.getLogger("fb-api")

# fb_dashboard/ — this module lives one level deeper than the old runner.py
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"

# ── SPA index.html: cached in memory, refreshed on VERSION change ──
_spa_html: str | None = None
_spa_mtime: float = 0


def _get_spa() -> str:
    global _spa_html, _spa_mtime
    static_index = STATIC_DIR / "index.html"
    html_path = TEMPLATES_DIR / "index.html"
    src = static_index if static_index.exists() else (html_path if html_path.exists() else None)
    if not src:
        return "<h1>SmartBot Dashboard</h1><p>Loading...</p>"
    try:
        mtime = src.stat().st_mtime
        if _spa_html is None or mtime > _spa_mtime:
            _spa_html = src.read_text(encoding="utf-8")
            _spa_mtime = mtime
    except Exception:
        pass
    return _spa_html or src.read_text(encoding="utf-8")


async def dashboard_page():
    return HTMLResponse(_get_spa())


async def spa_catch_all(path: str):
    # Don't catch API/system paths — let FastAPI handle or 404.
    # v10-D3 — these prefixes now answer with the unified {detail} JSON error
    # contract instead of an empty text/html body that the frontend's
    # ApiErrorBody parser cannot read (S2 deviation #3: empty 404 + English
    # 405). SPA page serving below is untouched.
    if path.startswith(("api/", "static/", "healthz", "webhook", "ws", "_next", "fonts")):
        return JSONResponse(status_code=404, content={"detail": "المسار غير موجود"})
    # Check if the Next.js static export has a page for this path
    path_page = STATIC_DIR / path / "index.html"
    if path_page.exists():
        return HTMLResponse(path_page.read_text(encoding="utf-8"))
    # Fallback: serve the root Next.js index.html (handles client-side routing)
    return HTMLResponse(_get_spa())


def _iter_real_routes(routes):
    """v10-D3 — flatten the route table, transparently descending into
    FastAPI's _IncludedRouter wrappers (include_router keeps them as single
    entries wrapping the original APIRouter) and yielding real routes only."""
    for r in routes:
        # skip the two catch-alls themselves (they match every path/method)
        if getattr(r, "path", None) == "/{path:path}" and getattr(r, "methods", None):
            continue
        included = getattr(r, "original_router", None)  # _IncludedRouter
        if included is not None:
            yield from _iter_real_routes(included.routes)
        else:
            yield r


def _route_table_lookup(request: Request) -> set[str] | None:
    """v10-D3 — route-table introspection for the non-GET catch-all.

    Returns the set of HTTP methods REAL routes serve at this path, or None
    when the path is unknown to the app. Lets us keep an informative 405
    (Arabic {detail} + Allow header) for wrong-method calls on REAL
    endpoints, while truly unknown paths answer 404 {detail} JSON."""
    allowed: set[str] = set()
    known = False
    # request.app is the FastAPI instance handling this request (the runner
    # app) — identical to the monolith's module-global `app`.
    for r in _iter_real_routes(request.app.routes):
        regex = getattr(r, "path_regex", None)
        if regex is not None and regex.match(request.url.path):
            known = True
            allowed |= set(getattr(r, "methods", None) or ())
    if not known:
        return None
    allowed.discard("HEAD")
    allowed.discard("OPTIONS")
    return allowed


async def unknown_method_catch_all(path: str, request: Request):
    """v10-D3 — unknown non-GET paths used to leak Starlette's English
    textual 405 ``{"detail": "Method Not Allowed"}`` (S2 deviation #3).

    Contract now (mirrors the rest of the app's Arabic {detail} errors):
      - unknown path + non-GET  → 404 {"detail": "المسار غير موجود"}
      - known path, wrong method → 405 {"detail": "..."} with Allow header

    Registered LAST: real routes always win (Starlette prefers a later FULL
    match over an earlier PARTIAL one), so no endpoint is shadowed."""
    allowed = _route_table_lookup(request)
    if allowed is None:
        return JSONResponse(status_code=404, content={"detail": "المسار غير موجود"})
    headers = {"Allow": ", ".join(sorted(allowed))} if allowed else None
    raise HTTPException(405, "الطريقة غير مسموح بها لهذا المسار", headers=headers)
