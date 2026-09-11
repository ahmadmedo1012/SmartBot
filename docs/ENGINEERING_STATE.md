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
| Database | `alembic/` (001-017) | Neon PostgreSQL (prod) / SQLite (test) + `_schema_reconcile.py` at boot | `fb_dashboard/models.py` (inferred) |
| Engines | `fb_dashboard/*.py` | bot_engine/, flow_engine, sequence_engine, broadcast_engine, agent_engine/brain (AI multi-agent), analytics_engine, commerce_engine | per-tenant, claim-pattern queues |
| Deployment | `vercel.json` | 2 Vercel projects: smart-bot-api (api.smart-link.ly) + smartbot-frontend (bot.smart-link.ly); push main → auto production | `scripts/gate_all.sh` quality gate |

**Envelope contract:** every `/api` response is `{success, data, error?}` — central unwrap only (`src/lib/api.ts` / `_responses.py`).
**Auth:** JWT cookie (web) + Bearer `/api/auth/token` (mobile); jti blacklist; tenant_id isolation; CSRF double-submit.
**Mobile contracts:** `mobile/src/lib/envelope.ts` mirrors backend envelope.

## 2. CURRENT STATE

- **Branch:** `main` @ `cea2d34d` — "docs(v25): final engineering report — deep audit round closed"
- **Working tree:** clean (fresh clone 2026-09-12)
- **v25 claims (UNVERIFIED this session — must re-verify):** 1112 pytest pass, tsc 0 errors, 416+38 vitest pass, build clean 43 pages, bundle 186.6KB, production live at a6d60247 with heartbeat 200
- **v25 verdict claimed:** READY FOR REAL DEVICE TESTING (mobile EAS build + real device not done)

## 3. KNOWN DEFECTS / OPEN ITEMS (from v25, must verify still closed or open)

| ID | Severity | Status claimed | Verification needed |
|---|---|---|---|
| S-01 | CRITICAL | live-verified dead (401/rejected) | re-verify secrets inert; rotation documented |
| D-05 | HIGH | OPEN — FK CASCADE not applied on legacy Neon prod DB | migration NOT VALID→VALIDATE pending |
| B-08 | MED | OPEN (bounded) — DB conn tax per mutating request for rate-limit | documented, latency acceptable |
| D-09/D-10/D-12/W-11 | P3 | OPEN — N+1 queries | deferred |
| B-18 | MED | OPEN — CSRF optional for non-cookie (mobile Bearer) clients | documented |
| S-06 | MED | OPEN — password policy length-only | documented |
| flaky test | — | `test_webhook_message_replay_does_not_reply_twice` under CPU load | closed-behavior failure (safe) |

## 4. SESSION LOG (v26 — 2026-09-12)

- [ ] Fresh clone; baseline `cea2d34d`; tree clean
- [ ] ENGINEERING_STATE.md created (this file)
- [ ] Independent gate verification: pytest / tsc / vitest / lint / build
- [ ] Auth + tenant isolation API-level audit
- [ ] Messaging/comments/automation/scheduling audit
- [ ] Billing/wallet/subscription audit
- [ ] Web↔Mobile parity matrix
- [ ] Security re-audit (secrets, IDOR, headers)
- [ ] Fixes in P0→P3 order with per-batch tests
- [ ] Live verification (heartbeat, version, deploy)
- [ ] Final report + verdict; state updated; commit+push

## 5. TESTS EXECUTED (this session)

(none yet — append every run with command + result)

## 6. LAST VERIFIED COMMIT

`cea2d34d` (clone verified only — no gates run yet this session)

## 7. NEXT EXACT ACTIONS

1. Install Python + Node deps (backend, frontend, mobile)
2. Run full pytest suite → record real pass/fail count
3. Run tsc + vitest (web + mobile) → record
4. Run Next.js production build → record page count/bundle
5. Begin domain audits (auth → tenant isolation → billing → automation)
