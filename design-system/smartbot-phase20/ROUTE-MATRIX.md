# SmartBot Phase 20 — Route Matrix (P20-C1)

Frontend root: `fb_dashboard/frontend` (Next.js 16 App Router, RTL Arabic-first).
Enumerated from `src/app/**/page.tsx` at commit `1916a63` (P19-W2C "THE VESSEL").
Auth gate = `middleware.ts` cookie-presence check (`/dashboard*`, `/admin*`, `/connect` → 307 `/login?redirect=…`).
Statuses are LIVE production checks (bot.smart-link.ly, curl, 2026-10-17). Rendering verified this phase via agent-browser (session p20c1, 1440×900 + 390×844): zero console errors, zero horizontal overflow on every page visited.

## Public routes

| Route | Access | Purpose | Status (prod) | Current state | Required work (P20) | Verification |
|---|---|---|---|---|---|---|
| `/` | public | Landing — Vessel hero + machine-instrument marketing | 200 | Vessel live; grid hairlines survive against P19 contract (fixed this phase); CTA fold law holds (measured 830<844 @390) | Grid-hairline removal (DONE P20-C1) | agent-browser 1440/390 + VLM crops |
| `/login` | public | Tenant/platform login | 200 | Full form renders after /api/me check; skeleton-first-paint by design | none | DOM text verified live |
| `/register` | public | Self-serve registration | 200 | sb-trace auth ground coherent | none | live visit, 0 errors |
| `/pricing` | public | Plan catalog (honest, mirrors DB seed) | 200 | 4 plan cards + fold law; API hydrate silent | none | live visit + DOM plan list |
| `/subscribe` | public | Payment funnel (plan → pay) | 200 | multi-step; 0 overflow 390/1440 | none | live visit |
| `/demo` | public | Dashboard demo (REAL AdminSidebar/MobileBottomNav/components, mock data, «تجربة - بيانات وهمية» badge) | 200 | 7 tabs; mono-register drifts vs real twins (fixed this phase) | 4 register fixes (DONE P20-C1) | agent-browser 1440/390 |
| `/privacy` | public | Privacy policy | 200 | token-coherent | none | curl 200 |
| `/terms` | public | Terms | 200 | token-coherent | none | curl 200 |
| `/connect` | cookie-gated | Facebook page connect | 307 (anon) | skeleton + 401 redirect contract | none | curl 307 |

## Dashboard routes (tenant; all behind 307 cookie gate + AuthGuard client island)

| Route | Purpose | Status (prod) | Current state | Required work (P20) | Verification |
|---|---|---|---|---|---|
| `/dashboard` | Home — KPI strip, 7-day chart, recent replies, rules table | 307 (anon) | canonical rules table carries mono index column (the demo twin now matches) | none (demo side fixed) | code + demo mirror |
| `/dashboard/messages` | Conversations + thread (core surface) | 307 | mono HH:MM stamps, page-run robot avatar, typing dots | none | carried by parity pins |
| `/dashboard/comments` | Comments inbox | 307 | canonical | none | parity pins |
| `/dashboard/posts` | Posts list | 307 | canonical | none | parity pins |
| `/dashboard/scheduled` | Scheduled posts (mono time stamps) | 307 | canonical | none | code read |
| `/dashboard/analytics` | Trends + best rules | 307 | sb-numerals + topbar trace | none | parity pins |
| `/dashboard/audience` | Subscribers (hover-wash rows) | 307 | canonical | none | code read |
| `/dashboard/leads` | Leads | 307 | canonical | none | — |
| `/dashboard/ads` | Ads | 307 | canonical | none | — |
| `/dashboard/broadcast` | Broadcasts | 307 | canonical | none | — |
| `/dashboard/sequences` | Sequence campaigns (Pro) | 307 | canonical | none | — |
| `/dashboard/marketing` | Marketing | 307 | canonical | none | — |
| `/dashboard/reports` | Reports | 307 | canonical | none | — |
| `/dashboard/pages` | FB pages | 307 | canonical | none | — |
| `/dashboard/team` | Team | 307 | canonical | none | — |
| `/dashboard/calendar` | Content calendar | 307 | canonical | none | — |
| `/dashboard/autoreply` | Auto-reply rules | 307 | canonical | none | — |
| `/dashboard/activity` | Activity log (mono stamps) | 307 | canonical — the demo twin now matches | none (demo side fixed) | code read |
| `/dashboard/notifications` | Notifications | 307 | canonical | none | — |
| `/dashboard/tools` | Tools | 307 | canonical | none | — |
| `/dashboard/billing` | Billing/subscription | 307 | canonical | none | — |
| `/dashboard/support` | Support tickets (tenant) | 307 | canonical | none | — |
| `/dashboard/settings` | Settings | 307 | canonical | none | — |
| `/dashboard/[...slug]` | 404-within-dashboard catch-all | 307 (anon) | renders notFound inside shell | none | build route |

## Platform-admin routes (cookie-gated; role gate client-side)

| Route | Purpose | Status (prod) | Current state | Required work (P20) | Verification |
|---|---|---|---|---|---|
| `/admin` | Admin home — tenants, payments table | 307 | tbl-stack table | none | code read |
| `/admin/settings` | Platform settings | 307 | canonical | none | — |
| `/admin/support` | All-tenant support tickets | 307 | overflow-x table (deliberate non-tbl-stack: disclosure rows) | none | code read |
| `/admin/telegram` | Telegram platform diagnostics | 307 | canonical | none | — |

## Non-page app routes

`robots.ts`, `sitemap.ts`, `manifest.ts`, `not-found.tsx`, `error.tsx`, `global-error.tsx`, `opengraph-image.png` — all present; 404 verified on `/nonexistent-page-xyz` (clean not-found, no crash). `/onboarding` is NOT a route (OnboardingWizard is a client modal mounted in dashboard/layout) — prod 404 is correct.

## Build route count

`npm run build` (this phase) → **43 routes** — matches the P17/P19 record.

## Notes for successors

- The dashboard interiors are auth-gated and NOT drivable without the API+DB stack in this sandbox; rendering verification rides the /demo public mirror (same AdminSidebar/MobileBottomNav/Card/KpiCard components) + the e2e sim battery (PART=1/2) when re-run.
- All 37 page routes enumerated; the 43-route build count includes robots/sitemap/manifest/404/error variants.
