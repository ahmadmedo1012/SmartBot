# SmartBot

Facebook Messenger chatbot dashboard + bot engine. FastAPI + Next.js 16 + Telegram payment approvals.

## Quick Start

```bash
# Backend
pip install -r requirements.txt
cp .env.example .env
DEBUG=true python3 -m fb_dashboard.runner  # or uvicorn fb_dashboard.runner:app

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
  twofa.py                   → TOTP-based 2FA (Fernet-encrypted secrets)
  ws_manager.py              → WebSocket connection manager (tenant-scoped)
  event_bus.py               → Pub/sub event bus (tenant-filtered)
  monitor.py                 → Structured JSON logger
  _services.py               → Shared state (lazy engine proxies, FB client, helpers)
  routers/                   → APIRouter per domain (auth, payments, bot, webhooks, ...)
  frontend/                  → Next.js 16 app (App Router, /api/* proxied to backend)
  static/                    → Built frontend + icons (legacy Vite remnants — keep until full cutover)

vercel.json                  → Vercel config for smart-bot-api project
vercel-frontend.json         → Vercel config for smart-bot-frontend project
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
- **smart-bot-frontend** — root of repo with `Root Directory: fb_dashboard/frontend`, uses `vercel-frontend.json` → `bot.smart-link.ly`

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

```bash
cd fb_dashboard
python3 test_bot_logic.py        # Core logic
python3 test_payment_system.py   # Payment model + telegram
python3 test_payment_api.py      # API integration (httpx)
python3 test_*.py                # Other module tests
```
