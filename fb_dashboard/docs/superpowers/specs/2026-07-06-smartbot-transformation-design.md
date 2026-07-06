# SmartBot Dashboard — Full Product Transformation

**Date:** 2026-07-06
**Status:** Approved design
**Scope:** Complete audit, cleanup, consolidation, deepening, and polish of the SmartBot Facebook auto-reply admin dashboard.

---

## Overview

Transform the SmartBot dashboard from a functional but inconsistent admin panel into a world-class, production-ready platform comparable to ManyChat/Speedly. Three sequenced phases, each independently verifiable:

1. **Cleanup & Consolidation** — delete dead code, merge overlapping pages, fix API bugs
2. **Deepen** — add missing features, real data, pagination, analytics depth, webhook page
3. **Polish** — responsive navigation, visual consistency, state audit, performance

---

## Phase 1: Cleanup & Consolidation

### Dead Code Removal

| File/Code | Reason | Action |
|-----------|--------|--------|
| `frontend/src/components/app-sidebar.jsx` | Orphaned — Topbar is sole nav, sidebar never imported in App.jsx | Delete file |
| `auto_reply.py` | Standalone CLI duplicate of `bot.py` with different code paths. Divergent maintenance liability | Delete file |
| `bot.py` lines 476-534: `run_auto_reply`, `_process_comment`, `_load_rules`, `load_replied_ids`, `import_json_data`, `add_log`, `bot_worker` | All legacy wrappers delegating to `BotEngine`. `_process_comment` creates BotEngine with `None` FBClient (bug). Direct callers in `main.py` already import BotEngine | Delete wrappers. Update `main.py` imports to use `BotEngine` directly |
| `main.py:352-353` duplicate `await db.commit()` / `return {"ok": True}` | Unreachable dead code after early return | Remove duplicated lines |
| `frontend/src/pages/analytics.jsx` | Near-identical to Dashboard — same chart, same data sources, adds negligible value | Delete file. Move "response rate" and "top rule" cards into Dashboard sidebar |

### Page Consolidation

**Merge FbControl into Settings:**
- `fb-control.jsx` is 156 lines, ~100 overlap with Settings bot/Facebook cards
- Add "Facebook" tab to Settings tabs (currently: bot, api, theme, system)
- Move: bot status, connectivity check, interval control, page info into Settings::facebook tab
- Delete `fb-control.jsx` and its route in App.jsx

**Nav item reduction:**
- Before: dashboard, analytics, rules, replies, posts, messages, ads, facebook, users, settings
- After: ~~analytics~~, ~~facebook~~ → dashboard, rules, replies, posts, messages, ads, users, settings
- 10→8 items, cleaner horizontal nav

### API Fixes

| Bug | Fix |
|-----|-----|
| `dm_template` empty in `/api/rules` response | Add `dm_template` to Rule model serialization. Rules table already has `dm_template` field? No — Model has `bot_type` but no `dm_template`. Need to either add column or always derive from JSON. Decision: add `dm_template` column to Rule model |
| Missing `/api/messages/{id}/reply` backend | Add endpoint in `main.py` that calls `fb.send_dm` with recipient from conversation |
| `bot.py:502` creates BotEngine(None) | Remove legacy wrapper, use direct BotEngine import |

### App.jsx Changes

- Remove analytics import + page entry
- Remove facebook (FbControl) import + page entry
- Remove sidebar import if present (not imported currently, but ensure)
- Add lazy loading for remaining pages

---

## Phase 2: Deepen

### Posts Page Enhancement

**Server-side:**
- Update `get_page_posts` fields to: `id,message,created_time,likes.summary(true),shares,comments.summary(true)`
- Add pagination to `/api/posts`: `?page=1&per_page=10`
- Return: `{ items, total, page, per_page }`

**Frontend:**
- Show like/shares/comment count per post card
- Add pagination controls
- Add "View Insights" button per post showing engagement metrics

### Replies Page Enhancement

**Server-side (new endpoints):**
- `GET /api/stats/hourly` — group replies by hour for last 7 days
- `GET /api/replies?rule_id=X` — filter by rule

**Frontend:**
- Add rule filter dropdown (populated from `/api/rules`)
- Add hourly distribution bar chart
- Move date filter from client to server-side query

### Messages — Wire Reply Endpoint

**Server:**
- Add `POST /api/messages/{conversation_id}/reply` that calls `fb.send_dm` or `fb._post` for conversation message
- Accept `{ message: string }` JSON body

**Frontend:**
- Remove raw `fetch("/api/messages/..."` and use api.js wrapper
- Show sender avatar initials

### Settings — Replace Stubs with Real Data

**API tab:**
- Remove hardcoded envConfig array
- Add `GET /api/env` returning non-sensitive env metadata: version, db_type, bot_interval, etc.
- Keep eye-toggle for token preview but derive from server response

**System tab:**
- Add `GET /api/system/stats` returning: version, db_size, rule_count, reply_count, uptime
- Remove hand-authored React version / hardcoded counts

**Logs:**
- Add `POST /api/logs/clear` with optional `days` param (default 30)
- "Clear logs" button calls real API

### Webhook Page (New)

**Server:**
- Existing `/api/webhook/check` is sufficient, add `last_event` timestamp
- Add `GET /api/webhook/events` returning recent webhook pings from DB (new model: WebhookEvent)

**Frontend (`frontend/src/pages/webhook.jsx`):**
- Show: webhook URL, verify token, subscription status
- Last N events with timestamps and payload preview
- "Test webhook" button triggering `/api/webhook/test`
- Instructions card for Facebook Developer Console setup
- Add to nav: `/api/webhook` route, App.jsx import

### New Backend Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/posts?page=&per_page=` | GET | Paginated posts with engagement |
| `/api/stats/hourly` | GET | Hourly reply distribution |
| `/api/replies?rule_id=` | GET | Filter replies by rule |
| `/api/messages/{id}/reply` | POST | Reply in conversation |
| `/api/env` | GET | Non-sensitive env metadata |
| `/api/system/stats` | GET | DB stats, version, counts |
| `/api/logs/clear` | POST | Purge old logs |
| `/api/webhook/events` | GET | Recent webhook events |

---

## Phase 3: Polish

### Responsive Navigation

- Topbar: at <1024px, collapse inline nav items under hamburger (already exists but sheet uses Sidebar component that we're deleting — rewrite sheet to use simple div/motion wrapper)
- Ensure sheet properly handles current page highlighting
- Active page indicator: use primary color pill for mobile sheet

### State Consistency Audit

Every data-fetching page must show 3 states:
1. **Loading** — skeleton matching card/table dimensions
2. **Error** — icon + message + retry button
3. **Empty** — icon + message + CTA (if applicable)

Pages to audit: Dashboard, Rules, Replies, Posts, Messages, Ads, Users, Settings, Webhook

### Visual Consistency

- Replace all inline `style={{}}` with theme CSS variable references where variables exist
- Verify RTL on all new content
- Card border-radius: 12px throughout (already consistent via index.css)
- Shadow: use CSS variables not hardcoded values

### Performance

- Wrap page imports in `React.lazy(() => import(...))` with Suspense fallback
- Reduce `refetchInterval` on non-critical queries when tab hidden (use `refetchIntervalInBackground: false` — already done on most)
- Remove `framer-motion` from pages that don't need animation (simpler transitions)

---

## Out of Scope (explicitly skipped)

- Full role-based access control UI (existing role system sufficient for now)
- Real-time WebSocket notifications (polling adequate at current scale)
- Dark/light mode editor (theme toggle exists, no customization canvas)
- Multi-language support (Arabic-only is correct for target audience)
- Database migration system (SQLite/Postgres handled by SQLAlchemy)

---

## Validation Criteria

1. App starts without 500 errors
2. Login → Dashboard shows real stats
3. All nav items navigate to correct pages
4. Dead files deleted, no import errors
5. Replies page filters work (search, date, rule)
6. Posts paginate and show engagement
7. Message reply sends from UI
8. Settings show real data, not stubs
9. Webhook page shows status and event log
10. Mobile nav works at 375px width
11. All loading/error/empty states render
12. No `app-sidebar.jsx`, `fb-control.jsx`, `analytics.jsx`, `auto_reply.py` remain
