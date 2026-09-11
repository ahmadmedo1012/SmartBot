# ENGINEERING_STATE.md — Persistent Engineering State

> **Purpose:** Single source of truth across sessions. Never rely on conversation memory.
> **Protocol:** Inspect git + this file at session start. Update continuously. Commit with every verified batch.
> **Created:** 2026-09-12 (v26 session, cloned fresh from GitHub)

---

## 1. ARCHITECTURE (verified from source)

| Layer | Location | Stack | Entry point |
|---|---|---|---|
| Backend/API | `fb_dashboard/` | FastAPI (async SQLAlchemy 2) | `api/index.py` → `fb_dashboard/runner.py` → 38 routers in `fb_dashboard/routers/` |
| Web | `fb_dashboard/frontend/` | Next.js 16 App Router, React Query, Tailwind, RTL-Arabic | `src/app/**` — 38 pages (10 public/admin, 28 dashboard) |
| Mobile | `mobile/` | Expo + React Native (expo-router) | `mobile/src/app/**` — 25 screens (5 tabs + auth + app + detail) |
| Database | `alembic/` (001-017) | Neon PostgreSQL (prod) / SQLite (test) + `_schema_reconcile.py` at boot | `fb_dashboard/models.py` |
| Engines | `fb_dashboard/*.py` | bot_engine/, flow_engine, sequence_engine, broadcast_engine, agent_engine/brain (AI multi-agent), analytics_engine, commerce_engine | per-tenant, claim-pattern queues |
| Deployment | `vercel.json` | 2 Vercel projects: smart-bot-api (api.smart-link.ly) + smartbot-frontend (bot.smart-link.ly); push main → auto production | `scripts/gate_all.sh` quality gate |

**Envelope contract:** every `/api` response is `{success, data, error?}` — central unwrap only (`src/lib/api.ts` / `_responses.py`).
**Auth:** JWT cookie (web) + Bearer `/api/auth/token` (mobile); jti blacklist; tenant_id isolation (claim `tid` is only a lookup filter — effective tenant always from DB row); CSRF double-submit.
**Mobile contracts:** `mobile/src/lib/envelope.ts` mirrors backend envelope.

## 2. CURRENT STATE

- **Branch:** `main` @ `063d7eed` — "feat(v26): adversarial cross-tenant sweep (40 vectors, all blocked) + mobile destructive-action confirms (W-26)" — **pushed & live in production**
- **Working tree:** docs/ENGINEERING_STATE.md (this update)
- **Production:** `/api/version` = `063d7eed` (production, iad1) · heartbeat 200 · web HTTP 200
- **v26 verdict:** READY FOR REAL DEVICE TESTING (see §8)

## 3. KNOWN DEFECTS / OPEN ITEMS

| ID | Severity | Status | Notes |
|---|---|---|---|
| S-01 | CRITICAL→inert | **live-verified dead (re-verified v26)** | token signed with leaked key → 401 from prod; blob `2e6a618a` still in history (hygiene: `git filter-repo` recommendation, guarded by pre-push hook) |
| D-05 | HIGH | OPEN | FK CASCADE not applied on legacy Neon prod DB (migration NOT VALID→VALIDATE pending); deletions leave orphans in prod |
| B-08 | MED | OPEN (bounded) | DB conn tax per mutating request for rate-limit; documented, latency acceptable |
| D-09/D-10/D-12/W-11 | P3 | OPEN | N+1 queries (tags count, broadcast fan-out, inbox search, sequences list) |
| B-18 | MED | OPEN | CSRF optional for non-cookie (mobile Bearer) clients — by design, documented |
| S-06 | MED | OPEN | password policy length-only |
| W-27 (new, doc) | LOW | OPEN | 19 direct `AsyncSessionLocal()` usages in routers bypass DI (inbox×8, bot×3, plans_config×2, marketing×2, payments×3, admin×1) — functional (tenant-scoped) but untestable via DI override; test-world pattern: use app engine without override (v22 pattern) |
| flaky test | — | bounded | `test_webhook_message_replay_does_not_reply_twice` under heavy CPU load; fails closed (safe); stable in isolation |

## 4. SESSION LOG (v26 — 2026-09-12) — COMPLETED

- [x] Fresh clone; baseline `cea2d34d`; tree clean
- [x] ENGINEERING_STATE.md created (this file)
- [x] Independent gate verification on fresh clone: **pytest 1112/1112 (3:02) · tsc 0/0 web+mobile · vitest 416/416 web + 38/38 mobile · expo lint clean · build 43/43 pages (BUILD_ID fresh)**
- [x] Live verification: heartbeat 200 · `/api/version` = HEAD · unauth perimeter 401 on ALL protected routes (dashboard/bundle, system/stats, admin/platform/users, admin/config, payments/balance, payments/history, auth/me, inbox, rules, notifications) · cron 403 w/o secret · FB webhook verify rejects wrong token · healthz 200
- [x] v25 fixes verified in source: B-01 (sequence_engine tenant checks L272-288), B-02 (`_brain._ai = None` in refresh_ai_from_db), M-01..06 (envelope.ts extractItems), M-07 (logout calls API with token first), W-01 (marketing confirm dialog + audience preview), D-01 (pipeline.py:709 atomic reply_count), D-02 (offer_engine expiry+capacity filter + atomic used_count)
- [x] NEW adversarial tests: `tests/test_v26_cross_tenant_sweep.py` — **40 IDOR vectors across 18 resource types ALL REJECTED** + privilege escalation (viewer restrictions, tenant-admin can't delete other tenants) + forged tenant-claim token rejected
- [x] Billing integrity: atomic claims (`UPDATE...WHERE status='pending' RETURNING`), wallet savepoint + IntegrityError retry, B-20 honest partial-failure reporting
- [x] Webhook replay: storage dedup (uq tenant+fb_message_id) + reply guard (`status["stored"]`) + recency check
- [x] Automation idempotency: broadcast claim, scheduled-post claim + stale recovery, sequence claim + recovery, accounting in separate transaction (D-03)
- [x] Analytics: all queries tenant-scoped, days validated 1-365, sentiment/hourly/daily from real records
- [x] Security: secret-scan clean · leaked key live-verified inert (401) · no .env tracked
- [x] Static gates: i18n (222 files, 0 direct locale calls) · a11y labels (186 files, all named) · contrast (all pairs ≥ AA) · CSS tokens (116 unique, no dupes) · ruff clean · slop-scan diagnostic-only
- [x] **FIX W-26 (web↔mobile parity, P1):** mobile one-tap destructive actions → 6 flows now confirm (broadcast mass-SEND with `/estimate` audience preview — parity with web W-01; campaign cancel; scheduled publish; scheduled delete; calendar delete; autoreply delete) via new `mobile/src/lib/confirm.ts` (Alert destructive style, Promise-based) + user-cancel swallowed
- [x] Commit `063d7eed` pushed → production auto-deployed → verified live
- [x] Final regression: **pytest 1115/1115 · web vitest 416/416 · mobile vitest 47/47 (38+9 new) · tsc 0/0 · lint clean**

## 5. TESTS EXECUTED (v26 session)

| Gate | Command | Result |
|---|---|---|
| Backend | `.venv/bin/python -m pytest -q` | **1115/1115 passed** (1112 + 3 v26 adversarial) |
| Web types | `npx tsc --noEmit` | 0 errors |
| Web unit | `npx vitest run` | 416/416 (51 files) |
| Mobile types | `npx tsc --noEmit` | 0 errors |
| Mobile unit | `npx vitest run` | 47/47 (4 files; 38 + 9 new confirm tests) |
| Mobile lint | `npx expo lint` | clean |
| Build | `npm run build` | 43/43 pages, BUILD_ID fresh |
| ruff | `.venv/bin/python -m ruff check` | clean |
| secret-scan | `scripts/secret_scan.py` | clean |
| i18n | `scripts/check_i18n_calls.py` | PASS (222 files) |
| a11y labels | `scripts/check_a11y_labels.ts` | PASS (186 files) |
| contrast | `scripts/check_contrast.mjs` | PASS |
| css tokens | `scripts/check-css-token-duplication.py` | PASS |
| **Live** | heartbeat + version + unauth sweep | 200 · `063d7eed` production · all protected routes 401/403/404 |

Not run this session (environment limits): EAS cloud build, real-device testing, full Playwright E2E specs (a11y/viewport sweeps were run by v25; web surface unchanged this session except zero web code changes).

## 6. LAST VERIFIED COMMIT

`063d7eed` — live in production (`/api/version` = `063d7eed`, heartbeat 200, deployment_env=production)

## 7. NEXT EXACT ACTIONS (next session)

1. **D-05**: apply FK CASCADE on legacy Neon prod DB (NOT VALID → VALIDATE migration + `_schema_reconcile` entry + sync migration test)
2. **Real-device pass**: EAS build (dev/preview → localhost per M-28) + one Android device: startup, login, tabs, broadcast confirm flow (new), keyboard, safe areas, RTL
3. Optional P3s: N+1s (D-09/D-10/D-12/W-11) with index/JOIN batch strategies
4. Optional hygiene: `git filter-repo` history cleanse (secrets already inert — cosmetic + repo size 470MB)
5. Full Playwright E2E sim battery after any web-code change

## 8. VERDICT (v26)

# READY FOR REAL DEVICE TESTING

**Evidence:** Web + Backend + DB **live in production serving `063d7eed`** (live-verified); every quality gate green on fresh clone (§5); multi-tenant isolation adversarially proven (40 vectors, zero leaks); billing atomicity proven; automation idempotency proven; mobile CODE COMPLETE + unit-test complete (47/47) + the only remaining gap is EAS build + real-device verification (unchanged from v25 — environment cannot emulate a device).
