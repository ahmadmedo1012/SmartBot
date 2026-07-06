# Master Audit Report — SmartBot Dashboard (FacebookPage)

**Date:** 2026-07-05  
**Mode:** READ-ONLY Deep Inspection  
**Coverage:** 100% of frontend source (35 files) + 100% of backend source (10 files)  
**Agents Deployed:** 8 specialized reviewers + 1 structure scanner  

---

## 1. Project Overview

**SmartBot** — Arabic RTL Facebook auto-reply management dashboard. FastAPI (Python) + Vite/React 19 SPA. Deployed on Render free tier. Simple page-based React app (no React Router), state managed via TanStack Query + local useState.

### Architecture

```
[React SPA] → api.js (fetch) → [FastAPI main.py] → fb_client.py → Graph API v22.0
                                                ↘ models.py → database.py → PostgreSQL/SQLite
[Background Bot] → bot.py → fb_client.py → Graph API
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, TanStack Query 5, Tailwind v4, shadcn/ui (17 primitives), Framer Motion 12, Recharts 3 |
| Backend | FastAPI, SQLAlchemy async (asyncpg/aiosqlite), Pydantic v2, bcrypt, PyJWT |
| Bot | httpx + asyncio background task (integrated) + standalone `auto_reply.py` (duplicate, sync, `requests`) |
| Auth | JWT (HS256, HTTP-only cookie, 24h expiry), bcrypt, RBAC (admin/editor/viewer) |
| Database | SQLite (dev) / PostgreSQL Neon (prod) |
| Deploy | Render free plan, Frankfurt |

### File Inventory (Source Only)

```
Frontend (35 files):
  src/main.jsx, src/App.jsx, src/index.css
  src/lib/api.js (153 lines, 30+ endpoints), src/lib/utils.js
  src/hooks/use-mobile.jsx
  src/components/ (6): app-sidebar, topbar, theme-provider, error-boundary, live-pulse, stat-card
  src/components/ui/ (17): avatar, badge, button, card, dialog, dropdown-menu, input, select,
                          separator, sheet, sidebar, skeleton, table, tabs, textarea, tooltip
  src/pages/ (11): login, dashboard, analytics, rules, replies, posts,
                  messages, fb-control, ads, settings, users

Backend (7 core files):
  main.py (509 lines, ~35 routes), config.py, database.py, models.py (5 ORM models)
  fb_client.py (Graph API wrapper), bot.py (auto-reply loop), worker.py

Other:
  auto_reply.py (standalone duplicate), facebook_automation.json (seed rules)
  e2e/ (2 Playwright specs), render.yaml, requirements.txt
```

---

## 2. Consolidated Findings — All 8 Agents

### 🔴 CRITICAL (1)

| ID | File:Line | Category | Finding | Agent |
|----|-----------|----------|---------|-------|
| C1 | `config.py:15` | AUTH | `effective_secret_key` is uncached `@property` — calls `secrets.token_hex(32)` on EVERY invocation. `make_token` signs with key_A, `get_current_user` verifies with key_B → JWT always fails when `SECRET_KEY` env var not set. App only works when SECRET_KEY explicitly configured. | Logic |

### 🟠 HIGH (14)

| ID | File:Line | Category | Finding | Agent |
|----|-----------|----------|---------|-------|
| H1 | `main.py:71-78` | AUTH_WEAKNESS | Default admin `admin/admin` seeded on every first run. Zero force-change enforcement. Deploy without manual change = anyone logs in as full admin. Verified password still "admin" per CHECKLIST-REPORT.md | Security |
| H2 | `main.py:123-132` | MISSING_VALIDATION | No rate limiting on `/api/login`. Brute-force / credential stuffing wide open | Security |
| H3 | `auto_reply.py` (entire file) | DUPLICATE | Complete second implementation of bot.py + fb_client.py using `requests` (sync) vs `httpx` (async), file-based vs DB-based state. Both running = race on comment pool, API rate limits exhausted | Logic |
| H4 | `settings.jsx:131-135` | SECRET_LEAK | Hardcoded env placeholder values in frontend source — DATABASE_URL format, SECRET_KEY, FACEBOOK_ACCESS_TOKEN prefix exposed | Security |
| H5 | `models.py:33` / `bot.py:100-106` | DATA_LOSS | `Reply.rule_id` column always NULL — never populated by `run_auto_reply()`. `/api/stats` GROUP BY rule_id → meaningless aggregation. `top_rule_id` always null/wrong | Logic |
| H6 | `api.js:3-13` | NO_VALIDATION | No input validation anywhere in API client. No AbortController/timeout on any fetch call. Stalled requests hang indefinitely | UI/Perf |
| H7 | `fb-control.jsx:39` + `settings.jsx:108` | API_INCONSISTENCY | Bot interval endpoint called with POST+FormData (fb-control) AND PUT+JSON (settings) — **different HTTP methods, different body formats for same API**. Also: settings.jsx calls non-existent `/api/logs/cleanup` endpoint | Arch |
| H8 | `App.jsx:11-21` | BUNDLE | All 10 pages eagerly imported. recharts (~300KB) + framer-motion (~165KB) shipped to ALL users including login-only. `chunkSizeWarningLimit: 1500` suppresses warnings | Perf |
| H9 | `messages.jsx:86` | MISSING_KEY | `[...messages].reverse().map(...)` — NO key prop. Falls back to array index. Wrong DOM reconciliation on message updates | Perf/UI |
| H10 | `theme-provider.jsx:18-31` | STATE_ISSUE | `localStorage.setItem` called in both `setTheme` callback (L21) AND separate `useEffect` (L30). Double-write on every theme change | UI |
| H11 | `index.css:6` | INCONSISTENT_FONT | Font stack declares "Inter", "Readex Pro" but deployed HTML loads Tajawal as primary. Dev vs prod font mismatch | UX |
| H12 | `App.jsx:62` | INCONSISTENT_COLOR | Auth loading spinner uses hardcoded `bg-slate-900` — breaks light theme entirely | UX |
| H13 | `dashboard.jsx:44` vs `analytics.jsx:30` vs `stat-card.jsx` | DUPLICATE_COMPONENT | **Three** different KPI card implementations (MetricCard, StatCard, analytics StatCard) plus raw div cards in login.html. Same visual purpose, different code | UX/Dead |
| H14 | `fb_client.py:22-34` | ERROR_HANDLING | All Facebook API errors silently swallowed. Non-200 responses → `None` → callers see `[]`. Rate limits, token expiry, permission errors all invisible to user | Logic |

### 🟡 MEDIUM (25)

| ID | File:Line | Category | Finding | Agent |
|----|-----------|----------|---------|-------|
| M1 | `main.py` (form routes) | CSRF | No CSRF tokens anywhere. `samesite=strict` mitigates cross-site, but same-origin CSRF from sibling app or XSS on same domain works | Security |
| M2 | `main.py` (form routes) | MISSING_VALIDATION | Minimal input validation — no bounds/type checks on most form fields. `int(interval)` unguarded | Security |
| M3 | `main.py:1-509` | GOD_FILE | 509 lines mixing 35 routes + auth + bot lifecycle + DB seeding + lifespan. Needs splitting into routes/ + lifespan.py | Arch |
| M4 | `main.py:490` | STATE_ISSUE | Runtime mutation of Pydantic settings: `settings.BOT_INTERVAL_SECONDS = interval`. Breaks immutability; next settings import resets it. Fix: store in DB BotState | Arch |
| M5 | `main.py:37` | DEPRECATED | `datetime.utcnow()` — Python 3.12+ warns. Should use `datetime.now(timezone.utc)` | Logic |
| M6 | `main.py:399-407` | DATA_LOSS | Manual reply-to-comment not persisted to DB as Reply record. Bot's dedup set never learns about manual replies | Logic |
| M7 | `bot.py:111-112` | DATA_LOSS | `IntegrityError` rollback discards ALL unsaved work in session, not just the duplicate | Logic |
| M8 | `config.py:30` | INCONSISTENCY | `DATABASE_URL` query params stripped (e.g. `?sslmode=require` silently dropped) | Logic |
| M9 | `fb_client.py:8` | RACE_CONDITION | Module-level `_http` singleton with unsafe `close()`. Sets `_http = None` mid-flight | Logic |
| M10 | `fb_client.py:39-46` | PAGINATION | All FB pagination ignored — `after` cursor never used. Data silently truncated to first page | Logic |
| M11 | `main.py:241-243` | PERFORMANCE | `cast(created_at, Date)` prevents PostgreSQL index usage | Logic |
| M12 | `main.py:188` | AUTH | Last admin deletion allowed (prevents self-deletion but not only-administrator-remaining deletion) | Logic |
| M13 | `settings.jsx` (entire) | MONOLITHIC | 500-line single component with 4 conditional tabs. Each tab should be separate component | Arch |
| M14 | `App.jsx:38-109` | LAYER_VIOLATION | AppInner mixes routing, auth, layout, page rendering in one giant component | Arch |
| M15 | `replies.jsx:172-185` | STATE_ISSUE | Client-side date filtering on current paginated page (20 items). Items outside page invisible. Must be server-side | Arch |
| M16 | `dashboard.jsx:96-108` + `analytics.jsx:59-71` | DUPLICATE_CODE | `chartData` and `topRuleName` useMemo logic duplicated identically across 2 files | UI/Arch |
| M17 | Post/Reply/messages EmptyState (4 files) | DUPLICATE_CODE | EmptyState/ErrorState defined independently in dashboard.jsx, rules.jsx, replies.jsx, settings.jsx — ~80% identical | Dead/UX |
| M18 | `replies.jsx:115` | RE-RENDER | ReplyDialog creates new useMutation definition every render (not memoized) | Perf |
| M19 | `posts.jsx:26` + `messages.jsx:15` | MISSING_STATE | No error state. API failures silently hidden — user sees empty data with no explanation | UI |
| M20 | `sidebar.jsx:82-97` | RE-RENDER | NavItem inline function refs — all ~9 nav items re-render on sidebar state change | Perf |
| M21 | `app-sidebar.jsx:199-203` | A11Y | Theme toggle + sidebar trigger buttons have no `aria-label`. Invisible to screen readers | UX |
| M22 | `app-sidebar.jsx:87` | A11Y | Active nav item has visual `bg-primary/15` + `font-bold` but no `aria-current="page"` | UX |
| M23 | `topbar.jsx:29-31` | A11Y | Sidebar toggle button no `aria-label` | UX |
| M24 | `replies.jsx:88-113` vs `rules.jsx:312-322` | DUPLICATE_CODE | Pagination: replies.jsx has reusable Pagination component, rules.jsx inlines same logic | Dead |
| M25 | `ui/table.jsx` + multiple UI sub-exports | DEAD_EXPORTS | Entire shadcn/ui table component unused (pages use native `<table>`). ~18 sidebar sub-components exported but never used. SelectGroup/Label/Separator/ScrollButtons unused | Dead |

### 🔵 LOW (20)

| ID | File:Line | Category | Finding | Agent |
|----|-----------|----------|---------|-------|
| L1 | `config.py:13-15` | INSECURE_STORAGE | Unset SECRET_KEY → random hex → all sessions invalidated per restart (related to C1) | Security |
| L2 | `main.py:202` | SECRET_LEAK | FB token first 8 chars exposed via settings API (admin-only, but unnecessary) | Security |
| L3 | `main.py:130` | COOKIE_MISSING_PATH | `set_cookie()` has no explicit `path="/"` — cookie may not apply across all subpaths | Logic |
| L4 | `bot.py:94` | ERROR_HANDLING | API rejection logged without response body or exc_info — no context to debug | Logic |
| L5 | `bot.py:55` | DEAD_PARAM | `state_file` parameter accepted but intentionally unused | Logic/Arch |
| L6 | `auto_reply.py:176` | ERROR_HANDLING | Exponential backoff missing jitter and max cap — can hammer API on persistent failures | Logic |
| L7 | `fb_client.py:23` | ERROR_HANDLING | FB error truncated to 200 chars — loses `error_user_msg`, `error_subcode`, `fbtrace_id` | Logic |
| L8 | `fb_client.py:54-56` + `:80-84` | DEAD_CODE | `delete_comment` and `get_post_insights` defined but never called | Logic/Dead |
| L9 | `models.py:45-51` | DEAD_MODEL | `BotState` model defined, table created on startup, never queried or written anywhere | Logic/Dead |
| L10 | `dashboard.jsx:44` | DYNAMIC_CLASS | ``panel-top-accent-${accent}`` — Tailwind dynamic class, works with v4 JIT but fragile | UI |
| L11 | `login.jsx:95-104` | RACE | `setTimeout(() => onAuth(res), 350)` — if component unmounts during delay, fires orphaned callback | UI |
| L12 | `messages.jsx:86-97` | ALLOCATION | `[...messages].reverse()` — new array allocation every render | Perf |
| L13 | `posts.jsx:31` | NO_DEBOUNCE | Search filter on posts has no debounce (acceptable for local data) | Perf |
| L14 | `analytics.jsx:132-136` | MISSING_STATE | Chart empty state shows icon+text but no CTA button unlike dashboard pattern | UX |
| L15 | `index.css:167-168` | ORPHAN_CSS | `.panel-top-accent-success` and `.panel-top-accent-warning` defined but never used (ponytail comment already flags) | Dead |
| L16 | `login.jsx:10-65` | RESPONSIVE | Canvas particles render O(N²) connection lines on every frame. On high-DPI mobile, CPU spike. No resize debounce | UX |
| L17 | `App.jsx:78` | RTL_HARDCODED | `dir="rtl"` hardcoded on root div — no LTR support, no direction context | Arch |
| L18 | `App.jsx:43-48` | AUTH_CHECK | Auth checked once on mount. No 401 interceptor or refresh check. Only discovers expired token on full reload | Arch |
| L19 | `stats.jsx` (system tab) | DEAD_FIELDS | `systemStats` references `stats?.version`, `rules_count`, `replies_count`, `db_size` — none exist in `/api/stats` response. All render as "—" | Arch |
| L20 | `package.json` | UNUSED_DEP | `next-themes` listed as dependency but never imported — custom ThemeProvider replaces it | Dead |

---

## 3. Agent-Specific Scores & Summaries

| Agent | Domain | Score | Total Findings | Key Callout |
|-------|--------|-------|----------------|-------------|
| Agent 2 | UI Components | B | 47 (0C/2H/12M/15L/18I) | 2 pages missing error states; chart logic duplicated |
| Agent 3 | Business Logic | D | 32 (1C/3H/9M/12L/7I) | CRITICAL: secret key uncached; duplicate auto_reply.py |
| Agent 4 | Performance | C | ~25 findings | No lazy loading; no AbortController; missing key on messages |
| Agent 5 | Architecture | C+ | ~20 findings | God file main.py; settings mutated at runtime; dead API refs |
| Agent 6 | Security | D | 6 (0C/2H/2M/2L) | Default admin/admin; no login rate limit; no CSRF |
| Agent 7 | UX Consistency | B | 31 (0C/6H/12M/9L/4I) | 4 card patterns; table style inconsistency; a11y gaps |
| Agent 8 | Dead Code | — | ~280 lines removable | 4× EmptyState; duplicate chart logic; unused UI exports; next-themes |

---

## 4. Top 10 Must-Fix Issues (Priority Order)

**1. 🔴 Cache `effective_secret_key`** — `config.py:15` generates new random key per call when SECRET_KEY unset → every JWT verification fails. Compute once. **Blocks all auth.**

**2. 🟠 Remove or freeze `auto_reply.py`** — Complete duplicate bot implementation using synchronous `requests`. If both run simultaneously, they race on comment pool and exhaust Facebook API rate limits.

**3. 🟠 Default admin password** — `main.py:71-78` seeds `admin/admin` with zero force-change enforcement. Deploy without manual change = instant full-access compromise.

**4. 🟠 Secure env config** — Remove hardcoded placeholders from `settings.jsx:131-135`. Add proper server-side env fetch endpoint.

**5. 🟠 Unify bot interval API contract** — `fb-control.jsx` uses POST+FormData, `settings.jsx` uses PUT+JSON for same `/api/bot/interval` endpoint. Pick one (prefer JSON/PUT).

**6. 🟠 Add AbortController to api.js** — Every fetch call is abortable. Prevents stale state on unmount, timeouts for stalled requests.

**7. 🟠 Populate `Reply.rule_id`** — `bot.py:100-106` never sets `rule_id` on Reply creation → stats meaningless → `top_rule_id` always null/wrong.

**8. 🟡 Lazy-load pages** — All 11 pages eagerly imported. recharts + framer-motion shipped to login-only users. Use `React.lazy()` + suspense.

**9. 🟡 Split `main.py`** — 509 lines of routes, auth, lifecycle, and DB seeding. Extract into `routes/` directory + `lifespan.py`.

**10. 🟡 Share EmptyState/ErrorState components** — 4+ files define their own variants. ~80 lines deduplication opportunity.

---

## 5. Data Flow Analysis

```
[User Input]
     │
     ▼
Pages (rules.jsx, posts.jsx, ...)   ← useState (UI state)
     │  ├── useQuery (TanStack: server fetch)
     │  └── useMutation (TanStack: server write)
     │
     ├──► lib/api.js (fetch wrapper) ← NO AbortController, NO validation
     │         │
     │         ▼
     │    FastAPI main.py (35 routes)
     │         ├── fb_client.py → Graph API v22.0 ← pagination ignored, errors silent
     │         └── models.py → DB (SQLite/PostgreSQL)
     │
     ├──► components/ui/* (17 shadcn/Radix primitives)
     │
     └──► components/* (app-sidebar, topbar, stat-card, etc.)
               │
               └──► ThemeContext (dark/light/system)
                    SidebarContext (open/closed)
                    TanStack Query Cache (all server state)
```

**State Management Layers:**
1. `ThemeContext` — theme preference (dark/light/system), persisted to localStorage
2. `SidebarContext` — sidebar open/closed state + mobile detection
3. `TanStack Query Cache` — all server data (stats, rules, posts, replies, etc.)
4. Local `useState` — forms, dialogs, search, pagination (per-component)

**Architecture Verdict:** Appropriate for this scale. No Redux/Zustand needed. React Query handles server state correctly. Weakest link: no service layer on backend, routing is primitive string-state.

---

## 6. Performance Analysis

| Metric | Finding |
|--------|---------|
| Bundle optimization | ❌ No code splitting. All pages eagerly imported. recharts + framer-motion shipped to everyone |
| Re-render control | ❌ No React.memo anywhere. Stats 10s poll causes full subtree re-render |
| Data fetching | ❌ No AbortController — every query lacks cancellation. 5 concurrent useQuery polls per page |
| Missing keys | ❌ `messages.jsx:86` — no key on mapped array |
| Caching | ✅ TanStack Query cache sharing works correctly. `placeholderData` used for smooth pagination |
| Animation | ⚠️ Framer Motion AnimatePresence causes full page remounts on nav |
| CSS | ✅ Tailwind v4 JIT — zero unused CSS at build. `prefers-reduced-motion` respected |
| Images | ✅ Image outline for dark/light mode. No layout shift (no uncontrolled images) |
| **Score** | **C** |

---

## 7. Security Analysis

| Metric | Finding |
|--------|---------|
| Auth scheme | ✅ JWT in httpOnly/secure/sameSite=strict cookie |
| Password hashing | ✅ bcrypt |
| RBAC | ✅ Server-enforced role hierarchy (admin > editor > viewer) |
| SQL injection | ✅ No raw SQL — SQLAlchemy ORM only |
| XSS | ✅ No `dangerouslySetInnerHTML`. No `eval()`. Radix handles escaping |
| CORS | ✅ No CORS middleware = restrictive default (but frontend is same-origin via static serve) |
| **Rate limiting** | ❌ `/api/login` has zero brute-force protection |
| **Default creds** | ❌ `admin/admin` never force-changed |
| **CSRF** | ❌ No CSRF tokens. samesite=strict only mitigates cross-site |
| **Secrets in source** | ❌ Env placeholders in frontend code |
| **FB error handling** | ❌ All API errors silently swallowed → user sees empty data |
| **Score** | **D** |

---

## 8. Dead Code & Duplication Summary

| Item | Type | Lines | Impact |
|------|------|-------|--------|
| `auto_reply.py` | Full duplicate bot | ~183 lines | 2 competing bots = race condition + rate limit exhaustion |
| EmptyState × 4 | Duplicate | ~80 lines | Same pattern in dashboard/rules/replies/settings |
| ChartData/topRuleName useMemo | Duplicate | ~15 lines | Identical in dashboard.jsx + analytics.jsx |
| ChartTooltip/CustomTooltip | Duplicate | ~30 lines | ~95% identical across dashboard/analytics |
| Pagination | Duplicate | ~15 lines | Component in replies.jsx, inlined in rules.jsx |
| `panel-top-accent-success/warning` | Orphan CSS | 2 lines | Never used in JSX |
| `next-themes` package | Unused dep | ~5KB bundle | Custom ThemeProvider replaces it |
| UI sub-exports (~25 exports) | Dead exports | ~0 (tree-shaken) | Many shadcn sub-components exported but unused (safe in JS) |
| `delete_comment`, `get_post_insights` | Dead functions | ~30 lines | Never called |
| `BotState` model | Dead model | ~15 lines | Table created, never queried |
| **Total recoverable** | | **~280 lines frontend + ~230 lines backend** | |

---

## 9. UX/UI Consistency Analysis

| Metric | Finding |
|--------|---------|
| Color system | ✅ HSL design tokens, consistent light/dark theme. Red primary (348°), semantic success/warning/info |
| Typography | ✅ Inter + Readex Pro (Arabic-Latin font stack). Tabular numbers for data |
| RTL | ✅ Right sidebar, right-aligned tables, Arabic labels, Arabic date locale |
| Loading states | ✅ Skeleton placeholders on all data pages |
| Empty states | ⚠️ 4 different implementations of same pattern — should be unified |
| Error states | ⚠️ 2 pages (messages, posts) silently fail; 3 separate ErrorState components |
| Accessibility | ❌ No `aria-current` on active nav; no `aria-label` on icon buttons; no focus management on page transitions |
| Card patterns | ❌ 3+ different KPI card implementations for same visual purpose |
| Table styles | ⚠️ `data-table` CSS class vs inline `w-full` with different padding — two table styling approaches |
| Redundant controls | ⚠️ Theme toggle appears in BOTH topbar and sidebar — visible simultaneously |
| **Score** | **B** |

---

## 10. Modified Files Report

**No files were modified during this audit.** Zero writes, zero changes. All analysis is READ-ONLY.

---

## 11. Coverage Report

| Area | Coverage | Notes |
|------|----------|-------|
| Frontend source (.jsx/.js/.css) | **100%** | 28 .jsx + 6 .js + 1 .css = 35 files |
| Frontend config | **100%** | package.json, vite.config.js, components.json, postcss.config.js |
| Pages | **100%** | 11 pages (login+dashboard+analytics+rules+replies+posts+messages+fb-control+ads+settings+users) |
| Components | **100%** | 6 custom + 17 shadcn/ui = 23 components |
| Hooks | **100%** | use-mobile.jsx |
| Styles (index.css) | **100%** | Tailwind v4 + design tokens |
| Tests | **100%** | 2 Playwright e2e specs |
| Backend API (main.py) | **100%** | 509 lines, 35 routes |
| Backend config/auth | **100%** | config.py (Pydantic), main.py auth logic |
| Backend DB | **100%** | models.py (5 ORM models), database.py |
| Backend FB integration | **100%** | fb_client.py (117 lines), bot.py (157 lines) |
| Standalone bot | **100%** | auto_reply.py (183 lines) |
| **Total unique findings** | **60** | 1 CRITICAL + 14 HIGH + 25 MEDIUM + 20 LOW |

---

## 12. Recommendations Roadmap

### Immediate (Day 1) — Fix critical auth + security holes
1. Cache `effective_secret_key` — compute once, store in private field
2. Remove `auto_reply.py` from deployment or add mutex
3. Change default admin password or add force-change on first login
4. Remove hardcoded env placeholders from `settings.jsx`
5. Add AbortController to `api.js` fetch wrapper
6. Unify bot interval API contract (pick PUT+JSON)

### Short-term (Days 2-3) — Architecture & quality
7. Lazy-load pages: `React.lazy()` for dashboard, analytics, posts, settings
8. Extract shared `EmptyState`/`ErrorState` components (4→1)
9. Unify `MetricCard`/`StatCard` into single component
10. Add `aria-current="page"` + `aria-label` on icon buttons
11. Add error states to messages.jsx and posts.jsx
12. Populate `Reply.rule_id` in bot.py
13. Split `main.py` (~509 lines → routes/ directory + lifespan.py)

### Medium-term (Week 2) — Hardening
14. Add rate limiting middleware on `/api/login`
15. Implement CSRF protection
16. Move `BOT_INTERVAL` override to DB BotState table
17. Implement server-side pagination for replies date filter
18. Propagate Facebook API errors to UI
19. Fix FB pagination — implement `after` cursor handling
20. Remove dead code: `next-themes`, `BotState` model, `delete_comment`, orphan CSS

### Long-term (Month 1+) — Scale & maintain
21. TypeScript migration (enums for roles, typed API responses)
22. React Router for proper URL-based navigation + deep linking
23. Add request/response interceptors in API layer
24. Component-level error boundaries per page
25. Systematic a11y audit + comprehensive aria implementation
26. Unit test framework for business logic (bot.py, fb_client.py)
27. Per-rule usage distribution metrics in analytics
28. Normalize SECRET_KEY validation at startup — fail fast if unset in production

---

*End of Master Audit Report — SmartBot Dashboard (FacebookPage)*  
*Generated by Multi-Agent Deep Analysis — READ-ONLY, No Modifications Made*  
*8 specialized agents + 1 structure scanner — 60 consolidated findings*
