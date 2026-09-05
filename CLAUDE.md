# SmartBot — Governance & Architecture

---

# Engineering Rules (قوانين هندسية صارمة)

These rules are globally active (see `/home/ahmed/.claude/CLAUDE.md`). Reinforced here for project context:

1. **Deep Analysis** — Full environment/requirement/code examination before any code.
2. **Precise Planning** — Write/update plan before touching code. Plan first, code second.
3. **Continuous Testing** — 100% verification after every step. No skip, no partial.
4. **Multi-Agent Orchestration** — Decompose work, recruit sub-agents, verify adversarially.

*Cost and time irrelevant. Perfect error-free results are the only priority.*

---

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
- **`fb_dashboard/frontend/`** — App Router, `/api/*` proxied to backend
- Live at `https://bot.smart-link.ly`

### API Backend
- Live at `https://api.smart-link.ly`

## Strict Rules (do not violate)

### DO NOT
1. **Add routes to runner.py** — all new routes go in `routers/`. `runner.py` ONLY includes routers, middleware, lifespan, SPA catch-all, WebSocket, webhook handlers.
2. **Create duplicate entry points** — `api/bot.py` and `api/public.py` are deleted. Only `api/index.py` exists.
3. **Add dead code** — no Vite/SPA remnants, no unconnected API files.
4. **Commit build artifacts** — `.next/`, `tsconfig.tsbuildinfo` in .gitignore and NOT tracked.
5. **Return raw dicts from any router** (latest_plan.md Track A): every endpoint MUST return `{"success": bool, "data": ..., "error"?: str}` via `fb_dashboard/_responses.py` (`ok()` / `fail()`). HTTP transport failures use `HTTPException`. Gate: `grep -L '"success"' fb_dashboard/routers/*.py` returns nothing (every router carries the contract note).
6. **Parse API responses ad hoc in the frontend** (Track A.4): all `/api` fetches go through `src/lib/api.ts` — `unwrapApi(res)` / `apiJson()`. Never `.then(r => r.json())` then read fields directly; the envelope is unwrapped centrally and `success:false` throws `ApiError`.
7. **Hardcode colors/shadows in components** (Track D): every color lives in `globals.css` tokens (incl. `--confetti-*`, `--iphone-*`); icons come from `lucide-react` exclusively; every `<Input>` carries `dir="auto"`. See `docs/design-system.md` (incl. the documented `bg-white` exceptions table and the AI-cliché refuse list).
8. **Ship a mobile-invisible dashboard** (Track F): `MobileBottomNav` must stay wired in `DashboardShell` (`md:hidden`) — nav data is the single exported `defaultNavSections` in `AdminSidebar`. Any new sidebar section MUST be added there (one source, both renders).
9. **Draw charts with manual divs** (Track E): use `src/components/charts/` (recharts wrappers) — no `<div style={{height}}>` bar charts.
10. **Import `facebook_engine` from live app code** (Track G): the MCP engine is ISOLATED until staging parity + owner approval replace `fb_client.py`. A test enforces zero live imports. The `mcp` package is standalone-only (never imported at app runtime).
11. **Use `json:` in Playwright APIRequestContext calls** — this Playwright version silently drops the option (POST arrives with no body). Use `data: {...}` (objects serialize as JSON automatically).

### DO
1. Add new routers in `fb_dashboard/routers/` using `APIRouter(prefix="", tags=["name"])` + `ok()/fail()` envelope.
2. Import shared state from `_services` (fb, engines, helpers) — never re-create.
3. Register new routers in `runner.py` with `app.include_router(...)`.
4. Keep .gitignore up to date — exclude build artifacts, env files, test outputs.
5. Add per-page backend proof to `test_track_e_pages_gate.py` (PAGE_API_MAP) when a page gets a new API dependency.
6. Run the E2E gates before shipping UI changes: `e2e/journey.spec.ts` (full customer journey) + `e2e/mobile-nav.spec.ts` (375px) — server + `scripts/sync_next_static.py` first.

## Deployment
- Vercel (two projects linked to same repo):
  - **smart-bot-api** — serves `api/index.py` at `api.smart-link.ly`
  - **smart-bot-frontend** — serves Next.js at `bot.smart-link.ly`, proxies `/api/*` to API project
- `vercel.json` defines `api/index.py` as sole function entry.
- `.vercel/project.json` has project ID for `smart-bot-api`.
- Local single-server mode: `python -m uvicorn runner:app --app-dir fb_dashboard --port 8000` serves API + the built frontend from `fb_dashboard/static/` (sync with `scripts/sync_next_static.py` after `npm run build`).

## Governing plan
`latest_plan.md` (2026-09-03) is the current source of truth. Delivery evidence: `docs/master-plan-2026-09-03-delivery-report.md`. Historical plans live in `docs/plans/` + `docs/history/` (superseded).
