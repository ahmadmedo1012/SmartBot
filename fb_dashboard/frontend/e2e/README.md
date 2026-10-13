# SmartBot e2e — the dual-stack runbook (phase6, P6-2-d5)

The ONLY way these specs run for real: a **dual stack** — the FastAPI backend
(uvicorn :8000) + the Next frontend (`next start` :3200) with the
`LOCAL_API_PROXY` same-origin rewrites **baked at `next build` time**.
Anything else (the old :8000 SPA shell, bare `next dev`) is a dead target.

## 0) One-time (per sandbox/checkout): Python deps + browsers

```bash
cd <repo-root>
uv venv .venv --python 3.12            # repo venv (gitignored)
uv pip install --python .venv/bin/python -r requirements.txt
npx playwright install chromium        # only if ~/.cache/ms-playwright lacks it
```

- Full `requirements.txt` installs clean via uv (weasyprint 68.1 included;
  its wheel installs without system pango — the reports engine falls back to
  fpdf2 when pango is missing).
- One benign resolver warning: `redis==8.1.0 has no extra named 'asyncio'`
  (redis ≥5 ships asyncio support natively; the extra is a no-op).
- `playwright.sim.config.ts` (battery) + `playwright.config.ts` share the same
  browser cache; `chromium_headless_shell-*` must be present.

## 1) Build the frontend with the proxy baked (config contract)

```bash
cd fb_dashboard/frontend
LOCAL_API_PROXY=http://127.0.0.1:8000 \
NODE_OPTIONS="--max-old-space-size=2400" npm run build
```

- `next.config.ts` bakes `/api/*`, `/webhook`, `/healthz` rewrites ONLY when
  `LOCAL_API_PROXY` is set **at build time** — `next start` needs nothing.
- No build without it: the proxy probe (`/api/plans` → `{"success":true…}`)
  fails and the battery script force-rebuilds.
- Heap: 2400MB worked in a contended 4GB sandbox (2816 OOM-killed once while
  another agent's stack was live; retry when memory frees).

## 2) The journey / mobile-nav specs — one command, both servers

```bash
cd fb_dashboard/frontend
PLAYWRIGHT_START_WEB_SERVER=1 npx playwright test journey mobile-nav
```

`playwright.config.ts` (opt-in `PLAYWRIGHT_START_WEB_SERVER=1`) boots BOTH:

1. **uvicorn** — repo root, `--app-dir fb_dashboard`, `:8000`. The webServer
   command is sandbox-proofed (phase6): prefers `.venv/bin/python`, drops a
   leaked `DATABASE_URL` (a Prisma-style `file:…` URL is not a SQLAlchemy
   dialect → boot dies at import), sets `DEBUG=1` + dev `SECRET_KEY`/
   `CRON_SECRET` (without them config.py's production fail-fasts abort the
   import). DB: env-clean boot → SQLAlchemy default
   `sqlite+aiosqlite:///data.db` at the repo root — schema auto-created and
   seeded (5 plans) on startup; `*.db` is gitignored.
2. **next start :3200** — serves the pre-built `.next` (see §1).

`PLAYWRIGHT_BASE_URL` overrides the origin (default `http://localhost:3200`;
post-deploy: `https://bot.smart-link.ly`). Playwright tears both servers down
when the run ends.

### demo-tabs (plain node script — not @playwright/test)

```bash
# stack already up (e.g. start it manually):
cd <repo-root> && env -u DATABASE_URL DEBUG=1 SENTRY_DSN=off \
  SECRET_KEY=smartbot-e2e-dev-key CRON_SECRET=smartbot-e2e-cron \
  .venv/bin/python -m uvicorn runner:app --app-dir fb_dashboard --host 127.0.0.1 --port 8000 &
cd fb_dashboard/frontend && npx next start -p 3200 &
node e2e/demo-tabs.spec.mjs        # BASE_URL env overrides :3200
```

## 3) The sim battery (15 personas, serial, honest claims)

```bash
bash scripts/v17_sim_local_battery.sh          # full battery (p01→p15)
PART=1 bash scripts/v17_sim_battery_split.sh   # split variant for 10-min tool limits
PART=2 bash scripts/v17_sim_battery_split.sh
```

- Boots its own clean stack: `db/v17-sim.db` (repo-local SQLite), fresh
  per-run secrets (`/tmp/v17-backend.env`), `INITIAL_ADMIN_USERNAME/PASSWORD`
  = `v17admin` / `V17Admin#2026`, and reuses the §1 build (rebuilds only if
  `.next/BUILD_ID` is missing or the `/api/plans` probe fails).
- Skips the build if it exists — run §1 first to avoid a mid-battery rebuild.
- Exit = playwright exit OR red (non-allowlisted) claims exit — a green
  playwright with red claims is a FAIL by design (CLAUDE.md §battery).
- phase6 path fix: ROOT is derived from the script's own location — the old
  hard-wired `/home/z/my-project/SmartBot` only matched the v15 sandbox
  layout and died at line one anywhere else.

## Ports (hard rules)

| port | use |
|------|----|
| 8000 | uvicorn (FastAPI backend) |
| 3200 | `next start` (frontend; config default, `V17_SIM_FRONT_PORT` in battery) |

3000 and 3111–3114 are BANNED (other products/agents in this sandbox).

## What ran green (2026-10-13, this sandbox — verified fresh by P6-2-d5)

- `journey.spec.ts` — 1/1 (landing → pricing → Arabic register → dashboard →
  billing → logout; real API responses through the baked proxy). Re-run with
  `PLAYWRIGHT_START_WEB_SERVER=1` from cold ports: the config's own webServer
  commands booted BOTH servers, both specs passed (30.5s total).
- `mobile-nav.spec.ts` — 1/1 (375px bottom bar + كل الأقسام sheet).
- `demo-tabs.spec.mjs` — 6/6 (4 sidebar tabs + thread/KPI content checks),
  run against the §2 manual runbook boot.
- The auth/cookie contract through the proxy is sound and NOT the battery
  401s' root: a curl login through `:3200/api/login` (cookie jar) →
  `GET /api/me` → `GET /api/admin/platform/users` — all return the ok()
  envelope with the admin session.

## Sim battery — HONEST verdict (NOT green)

`PART=1 bash scripts/v17_sim_battery_split.sh` (this task, fresh DB):
**23 passed · 2 skipped · 17 failed** (3.8m) — playwright exit=1, claims
exit=1. The prior agent's full run left the same failure set (report kept at
`docs/evidence/v17/sim-local-report.txt`; it completed AFTER the agent died).
These 17 failures are pre-existing v17 battery/product drift, NOT dual-stack
problems. Triage (evidence: /tmp/v17-playwright.log + error-context files):

1. **Session 401s inside the sim specs** — p02 #11-14
   (`POST /api/subscriptions → 401`) and the six p05 admin 401s
   (cron/telegram/users/bot-restart). Not reproducible outside the specs
   (curl above is green; journey logs in/out fine). p02 #15-18/#21/#22,
   p03 #6-9, p05 #1-4 are cascades (no payment rows → admin «الكل» queue
   empty → payments table never renders). Needs the battery owner.
2. **p02 `p02-page-bound-fernet` claim — STALE**: expects 3 `fb_%` rows;
   onboarding now also writes `fb_token_check` (4 rows observed).
3. **p07 #16 — STALE**: webhook with a non-JSON body now 400s (validation)
   instead of 500; the no-stack-trace-leak assertions stay valid — update
   to present when the battery round reopens.
4. **p03 #1-5 — ENOENT** `static/uploads/receipts`: the battery deletes it
   and that flow never re-created it (upload failed earlier in the flow).
5. **p04 `p04-topup-pending` — claim anomaly**: actual reported =
   `{"status":"pending","amount":50,"provider":"libyana"}` (matches the
   expectation) yet the claim stays red — comparator needs inspection.
6. From the prior agent's full run (PART=2 territory, remaining): p13
   double-POST → 403×2, p15 `p15-sequence-create` (campaign/step rows stay
   0 — possible real v17 product gap), p09/p10/p12 mixed.
7. Known-good personas even in these runs: p06, p08, p11, p14 (secret
   rotation incl. admin re-login — more evidence auth itself is healthy).
