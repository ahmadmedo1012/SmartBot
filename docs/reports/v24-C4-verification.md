# v24-C4 — Backend Robustness Fixes (Verification Report)

**Agent:** c4-backend (Implementation Agent C4-BACKEND, Task ID v24-C4)
**Date:** 2026-09-12 · **Mode:** implementation (edits only within declared file ownership)
**Inputs:** docs/reports/v24-B1-backend.md (H1/H2/H3, M1/M9, V1) + docs/reports/v24-B3-datalayer.md (§5-R8 P0) + worklog directives

---

## 1. Per-Task Table

| # | Task | Finding (file:line as reported) | Fix applied (file:line after fix) | Test(s) | Status |
|---|---|---|---|---|---|
| 1 | **P0 — pipeline CRM session poisoning** | `bot_engine/pipeline.py:746-773` check-then-insert on `uq_customer_tenant_fbuser`; `IntegrityError` swallowed without rollback → PendingRollback session → every later comment's stage-9 write fails → replies silently lost for the rest of the cycle | Insert now flushes inside `async with session.begin_nested():` (the `credit_wallet` / `_get_or_create_conversation` savepoint pattern); loser **re-reads the winner's row and updates it** (`_crm_touch`); outer except now always `rollback()` before warn — session never left dirty (pipeline.py:751-812) | `test_crm_race_savepoint_session_stays_usable` (forces the exact IntegrityError path via a stale-read session double, then proves a **second comment on the SAME session** still replies + writes; winner row healed, exactly 1 Customer row); `test_crm_commit_failure_rolls_back_session` (non-Integrity commit failure → rollback → later comments still work) | ✅ |
| 2 | **H1 — publisher tz-aware scheduled_at** | `publisher_routes.py:65` `datetime.fromisoformat(scheduled_at)` keeps tzinfo → aware bind into naive-UTC column → Neon/asyncpg DataError at commit (v21 bug class) | Sibling-route normalization copied verbatim: `Z`/`+0000` → `+00:00`, `astimezone(UTC).replace(tzinfo=None)`, **plus past-date rejection** like the sibling (B1 asked for both) (publisher_routes.py:64-83) | `test_publisher_scheduled_aware_offsets_normalized_to_utc` (+02:00 → 10:00 UTC, Z → 10:00 UTC, `tzinfo is None` asserted on the stored row); `test_publisher_scheduled_past_rejected` (400 «الماضي») | ✅ |
| 3 | **H3 — raw-body 500s (sequences/flows/calendar)** | `sequences.py:52/79/103/111`, `flows.py:35/77/112`, `calendar_routes.py:30/48` `body["key"]`/`request.json()` → KeyError/JSONDecodeError → 500 + false CRITICAL alerts | All bodies parsed via `from routers.broadcasts import _json_body, _required_key` (the v15-E3 precedent, same as subscribers_tags_routes.py); required keys: sequences `name`, flows `name`, calendar `message`; calendar GETs got `year/month/day` Query bounds (ge/le) so `month=13` and `Feb 31` answer 422 instead of engine `ValueError` 500 | 7 tests: missing-key 422 ×3 (detail names the field), malformed-JSON 422 ×5 endpoints, `month=13` / `day=31` / `month=0` 422 + valid-values-200 regression | ✅ |
| 4 | **M1 — users create_user race → 500** | `users.py:41-43` check-then-insert, no IntegrityError catch → concurrent duplicate = raw 500 | Commit wrapped; `IntegrityError` → `rollback()` + **409** with the SAME Arabic message as the pre-check («اسم المستخدم موجود مسبقاً في مساحة عملك») — register.py:295-312 pattern (users.py:74-84) | `test_create_user_commit_race_maps_409` (poisoned-commit get_db, the test_v15_concurrency `_poisoned_get_db` pattern) | ✅ |
| 5 | **H2 — AI cost abuse** | `ai.py:22-39/42-51` suggest+analyze: viewer role allowed, no per-user limit (unlimited paid LLM calls) | Both endpoints → `require_role("editor")` (the generate-reply precedent); **per-user daily cap 30/day/user/tenant** via the existing DB-backed `check_rate_limit` (change-password per-user precedent; DB-backed = cross-instance on Vercel), key `ai:{tenant_id}:{user_id}`, env knob `SMARTBOT_AI_DAILY_LIMIT`; budget checked BEFORE any provider call; the cap also covers the two already-editor-gated compute endpoints (`generate-reply`, `analyze-image`) per B1's "all AI-compute endpoints" | `test_ai_suggest_viewer_gets_403` (viewer → 403 on both), `test_ai_suggest_daily_cap_429_after_budget` (cap=2 → 3rd call 429 Arabic, **provider called exactly 2×**; a different user in another tenant has a separate budget), `test_ai_analyze_daily_cap_429` | ✅ |
| 6 | **V1 — rate-limit IP fidelity** | `app/middleware.py:70` `request.client.host` behind Vercel proxy = one shared bucket for ALL users (cross-user 429 lockouts, useless brute-force caps) | `client_ip(request)` helper in `_rate_limit.py` (my file, the limiter home): trusts `X-Forwarded-For` **only** when a proxy is known (`VERCEL` env, or `SMARTBOT_TRUST_XFF=1` opt-in for other deployments); validates every entry (literal IP only), strips ports (`1.2.3.4:5678`, `[v6]:443`), takes the **left-most PUBLIC** IP, else `request.client.host`. Applied at the one limiter call site in my files (middleware.py:70-76). Docstring carries the orchestrator NOTE: auth.py:135/262/444/491 + payments/wallet.py:185 + payments/plans.py:95 should adopt it (outside my ownership) | 4 tests: spoofed-XFF-ignored without proxy marker; VERCEL path (leftmost-public, port strip v4+v6, garbage skipped, all-private → fallback, no header → host); `SMARTBOT_TRUST_XFF` knob semantics; middleware-level bucket-key capture proving `mutate:` keys are per-forwarded-IP | ✅ |
| 7 | **M9 — webhook json.loads guard** | `app/webhooks.py:89` unguarded `json.loads(body)` → malformed JSON → 500 to Facebook → retry storm (a non-object JSON body also hit `data.get` → AttributeError 500) | Parse wrapped → **400** with a warning log (B1's recommended answer); non-dict JSON equally 400. **Signature verification stays FIRST** (verified order unchanged — only secret-holders can reach the parser) (app/webhooks.py:89-104) | `test_webhook_malformed_json_is_400_not_500` (signed garbage → 400; signed `[1,2,3]` → 400; unsigned → 401 first, order pinned) | ✅ |
| 8 | **sequences list step_count** | Frontend tolerant consumer shipped by C1 (`step_count ?? steps?.length ?? 0`) but backend never sent the field | `GET /api/sequences` merges `step_count` into each item via **ONE grouped `COUNT … GROUP BY` query** over `sequence_steps` (the engine's own `subscriber_count` pattern — no N+1), done in the router because `sequence_engine.py` is the datalayer agent's file (sequences.py:45-66) | `test_sequences_list_step_count` (2 steps → 2, none → 0) | ✅ |

**8/8 tasks implemented.**

---

## 2. Files Changed (all within declared ownership)

| File | Change |
|---|---|
| `fb_dashboard/bot_engine/pipeline.py` | P0 savepoint + heal + rollback (task said `facebook_engine/pipeline.py` — the real path of the cited code is `bot_engine/pipeline.py`, per B1/B3 line references) |
| `fb_dashboard/routers/publisher_routes.py` | H1 tz normalization + past rejection |
| `fb_dashboard/routers/sequences.py` | H3 422 bodies + task-8 step_count |
| `fb_dashboard/routers/flows.py` | H3 422 bodies |
| `fb_dashboard/routers/calendar_routes.py` | H3 422 bodies + y/m/d bounds + Feb-31 422 |
| `fb_dashboard/routers/users.py` | M1 409 on commit race |
| `fb_dashboard/routers/ai.py` | H2 editor gate + per-user daily cap (suggest/analyze/generate-reply/analyze-image) |
| `fb_dashboard/_rate_limit.py` | V1 `client_ip()` + `_normalize_ip_entry()` + `_is_private_ip()` |
| `fb_dashboard/app/middleware.py` | V1 use `client_ip(request)` at the mutate-limiter site |
| `fb_dashboard/app/webhooks.py` | M9 guarded parse (ownership note: task listed `routers/webhooks.py`, but the unguarded `json.loads` lives in `app/webhooks.py:89` — `routers/webhooks.py` has no body parsing; fixed at the actual defect site) |
| `tests/test_v24_c4_backend.py` | NEW — 20 regression tests (one per fix family) |

Every fix carries a `# v24-C4:` tag at the change site. No pre-existing test was edited; no file outside ownership was touched (verified via scoped `git diff` — the other modified files in the tree belong to the parallel C5-datalayer/C1/C2/C6 agents).

---

## 3. Gates

- **pytest:** `python -m pytest -q -p no:cacheprovider -k "not live" --maxfail=10` → **1043 passed, 30 deselected** in 318.9s. Baseline was 1009 (29 live-deselected); delta = +20 (this agent's `tests/test_v24_c4_backend.py`) and +14 (the parallel datalayer agent's `tests/test_v24_datalayer.py`, already green in the shared tree). **Zero failures.**
- **ruff:** `ruff check fb_dashboard/ tests/test_v24_c4_backend.py` → **All checks passed**. (Repo-wide `ruff check fb_dashboard/ tests/` currently reports 5 remaining issues, all inside `tests/test_v24_datalayer.py` — the parallel datalayer agent's in-flight file, outside my ownership; my scoped check is clean.)

---

## 4. Deviations & Notes

1. **pipeline.py path:** ownership list named `fb_dashboard/facebook_engine/pipeline.py`; that path does not exist — the cited defect (B3 §5-R8, pipeline.py:746-773) is `fb_dashboard/bot_engine/pipeline.py`. Fixed there.
2. **webhooks.py:** ownership list named `routers/webhooks.py` (event list/health — no body parsing); the M9 unguarded `json.loads` is `app/webhooks.py:89`. Fixed at the defect site; signature-verify-before-parse order preserved and pinned by test.
3. **AI cap scope:** applied the daily budget to all four AI-compute endpoints (suggest/analyze + the already-editor-gated generate-reply/analyze-image) per B1's "all AI-compute endpoints" recommendation; only suggest/analyze needed the role change. `/api/ai/status`, `/api/agent/memory*` untouched (no LLM cost).
4. **client_ip trust marker:** VERCEL-only per B1, plus an explicit `SMARTBOT_TRUST_XFF=1` opt-in for non-Vercel trusted proxies (documented ops knob, mirrors `SMARTBOT_MUTATE_RATE_LIMIT` style). Left-most PUBLIC IP as directed; private/unparsable entries skipped; all-private → connection host.
5. **Not done (out of scope / other owners):** auth.py + payments limiter sites must adopt `client_ip()` (comment left at the helper for the orchestrator); M2/M3 (widgets/diagnostics bounds), M7 (ai_analyze_image logging/to_thread), M10 (logs SSE caps), M11 (notification user-scoping) — not in my task list; offer dedup R7 + indexes belong to the datalayer agent (already landing in parallel).
