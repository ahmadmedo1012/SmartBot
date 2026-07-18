# SmartBot Frontend Redesign — Design Spec v2

## Summary
Upgrade SmartBot dashboard frontend: premium landing page (Facebook-native), font improvement, selective Recharts for analytics, fix frontend hardcoded values, SPA polish.

## Key Constraints (from council review)
- React 19.2.7 — verify peer deps before adding any library
- Lazy-load landing to avoid framer-motion leaking into main bundle
- Keep existing CSS animations — only add libraries where CSS falls short
- No restaurant-menu design — landing must feel Facebook-operations-native

## Sections

### 1. Frontend Cleanup — Hardcoded UI Values
**Problem:** dashboard.jsx:113 has `↑ 12%` and `↑ 8.2%` hardcoded. topbar.jsx has hardcoded badge counts. These look like mock data even though the backend is real.
**Fix:** Remove hardcoded trend deltas. Either:
- Wire to real comparison data (week-over-week from API)
- Or hide until endpoint provides comparison

### 2. Font System
- **Primary:** Tajawal (body + headings) — Google Fonts (weights 300-800)
- **Display:** Cairo (h1/h2 only) — already loaded
- **Fallback:** Noto Sans Arabic
- **No extra cost:** Font loading already in index.css pattern

### 3. Landing Page — SmartBot (Facebook Operations Native)
**Not a copy of menu.smart-link.ly.** Structure inspired but content rewritten:
- **Hero:** Headline "إدارة تفاعل فيسبوك بذكاء" + real dashboard screenshot (no phone mockup)
- **Features:** 6 cards with lucide-react icons (auto-reply, inbox, analytics, scheduling, AI, security)
- **Stats:** Live from `/api/system/stats`
- **Workflow:** 3 steps (اتصل بصفحتك → هيئ قواعد الرد → راقب الأداء)
- **Pricing:** Existing 3 plans
- **FAQ:** Facebook permissions, data safety, Arabic support, limits
- **CTA:** ابدأ مجاناً / تسجيل الدخول
- **Deps:** `lucide-react` only. No framer-motion. CSS animations for entrance.

### 4. Charts — Recharts (Selective)
**Only for analytics & reports pages.** Dashboard mini bars stay as hand-rolled SVG.
- **Install:** `npm install recharts` (verify React 19 peer compat first)
- **Analytics:** Line chart for trends (tooltip, responsive)
- **Reports:** Horizontal stacked bar for sentiment (clearer than pie)
- **Dashboard bars:** unchanged

### 5. SPA Polish
- Hash-based URL sync for direct page links
- Scroll-to-top on page change (already partial — App.jsx:74)
- Active page on refresh (read from hash or default to dashboard)

## Dependencies Added (final)
```json
{
  "lucide-react": "^0.x",
  "recharts": "^2.x"
}
```
`framer-motion` and `tw-animate-css` deferred — current CSS animations are sufficient.

## Implementation Order
1. Fix hardcoded frontend values (trend deltas, badges)
2. Load Tajawal font + update CSS
3. Install lucide-react — replace emoji/icons in landing
4. Build landing page (CSS-animated, Facebook-native, no framer-motion)
5. Install recharts (verify compat) — wire to analytics/reports
6. SPA polish: hash routing, scroll-to-top
