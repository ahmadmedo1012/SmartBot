# SmartBot Remediation Plan

> Generated from 40-agent audit comparing SmartBot vs smart-menu reference project
> Date: 2026-07-16 | Total findings: 197 (11 critical, 25 high)

---

## Phase 0: Critical Bugs (P0) — 7 agents, 0 dependencies

### 0.1 Fix login-by-email crash
- **File**: `fb_dashboard/routers/auth.py:87`
- **Problem**: Login with email stores email as JWT `sub`, then `get_current_user` queries `User.username == payload['sub']` which fails → 401
- **Fix**: After login query, use `user.username` (not form input) as JWT subject
- **Agent count**: 1

### 0.2 Fix subscription API response
- **File**: `fb_dashboard/routers/payments.py:153` + `fb_dashboard/frontend/src/app/subscribe/page.tsx:67`
- **Problem**: Frontend expects `{provider, ussd, payment_id}` from POST /api/subscriptions, backend returns `{payment_id, status, message}` only. No USSD code generation exists.
- **Fix**: Make backend return `provider` from request + generate USSD codes. Or make frontend match backend response. Prefer aligning with smart-menu's `PaymentDialog` pattern.
- **Agent count**: 2

### 0.3 Fix double sidebar + broken nav
- **File**: `fb_dashboard/frontend/src/app/dashboard/page.tsx:150`
- **Problem**: Page renders its own stub sidebar over DashboardShell's full AdminSidebar. Nav links in AdminSidebar point to `/messages` instead of `/dashboard/messages`.
- **Fix**: Remove inline sidebar from page.tsx, fix AdminSidebar route hrefs to include `/dashboard/` prefix
- **Agent count**: 1

### 0.4 Secure webhook endpoints
- **File**: `fb_dashboard/runner.py:450`, `runner.py:759`
- **Problem**: Telegram webhook has no auth when `TELEGRAM_WEBHOOK_SECRET` is empty. Facebook webhook HMAC disabled when `FACEBOOK_APP_SECRET` is empty. Anyone can POST payment approve/reject or fake comments.
- **Fix**: Set secrets in .env.prod, add HMAC verification, add IP allowlisting
- **Agent count**: 1

### 0.5 Standardize API error responses
- **Files**: `dashboard_stats.py:108`, `admin_routes.py:48`, `facebook_routes.py:191`, `ai.py:71`, `widgets_routes.py:117`
- **Problem**: Inconsistent error patterns — some use JSONResponse, some return 200 with error key, some use HTTPException
- **Fix**: Add middleware/helper that catches all unhandled exceptions, standardize on `{"detail": "..."}` pattern via HTTPException
- **Agent count**: 1

### 0.6 Add frontend middleware with security headers
- **File**: `fb_dashboard/frontend/` — create `middleware.ts`
- **Problem**: No middleware.ts exists. No CSP, HSTS, X-Frame-Options, or auth gate at edge level.
- **Fix**: Create `middleware.ts` matching smart-menu pattern: public prefixes, auth gate for `/admin/*` and `/dashboard/*`, security headers (CSP, HSTS, nosniff, DENY, Permissions-Policy)
- **Agent count**: 1

### 0.7 Fix AuthGuard redirect loop + role check
- **File**: `fb_dashboard/frontend/src/app/dashboard/AuthGuard.tsx`
- **Problem**: Transient fetch error → immediate /login redirect. No role check — non-admins can see /admin shell. Cookie timing race on login redirect.
- **Fix**: Add retry logic on fetch failure, role-based redirect, shared auth context. Add timeout for loading state.
- **Agent count**: 1

---

## Phase 1: Auth Restructure (P0-P1) — 5 agents, depends on Phase 0.7

### 1.1 Align auth response formats with smart-menu
- **Files**: `routers/auth.py` + frontend pages
- **Problem**: `/api/login` returns `{ok, role}`, `/api/me` returns `{authenticated, role}`. smart-menu uses `{success, data: {user: {role}}}` pattern with session cookies.
- **Fix**: Keep JWT pattern but standardize response wrappers. Add `user` object in login response. Move to `{success, data/message}` pattern.
- **Agent count**: 1

### 1.2 Add cookie dev-mode bypass
- **File**: `fb_dashboard/routers/auth.py:91`
- **Problem**: `secure=True` hardcoded. Breaks on localhost HTTP without Chrome's localhost exception.
- **Fix**: Check `settings.DEBUG` — set `secure=not settings.DEBUG`
- **Agent count**: 1

### 1.3 Add rate limiting to mutating endpoints
- **File**: `fb_dashboard/_rate_limit.py` + 20+ router files
- **Problem**: Rate limiting only covers login and register. All offers, rules, sequences, broadcasts endpoints are unthrottled.
- **Fix**: Create rate-limit middleware or decorator, apply to all POST/PUT/DELETE endpoints
- **Agent count**: 1

### 1.4 Fix JWT missing claims + WebSocket token handling
- **Files**: `routers/auth.py:29`, `runner.py:626`
- **Problem**: JWT missing `iat`/`nbf` claims. WebSocket passes JWT in query string (logged by proxies).
- **Fix**: Add `iat`/`nbf` to JWT, send token as first WebSocket message frame instead of query param
- **Agent count**: 1

### 1.5 Add CSRF protection
- **Files**: All mutation endpoints
- **Problem**: Relies solely on SameSite=Lax. No Origin/Referer header validation, no CSRF tokens.
- **Fix**: Add Origin header validation middleware, follow smart-menu's CSRF client pattern
- **Agent count**: 1

---

## Phase 2: Payment Flow Overhaul (P0-P1) — 5 agents, depends on Phase 0.2

### 2.1 Implement smart-menu PaymentDialog
- **File**: `fb_dashboard/frontend/src/app/subscribe/` (new files)
- **Problem**: Current subscribe page has broken USSD display, infinite polling, no real-time status, missing provider selection
- **Fix**: Port `PaymentDialog.tsx`, `PlanSelector.tsx`, `PaymentSection.tsx` from smart-menu. Full USSD code generation (`*122*#`, `*140*#`), copy/click-to-call, provider tabs, countdown, polling + SSE
- **Agent count**: 2

### 2.2 Fix subscription polling cleanup
- **File**: `fb_dashboard/frontend/src/app/subscribe/page.tsx:82-94`
- **Problem**: setInterval never cleaned up on unmount. Countdown reaching 0 has no state transition. Rejected retry loops infinitely with stale payment_id.
- **Fix**: Add cleanup effect, timeout handler, fresh payment_id on retry
- **Agent count**: 1

### 2.3 Add provider + amount fields to subscription response
- **File**: `fb_dashboard/routers/payments.py:153`
- **Problem**: Response missing provider field that frontend needs
- **Fix**: Return `provider` from request body in response
- **Agent count**: 1

### 2.4 Fix admin subscription list response
- **File**: `fb_dashboard/routers/payments.py:214-228`
- **Problem**: Returns `plan_name, user_id` but frontend expects `plan, username`
- **Fix**: Add username lookup, rename field to match frontend expectation
- **Agent count**: 1

---

## Phase 3: Pricing & Pages Restructure (P1) — 4 agents, depends on Phase 0.6

### 3.1 Redesign pricing page
- **File**: `fb_dashboard/frontend/src/app/pricing/page.tsx`
- **Problem**: Missing yearly/monthly toggle, features sliced to 5, no loading state, errors silently swallowed, CTA doesn't pass plan context
- **Fix**: Add yearly billing toggle (10x multiplier), remove `.slice(0,5)`, add loading skeleton, error toast, pass `?plan=X` to /subscribe
- **Agent count**: 1

### 3.2 Fix static file routing
- **File**: `fb_dashboard/frontend/next.config.ts` + icon references
- **Problem**: `/static/brand-icon.png` proxied to API backend instead of served directly. File not in `public/static/`.
- **Fix**: Move brand-icon.png to `public/static/` or change all references to `/brand-icon.png`
- **Agent count**: 1

### 3.3 Add missing loading/error boundaries
- **Files**: `/` root page, `/register`, `/connect`, `/dashboard/[...slug]`
- **Problem**: Root page missing loading.tsx and error.tsx. All uncaught errors show blank white screen.
- **Fix**: Add loading.tsx (skeleton) and error.tsx (retry button) to root and register
- **Agent count**: 1

### 3.4 Remove dead SPA artifacts
- **Files**: `public/static/assets/login-*.js`, `fb_dashboard/static/assets/login-*.js`, `api-client.ts`
- **Problem**: Old Vite/SPA build JS files served via /static/. Duplicate api-client.ts (identical to csrf-client.ts).
- **Fix**: Delete dead JS files, delete api-client.ts, rename csrf-client.ts to api-client.ts (keep better name)
- **Agent count**: 1

---

## Phase 4: Security Hardening (P1) — 3 agents, depends on Phase 0.6

### 4.1 Complete security headers
- **File**: `fb_dashboard/frontend/middleware.ts` (new)
- **Problem**: Missing CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy, Referrer-Policy
- **Fix**: Copy smart-menu's header configuration exactly
- **Agent count**: 1

### 4.2 Fix CORS configuration
- **File**: `fb_dashboard/runner.py:346`
- **Problem**: CORS missing api.smart-link.ly in origins. WebSocket origin unchecked.
- **Fix**: Add all expected origins, add WebSocket origin validation
- **Agent count**: 1

### 4.3 Add SPA catch-all safety guard
- **File**: `fb_dashboard/runner.py:829`
- **Problem**: Catch-all at end of runner.py can shadow future routes added after line 829
- **Fix**: Move catch-all before all include_router calls (FastAPI processes first-match), or add explicit check for registered paths
- **Agent count**: 1

---

## Phase 5: Dashboard & UI Polish (P1-P2) — 4 agents, depends on Phase 0.7

### 5.1 Fix dashboard empty state
- **File**: `fb_dashboard/frontend/src/app/dashboard/page.tsx`
- **Problem**: No loading skeleton while bundle fetches, 15s aggressive polling, no retry logic on error
- **Fix**: Add proper loading skeleton, increase refetchInterval to 60s, add `refetchIntervalInBackground: false`, improve error state
- **Agent count**: 1

### 5.2 Add SSE for real-time payment status
- **File**: `fb_dashboard/frontend/src/app/subscribe/page.tsx` + backend
- **Problem**: Only polling (3s interval), no SSE for instant payment approval/rejection like smart-menu
- **Fix**: Add `/api/user/events/stream` SSE endpoint, subscribe on subscribe page
- **Agent count**: 1

### 5.3 Implement role-based UI
- **File**: `fb_dashboard/frontend/src/app/dashboard/AuthGuard.tsx` + layout
- **Problem**: AuthGuard only checks `d.authenticated`, no role gating. Non-admin users see admin shell.
- **Fix**: Add role check, redirect non-admins from /admin, show role-appropriate sidebar
- **Agent count**: 1

### 5.4 Fix login page redirect for non-admins
- **File**: `fb_dashboard/frontend/src/app/login/page.tsx:85`
- **Problem**: Only admins preserve `?redirect=` param. Non-admin users always go to /dashboard.
- **Fix**: Apply safeRedirect for all roles, not just admin
- **Agent count**: 1

---

## Phase 6: Performance & Cleanup (P2) — 3 agents, after all above

### 6.1 Fix analytics N+1 and date casting
- **Files**: `routers/analytics.py:33-85`, `routers/bot.py:96`
- **Problem**: `cast(created_at, Date)` prevents index usage. Bot cycle has N+1 per-tenant queries.
- **Fix**: Use date range instead of cast, batch tenant FB client queries
- **Agent count**: 1

### 6.2 Clean up dead code
- **Files**: `models.py` (User.subscription_status, User.plan), `api_cache.py` (invalidate_on_write), `api-client.ts`
- **Problem**: Orphan columns, dead cache code, duplicate files
- **Fix**: Remove unused fields, delete dead code paths
- **Agent count**: 1

### 6.3 Add Arabic error messages to auth middleware
- **File**: `fb_dashboard/routers/auth.py:38-72`
- **Problem**: get_current_user/require_role return English errors while login/register use Arabic
- **Fix**: Translate auth middleware error messages to Arabic
- **Agent count**: 1

---

## Execution Order

```
Phase 0: Critical Bugs ─────────────────────────┐
   0.1  0.2  0.3  0.4  0.5  0.6  0.7          │
         │                                      │
Phase 1: Auth Restructure ◄── depends on 0.7   │
   1.1  1.2  1.3  1.4  1.5                      │
         │                                      │
Phase 2: Payment Flow ◄── depends on 0.2        │
   2.1  2.2  2.3  2.4                            │
         │                                      │
Phase 3: Pricing & Pages ◄── depends on 0.6     │
   3.1  3.2  3.3  3.4                            │
         │                                      │
Phase 4: Security ◄── depends on 0.6            │
   4.1  4.2  4.3                                 │
         │                                      │
Phase 5: Dashboard & UI ◄── depends on 0.7      │
   5.1  5.2  5.3  5.4                            │
         │                                      │
Phase 6: Performance & Cleanup                   │
   6.1  6.2  6.3 ────────────────────────────────┘
```

**Total: 31 agents across 7 phases**
