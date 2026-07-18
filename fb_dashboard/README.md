# SmartBot

Facebook Messenger chatbot dashboard + bot engine. FastAPI + React SPA + Telegram payment approvals.

## Quick Start

```bash
pip install -r requirements.txt
cd fb_dashboard
DEBUG=true python3 runner.py
```

## Architecture

```
api/index.py                 → Vercel entrypoint (routes to fb_dashboard.runner.app)
fb_dashboard/
  runner.py                  → FastAPI server, all routes (~3400 lines)
  bot.py                     → Bot engine (BotEngine, ReplyPipeline, RuleMatcher, CooldownManager)
  fb_client.py               → Facebook Graph API v22.0 client
  models.py                  → SQLAlchemy models (32 tables + PaymentRequest)
  database.py                → SQLAlchemy async engine (NullPool for Vercel)
  config.py                  → Settings from env vars
  telegram_bot.py            → Telegram admin notification + payment approval
  ws_manager.py              → WebSocket connection manager
  event_bus.py               → Pub/sub event bus for SSE streaming
  monitor.py                 → Structured JSON logger
  enhanced_intent.py         → Intent classifier (Libyo-Arabic)
  context_engine.py          → User conversation context
  cache_layer.py             → TTL rule cache + reply dedup
  offer_engine.py            → Smart offer selection
  agent_engine.py            → AI agent for auto-replies
  analytics_engine.py        → Analytics rollups
  migration.py               → DB migration helpers
  _crypto.py                 → Fernet encryption for FB tokens
  _utils.py                  → utcnow() helper
  frontend/                  → React SPA (Vite + Tailwind)
  static/                    → Built frontend + icons
  migrations/                → SQL migration files
  test_*.py                  → Self-check tests (no framework, assert-based)

vercel.json                  → Vercel config (rewrites, maxDuration, no build)
```

## Payment Flow

1. User requests topup → `PaymentRequest` created in DB (status=pending)
2. Telegram notification sent to admin with approve/reject buttons
3. User submits transfer reference
4. Admin taps approve on Telegram
5. Webhook handles callback → atomic `UPDATE ... WHERE status=pending`
6. Balance credited via `BotState` (key="balance")
7. Message edited to show result

## Telegram Commands

- `/start` — get your Telegram ID for admin whitelist

## Environment Variables

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
