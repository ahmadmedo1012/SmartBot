# v24-A2 — Mobile Performance Audit (Frontend)

**Agent:** MOBILE-PERF · **Date:** 2026-09-11 · **Repo:** `/home/z/my-project/SmartBot` @ `3a575a77` (v23 final)
**Scope:** `fb_dashboard/frontend` (Next.js 16.3.4 / React 19.2.4 / Turbopack build, `.next/` = 219 MB, node_modules installed)
**Mode:** READ-ONLY static + build-artifact analysis. No source files were modified. No live testing.

---

## 1. Executive Summary

The frontend has already been through several serious bundle-diet rounds (v6 §D RSC landing, v9-B14 lazy recharts, v11-A7 framer-removal, v12-E5 provider diet, v16-E4 toaster scoping, v23 messages-page query tuning). **First-load JS is healthy**: 186 KB gz common base (budget ≤190 KB **PASS**), dashboard = 248.6 KB gz, and the three historically heavy libs are correctly lazy (recharts, react-joyride, framer-motion).

**The mobile "instant" problem is not primarily bundle weight — it is the interaction architecture:**

1. **Every dashboard navigation is a serial client-side waterfall**: HTML → JS → `AuthGuard` blocks ALL content behind a spinner until `/api/me` resolves → children mount → page `useQuery` fires → data paints. That is +2 network round-trips after hydration, on Libyan 3G ≈ **1.5–4 s of spinner per tap**.
2. **Navigation is programmatic (`router.push` via `onClick`), not `<Link>`** in `MobileBottomNav` + `AdminSidebar` (all 23 sections) → **zero route prefetching**. Every tap on the mobile bottom bar pays a cold RSC fetch.
3. **`/api/me` is fetched TWICE per navigation** (AuthGuard raw `fetch` + `useSubscriptionStatus` react-query refetch, both keyed on `pathname`).
4. **Sentry's client SDK (567 KB raw / 178 KB gz) loads async on EVERY page view** — DSN is committed so it's always on; sample rate is fine (5%), but the SDK weight is a first-visit mobile tax.
5. **PWA is installable but brain-dead**: `manifest.webmanifest` exists, **no service worker** → no offline, no runtime caching of the app shell on Libya's flaky networks.
6. **Polling is pervasive** (8s–60s on 14 pages; `/dashboard/analytics` alone runs 6 polled queries) — battery + data drain on mobile, and constant JSON parsing on the main thread.
7. **No query persistence** — the in-memory react-query cache dies with every tab close/refresh; repeat visits re-spin every skeleton (the exact opposite of "instant").

None of these require re-architecting the whole app; items 1–4 are addressable with focused, low-effort changes (see §9).

---

## 2. Method

- `scripts/measure_bundle.py` (repo's own honest first-load measurement: parse `.next/server/app/<route>.html` script tags, sum raw + gzip-9) — re-run for all 11 routes.
- Chunk fingerprinting: string markers (`recharts`, `react-joyride`, `@sentry/*`, `react-dom`, core-js polyfill signature, Turbopack runtime header) inside `.next/static/chunks/*.js`.
- Grep/read of all `src/` for React Query options, `use client` density, dynamic imports, Suspense, skeletons, `<img>`/`next/image`, Promise.all, refetch intervals, cache headers, SW/PWA markers.
- Verified dependency versions from `package-lock.json`: next 16.3.4, react 19.2.4, recharts 3.9.2, react-joyride 2.9.3, @sentry/nextjs 10.73.0, @tanstack/react-query 5.101.2, lucide-react 1.24.0, @base-ui/react 1.8.0, sonner 2.0.7.

---

## 3. Bundle Analysis

### 3.1 First-load JS per route (script tags in prerendered HTML, gzip-9)

| Route | Raw KB | Gz KB |
|---|---:|---:|
| (landing `/`) | 668.1 | **208.6** |
| /dashboard | 794.4 | **248.6** ← heaviest |
| /admin | 734.4 | 229.8 |
| /connect | 703.6 | 219.2 |
| /login | 706.8 | 221.6 |
| /demo | 695.9 | 217.0 |
| /pricing | 665.1 | 209.2 |
| /register | 655.0 | 203.2 |
| /subscribe | 657.2 | 204.2 |
| /privacy, /terms | 657.5 | 206.1 |
| **COMMON BASE (10 chunks)** | 602.2 | **186.3** |

Other payload parts (landing): HTML 110 KB raw / 18 KB gz · CSS 170 KB raw / 22 KB gz · fonts (Cairo ar+lat 64 KB, Readex Pro 55 KB, preloaded: cairo-arabic 30.9 KB + readex-pro 22.9 KB).

### 3.2 Largest chunks identified (raw → gz)

| Chunk | Size (raw/gz) | Contents (fingerprinted) | Loaded when |
|---|---|---|---|
| `0d65-8gd8upsk.js` | 567/178 KB | **@sentry/nextjs client SDK** | async after hydration, **every route** |
| `20u_5d7v16ncw.js` | 361/103 KB | **recharts + d3 deps** (61 `recharts` markers) | lazy — chart render only |
| `352i9biw0d55n.js` | 228/71 KB | react-dom | every route (base) |
| `3x6r8c1bqc_nq.js` | 138/37 KB | Next App Router runtime (`callServer`/`dispatchAppRouterAction`) | every route (base) |
| `0cz1d0mv5g_q7.js` | 109/38 KB | core-js polyfills | every route (base) |
| `1usyb8akktcz-.js` | 96/29 KB | **react-joyride** | lazy — fresh-tenant tour only |
| `0u9bqcdqslzn1.js` | 61/20 KB | @base-ui/react (dialog) | route-level |
| `0wt4ajh_cekob.js` | 54/18 KB | app shared code | route-level |
| 8 chunks extra for /dashboard vs landing | 188/60 KB | react-query + shell + toaster + dashboard page | dashboard routes |

### 3.3 Answers to the specific questions asked

- **Is recharts fully imported into shared chunks?** No — correctly isolated to its own async chunk (`20u_…`, 361 KB raw) and only reachable through `dynamic(ssr:false)` boundaries: `src/components/charts/lazy.tsx:23-31` (ActivityBarChart, ComparisonBars), `dashboard/analytics/page.tsx:31` (TrendLineChart), `demo/page.tsx:32` (analytics tab only, default tab is a zero-dep CSS chart). Only `charts/index.tsx` and `charts/TrendLineChart.tsx` import from `"recharts"` (named imports; tree-shaking works). **Verdict: no fix needed.**
- **react-joyride?** Not in shared chunks. `AuthGuard.tsx:22-25` dynamic-imports `OnboardingTour` (`ssr:false`), which statically imports Joyride (`OnboardingTour.tsx:4`). Chunk loads only for fresh tenants. **Verdict: fine.** (Cost when it does load: 29 KB gz.)
- **Sentry?** The single biggest async chunk (178 KB gz) fetched on **every** page view after hydration — `instrumentation-client.ts:19` dynamic-imports `@sentry/nextjs` (good: off the critical path), but `sentry-config.ts:16-17` commits the DSN so it always initializes. See §7.
- **dynamic(() => import()) usage — heavy components NOT lazy-loaded:** all heavy ones ARE lazy (recharts, joyride, OnboardingWizard, sonner toaster via `app-toaster` + dynamic import in `csrf-client.ts:72`, PaymentDialog in `SubscribeContent.tsx:27`, landing sections in `LandingIslands.tsx:21-25`, RegisterForm `register/page.tsx:5`). Remaining eager-but-heavy: nothing material. **This layer is in good shape.**
- **next.config.ts optimizations:** NO `experimental.optimizePackageImports` / `modularizeImports` are configured. Next 16's built-in default list already covers `lucide-react` (all icon imports in the repo are named imports — verified — so no barrel bloat). `images: { unoptimized: true }` is set globally (reason: Messenger CDN attachment URLs, `messages/page.tsx:537` also sets `unoptimized` per-image) — this disables optimization for local statics too. `withSentryConfig` wraps only build-time tooling (sourcemaps disabled without token — no bundle effect). `turbopack.resolveAlias` is empty.

### 3.4 What's in the 186 KB common base

react-dom 71 KB gz + Next App Router runtime 37 KB gz + core-js polyfill 38 KB gz + shared app code ≈ 40 KB gz. The core-js floor is notable: 38 KB gz of polyfills shipped to every modern mobile browser. Next 16 targets modern browsers by default (`browserslist` not configured) — worth verifying whether the polyfill chunk is legacy fallback or mainline; if mainline, `compileTargets`/browserslist tuning could reclaim ~30 KB gz for everyone.

---

## 4. Data-Layer Findings (React Query)

**Versions:** @tanstack/react-query 5.101.2. **Usage:** 53 `useQuery` across 26 files, 42 `useMutation` across 15 files. All consumers are under `/dashboard` + `/admin` (confirmed by the provider scoping).

### 4.1 QueryClient defaults — GOOD

`src/components/shared/QueryProvider.tsx:29`
```ts
defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } }
```
- ✅ `staleTime: 30_000` — refetch-on-mount storms avoided globally (the "default = refetch every mount" anti-pattern does NOT apply here).
- ✅ `refetchOnWindowFocus: false` — no mobile tab-switch refetch storms.
- ⚠️ `gcTime` unset (default 5 min). Fine, but no persistence layer means the cache evaporates on every tab close/refresh/redirect (see 4.6).

### 4.2 Anti-pattern / friction list (file:line)

| # | Finding | Location | Severity |
|---|---|---|---|
| Q1 | **`/api/me` fetched twice per dashboard navigation**: AuthGuard raw `fetch("/api/me")` in a `useEffect` keyed on `pathname` (runs per route change) AND `useSubscriptionStatus` query `["me"]` with `staleTime: 0` + `refetchOnMount: "always"` + a `pathname`-keyed `refetch()` effect. | `AuthGuard.tsx:56-121` (deps `[pathname, …]` line 121), `useSubscriptionStatus.ts:44-61` | HIGH — 1 wasted RTT + serial gate (see §6.1) |
| Q2 | **AuthGuard blocks the whole subtree** on the `/api/me` result (spinner `AuthGuard.tsx:123-132`) — children never start their queries until auth resolves. | `AuthGuard.tsx:123` | HIGH |
| Q3 | **Aggressive polling** on 14 pages: messages list 8 s + thread 5 s (`messages/page.tsx:150,182`), comments 20 s (`comments/page.tsx:38`), activity 15 s (`activity/page.tsx:34`), autoreply 30 s (`autoreply/page.tsx:80`), scheduled 30 s, team 30 s, posts 30 s, broadcast 30 s, calendar 60 s, dashboard 60 s, audience 3×60 s, **analytics 6×60 s** (`analytics/page.tsx:112,150,195,231,294,360`). | various | MED — battery/data on mobile; `refetchIntervalInBackground` is default-false (good, only set explicitly at `dashboard/page.tsx:252`) |
| Q4 | **`staleTime: 0` + `refetchOnMount: "always"`** on the shared `["me"]` key — intentionally "fresh on every mount" (documented), but combined with Q1 it doubles `/api/me` traffic and re-renders the shell on every navigation. | `useSubscriptionStatus.ts:52-53` | MED |
| Q5 | **No `placeholderData`/`keepPreviousData` on paginated & filterable queries**: admin support tickets `["admin-support-tickets", status, page]` (`admin/support/page.tsx:125-132`) — page/filter switches flash full skeletons. (Messages page does it RIGHT: `messages/page.tsx:146,193` with `placeholderData: (prev) => prev` + `isPlaceholderData` dimming — copy that pattern.) | `admin/support/page.tsx:125` | MED |
| Q6 | **N+1 fan-out**: sequences list fetch + one detail request per sequence (`Promise.all` over `list.map`) — parallel but still 1+N requests on every mount of the page; step counts are not in the list contract. | `sequences/page.tsx:567-587` | MED |
| Q7 | **No prefetching anywhere**: zero `prefetchQuery`/`ensureQueryData` in `src/`; no hover/tap prefetch before navigation; no `queryClient` warm-up from route layouts. | repo-wide grep: 0 hits | MED (missed opportunity) |
| Q8 | **Analytics page = 6 independent queries + 6 polls** instead of one aggregated endpoint (contrast: `/dashboard` correctly uses one `/api/dashboard/bundle`). | `analytics/page.tsx:108-360` | LOW-MED |
| Q9 | Reports page fires 3 queries on mount (dashboard stats, top commenters, PDF status) — parallel (good), but the PDF readiness check is only needed when the user clicks generate. | `reports/page.tsx:33-64` | LOW |
| Q10 | Positive confirmations: messages page v23 tuning (15 s/20 s staleTime, 5 min gcTime for threads, debounced search 300 ms `messages/page.tsx:124`, optimistic mark-read `messages/page.tsx:205-220`, optimistic send `messages/page.tsx:280`); `usePublicStats.ts` single-flight module cache (60 s); `useConfig.ts` TTL cache + inflight dedup. | — | ✅ |

### 4.3 Pagination state of the union

Only `admin/support/page.tsx` has real client-side pagination (`setPage`, lines 107/456/468) — no `placeholderData`. `audience/page.tsx:29` fetches `per_page=10` with **no page parameter** (first page only, no way to see more). `posts`, `leads` render single envelopes. So the pagination UX gap is: admin support = skeleton flash; audience = dead-end list.

---

## 5. Rendering Strategy Findings

### 5.1 `use client` density

- **119 files** carry `"use client"` (of ~184 tsx in `src/`).
- **Fully client-side `page.tsx` files (35):** all 22 `/dashboard/*` pages + `/dashboard/[...slug]`, all 4 `/admin/*` pages, `/login`, `/register`, `/connect`, `/pricing`, `/subscribe`, `/demo`.
- **True RSC pages (4):** `/` (landing — exemplary: static hero + client islands, LCP text in HTML), `/privacy`, `/terms`, plus the root `layout.tsx`.
- Landing uses `LazySections` dynamic islands (`LandingIslands.tsx:21-25`) — below-fold sections stream in.

### 5.2 The dashboard data model is 100% client-fetch

Every dashboard page is `use client` + `useQuery` after hydration. There is **no server-side data fetching with cookie forwarding** anywhere (`next: { revalidate }` — 0 hits repo-wide; no `fetch` in any server component for data). The middleware (`middleware.ts:79-93`) already validates the `token` cookie server-side before the dashboard RSC shell is even served — so the auth signal exists at request time, yet the client re-verifies it with `/api/me` on every navigation and then fetches data. This is the structural source of the waterfall (§6.1).

### 5.3 Loading states inventory

- ✅ `loading.tsx` present for every route family (login, pricing, connect, privacy, terms, demo, subscribe, admin, admin/telegram, dashboard) → route-level streaming fallbacks exist for the shell.
- ✅ Skeletons used consistently on data pages (`Skeleton` component: dashboard, analytics ChartCard, comments, audience, support…).
- ❌ **The auth gate defeats them**: `AuthGuard.tsx:123-131` renders a full-screen centered spinner ("جارٍ التحميل…") until `/api/me` resolves; the page's nice skeletons only appear AFTER that. So the real perceived sequence on mobile: blank shell → spinner → skeleton → content. 3 visual states = "not instant".
- ❌ No `<Suspense>` streaming of data (only `subscribe/page.tsx:14` uses Suspense, for the SEO metadata fallback).
- ✅ Demo/pricing etc. load instantly (static content).

### 5.4 Hard navigations (full page reloads) from inside the SPA

`window.location.href =` / `window.location.replace` used for in-app transitions (loses prefetched bundles + query cache):
- `dashboard/page.tsx:109,113,417` — EmptyState CTAs → `/connect`, `/dashboard/autoreply` (should be `router.push`/`<Link>`).
- `analytics/page.tsx:100` — plan upgrade CTA → `/subscribe`.
- `admin/page.tsx:135` — back to dashboard.
- (Auth failures/kicks legitimately use hard navigation — fine.)

---

## 6. Waterfall & N+1 Map

### 6.1 The dashboard navigation waterfall (mobile-critical)

```
tap nav item (button onClick → router.push, NO prefetch)
  → RTT 1: fetch RSC payload for route (not prefetched — §5.5)
  → hydrate page component
  → RTT 2: AuthGuard GET /api/me          (blocks render: spinner)
  → RTT 2b: useSubscriptionStatus GET /api/me (parallel, duplicate)
  → children mount → RTT 3: page useQuery (e.g. /api/dashboard/bundle)
  → skeleton → paint data
```
On 3G (400 ms RTT per the repo's own persona P01 spec `e2e/sim-p01-visitor-3g.spec.ts`), that's ≈1.2–2 s of network after each tap before any real content — plus the initial cold-load JS.

### 6.2 Other sequences

- **Sequences N+1**: `sequences/page.tsx:569-584` — list, then N parallel detail calls (each `await apiFetch(/api/sequences/{id})`). With 20 campaigns = 21 requests on page mount; no detail cache.
- **No other sequential `await` chains** were found in query functions (single `Promise.all` in repo is the one above); `useQuery` multi-query pages (analytics, reports, audience, billing, admin/telegram ×5) fire in parallel — good.

### 6.3 Navigation without prefetch (the mobile tap latency)

`MobileBottomNav.tsx:85-89/147/191` and `AdminSidebar.tsx:159-160` navigate via `onNavigate` → `DashboardShell.handleNavigate` → `router.push` (`DashboardShell.tsx:39-41`). Programmatic `router.push` **never prefetches**; `<Link>` prefetches route RSC + chunks when visible in production. The 5-item bottom bar is always visible on mobile — converting those 5 items to `<Link>` would make the highest-traffic dashboard sections effectively instant after first visit.

---

## 7. Third-Party Audit

### 7.1 Sentry (`@sentry/nextjs` 10.73.0)

- **Init** (`instrumentation-client.ts:14-31`): dynamic `import("@sentry/nextjs")` (keeps SDK out of critical path ✅), `tracesSampleRate` = `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.05` — **5%, not 1.0** ✅ (low tracing overhead), `sendDefaultPii: false` ✅, environment/release resolution sane.
- **DSN committed** (`sentry-config.ts:16-17`) → **always on in every deployment** (documented decision).
- **Cost**: `0d65-8gd8upsk.js` = **567 KB raw / 178 KB gz**, fetched async after hydration on **every route, every session** (immutable-cached after first hit per deploy). For a mobile-first "instant" product this is the single largest async asset. The `@sentry/nextjs` client bundle includes browser SDK + router instrumentation + metrics/replay helpers that a GlitchTip-compatible setup mostly doesn't use.
- **Recommendation options** (ranked): (a) lazy error-capture only (buffer errors, load SDK on first error) — kills the always-on cost; (b) swap to bare `@sentry/browser` + manual router breadcrumb (est. −40–60%); (c) accept as-is since it's off the critical path. Also `onRouterTransitionStart` double-imports the SDK (`instrumentation-client.ts:39`) — same chunk, no extra cost.
- Server side (`instrumentation.ts:23-42`): nodejs runtime only, 5% traces — no client impact.

### 7.2 react-joyride 2.9.3

Lazy chunk 96 KB raw / 29 KB gz; loads only when `showTour` is true (fresh tenant after wizard). Cost is acceptable; alternative is a hand-rolled spotlight tour (~2 KB) if the product wants to shave the first-session weight. **Keep as-is for now.**

### 7.3 recharts 3.9.2

One shared lazy chunk (361 KB raw / 103 KB gz) behind `ssr:false` boundaries with skeleton fallbacks; not on any first-load path; default demo tab replaced with a zero-dep CSS chart (`demo/page.tsx:21-32`). If further reduction is ever needed: `uPlot` (~10 KB gz) or pure-SVG line chart would save ~90 KB gz on the 3 chart routes. **Not a priority.**

### 7.4 Others

- `@vercel/speed-insights` gated on `VERCEL` (`layout.tsx:125`) — self-hosted builds ship nothing ✅.
- `sonner` toaster scoped to toast-using layouts (v16-E4) + dynamically imported for the 401 path (`csrf-client.ts:72`) ✅.
- No Google Fonts / external CSS or script origins in actual use (CSP allows them defensively).

---

## 8. Caching Layers, Images, Fonts, PWA

### 8.1 HTTP caching

- **HTML + API responses**: `middleware.ts:54` → `no-store, no-cache, must-revalidate` for everything not static/font — correct for personalized dashboard HTML, but it also means the **prerendered public pages (landing/pricing/privacy/terms) are served no-store**; they're static RSC output that could be `public, max-age=0, must-revalidate` + SWR at the edge. Minor (HTML is only 18 KB gz).
- **Statics**: fonts 7 d + SWR (middleware `FONT_CACHE_CONTROL`), local icons/og-image 1 y immutable, manifest 1 h + SWR (`middleware.ts:31-33`, mirrored in `next.config.ts:50-68` and `vercel.json:11-30`) ✅. Hashed `/_next/static` excluded from the matcher (Next's immutable default) ✅.
- **No data-fetch caching tier at all**: zero `fetch(..., { next: { revalidate } })`, zero route `revalidate` exports, zero `unstable_cache`. All data = client react-query in-memory only.

### 8.2 Images

- `next.config.ts:25` — `images: { unoptimized: true }` (global). Local images used: `brand-icon.png` (rendered at 40×40 in `MobileBottomNav.tsx:114-120` — check actual file size vs display size), icons, hero mockup is pure CSS/SVG. Messenger attachment images in messages page pass `unoptimized` per-instance (`messages/page.tsx:537,547`).
- **Finding**: the global disable was chosen for CDN URL simplicity; local statics could still be optimized by using `remotePatterns` for Messenger CDN + keeping the optimizer on. Impact small (few raster images) — LOW priority.
- No raw `<img>` in app code (only in a doc comment) ✅. `OptimizedImage` wrapper (memo, shimmer, lazy, `sizes`) exists ✅.

### 8.3 Fonts

- Self-hosted subsets with `unicode-range` + `font-display: swap` + preload of `cairo-arabic.woff2` + `readex-pro.woff2` (`layout.tsx:68-74`, `public/fonts/fonts.css`) — solid, no external round-trip, no next/font module overhead.
- Minor: `cairo-latin.woff2` (33.8 KB — the digits/Latin subset that the UI constantly renders, e.g. "1.247", "240 د.ل.") is NOT preloaded; `noto-naskh-arabic.woff2` (94 KB) only loads where `.font-naskh` is used. Preloading cairo-latin too (or dropping the second preload) is a micro-optimization.

### 8.4 Icons

- All `lucide-react` imports are named imports (repo-wide pattern, e.g. `dashboard/page.tsx:5-8`); lucide-react is in Next 16's default `optimizePackageImports` list. **No barrel import problem.**

### 8.5 PWA

- `src/app/manifest.ts` → `/manifest.webmanifest` (name/icons/maskable/standalone/RTL/theme) ✅; cached 1 h + SWR.
- **No service worker**: no `sw.js`, no workbox/serwist, no `serviceWorker.register` anywhere (grep: 0 hits; `public/` contains only icons + fonts). → App is installable but has **no offline, no app-shell precache, no runtime caching**. On Libyan mobile networks (frequent drops), a NetworkFirst/SWR service worker for `/_next/static`, fonts, and GET API responses would convert many failed loads into instant ones. This is a genuine top-5 mobile win.

---

## 9. Ranked Optimization List (impact × effort, with exact changes)

Scores: Impact = expected mobile UX gain (1–5), Effort = engineering cost (1–5, lower = easier).

| # | Fix | Impact | Effort | Where |
|---|---|---:|---:|---|
| 1 | **Un-block the auth gate + de-dupe `/api/me`** | 5 | 2 | `AuthGuard.tsx`, `useSubscriptionStatus.ts` |
| 2 | **Replace programmatic nav with `<Link>` (prefetch)** in bottom bar + sidebar | 5 | 1 | `MobileBottomNav.tsx`, `AdminSidebar.tsx`, `DashboardShell.tsx` |
| 3 | **Persist the react-query cache** (sessionStorage) | 4 | 2 | `QueryProvider.tsx` |
| 4 | **Service worker (PWA offline + runtime cache)** | 4 | 3 | new `public/sw.js` + register in `layout.tsx` |
| 5 | **Sentry client diet** (lazy-load SDK or `@sentry/browser`) | 3 | 2 | `instrumentation-client.ts` |
| 6 | **Pause/trim polling when tab hidden; aggregate analytics endpoint** | 3 | 2 | analytics/audience/activity pages + backend |
| 7 | **`placeholderData` for paginated/filter queries** | 2 | 1 | `admin/support/page.tsx`, future paginated pages |
| 8 | **`router.push` instead of `window.location.href` for in-app CTAs** | 2 | 1 | `dashboard/page.tsx`, `analytics/page.tsx`, `admin/page.tsx` |
| 9 | **Sequences step_count in list contract (kill N+1)** | 2 | 2 | backend `routers/sequences.py` + `sequences/page.tsx` |
| 10 | **Server-side data for read-heavy pages (RSC + cookie forwarding)** | 5 | 5 | dashboard/analytics/reports/… pages |
| 11 | Public HTML SWR + cairo-latin preload (micro) | 1 | 1 | `middleware.ts`, `layout.tsx` |

### #1 — Un-block the auth gate + de-dupe `/api/me` (the waterfall killer)

Today: `AuthGuard` renders a spinner until `/api/me` resolves, then children mount and start their queries; `useSubscriptionStatus` re-fetches the same endpoint in parallel.

Minimal change (keeps the guard semantics, removes the serialization + the duplicate):

```tsx
// AuthGuard.tsx — route the session through react-query ONCE (dedupe with
// useSubscriptionStatus via the shared ["me"] key), and stop blocking paint:
const { data: me, isLoading, isError } = useQuery({
  queryKey: ["me"],
  queryFn: () => apiFetch("/api/me").then(unwrapApi),
  staleTime: 30_000,          // ← was: raw fetch, per-pathname, no cache
  retry: 1,
})
// render children IMMEDIATELY with the existing loading.tsx/skeletons;
// do the role/platform-admin redirect in an effect when data arrives.
```
And in `useSubscriptionStatus.ts`: delete `staleTime: 0`, `refetchOnMount: "always"` and the `pathname` `refetch()` effect (lines 52-61) — the shared `["me"]` entry with a 30–60 s staleTime keeps the sidebar CTA honest without a per-navigation request. Net effect: −1 RTT per navigation and skeletons start one RTT earlier.

### #2 — `<Link>` prefetch for the nav (one-file change, biggest tap-latency win)

```tsx
// MobileBottomNav.tsx — replace <button onClick={() => go(item.href)}> with:
import Link from "next/link"
<Link
  href={item.href}
  onClick={() => setSheetOpen(false)}
  prefetch   // App Router prefetches the RSC payload when this is in viewport
  className={…same classes…}
>
  <item.icon className="size-5" /><span>{item.label}</span>
</Link>
```
Same for the 4 always-visible bar items, the 23 sheet items, and `AdminSidebar.tsx:159-160` (`onKeyDown` handler can go — `<Link>` handles Enter/Space natively). `DashboardShell.handleNavigate` remains for programmatic cases only. Expected: taps on prefetched sections skip RTT 1 entirely (the RSC payload + chunks are already in the router cache).

### #3 — Persist the query cache

```tsx
// QueryProvider.tsx
import { persistQueryClientSave } from "@tanstack/react-query-persist-query-client" // (or hand-rolled: subscribe + sessionStorage)
new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 1 } } })
// persist ["rules"], ["pages"], ["team"], ["plans"], ["sequences"] list payloads to
// sessionStorage on settle; hydrate on mount; maxAge 24h; never persist ["me"] / inbox threads.
```
Back-navigation and app re-launch on mobile then render from cache instantly and revalidate in the background — the literal definition of the demanded "instant" feel. (messages/threads already have per-key staleTime/gcTime discipline — reuse their list-level values.)

### #4 — Service worker

Add `public/sw.js` (hand-rolled or `serwist`): precache `/fonts/*`, app shell routes; runtime `stale-while-revalidate` for `/_next/static/**`; `NetworkFirst` with JSON fallback for GET `/api/public/stats`, `/api/plans`; NEVER cache authenticated `/api/*` (no-store + token scope). Register in `layout.tsx` behind `process.env.NODE_ENV === "production"` + a version query param. Middle-east mobile networks drop constantly; this turns drops into cached paints.

### #5 — Sentry diet

Option A (cheapest, keeps full SDK semantics): load the SDK **on first error or after `requestIdleCallback` + 3 s**, buffer early errors:
```ts
// instrumentation-client.ts — error-triggered lazy init
const buffer: unknown[] = []
window.addEventListener("error", e => { buffer.push(e); ensureSdk() }, { once: true })
```
Option B: `@sentry/browser` core + manual `onRouterTransitionStart` breadcrumb (drop the nextjs wrapper's extra code paths). Either removes the 178 KB gz always-on tax from most page views (errors are rare).

### #6 — Polling hygiene

- All polled queries already stop in background tabs (`refetchIntervalInBackground` default false) ✅ — but they keep firing while the tab is visible even when nothing changed. For 30–60 s pages (team, scheduled, posts, broadcast, calendar, audience, analytics) consider visibility-driven refetch (refetch on `visibilitychange` → visible, with `staleTime` ≥ poll interval) — fewer requests, same perceived freshness.
- Analytics: ask backend for `/api/analytics/bundle?days=30` returning daily-trend + heatmap + peak + top-rules + comparison in one payload (mirror of the existing `/api/dashboard/bundle` pattern, `dashboard/page.tsx:248-253`) — 6 requests/min → 1.
- Activity page at 15 s (`activity/page.tsx:34`) is the most aggressive non-inbox poll; 30 s is plenty for an audit log.

### #7 — `placeholderData` on paginated queries

```tsx
// admin/support/page.tsx:125
const ticketsQuery = useQuery({
  queryKey: ["admin-support-tickets", status, page],
  queryFn: …,
  placeholderData: (prev) => prev,   // ← add; keep page-2 skeleton-free
  retry: 1,
})
```
(Identical to the proven `messages/page.tsx:146` pattern; dim via `isPlaceholderData`.)

### #8 — Kill in-app hard reloads

`dashboard/page.tsx:109,113,417`, `analytics/page.tsx:100`, `admin/page.tsx:135`: swap `window.location.href = X` → `router.push(X)` (or `<Link>`). Preserves SPA state + query cache; saves a full document+JS reload (~1–2 s on 3G each occurrence).

### #9 — Sequences step_count server-side

Backend: include `step_count` in `GET /api/sequences` rows (single `COUNT(*)` join or annotated query). Frontend: drop the `Promise.all` detail fan-out (`sequences/page.tsx:569-584`) and read `s.step_count`. Mount cost goes from 1+N requests to 1.

### #10 — Server-side data (strategic, biggest long-term payoff)

The middleware already gates `/dashboard` on the `token` cookie server-side. Convert read-heavy pages (dashboard, analytics, reports, audience, leads, posts, comments, team, scheduled, activity) to RSC pages that fetch `https://api.smart-link.ly/api/...` server-side with forwarded cookies (`fetch(url, { headers: { cookie }, next: { revalidate: 30 } }`), stream with `<Suspense>` + existing skeletons, and leave only mutations/interactive filters as client islands. First paint then contains real data (RTT 2/3 disappear), and skeletons only guard below-fold sections. This is the "world-class" end-state; items #1–#3 deliver 80% of the felt improvement at 10% of the effort, so sequence them first.

---

## 10. Appendix — Verification data

- Build: `next build` (Turbopack, BUILD_ID `PUrmH_d95VgSQQpgA28p_`), `.next` = 219 MB, total emitted chunks 3.5 MB raw.
- Budget check (repo's own gate): common base gzip 186.3 KB ≤ 190 KB → **PASS** (script exit 0).
- Route→chunk mapping verified via `.next/server/app/*.html` script-tag extraction; async chunks (sentry/recharts/joyride) verified absent from HTML script tags (loaded via dynamic import) and present in `.next/static/chunks/`.
- `react-joyride` referenced only by `OnboardingTour.tsx` (dynamic since v9-E5); `recharts` imported only by `charts/index.tsx` + `charts/TrendLineChart.tsx` (both behind dynamic boundaries).
- Polling inventory: 14 files with `refetchInterval` (counts: messages 8 s/5 s, comments 20 s, activity 15 s, autoreply 30 s, scheduled 30 s, team 30 s, posts 30 s, broadcast 30 s, calendar 60 s, dashboard 60 s, audience 3×60 s, analytics 6×60 s, dashboard-bundle 60 s).
- `useQuery` file inventory (26 files): dashboard/{page,analytics,messages,posts,autoreply,sequences,calendar,activity,ads,scheduled,billing,comments,audience,support,tools,team,settings,pages,notifications,reports,broadcast,leads,marketing}, admin/{support,telegram}, hooks/useSubscriptionStatus.
- No service worker (grep `serviceWorker|sw.js|workbox|registerSW` → 0 hits). PWA = manifest only.
- Read-only compliance: no source file modified. Files written: this report + worklog entry.

**Bottom line:** the bundle layer is already optimized (prior rounds did that work well); the remaining mobile latency lives in (a) the client-side auth-then-data waterfall, (b) prefetch-less programmatic navigation, (c) no cache persistence/no SW, and (d) the always-on Sentry SDK. Fixes #1, #2, #3, #8 are one-day work with the largest "instant" payoff.
