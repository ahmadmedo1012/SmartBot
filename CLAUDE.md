# SmartBot — Governance & Architecture

## Project Identity
SmartBot: Facebook engagement automation platform (FastAPI + Next.js 16).  
Reference architecture: [Smart-Menu](https://github.com/ahmadmedo1012/Smart-Menu) — same cleanliness principles, different backend language.

## Single Entry Points

### Backend (Python/FastAPI)
- **`api/index.py`** — Vercel entrypoint, imports `fb_dashboard.runner.app`
- **`fb_dashboard/runner.py`** — app factory: lifespan, middleware, router includes, SPA catch-all, WebSocket, webhook
- **`fb_dashboard/routers/`** — ALL business logic routes. Never add `@app.get/post/...` in `runner.py`.
- **`fb_dashboard/_services.py`** — shared state: lazy engine proxies, FB client, helpers (get_ai, _track_event, _get_trend_data)

### Frontend (Next.js 16)
- **`fb_dashboard/frontend/`** — App Router, `/api/*` proxied to backend via `next.config.ts`
- Live at `https://bot.smart-link.ly`

### API Backend
- Live at `https://api.smart-link.ly`

## Strict Rules (do not violate)

### DO NOT
1. **Add routes to runner.py** — all new routes go in `routers/`. `runner.py` ONLY includes routers, middleware, lifespan, SPA catch-all, WebSocket, webhook handlers.
2. **Create duplicate entry points** — `api/bot.py` and `api/public.py` are deleted. Only `api/index.py` exists.
3. **Add dead code** — no Vite/SPA remnants, no unconnected API files.
4. **Commit build artifacts** — `.next/`, `tsconfig.tsbuildinfo` in .gitignore and NOT tracked.

### DO
1. Add new routers in `fb_dashboard/routers/` using `APIRouter(prefix="", tags=["name"])`
2. Import shared state from `_services` (fb, engines, helpers) — never re-create.
3. Register new routers in `runner.py` with `app.include_router(...)`.
4. Keep .gitignore up to date — exclude build artifacts, env files, test outputs.

## Deployment
- Vercel (two projects linked to same repo):
  - **smart-bot-api** — serves `api/index.py` at `api.smart-link.ly`
  - **smart-bot-frontend** — serves Next.js at `bot.smart-link.ly`, proxies `/api/*` to API project
- `vercel.json` defines `api/index.py` as sole function entry.
- `.vercel/project.json` has project ID for `smart-bot-api`.
