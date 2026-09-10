# Cron Setup — cron-job.org → SmartBot heartbeat (v19 Step 0)

> **Why an external cron service?** The Vercel Hobby plan allows only 2 native
> cron jobs (both consumed: `cleanup-logs` at 03:00 UTC + `heartbeat` at 04:00
> UTC). The bot's reply engine needs a heartbeat every **5 minutes** — that
> channel must come from an external scheduler. `dec-cron-restore`
> (docs/decisions-ledger.md) documents the outage this caused: the channel was
> "mathematically dead" (~288 errors/day expected, 2 observed).
>
> **v21 (T4-a) note:** while this channel was dead, an in-code **piggyback
> beat** (`fb_dashboard/app/piggyback.py`) was added — every AUTHENTICATED
> user request on a warm serverless instance advances the same automation
> sweep (throttled to one beat per 300s per instance, non-blocking,
> Vercel-only). That covers warm-traffic windows, but this external job is
> STILL required: it is the cold-start/night driver and the independent
> outage detector (its 503s are alertable when no traffic exists to
> piggyback on).

## The exact 1-minute setup (cron-job.org)

| Field | Value |
|---|---|
| **URL** | `https://api.smart-link.ly/api/cron/heartbeat` — plain, **no query string** |
| **Method** | `GET` (the ONLY accepted method — POST is a dead route, v15 D9-H1) |
| **Schedule** | Every **5 minutes** (`*/5 * * * *`) |
| **Header** | `Authorization: Bearer <CRON_SECRET>` (exact header name `Authorization`, value `Bearer ` + the secret, one space) |
| **Timeout** | ≥ **40 s** (the function's `maxDuration` is 30 s; Vercel cold starts add a few) |
| **Success** | HTTP **200** + `{"success": true, ...}` |
| **Failure alert** | HTTP **503** = a real core-sweep failure (cron-job.org should alert on it). **403** = wrong header/secret. Both should notify. |

Optional second job (already covered daily by Vercel at 03:00 UTC, idempotent
and safe to re-run): `GET https://api.smart-link.ly/api/cron/cleanup-logs`
with the same `Authorization: Bearer <CRON_SECRET>` header.

### In the cron-job.org UI

1. Create job → paste the URL above, method **GET**.
2. Schedule → Every 5 minutes.
3. Advanced → Notifications → enable failure alerts (email/Telegram as configured).
4. Advanced → Headers → add custom header:
   - Name: `Authorization`
   - Value: `Bearer <CRON_SECRET_VALUE>`
5. Save → the next tick should log HTTP 200.

## ⚠️ v19 live verification (2026-09-10) — READ BEFORE SETTING THE JOB

The v19 plan supplied `CRON_SECRET = <CRON_SECRET_VALUE>`,
and a live probe (`Authorization: Bearer <that value>` →
`GET /api/cron/heartbeat`) answered **403 «وصول غير مصرح به لمهام الجدولة»**.
The app itself boots in production (config.py fails fast on a missing
CRON_SECRET), so the **deployed Vercel env var holds a DIFFERENT value** than
the one in the plan.

Before cron-job.org can work, the two sides must be aligned — pick ONE:

- **Option A (plan's value wins):** in the Vercel project `smart-bot-api` →
  Settings → Environment Variables → set `CRON_SECRET` to
  `<CRON_SECRET_VALUE>` and redeploy. Then use the
  same value in the cron-job.org header.
- **Option B (deployed value wins):** read the CURRENT value from the Vercel
  env-var page and use THAT in the cron-job.org header (do not change the
  deployment).

Verification after setup (one curl, no login needed):

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <CRON_SECRET>" \
  https://api.smart-link.ly/api/cron/heartbeat
# 200 = aligned and live · 403 = secret mismatch · 503 = DB/sweep failure
```

## Why Bearer-only (the old `?token=` is dead)

v16-E2 removed the `?token=` query-string auth channel: query strings leak
`CRON_SECRET` into access logs and proxy logs. Any call using
`https://api.smart-link.ly/api/cron/heartbeat?token=<secret>` now gets **403**
by design — the token must ride the `Authorization` header. (Vercel native
crons already send exactly that header; `bot.py:_cron_authorized` is the
single constant-time-compare gate for both cron routes there.)

## The two admin-JWT cron routes are NOT for cron-job.org

`GET /api/cron/status` and `POST /api/cron/alert-test` (admin_routes.py) are
platform-admin console endpoints — they take a logged-in admin session, not
the Bearer secret. Do not point the scheduler at them.
