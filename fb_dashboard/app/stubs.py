from __future__ import annotations

"""Vercel Analytics no-op stubs (v11-A1 extraction).

The Next.js PRODUCTION build injects <script src="/_vercel/insights/script.js">
and /_vercel/speed-insights/script.js. On Vercel these are platform-served;
in local/E2E single-server mode they previously 404'd as text/html, which
browsers refuse to execute ("strict MIME type checking") — a console error
on EVERY dashboard page. Serve a valid no-op JS stub instead.

Registered in runner.py on BOTH paths (include_in_schema=False).
"""

from fastapi.responses import PlainTextResponse


async def _vercel_analytics_stub():
    return PlainTextResponse("/* no-op outside Vercel */", media_type="application/javascript")
