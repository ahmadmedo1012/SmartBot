<div align="center">

# 🤖 SmartBot — سمارت بوت

**Messenger bot & Facebook page automation — built for the Libyan market 🇱🇾**
**بوت ماسنجر وأتمتة لصفحات فيسبوك — للسوق الليبي**

[![Live](https://img.shields.io/badge/live-bot.smart%2Dlink%2Dly-2EA44F?style=flat-square)](https://bot.smart-link.ly)
[![API](https://img.shields.io/badge/API-api.smart%2Dlink%2Dly-8B5E3C?style=flat-square)](https://api.smart-link.ly/api/health)
[![Tests](https://img.shields.io/badge/pytest-1118%2B%20dynamic-2EA44F?style=flat-square)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-proprietary-D4380D?style=flat-square)](LICENSE)

**[🌐 bot.smart-link.ly](https://bot.smart-link.ly)** · [🧪 Live demo](https://bot.smart-link.ly/demo) · [📚 Docs](docs/INDEX.md) · [العربية](README.md) · **English**

<img src="docs/screenshots/hero.webp" width="820" alt="SmartBot landing page in the night Madarek identity (navy/gold): navbar, headline «اكتشف ذكاءً اصطناعيًا», and «ابدأ مجانًا» / «جرّب البوت الآن» CTAs">

</div>

---

## What is SmartBot?

A **multi-tenant** platform for managing Facebook pages: an Arabic-first RTL control panel plus a bot engine that auto-replies to **comments and DMs**, sends broadcasts, drives marketing flows, and gates subscriptions behind Libyan payments — with instant admin approvals over Telegram. SmartBot is a member of the **Madarek / Smart-Link** ecosystem (see the family footer at the bottom of this page).

## ✨ Features

| Area | What you get |
|---|---|
| 🚀 **Onboarding wizard** | A first-run wizard walks you through setup step by step — `src/app/onboarding` |
| 🔗 **Connect page** | Connect your Facebook pages; every tenant's tokens are **FERNET-encrypted** and isolated |
| 💬 **Auto-replies** | On comments and DMs via a multi-platform flow engine (`flow_engine.py`: Messenger-first, with Instagram/WhatsApp support) |
| 📣 **Broadcasts & marketing** | Bulk messages to subscribers, content calendars and reply-driven marketing |
| 👥 **Leads & posts tables** | A **leads** table (`dashboard/leads`), a **posts/ads** table (`Post`/`ScheduledPost`/`AdAccount`) and full subscriber CRM |
| 📊 **Dashboard analytics** | Charts and stats for page and message activity — `dashboard/` |
| 💳 **Libyan payments** | **Lybiana/Madar** mobile wallets + bank transfer, with **Telegram approvals** and full payments admin |
| 🧾 **PDF reports** | Reports rendered with the bundled IBM Plex Sans Arabic font — `pdf_reports_engine.py` |
| 📱 **Native mobile app** | Expo + React Native — native navigation, not a WebView (`mobile/`) |
| 🌓 **Madarek identity** | night/gold dark & cream/copper light themes, full RTL, mathematically measured AA contrast |

## 📸 Screenshots

All shots are from **production** (`bot.smart-link.ly`) — click any image to view it full-size:

<table>
  <tr>
    <td width="50%" align="center"><b>Dashboard — <code>/dashboard</code></b><br>
      <a href="docs/screenshots/03-dashboard.png"><img src="docs/screenshots/03-dashboard.png" width="380" alt="Dashboard: sidebar and stat cards — لوحة البيانات"></a></td>
    <td width="50%" align="center"><b>Interactive demo — <code>/demo</code></b><br>
      <a href="docs/screenshots/05-demo.png"><img src="docs/screenshots/05-demo.png" width="380" alt="Interactive demo panel for trying the product before subscribing — لوحة التحكم التجريبية"></a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><b>Pricing — <code>/pricing</code></b><br>
      <a href="docs/screenshots/06-pricing.png"><img src="docs/screenshots/06-pricing.png" width="380" alt="Pricing plans page — صفحة الخطط والأسعار"></a></td>
    <td width="50%" align="center"><b>Subscribe — <code>/subscribe</code></b><br>
      <a href="docs/screenshots/07-subscribe.png"><img src="docs/screenshots/07-subscribe.png" width="380" alt="Subscribe page with «اختر خطتك» heading — صفحة الاشتراك"></a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><b>Landing (narrow viewport)</b><br>
      <a href="docs/screenshots/01-landing.png"><img src="docs/screenshots/01-landing.png" width="380" alt="SmartBot landing page on a narrow viewport — صفحة الهبوط على شاشة ضيقة"></a></td>
    <td width="50%" align="center"><b>Full desktop pricing</b><br>
      <a href="docs/screenshots/09-pricing-desktop.png"><img src="docs/screenshots/09-pricing-desktop.png" width="380" alt="Full desktop pricing page with monthly/yearly toggle and multiple plan cards — الأسعار على سطح المكتب"></a></td>
  </tr>
</table>

→ Full bilingual captions live in [docs/screenshots/CAPTIONS.md](docs/screenshots/CAPTIONS.md).

## 🧱 Tech stack

| Layer | Technology |
|---|---|
| Backend | **FastAPI** (Python 3.12) — `fb_dashboard/` (routers + engines + bot) |
| Frontend | **Next.js 16** (App Router, Arabic RTL) — `fb_dashboard/frontend/` |
| Database | SQLAlchemy + Alembic — **Neon PostgreSQL** (prod) / SQLite (dev, hermetic isolated test DB) |
| Mobile | **Expo + React Native** — `mobile/` (native app) |
| Hosting | Vercel — frontend [bot.smart-link.ly](https://bot.smart-link.ly) + API [api.smart-link.ly](https://api.smart-link.ly) |
| Observability | Sentry/GlitchTip + critical Telegram alerts |
| Design | The **Madarek** identity: night/gold `#070B16`/`#E9B44C` dark — cream/copper `#FBFAF9`/`#B57438` light — IBM Plex Sans Arabic. Reference: `design-system/smartbot/MASTER.md` |

## 🚀 Getting started

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                          # dev defaults ready to go (DEBUG=true)
.venv/bin/python -m uvicorn runner:app --app-dir fb_dashboard --port 8000   # backend on :8000

cd fb_dashboard/frontend
npm install
LOCAL_API_PROXY=http://127.0.0.1:8000 npm run dev   # frontend on :3000, /api proxied to the backend
```

> **Proxy note (v10-H3):** local development `/api` proxying requires `LOCAL_API_PROXY` (it mirrors the production vercel.json rewrite) — without it, frontend calls return 404.

### Environment variables required in production

| Variable | Purpose | How to generate |
|---|---|---|
| `SECRET_KEY` | JWT signing | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `FERNET_KEY` | Encrypting Facebook tokens & 2FA secrets | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key())"` |
| `CRON_SECRET` | Protecting cron endpoints (vercel.json) | a strong random secret |
| `FB_WEBHOOK_VERIFY_TOKEN` | `GET /webhook` verification | must match the Facebook app config |
| `FACEBOOK_APP_SECRET` | `X-Hub-Signature-256` verification | from the Facebook app dashboard |
| `DATABASE_URL` | PostgreSQL (Neon) | empty locally = automatic SQLite |

> The full list is documented line-by-line in Arabic in [`.env.example`](.env.example).

## 🗂️ Project structure

```text
api/index.py                ← Vercel serverless API entry point
fb_dashboard/               ← production code (backend)
├── runner.py               ← FastAPI app (routers + middleware + lifespan)
├── bot.py                  ← bot engine (per-tenant isolation)
├── messenger_service.py    ← Messenger pipeline (webhook → storage → reply)
├── engines (analytics/inbox/subscriber/…)  ← business logic
├── routers/                ← API routes (every route returns {success, data})
├── frontend/               ← Next.js 16 frontend (App Router, Arabic RTL)
├── static/                 ← exported Next.js build — generated locally, untracked in git
├── models.py               ← SQLAlchemy models
└── migrations/             ← legacy SQL migrations (001–002)
mobile/                     ← mobile app (Expo + React Native) — see mobile/README.md
alembic/versions/           ← Alembic migrations (up to 017)
tests/                      ← pytest suite (1118+ — grows every round, see CHANGELOG.md)
e2e/  (frontend/e2e/)       ← Playwright simulation battery (personas p01–p15)
scripts/                    ← gates and checks (gate_all.sh, CSS-token scan…)
docs/                       ← structured docs — docs/INDEX.md (screenshots in docs/screenshots/)
```

## ⚙️ Development commands

| Command | Description |
|---|---|
| `.venv/bin/python -m uvicorn runner:app --app-dir fb_dashboard --port 8000` | Run the backend on `:8000` |
| `LOCAL_API_PROXY=http://127.0.0.1:8000 npm run dev` (inside `fb_dashboard/frontend`) | Next.js frontend on `:3000` with `/api` proxy |
| `cd fb_dashboard/frontend && npm run test:unit` | Frontend unit tests (vitest) |
| `cd fb_dashboard/frontend && npm run typecheck` | TypeScript check |
| `bash scripts/gate_all.sh` | Run every quality gate at once |

## 🛡️ Quality gates

Run automatically on every push/PR via GitHub Actions (Node 24):

| Gate | Command | Expectation |
|---|---|---|
| Lint | `ruff check fb_dashboard api tests scripts` | zero findings |
| Backend tests | `.venv/bin/python -m pytest -q` | **1118+ passed** — grows every round (see CHANGELOG.md) |
| TypeScript | `cd fb_dashboard/frontend && npm run typecheck` | 0 errors |
| Frontend tests | `cd fb_dashboard/frontend && npx vitest run` | green — grows every round |
| Production build | `npm run build` | succeeds before merge |
| Unified i18n | `python scripts/check_i18n_calls.py` | zero `toLocale` calls outside format.ts |
| A11y labels | `node scripts/check_a11y_labels.ts` | zero icon-only elements without a name |
| AA contrast | `node scripts/check_contrast.mjs` | every combination ≥ 4.5:1 (mathematically measured) |

> Test determinism: root `conftest.py` **forces** an isolated throwaway SQLite database — `DATABASE_URL` is never inherited from the machine.

## 📈 Monitoring & error tracking

- `GET /api/health` — liveness (never touches the DB) · `GET /api/health/ready` — readiness with `latency_ms`.
- Every response carries an `X-Request-Id` echoed in the log line (`rid=…`).
- **Sentry/GlitchTip enabled by default** (public send-only DSN; disable with `SENTRY_DSN=off`); every unhandled 500 reaches the admin over Telegram instantly with a 5-minute cooldown per error fingerprint, plus cron-stall detection (>15 minutes without a heartbeat).

## 🚢 Deployment

Two Vercel projects (details in [docs/deployment.md](docs/deployment.md)):

- **API** (`vercel.json`): FastAPI serverless — `api/index.py` → **api.smart-link.ly**
- **Frontend** (`fb_dashboard/frontend/vercel.json`): Next.js → **bot.smart-link.ly**
- Migrations: `alembic upgrade head` whenever the schema changes (latest migration: 017).

## 📚 Docs & branch policy

- Full documentation map: **[docs/INDEX.md](docs/INDEX.md)** — Arabic user guide, architecture, deployment, design decisions.
- Branches: `main` protected by GitHub rules ([docs/branch-protection.md](docs/branch-protection.md)); `develop` merged with `--no-ff` after exit gates close.

---

## 🛰️ Part of the Madarek Ecosystem — جزء من منظومة مدارك

> One design system across all projects · the Madarek identity: night/gold `#070B16`/`#E9B44C` dark — cream/copper `#FBFAF9`/`#B57438` light — IBM Plex Sans Arabic

| Project | Role | GitHub | Live |
|---|---|---|---|
| 🎓 **Madarek / مدارك** | Smart-learning platform for University of Zawia — the design-system reference | [github.com/ahmadmedo1012/madarek](https://github.com/ahmadmedo1012/madarek) | [madarek.onrender.com](https://madarek.onrender.com) |
| 🔗 **Smart-Link / سمارت لينك** | Digital umbrella for Libyan businesses | [github.com/ahmadmedo1012/Smart-Link](https://github.com/ahmadmedo1012/Smart-Link) | [smart-link.ly](https://smart-link.ly) |
| 🍽️ **Smart Menu / سمارت منيو** | Digital menu & WhatsApp ordering for restaurants | [github.com/ahmadmedo1012/Smart-Menu](https://github.com/ahmadmedo1012/Smart-Menu) | [menu.smart-link.ly](https://menu.smart-link.ly) |
| 🤖 **SmartBot / سمارت بوت** | Messenger bot & automation for Facebook pages | [github.com/ahmadmedo1012/SmartBot](https://github.com/ahmadmedo1012/SmartBot) | [bot.smart-link.ly](https://bot.smart-link.ly) |
| 🛍️ **Smart Order / سمارت أوردر** | Digital storefront, orders & delivery for businesses | [github.com/ahmadmedo1012/Smart-Order](https://github.com/ahmadmedo1012/Smart-Order) | [order.smart-link.ly](https://order.smart-link.ly) |

## 📄 License

This project is licensed under a **Proprietary** license — all rights reserved © 2026 Ahmad Medo (ahmadmedo1012). No right to use, copy, modify, publish, distribute, or operate this software is granted without prior written permission from the copyright holder. Viewing, cloning, or forking grants no right to build, run, or redistribute. Full terms in the [LICENSE](LICENSE) file.
