from __future__ import annotations

"""Exception handlers extracted from runner.py (v11-A1 decomposition).

Registered in runner.py via ``app.add_exception_handler`` — identical to the
old ``@app.exception_handler`` decorators.
"""

import logging

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("fb-api")


# ponytail: friendly 422 → readable Arabic message
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    msgs = []
    for e in errors:
        field = ".".join(str(x) for x in e.get("loc", []))
        msgs.append(f"الحقل '{field}' مطلوب")
    return JSONResponse(status_code=422, content={"detail": "؛ ".join(msgs) or "بيانات غير صالحة"})


# ponytail: catch-all 500 — log full traceback server-side, return generic message
async def global_500_handler(request: Request, exc: Exception):
    import traceback
    # v12-E3.2 — rid in the traceback line: request_logging_middleware binds
    # request.state.request_id (the same id echoed in the X-Request-Id response
    # header and the rid= access log), so one grep for a user-reported id now
    # hits this traceback too (the getattr pattern is _observability-safe:
    # state may lack the attr when the request never reached that middleware).
    rid = getattr(request.state, "request_id", "-")
    log.error(f"Unhandled 500 | {request.method} {request.url.path} | rid={rid} | {traceback.format_exc()}")
    # v6 §C — Sentry capture + critical Telegram alert (never raises;
    # cooldown-guarded so an error storm sends one alert, not hundreds)
    from _observability import report_critical
    await report_critical(request, exc)
    return JSONResponse(status_code=500, content={"detail": "حدث خطأ داخلي — الرجاء المحاولة لاحقاً"})
