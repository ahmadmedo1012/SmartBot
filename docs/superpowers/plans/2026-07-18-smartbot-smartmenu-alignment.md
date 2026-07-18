# SmartBot ← Smart-Menu Alignment Plan

**Goal:** Make SmartBot's customer-facing pages (login, register, subscribe/payment, pricing, admin dashboard, owner dashboard) **identical in structure and behavior** to Smart-Menu's, with only content differences for the service type (Facebook automation vs digital restaurant menu).

**Source:** Smart-Menu at `/home/ahmed/Downloads/smart-menu/`  
**Target:** SmartBot at `/home/ahmed/Downloads/SmartBot/fb_dashboard/frontend/`

**Principle:** Copy Smart-Menu's files → modify minimally for SmartBot context. No rewriting from scratch.

---

## Phase 1: Foundation — Design System & Shared Libs

**Goal:** Globals.css, layout.tsx, lib/ files, and UI components match Smart-Menu exactly.

### 1A: globals.css — Replace entirely
- **Source:** `smart-menu/src/app/globals.css`
- **Target:** `fb_dashboard/frontend/src/app/globals.css`
- **Modifications:**
  - Change `z-index: 60` on `.grain-overlay` → `40` (SmartBot's current value — avoids overlay covering header)
  - Remove keyframes: `confetti`, `confetti-fall`, `ring-drain`, `fade-out`, `grain-anim` (unused in SmartBot)
  - Remove `.eye-catcher` class (menu-only, not needed)
  - Keep all shadcn/ui base layer variables and all CSS custom properties

### 1B: layout.tsx — Replace with Smart-Menu structure
- **Source:** `smart-menu/src/app/layout.tsx`
- **Target:** `fb_dashboard/frontend/src/app/layout.tsx`
- **Modifications:**
  - Change title/description/OG tags to SmartBot branding
  - Remove: `ServiceWorkerInit`, `ReactScanInit`, `FloatingWhatsApp`, `GridPattern`, `MotionProvider`
  - Remove manifest.json link and icon preloads
  - Change domain references from `menu.smart-link.ly` → `bot.smart-link.ly`
  - Keep only Cairo font preload (remove Noto Naskh Arabic preload)

### 1C: lib/ files — Copy from Smart-Menu (8 files)
| File | Source | Target |
|------|--------|--------|
| csrf.ts | smart-menu/src/lib/csrf.ts | fb_dashboard/.../src/lib/csrf.ts |
| csrf-client.ts | smart-menu/src/lib/csrf-client.ts | fb_dashboard/.../src/lib/csrf-client.ts |
| motion.ts | smart-menu/src/lib/motion.ts | fb_dashboard/.../src/lib/motion.ts |
| format.ts | smart-menu/src/lib/format.ts | fb_dashboard/.../src/lib/format.ts |
| premium-toast.tsx | smart-menu/src/lib/premium-toast.tsx | fb_dashboard/.../src/lib/premium-toast.tsx |
| session.ts | smart-menu/src/lib/session.ts | fb_dashboard/.../src/lib/session.ts |
| auth.ts | smart-menu/src/lib/auth.ts | fb_dashboard/.../src/lib/auth.ts |
| utils.ts | smart-menu/src/lib/utils.ts | fb_dashboard/.../src/lib/utils.ts |

**Modifications:**
- `csrf-client.ts`: Update import path of `CSRF_COOKIE`/`CSRF_HEADER` to match SmartBot's config
- `motion.ts`: Remove `shimmerVariants` if unused; keep `pageTransition`, `springGentle`, `stagger`, `fadeSlideUp`, `scaleOnHover`
- `auth.ts`: Change API endpoint from `/api/auth/me` to `/api/me` (or add alias in backend)
- `utils.ts`: Copy as-is (same shadcn `cn()` helper)

### 1D: UI Components — Replace with Smart-Menu's shadcn variants
- **Source:** `smart-menu/src/components/ui/button.tsx`, `card.tsx`, `badge.tsx`
- **Target:** Same relative paths in SmartBot
- **Modifications:** None — these are standard shadcn components with same CVA variants. Smart-Menu's versions have slight visual upgrades (glow-within, elevation prop on card).

### 1E: Layout Components — Copy from Smart-Menu
| File | Source | Target |
|------|--------|--------|
| Header | smart-menu/src/components/layout/Header.tsx | fb_dashboard/.../src/components/layout/Header.tsx |
| Footer | smart-menu/src/components/layout/Footer.tsx | fb_dashboard/.../src/components/layout/Footer.tsx |
| LayoutHeader | smart-menu/src/components/layout/LayoutHeader.tsx | fb_dashboard/.../src/components/layout/LayoutHeader.tsx |
| NavLink | smart-menu/src/components/shared/NavLink.tsx | fb_dashboard/.../src/components/shared/NavLink.tsx |
| PageFade | smart-menu/src/components/shared/PageFade.tsx | fb_dashboard/.../src/components/shared/PageFade.tsx |

**Header modifications:** Change nav links from restaurant-focused to SmartBot features (automation, analytics, pricing → keep as-is, they're generic). Update mobile menu links.

**Footer modifications:** Change social links and copyright to SmartBot. Keep same layout structure.

### 1F: Admin/Landing Components — Copy from Smart-Menu
| File | Source | Target |
|------|--------|--------|
| KpiCard | smart-menu/src/components/admin/KpiCard.tsx | fb_dashboard/.../src/components/admin/KpiCard.tsx |
| AdminEventNotifier | smart-menu/src/components/admin/AdminEventNotifier.tsx | fb_dashboard/.../src/components/admin/AdminEventNotifier.tsx |
| AreaChart | smart-menu/src/components/shared/AreaChart.tsx | fb_dashboard/.../src/components/shared/AreaChart.tsx |
| HorizontalBar | smart-menu/src/components/shared/HorizontalBar.tsx | fb_dashboard/.../src/components/shared/HorizontalBar.tsx |

---

## Phase 2: Auth & Subscription Pages

**Goal:** Login, subscribe, and payment flow identical to Smart-Menu.

### 2A: Login Page — Replace with Smart-Menu version
- **Source:** `smart-menu/src/app/login/page.tsx`
- **Target:** `fb_dashboard/frontend/src/app/login/page.tsx`
- **Modifications:**
  - Change `csrfFetch` calls → `apiFetch` (SmartBot uses its own fetch wrapper)
  - Change `premiumToast` → `sonner`'s `toast` (SmartBot already has sonner)
  - `fetch('/api/auth/me')` → `apiFetch('/api/me')`
  - Redirect logic: admin→`/admin`, owner→`/dashboard` (SmartBot's dashboard), subscriber→`/subscribe`
  - "Create account" link → `/register` (not Smart-Menu's `/subscribe`)

### 2B: Subscribe Page — Replace with Smart-Menu multi-step flow
- **Source:** `smart-menu/src/app/subscribe/page.tsx`
- **Target:** `fb_dashboard/frontend/src/app/subscribe/page.tsx`
- **Modifications:**
  - Plan interface: replace `maxMenus/maxItems/maxOrders` with `max_replies/max_pages/max_rules` (SmartBot metrics)
  - Registration: creates `Tenant + User` instead of `Restaurant + User`
  - Payment: POST to `/api/subscriptions` (same, SmartBot already has this)
  - SSE: points to `/api/user/events/stream` — **need to add SSE endpoint**
  - Telegram approval: already exists in SmartBot backend — keep existing `runner.py` webhook handling

### 2C: Create PlanSelector, SubscribeForm, PaymentSection
- **Source:** `smart-menu/src/app/subscribe/PlanSelector.tsx`, `SubscribeForm.tsx`, `PaymentSection.tsx`
- **Target:** Same relative paths in SmartBot
- **Modifications:** PlanSelector shows SmartBot features. SubscribeForm collects tenant info + admin credentials. PaymentSection matches Smart-Menu's provider libyana/madar tabs.

### 2D: SSE Endpoint — Add to backend
- **Source:** Smart-Menu's `/api/user/events/stream` uses Prisma polling every 5s
- **Target:** New route in `fb_dashboard/runner.py` — SSE stream for subscription payment status
- **Modifications:** Poll `subscription_payments` table instead of Prisma models

---

## Phase 3: Admin & Dashboard Pages

### 3A: Admin Page — Replace with Smart-Menu structure
- **Source:** `smart-menu/src/app/admin/page.tsx`
- **Target:** `fb_dashboard/frontend/src/app/admin/page.tsx`
- **Modifications:**
  - Remove: `totalRestaurants`, `topRestaurants`, `topItems`, `linkedRestaurants`, `ordersToday`
  - Add: `totalTenants`, `totalReplies`, `totalActivePages`, `todayReplies`
  - Keep: `revenueTrend`, `userGrowthPct`, `recentSignups`, `recentLogins`, `systemEvents`
  - Keep charts (AreaChart, HorizontalBar) — they're generic

### 3B: Admin Layout — Replace
- **Source:** `smart-menu/src/app/admin/layout.tsx`
- **Target:** `fb_dashboard/frontend/src/app/admin/layout.tsx`
- **Modifications:** Import `AdminSidebar` (already exists in SmartBot). Adjust AuthGuard import.

### 3C: Pricing Page — Replace with Smart-Menu structure
- **Source:** `smart-menu/src/app/pricing/page.tsx`
- **Target:** `fb_dashboard/frontend/src/app/pricing/page.tsx`
- **Modifications:**
  - Features: auto-reply, unified inbox, analytics, scheduling, audience targeting → keep SmartBot-specific
  - Plan interface: `max_replies`, `max_pages`, `max_rules` (not menu items)
  - Keep: yearly/monthly toggle, plan badges, gradient icons, skeleton loading

### 3D: Landing Page — Light modification
- **Source:** `smart-menu/src/app/page.tsx`
- **Target:** `fb_dashboard/frontend/src/app/page.tsx`
- **Modifications:** Hero text and feature list → SmartBot value proposition. Keep same visual rhythm, sections, animations.

---

## Phase 4: Backend API Alignment

### 4A: New API Endpoint — GET /api/admin/stats
- **Source:** Smart-Menu `GET /api/admin/stats` returns: totalUsers, totalRestaurants, totalOrders, freePlanCount, paidPlanCount, monthlyRevenue, recentSignups, recentLogins, ordersToday, systemEvents, revenueTrend, orderVolumeTrend, userGrowthPct, restaurantGrowthPct
- **SmartBot equivalent:** totalUsers, totalTenants, totalReplies (today), totalActivePages, freePlanCount, paidPlanCount, monthlyRevenue, recentSignups, replyTrend (daily), revenueTrend, userGrowthPct, tenantGrowthPct

### 4B: Auth Response Format Alignment
Smart-Menu returns: `{success: true, data: {user: {...}}}`  
SmartBot returns: `{ok: true, user: {...}}`  

Align SmartBot to Smart-Menu's `{success, data}` format so the frontend auth hooks work identically.

### 4C: Add SSE for subscription payments
SmartBot already has WebSocket support. Add a simple SSE endpoint `/api/user/events/stream` that polls `subscription_payments` and sends events when status changes.

---

## Phase 5: Final Config & Build

### 5A: next.config.ts — Keep `output: "export"` for monolith
Smart-Menu uses `output: "standalone"` (deployed as Next.js server on Vercel). SmartBot needs `output: "export"` because it's deployed as a FastAPI function. Keep current SmartBot config, but add `turbopack.root` to suppress workspace warning.

### 5B: tsconfig.json — Pull Smart-Menu's strict settings
Set `strict: true` and fix any type errors gradually. Start with `strict: true` + `strictNullChecks: true` since these are the most impactful.

### 5C: middleware.ts — No changes needed  
SmartBot doesn't use Next.js middleware (auth is in the Python backend).

### 5D: Build & Deploy test
After all changes, rebuild static export and deploy to Vercel. Verify all pages 200.

---

## Key Differences Summary

| Component | Smart-Menu (source) | SmartBot (target) | Modification |
|-----------|-------------------|-------------------|--------------|
| Service type | Digital restaurant menu | Facebook automation SaaS | Core content |
| Pricing features | maxMenus, maxItems, maxOrders | max_replies, max_pages, max_rules | Plan model |
| User registration | Creates Restaurant + User | Creates Tenant + User | Backend endpoint |
| Landing page | Restaurant showcase | Bot automation showcase | Hero/content only |
| Login redirect | → /owner (dashboard) | → /dashboard | Route name |
| Dashboard | Owner: orders/menu mgmt | Admin: replies/analytics | Content + KPI cards |
| Admin stats | Restaurants, Orders | Tenants, Replies | Data sources |
| UI shell | Same Header/Footer/NavLink/PageFade | Same (copy directly) | None |
| Payment | Telegram approval via SSE | Telegram approval via SSE | Same (keep) |
| globals.css | Same tokens (oklch orange) | Same (copy + z-index fix) | Minor |
| lib/* | csrf, format, motion, session, auth | Same (copy directly) | Import paths |
