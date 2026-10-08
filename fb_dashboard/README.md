# SmartBot

Facebook Messenger chatbot dashboard + bot engine. FastAPI + Next.js 16 + Telegram payment approvals.

> **Design system:** Madarek identity on every surface — web frontend
> (`frontend/`), static export (`static/`), mobile app, and PDF reports
> (bundled IBM Plex Sans Arabic TTFs in `fonts/` since v26):
> dark night/gold `#070B16`/`#E9B44C`, light cream/copper `#FBFAF9`/`#B57438`,
> IBM Plex Sans Arabic (self-hosted). Reference: `design-system/smartbot/MASTER.md`
> + the Madarek tokens (`madarek/frontend/src/styles/tokens.css`) as upstream SSOT.

## Quick Start

```bash
# Backend (run from the repo root — the module layout is flat)
pip install -r requirements.txt
cp .env.example .env
DEBUG=true uvicorn runner:app --app-dir fb_dashboard --port 8000  # or: python3 -m uvicorn runner:app --app-dir fb_dashboard

# Frontend (separate terminal)
cd fb_dashboard/frontend
npm install
npm run dev
```

Open http://localhost:3000 — Next.js dev server proxies `/api/*` to the backend on :8000.

## Architecture

```
api/index.py                 → Vercel entrypoint (routes to fb_dashboard.runner.app)
fb_dashboard/
  runner.py                  → FastAPI app factory (middleware + lifespan + router includes)
  bot.py                     → Bot engine (BotEngine, ReplyPipeline, RuleMatcher, CooldownManager)
  fb_client.py               → Facebook Graph API v22.0 client
  models.py                  → SQLAlchemy models (multi-tenant)
  database.py                → SQLAlchemy async engine (NullPool for Vercel)
  config.py                  → Settings from env vars (fail-fast in prod)
  telegram_bot.py            → Telegram admin notification + payment approval
  ws_manager.py              → WebSocket connection manager (tenant-scoped)
  event_bus.py               → Pub/sub event bus (tenant-filtered)
  monitor.py                 → Structured JSON logger
  _services.py               → Shared state (lazy engine proxies, FB client, helpers)
  routers/                   → APIRouter per domain (auth, payments, bot, webhooks, ...)
  fonts/                     → Bundled IBM Plex Sans Arabic TTFs (Regular+Bold) — PDF engine @font-face
  frontend/                  → Next.js 16 app (App Router, /api/* proxied to backend)
  static/                    → Synced Next.js static export — single-server mode (scripts/sync_next_static.py, Gate 4.5 freshness in CI)

vercel.json                  → Vercel config for smart-bot-api project
frontend/vercel.json         → Vercel config for smart-bot-frontend project (the real file — there is no root vercel-frontend.json)
alembic/                     → Database migrations (run: alembic upgrade head)
```

## Multi-Tenant

Every business table carries `tenant_id`. Queries are filtered by `current_user._tenant_id` (set by `AuthGuard` in `routers/auth.py`). Tenant 0 is the default legacy tenant — production data with no explicit tenant is reassigned there so isolation can be enforced without losing rows.

## Payment Flow

1. User subscribes → `SubscriptionPayment` created in DB (status=pending)
2. User transfers to provider wallet (Libyana/Madar/bank — numbers in `/api/config`)
3. User submits transfer reference + receipt upload
4. Telegram notification sent to admin
5. Admin taps approve on Telegram
6. Webhook handles callback → atomic `UPDATE ... WHERE status=pending`
7. Subscription activated

## Telegram Commands

- `/start` — get your Telegram ID for admin whitelist

## Environment Variables

See `.env.example` at the repo root for the full list. Required in production:
- `SECRET_KEY` (JWT signing)
- `FERNET_KEY` (encrypts FB tokens + 2FA secrets)
- `CRON_SECRET` (vercel.json cron auth)
- `FB_WEBHOOK_VERIFY_TOKEN` (Facebook webhook verify)
- `FACEBOOK_APP_SECRET` (signature verification)
- `DATABASE_URL` or `DATABASE_POOLED_URL` (Neon Postgres)

## Deployment

Two Vercel projects linked to the same repo:
- **smart-bot-api** — root of repo, uses `vercel.json` → `api.smart-link.ly`
- **smart-bot-frontend** — root of repo with `Root Directory: fb_dashboard/frontend`, uses `fb_dashboard/frontend/vercel.json` → `bot.smart-link.ly`

See `CLAUDE.md` for the deployment contract.

| Var | Required | Description |
|-----|----------|-------------|
| `DATABASE_URL` | For Neon | PostgreSQL connection string |
| `SECRET_KEY` | Yes | JWT signing key |
| `CRON_SECRET` | Yes | Auth for cron-job.org |
| `TELEGRAM_BOT_TOKEN` | For payment | Telegram bot token |
| `TELEGRAM_ADMIN_IDS` | For payment | Comma-separated admin IDs |
| `TELEGRAM_WEBHOOK_SECRET` | Optional | Telegram webhook secret |
| `FACEBOOK_ACCESS_TOKEN` | For bot | FB page token |
| `FACEBOOK_PAGE_ID` | For bot | FB page ID |

## Vercel Deployment

- Entry: `api/index.py`
- Functions: `maxDuration: 30`
- Cron: via cron-job.org (not Vercel crons — hobby plan limits)
- DB: Neon PostgreSQL (NullPool for serverless)

## Tests

The hermetic suite lives in the repo's `tests/` directory (pytest, ~1118 tests;
run `.venv/bin/python -m pytest -q` from the repo root — see the root README's
gates table). The old in-directory `test_*.py` scripts were consolidated into
that suite in the v5 hermeticity wave.
