# SmartBot Frontend Redesign — Design Spec v3

## Summary
Upgrade SmartBot dashboard frontend: rewrite landing page (Facebook-native, no fabricated claims), Tajawal font, selective Recharts for analytics only, fix frontend hardcoded values and trust metrics, SPA polish.

## Key Constraints (from council review)
- React 19.2.7 — verify peer deps before adding any library
- Lazy-load landing to avoid bundle bloat (despite no framer-motion)
- Keep existing CSS animations — over 30 keyframes already exist; no motion lib needed
- No restaurant-menu design — landing must feel Facebook-operations-native
- No unverified social-proof claims in landing copy

---

### 1. Frontend Cleanup — Hardcoded UI Values & Fabricated Metrics

**Problem — hardcoded deltas (dashboard.jsx):**
- Line 113: `↑ 12%` (total replies trend) — hardcoded
- Line 119: `↑ 8.2%` (today replies trend) — hardcoded
- Line 125: `↓ 3.1%` (follower count trend) — hardcoded

**Fix:** Remove all three hardcoded trend deltas. Wire to real week-over-week comparison data if endpoint provides it, or hide the elements entirely (no fake number is better than a wrong number).

**Problem — unconditional notification badge (topbar.jsx ~line 157):**
- `notif-dot` renders regardless of whether unread notifications exist.

**Fix:** Only render `notif-dot` when unread count > 0 (conditionally, from real API data or null).

**Problem — fabricated trust claim (landing.jsx CTA section):**
- `"انضم إلى مئات المستخدمين"` — no data source, unsupported.

**Fix:** Remove all unverified trust/social-proof claims from landing page copy. Any user-count, adoption, or "trusted by" language must be backed by a real API value or removed. No placeholder numbers.

---

### 2. Font System
- **Primary:** Tajawal (body + headings) — Google Fonts (weights 300,400,500,600,700,800)
- **Display:** Cairo (h1/h2 only) — already loaded
- **Fallback:** Noto Sans Arabic (currently primary → becomes fallback)
- **No extra cost:** Font loading already follows index.css `@import` pattern

---

### 3. Landing Page — SmartBot (Facebook Operations Native)

**Not a greenfield build — rewrite of existing `src/pages/landing.jsx` (188 lines).** Every section gets re-evaluated; nothing preserved by default.

- **Hero:** Headline "إدارة تفاعل فيسبوك بذكاء" + real dashboard screenshot (no phone mockup, no trust badges)
- **Features:** 6 cards with lucide-react icons (auto-reply, unified inbox, analytics, scheduling, AI replies, security)
- **Stats section:** ⚠️ **See item 2 in additional notes below — needs an API decision first**
- **Workflow:** 3 steps (اتصل بصفحتك ← هيئ قواعد الرد ← راقب الأداء)
- **Pricing:** Existing 3 plans (carried over from current landing; verify no fabricated claims)
- **FAQ:** Facebook permissions, data safety, Arabic support, limits
- **CTA:** ابدأ مجاناً / تسجيل الدخول — no fabricated metrics
- **Deps:** `lucide-react` only. No framer-motion. CSS animations for entrance (stagger-children, fade-in, slide-up already exist in index.css).

**Stats endpoint problem:**
`/api/system/stats` (runner.py:864) requires `get_current_user` — landing is rendered for logged-out visitors. It also returns `user_count` and `db_size` which shouldn't be public.

Two options — pick one:

- **(a) New public stats endpoint:** Add `/api/public/stats` returning only safe fields (`reply_count`, `rule_count`, `replies_today`), wire landing to it. This is the better UX but adds backend work.
- **(b) Drop stats section:** Remove the stats bar from landing for this pass. Simpler, no backend changes.

---

### 4. Charts — Recharts (Selective)

**Only for analytics & reports pages.** Dashboard mini bars stay as hand-rolled SVG (fine for sparklines).

- **Install:** `npm install recharts lucide-react` (unpinned — npm resolves current major; lock resulting version in package.json)
- **Verify:** React 19.2.7 peer compat at install time (`recharts` 3.x declares `^19.0.0` support)
- **Analytics (`analytics.jsx`):** Hand-rolled SVG bar chart → Recharts `<BarChart>` / `<LineChart>` with tooltips, responsive
- **Reports (`reports.jsx`):** CSS conic-gradient pie → Recharts horizontal stacked bar (clearer than pie, lighter)
- **Dashboard bars:** unchanged — keep existing CSS bar chart

**Confirmed scope boundary:** No other pages need charting. Only these two files are in scope.

---

### 5. SPA Polish
- **Hash-based URL sync:** App.jsx uses plain `useState` for `page` — no routing at all. Add hash change listener + initial page read from hash. This is a real, unaddressed gap.
- **Scroll-to-top:** Already implemented (App.jsx:74, `content` div scroll on page change)
- **Active page on refresh:** Read initial page from `window.location.hash`, fallback to "dashboard"

---

## Dependencies Added (final)
```json
{
  "lucide-react": "installed via npm install — lock to whatever npm resolves",
  "recharts": "installed via npm install — lock to whatever npm resolves"
}
```
`framer-motion` and `tw-animate-css` excluded — current CSS keyframes (30+) are sufficient. React 19 peer compat verified at install time.

## Implementation Order
1. Fix frontend hardcoded values: trend deltas (3), notif-dot conditional, landing trust claim removal
2. Load Tajawal font + update CSS font stack (Tajawal primary, Noto Sans Arabic fallback, Cairo display)
3. Install lucide-react + recharts (unpinned)
4. Rewrite landing page (CSS-animated, Facebook-native, stats section pending endpoint decision)
5. Migrate analytics.jsx hand-rolled SVG → Recharts
6. Migrate reports.jsx conic-gradient → Recharts horizontal stacked bar
7. SPA polish: hash-based routing

## Open Questions (resolve before implementation)
1. **Stats on landing:** (a) new public endpoint or (b) drop section?
2. **Dashboard trend deltas:** should these be hidden entirely for now, or is there existing comparison data in the API that just needs a frontend wire-up?
