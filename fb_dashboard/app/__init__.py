"""SmartBot FastAPI application package (v11-A1 decomposition).

Extracted from the former 1298-line ``runner.py`` monolith, one concern per
module:

  startup.py    — lifespan + DB seeding
  middleware.py — HTTP middlewares (dedup, rate limit, CSRF, logging, cache, security)
  errors.py     — exception handlers (422 validation, catch-all 500)
  telegram.py   — Telegram payment webhook + background bot loop
  webhooks.py   — Facebook webhook verify/receive + event processing
  spa.py        — SPA index serving + route-table catch-alls (404/405 contract)
  ws.py         — WebSocket + SSE real-time endpoints
  stubs.py      — Vercel Analytics no-op stubs

``runner.py`` stays the composition root: it builds ``app = FastAPI(...)`` and
registers routes/middleware in the exact order the monolith used. Import this
package's members via ``runner`` (the stable public surface) or directly.
"""
