# P30 — Route Inventory (canonical verification pass)

- **Task**: P30 §4 (four-product route-inventory deliverable)
- **Repo HEAD audited**: `main @ b998117c` (P27 final; unchanged in P30 so far)
- **Method**: source scan of the Next.js frontend (`fb_dashboard/frontend/src/app/`) + FastAPI router enumeration (`fb_dashboard/runner.py` — 20 routers) + production HTTP probes on https://bot.smart-link.ly + https://api.smart-link.ly (this session) + internal-link sweep (47 links across 7 key pages, 0 broken) + sitemap reconciliation + CI battery state (osv-scanner/mobile/quality-gates/secret-scan all green at HEAD).

## Classification legend

Valid public (VP) · Valid authenticated (VA) · Valid dynamic (VD) · Intended alias/redirect (AR) · Intentional demo/fixture (DF) · Unreachable/broken (BK) · Duplicate content (DP) · Obsolete (OB)

## Frontend page routes

| Route | Class | Auth | Prod status | P30 verification |
|---|---|---|---|---|
| `/` | VP | none | 200 | landing (CharacterScene composed-SVG path — P27-A holds) |
| `/demo` | VP | none | 200 | demo explorer |
| `/pricing` | VP | none | 200 | pricing claims verified truthful (P29-0: Free 100/mo + paid from 19 د.ل) |
| `/register` | VP | none | 200 | signup |
| `/login` | VP | none | 200 | login (+ `?redirect=` contract) |
| `/subscribe` | VP | none | 200 | subscribe flow |
| `/connect` | VA | session | **307 → /login?redirect=/connect** | Facebook-page connect — auth gate verified |
| `/admin` + 3 sub-routes | VA | platform admin | **307 → /login?redirect=/admin** | platform-admin surface — auth gate verified |
| `/dashboard` + 22 sub-routes | VA | session (merchant) | **307 → /login?redirect=…** (verified on `/dashboard` + `/dashboard/messages`) | the app surface (messages/comments/leads/analytics/autoreply/broadcast/calendar/flows/sequences/scheduled/posts/pages/ads/marketing/audience/tools/billing/reports/settings/support/team/notifications/activity + `[...slug]` fallback) |
| `*` catch-all | BK→404 (correct) | none | 404 | verified |

## API surface (api.smart-link.ly — FastAPI, 20 routers)

| Group | Representative routes | Auth |
|---|---|---|
| health | `/api/health`, `/api/health/ready` | none — **verified 200** |
| auth/users | `/api/auth/*`, `/api/users/*` | session |
| inbox | `/api/inbox/*` (conversations, tags) | session + tenant |
| analytics | `/api/analytics/*` (dashboard, overview, trends, heatmaps, export…) | session |
| bot/rules/replies | `/api/bot/*`, `/api/rules/*`, `/api/replies/*` | session |
| flows/sequences/broadcasts | `/api/flows/*`, `/api/sequences/*`, `/api/broadcasts/*` | session |
| calendar/posts/comments | `/api/calendar/*`, `/api/posts/*`, `/api/comments/*` | session |
| webhooks/integration | `/api/config`, webhooks, brand, telegram | session / signed |
| commerce/ads/crm | `/api/commerce/*`, `/api/ads/*`, `/api/crm/*` | session |
| platform admin | `/api/admin/*` (support tickets, tenants, config, subscriptions…) | platform admin |
| docs | `/docs` (FastAPI OpenAPI) | public — **verified 200** |

Full per-route contracts: see `fb_dashboard/` routers + the pytest battery (CI quality-gates green).

## Sitemap/robots reconciliation

- `sitemap.xml` (200): exactly the 7 public marketing pages (`/`, `/pricing`, `/register`, `/demo`, `/subscribe`, `/privacy`, `/terms`). **Zero unexpected entries** — no authenticated/dashboard routes leak.
- `robots.txt` (200): unchanged contract.
- `api.smart-link.ly/` root: serves the dashboard shell (200 — verified; a transient `000` on first probe re-verified clean at 536ms).

## P30 findings & gates

- **Zero new defects found** in this pass (0 broken internal links of 47 checked; auth gates verified on `/connect`, `/admin`, `/dashboard` + sub-route sample).
- Demo-data truth (P30 §7 lens): demo inbox/conversations render as demonstration data per the P24-era verification; pricing claims verified truthful (P29-0).
- Regression gates holding: osv-scanner ✓ mobile ✓ quality-gates ✓ secret-scan ✓ at `b998117c`.

## §5.2 journey coverage (P30 §5 battery mapping)

The CI quality-gates battery (pytest) + mobile job cover: health, auth (register/login/me/logout/session-expiry), tenant isolation, bot config persistence, rules/autoreply CRUD, inbox flows, plan-limit refusals, invalid input. **Unverified boundary (documented honestly)**: the real Facebook provider path (connect + real page events) — requires owner-held credentials; the local contract is verified, the live-provider boundary is not (never claimed as verified).
