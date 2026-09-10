# v24-R3 — Backend Round 2 Verification

> **Agent:** R3-BACKEND2 (implementation; report completed by orchestrator after agent context-timeout)
> **Scope:** B1 M-items + B2 H-1/M-1 + client_ip adoption in auth/payments

## Implementation summary (all tagged `v24-R3`)

| # | Task | Files | Status |
|---|---|---|---|
| 1 | **client_ip() adoption** (C4 follow-up) — auth.py login/register limiters + payments limiter sites now key buckets via the honest XFF helper (was `request.client.host` = shared proxy bucket) | routers/auth.py, routers/payments/* | ✅ |
| 2 | **M4/M5 cache layer** — `api_cache.invalidate_on_write` dead-code 500 trap fixed; redis_cache double-encoding unified between cache layers | api_cache.py, redis_cache.py | ✅ |
| 3 | **M6 tenant loop isolation** — per-tenant try/except + continue with tenant-context logging (one tenant's error no longer aborts the rest) | app/telegram.py | ✅ |
| 4 | **M7 ai_analyze_image** — narrowed excepts (honest failure surface preserved), Pillow decode/encode moved to `asyncio.to_thread` | ai_service.py | ✅ |
| 5 | **M2/M3 param clamps** — widgets/diagnostics/logs limit ≤200 default 50, days ≤90 default 30 | widgets_routes.py, diagnostics.py, logs_api.py | ✅ |
| 6 | **M4 str(e) leaks** — bounded client-facing detail at the 6 flagged sites (dashboard_stats, onboarding, bot, telegram_config) | per-file | ✅ |
| 7 | **H-1 static upload exposure** — receipts land in a PRIVATE root (`_utils.private_upload_dir()` — sibling `data/uploads/` local, `/tmp` on Vercel, env override); URL stays a DB marker; served only via the authenticated `GET /api/payments/receipt/{id}` route | routers/payments/bank.py, _utils.py | ✅ |
| 8 | **M-1 DEBUG guard** — one-shot loud startup warning when DEBUG=true off-localhost | config.py | ✅ |
| 9 | **M11 mark_read scoping** — adjudicated (see test file for the pinned semantics) | routers/notifications.py | ✅ |

## Verification gates
- `tests/test_v24_r3_backend.py`: **25 tests** all passing (incl. login-throttle honest-IP key, tenant-loop isolation, upload private-root + NOT-in-static assertions)
- Legacy `test_phase_b_payments.py::test_upload_receipt_ok` **updated to the secure contract** (file must NOT exist under /static — the security assertion)
- Full backend suite: **1068 passed** · ruff clean
- Follow-up (v24-R4 F5 by orchestrator): `/api/agent/interpret` joined the AI daily budget (5/5 surfaces capped)

## Known follow-ups
- `routers/ai.py` agent image uploads should adopt `private_upload_dir()` (TODO left in _utils.py — file was outside this agent's ownership)
