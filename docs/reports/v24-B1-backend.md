# v24-B1 — Backend Routers Deep Audit (Diagnostic Agent BACKEND)

**Date:** 2026-09-11 · **Agent:** backend-auditor (Task v24-B1) · **Mode:** READ-ONLY static analysis — no source modified
**Scope:** `fb_dashboard/` — all 38 router files (incl. `payments/` ×5), shared modules (`models.py`, `database.py`, `config.py`, `_wallet.py`, `_subscription.py`, `_rate_limit.py`, `_responses.py`, `_audit.py`, `_utils.py`, `_services.py`, `api_cache.py`, `cache_layer.py`, `redis_cache.py`, `_schema_reconcile.py`), core services (`fb_client.py`, `messenger_service.py`, `broadcast_engine.py`, `pdf_reports_engine.py`, `telegram_bot.py`, `bot_engine/`), app layer (`runner.py`, `app/{middleware,startup,webhooks,telegram,piggyback,ws,errors,spa}.py`), `logs_api.py`, `vercel.json`, `alembic/versions/` (16 migrations).

---

## 1. Executive Summary

SmartBot's backend is **unusually disciplined for its size**. Every major historical security/consistency bug class this audit hunted for has already been systematically fixed and *documented at the fix site* (tenant scoping after `db.get`, platform-admin vs tenant-admin split, atomic claim-then-fanout outbox patterns, SSRF guards, constant-time secret compares, naive-UTC datetime normalization, CSRF double-submit, per-key singleflight caches). 1009 passing tests corroborate.

That maturity shifts the risk surface to **residual, mostly-low-severity items**: a handful of routers that pre-date the v15-E3 "clean 422" body-parsing convention still 500 on client typos; a few unbounded query params; one suspected tz-aware datetime bug in `publisher_routes.py` that re-introduces the exact asyncpg failure class fixed in v21; rate-limit client-IP resolution that may mis-bucket on Vercel; and some dead/latent code in the cache layer.

**Issue counts** (finding = actionable deviation; "note" = informational):

| Severity | Count |
|---|---|
| Critical (tenant isolation / money-loss / data corruption) | **0 confirmed** (2 "verify-in-prod" items) |
| High | 3 |
| Medium | 11 |
| Low / consistency / notes | 17 |

**Files audited:** 38 routers + 20 shared/app/service modules + migrations. **0 source modifications.**

---

## 2. Critical Findings

### 2.1 Tenant isolation — verdict: SOUND (no confirmed leak)

Method: every `select(`/`db.get(` across all 34 query-bearing router files inspected (236 call sites), plus engine delegation paths.

- All tenant-scoped models carry `tenant_id` (`models.py`, 40+ tables), almost always with composite indexes.
- The dominant pattern — `db.get(Model, id)` followed by `if not x or x.tenant_id != current_user._tenant_id: 404` — is applied consistently in marketing.py:164-166/202-204/220-222, support.py:217-219/259-261/291-293/401-403/443-445, notifications.py:133-135, payments/wallet.py:253-255, payments/plans.py:206-210/271-285, rules.py, flows.py, sequences (engine-scoped), templates, crm, offers, scheduled_posts, broadcasts, health_alerts, alerts, reports_schedules.
- `get_current_user` (auth.py:50-92) pins the JWT's `tid`, scopes the per-tenant username lookup (fixes the documented MultipleResultsFound lockout), and re-checks tenant liveness on every request.
- Documented exceptions audited and confirmed safe:
  - `brand_routes.py` — `BrandConfig` is a global platform row; PUT is platform-admin (v9-A7).
  - `commerce_routes.py` — Shopify store is a global singleton; all writes/reads platform-admin (v12-E2.2).
  - `telegram_config.py` / `admin_routes.py` / `diagnostics.py` / `logs_api.py` — platform-level surfaces gated by `require_platform_admin`.
  - `payments/approvals.py:52-78` — admin list splits platform admin (all tenants) vs tenant admin (own only); resolve is platform-admin-only (v14-E1 C-SEC1).
  - `support.py:322+` — platform-admin cross-tenant queue, gated.
  - `notifications mark_read` (notifications.py:127-138) — tenant-scoped; *note:* any same-tenant user can mark another **user's** notification read (in-tenant, low impact).

**Residual tenant risks (verify, not confirmed):**

1. **`request.client.host` as the rate-limit key on Vercel** (auth.py:135/262/444/491, app/middleware.py:70, payments/wallet.py:185, payments/plans.py:95). No `X-Forwarded-For` handling exists anywhere in the repo (grep: 0 hits). If Vercel's ASGI adapter surfaces the edge/proxy IP rather than the true client IP, **all users share one `mutate:` bucket (30/60s) and one `login:` bucket (10/60s)** → cross-user 429 lockouts and useless brute-force protection. Fix: a small helper that prefers the first hop of `x-forwarded-for` (trusted only when `VERCEL` is set), used by all 7 sites.
2. **`payments/sse.py` per-tenant stream cap is per-process** (`_sse_tenant_counts` dict) — on multiple warm Vercel instances the cap of 5 streams/tenant is per-instance only. Informational (SSE is cheap); the payments SSE also has lifetime + disconnect guards (good).

### 2.2 Transaction & money safety — verdict: SOUND

- **Wallet credit is atomic** (`_wallet.py:credit_wallet`): single SQL `UPDATE ... CAST(value AS NUMERIC(12,3)) + :amt`, savepoint for row creation, IntegrityError retry — no read-modify-write race; caller owns the commit so payment-confirm + credit are one transaction (app/telegram.py:171-180).
- **Approve/reject idempotency**: `UPDATE ... WHERE status='pending' RETURNING` atomic claim in *both* the HTTP path (approvals.py:107-116) and the Telegram path (app/telegram.py:89-96) — double-activation is prevented.
- **Subscription activation** (approvals.py:117-136, app/telegram.py:100-115): tenant + user + plan writes happen in the same transaction as the claim update; single commit at 169/141.
- **Duplicate-subscription guard** via `_subscription.is_subscription_active` (v19) at create (plans.py:135-137) and in-process `_pending_lock` double-submit guard (plans.py:160-183). Note: the lock is per-instance (documented in-code); a partial UNIQUE index `(user_id WHERE status='pending')` is still the recommended durable fix — on Vercel two instances can each create a pending row (low impact: both require platform approval, only one claimable).
- **Broadcast fan-out** (broadcast_engine.py:240-503): atomic `draft→sending` claim published before slow fan-out; per-recipient short sessions; batch commits; failure marks row `failed`. Same claim pattern in marketing campaigns (marketing.py:332-341) and scheduled posts (`claim_scheduled_post`).
- **`check_rate_limit` commits the caller's session** (_rate_limit.py:26). In login/register/change-password the call runs *before* any write, so it is currently benign — but it is a landmine: any future caller that rate-limits *after* staging writes gets a premature partial commit. plans.py/wallet.py correctly isolate it in a separate `AsyncSessionLocal` session; auth.py does not. Fix: always use a private session (or `begin_nested`), never the request session.

### 2.3 Two "verify against production" items (potential High, not statically provable)

- **V1 — rate-limit IP bucketing** (see 2.1 residual #1).
- **V2 — Vercel cron cadence**: `vercel.json:135-143` schedules `heartbeat` **daily at 04:00** and `cleanup-logs` daily 03:00. The 5-minute external channel (cron-job.org) is documented DEAD in app/piggyback.py. Automation latency therefore depends entirely on the piggyback beat (warm traffic, 300s window, 20s budget) — with no traffic, an inbound comment can wait up to 24h for a bot reply (the exact T3-a finding). Ops fix, not code: re-arm cron-job.org with current CRON_SECRET, or move to Vercel Pro sub-daily crons.

---

## 3. High Findings

### H1 — `publisher_routes.py:63-75` stores tz-aware `scheduled_at` (asyncpg DataError class)
```python
sched = datetime.fromisoformat(scheduled_at)   # keeps tzinfo (Z / +02:00)
post = ScheduledPost(... scheduled_at=sched ...)  # naive-UTC column
```
`scheduled_posts_routes.py:64-73` (the sibling route) and `_parse_fb_time` (facebook_routes.py:106-128) both normalize to naive UTC — the exact v21 live bug ("asyncpg REFUSES aware datetimes bound to naive DateTime columns … 13 hours of empty posts section"). If the frontend ever sends a Z-suffixed ISO string here (it does elsewhere), **every scheduled multi-platform post write fails on Neon at commit** while passing on SQLite tests. Note: pre-3.11 `fromisoformat` also rejects `Z` outright (ValueError → clean 400), masking the issue on some runtimes.
**Fix:** mirror the sibling: `if sched.tzinfo is not None: sched = sched.astimezone(UTC).replace(tzinfo=None)`, and reject `sched <= utcnow()` like the sibling does (this route also accepts past dates).

### H2 — `ai.py` cost endpoints lack role gate + per-user rate limit
`/api/ai/suggest` (ai.py:22-39) and `/api/ai/analyze` (42-51) require only `get_current_user` — a **viewer**-role account (or any compromised session) can drive unlimited paid LLM calls; only the global 30-mutations/60s-per-IP middleware cap applies. `/api/ai/generate-reply` correctly requires editor. Fix: `require_role("editor")` on all AI-compute endpoints, plus `check_rate_limit(f"ai:{user.id}")` (the change-password precedent, 5/hour).

### H3 — Legacy raw-body routers still 500 on client typos (v15-E3 D1-H1 convention violations)
The payments family and newer routers answer clean Arabic 422s via `_json_body`/`_required_key`/`_as_int`; these never got the treatment:
- `sequences.py:52-58` (`body["name"]` → KeyError → 500), `79`, `103` (`add_step`), and `update_sequence` bodies.
- `flows.py:35-37` (`body["name"]`).
- `calendar_routes.py:30-40` (`body["message"]`) — also no year/month/day bounds (`month=13` reaches the engine).
Each is a guaranteed unhandled 500 + CRITICAL Sentry/Telegram alert for a plain client typo — the exact failure mode v15-E3 set out to eliminate. Fix: import `_json_body`/`_required_key` from `routers.broadcasts` (the existing precedent) — ~10 lines per site.

---

## 4. Medium Findings

| # | Location | Finding | Fix |
|---|---|---|---|
| M1 | `users.py:41-43` | `create_user` check-then-insert with no `IntegrityError` catch → concurrent duplicate = raw 500 (register.py:295-312 already has the 409 pattern) | Wrap commit, map `uq_user_tenant_username` → 409 Arabic |
| M2 | `widgets_routes.py:102` `limit: int = Query(10)`; `diagnostics.py:50` `Query(20)` | Unbounded `limit` (client can pass 10⁷ → GROUP BY over whole table) | Add `ge=1, le=100/500` (the v12-E2.7 pattern) |
| M3 | `widgets_routes.py:61,80`, `team_routes.py:20` `days: int = Query(7)` | Unbounded `days` (negative → future cutoff = empty; huge → full scans). analytics.py already uses `ge=1, le=365` everywhere | Copy the analytics bounds |
| M4 | `api_cache.invalidate_on_write` (api_cache.py:147-162) + `invalidate_prefix` | **Latent poison + dead code**: invalidation writes `''` to Redis; a subsequent `APICache.cached` read would `json.loads('')` → JSONDecodeError → 500. Currently unused (grep: only docstrings) — but a timebomb for the next user. Also local-only prefix invalidation leaves other instances' Redis entries until TTL | Either delete the decorator or make it `await redis_cache.delete(k)` over a tracked key set |
| M5 | `api_cache` vs `redis_cache` double-encoding | `_rcache_set(key, json.dumps(x))` → `redis_cache.set` json.dumps *again* → Redis stores a doubly-encoded string; reads double-decode. Works, but doubles payload size and the two layers use incompatible conventions (`redis_cache.get_or_set` single-encodes) — a future mixed consumer corrupts silently | Standardize on one serialization layer |
| M6 | `app/telegram.py:198-221` `_run_bot_loop` | try/except wraps the **whole tenant loop** — one tenant's `engine.cycle()` raise aborts tenants N+1..end for that pass (local/standalone only; Vercel uses `_automation_sweep`, which catches per-tenant) | Move try/except inside the `for tenant` loop (mirror `_automation_sweep`) |
| M7 | `ai.py:78-101` `ai_analyze_image` | `except Exception: pass` → always `{"analysis": ""}`; provider errors are indistinguishable from a genuine empty result; also 10MB image decoded with Pillow **on the event loop** (~100-300ms CPU) | Log the exception (`ai.last_error` precedent in `generate-reply`); run Pillow re-encode via `asyncio.to_thread` |
| M8 | `telegram_config.py:277-278` `update_target` | `t.is_active = body["isActive"]` with no type check — a string lands in a Boolean column (500 on strict PG commit / silent truthiness on SQLite) | `if not isinstance(v, bool): 422` |
| M9 | `app/webhooks.py:89` `json.loads(body)` unguarded | Malformed JSON → 500 to Facebook (retry storm). Signature check runs first, so only secret-holders can reach it — severity bounded | Wrap → 400 early return |
| M10 | `logs_api.py:51-85` `/api/logs/realtime` SSE | No lifetime cap and **no `request.is_disconnected()` check** (payments/sse.py has both). An abandoned admin tab holds the stream until server kill | Copy the payments SSE guards (deadline + is_disconnected) |
| M11 | `notifications.py:127-138` `mark_read` | Tenant-scoped but not **user**-scoped: any same-tenant user marks another user's notification read | Also compare `n.user_id in (None, current_user.id)` |

---

## 5. Per-Category Findings

### 5.1 Router consistency (checklist item 1)

| Pattern | Canonical | Deviations |
|---|---|---|
| Auth dependency | `get_current_user` / `require_role("editor"\|"admin")` / `require_platform_admin` | ✅ all 38 routers; write endpoints consistently `editor+`; destructive = `admin` |
| Response envelope | `ok()`/`fail()` from `_responses` | ✅ everywhere; documented exceptions honored (healthz, PDF bytes, SSE, webhooks) |
| Tenant scoping | `current_user._tenant_id` filter or post-`db.get` check | ✅ no gaps found (see 2.1) |
| Pagination | `page`+`per_page` (ge/le bounded) — auth, audit, users, subscribers, support, inbox, alerts(admin), platform users | ⚠️ `payments/wallet.py:277` uses `limit/offset`; `admin_list_subscriptions` (approvals.py:53-65) hardcodes 20/page; `rules`/`scheduled_posts` use `limit/offset`; marketing uses `limit` only; flows/templates/sequences lists unbounded (small tables) |
| Error shape | `HTTPException(status, "Arabic message")`, never internals | ✅ 4 raw `str(e)` sites (subscribers_tags:73, calendar:43, reports:101 — all engine-raised ValueError with Arabic text; facebook_routes:806 maps double-bind) — acceptable but should switch to fixed strings for defense-in-depth |
| Body parsing | `_json_body`+`_required_key` (v15-E3) / `_as_int`/`_as_float` (payments) / `RulePayload` (rules) / pydantic (`ConnectPagePayload` onboarding, `TemplateCreate` templates) | ❌ sequences, flows, calendar, commerce shopify_configure, publisher — raw `request.json()` + `body["key"]` (see H3) |
| Form vs JSON dual-accept | rules + templates (v17 Convention #1) | Sequences/flows are JSON-only; users is Form-only — acceptable, documented |

### 5.2 N+1 / query-per-item loops (item 3)

The codebase has already converted its known N+1s to batch `IN(...)` upserts: inbox conversations (inbox.py:263-298), comments sync (replies.py:77-109), posts/ads sync (facebook_routes.py:190-217), widgets top-keywords (widgets_routes.py:106-128), admin ticket queue threads (support.py:352-366). Remaining:

- **broadcast_engine.send_one** (broadcast_engine.py:426-464): 2 SELECTs + 1 commit **per recipient** under a semaphore of 10. For a 5,000-recipient broadcast ≈ 10k queries / 5k commits. Deliberate (per-recipient session isolation; comment says so) — but recipients could be batch-loaded and statuses written with one `CASE` UPDATE per batch. Medium perf, not correctness.
- **`_run_bot_loop`/`_automation_sweep` fan sweeps** iterate tenants serially with live Graph calls each (bot.py:224-289) — inherent to the design; TTL-cached fan counts + 300s piggyback throttle bound it.
- `auth.py get_current_user` runs 2-3 queries per request (blacklist + user + tenant). A Redis-backed session cache would cut the hot path; currently acceptable on Neon.

### 5.3 Transaction safety (item 4) — see §2.2. Additional notes:
- `marketing._dispatch_campaign` (marketing.py:233-292) commits mid-flight (line 270) while the caller `send_campaign` had already staged `c.status="sending"` — a crash between commits leaves an honest-but-odd state; recoverable by the queued/failed sweep. Documented trade-off, low risk.
- `auth.py` reset/change password use the documented commit → log_audit → commit sequence (v22 FIX-A) — audit rows survive.
- `admin_routes.delete_tenant` (348-386): 40 deletes in one transaction — correct (all-or-nothing GDPR).
- `get_db` rolls back on exception (database.py:57-63) — good baseline.

### 5.4 Error handling (item 5)
- **Zero bare `except:` clauses** (grep: 0). ~90 `except…: pass` blocks; nearly all are documented best-effort guards on notifications/cache/observability with in-code rationale. The genuinely problematic swallows are M7 (ai_analyze_image), and approvals.py:167/telegram.py:139 (push_notification loss — documented as non-fatal by design).
- `str(e)`/`str(exc)` never reaches the client from an internal exception (only engine-validated ValueError messages, see 5.1). `app/errors.py` global 500 handler + 422 Arabic validation handler confirmed registered (runner.py:203-205).
- `except Exception: raise HTTPException(500, …) from None` pattern used correctly (admin repair, dashboard bundle).

### 5.5 Async correctness (item 6)
- **No sync `requests`** (grep: 0). All HTTP via httpx.AsyncClient with timeouts (fb_client 15s, telegram 10s, receipts 10s, AI service).
- `telegram_bot._call` is sync but **always dispatched via `asyncio.to_thread`** (verified at all 4 call sites).
- PDF render, Pillow uploads, file reads, alembic upgrade — all `to_thread` (pdf_reports_engine.py:308, startup.py:82/199/212, payments/bank.py re-encode on-loop — minor, ~100ms).
- `time.sleep` only inside the to_thread-bound `_call`. No CPU-heavy loop work found on the event loop beyond Pillow re-encodes (M7).
- SSE endpoints poll with fresh short sessions (payments/sse.py — documented StaticPool reasoning); heartbeat loops sleep 30-60s.

### 5.6 Input validation (item 7)
- Pydantic models exist only where payloads are complex (onboarding, templates). Elsewhere: `Body(dict)` + manual checks — consistent with house style; gaps listed in H3/M2/M3/M8. Field-level bounds otherwise solid: password ≥8, username regex, plan price equality, wallet cap 1-10000, receipt URL prefixes + 2MB, upload magic-bytes + 5MB + re-encode, behavior-switch unknown-key 422, notification prefs key whitelist, telegram token/chat regexes, wallet-cap DB bounds.
- Unbounded list endpoints: flows, templates, sequences, crm (no limit param) — small per-tenant tables; acceptable but inconsistent.

### 5.7 Rate limiting & abuse (item 8)
Covered: per-IP login 10/60s, register 5/300s, change-password 5/3600 per-user, subscriptions 5/60s, topup/confirm/upload 10/60s, global mutating 30/60s per-IP, SSE 5 streams/tenant, piggyback 1 beat/300s/instance, cron Bearer constant-time.
**Not covered:** AI compute endpoints per-user (H2); GET endpoints (all reads unthrottled — dashboard bundle is 60s-cached which mitigates); `/api/support` ticket create (rate-limited? — support.py create uses none; spam vector is bounded by 2k char cap + middleware 30/60s). RateLimitEntry growth is handled by daily cleanup-logs (plans_config.py:299+). IP fidelity issue → 2.1 V1.

### 5.8 Cache layer (item 9)
- `APICache.cached` used **only** on the 3 public endpoints (plans/config/public-stats) — path-keyed cache is tenant-safe there by construction (documented D10 §8 reasoning in middleware.py:39-53). `get_or_compute` is caller-keyed with tenant id (dashboard_stats.py:279-283). ✅ no cross-tenant cache leak.
- Invalidation: `admin_set_config` → `api_cache.clear_all()` — **local store only**; Redis copies on other Vercel instances serve stale `/api/config` up to 300s. Bounded, documented behavior, acceptable; worth a one-line comment.
- `TTLCache` double-check uses a `now` captured before lock acquisition (cache_layer.py:27-32) — can return data up to lock-wait stale; harmless.
- `ReplyDedupCache` (in-memory, 300s TTL clear) is per-instance; cross-instance comment dedup relies on the 48h DB replied-ids window (documented) — sound.

### 5.9 Webhook robustness (item 10)
- **Signature**: HMAC-SHA256 `x-hub-signature-256`, `hmac.compare_digest`, **fails closed** when secret unconfigured (app/webhooks.py:78-87). Verify-token: constant-time, fails closed. Telegram webhook: secret-token constant-time; the `TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED=true` dev hatch is **refused at boot in production** (config.py:111-116). Cron: Bearer + `secrets.compare_digest`, empty secret never validates.
- **Dedup/replay**: Messenger events dedup on `(tenant_id, fb_message_id)` DB lookup *before* reply (messenger_service.py:176-183) — cross-instance safe; comments dedup via engine caches + 48h DB window; posts upsert keyed on fb_post_id. FB redelivery → no double replies.
- **Timeouts**: all Graph calls via fb_client `_get/_post` (15s httpx); per-event processing is inline (Vercel-safe by design, documented) — a many-entry payload could exceed maxDuration 30s → FB retry → deduped on arrival; acceptable. M9 covers the JSON 500.

### 5.10 Facebook client (item 11)
- **Token handling**: `ensure_page_token` (v20) verifies user-vs-page token and auto-exchanges; `get_tenant_fb_client` (v20) self-heals stored user-tokens once per TTL, re-encrypts, evicts caches. No long-lived-token refresh cycle exists (page tokens ~60-day expiry is the operator's burden; health probes + subscription-state recording surface it).
- **Error mapping**: 4xx → structured `{"_error", status, body}` (no retry), 5xx/timeouts → backoff retry 1.5^n ×3; `_get_with_status` classifies token-type failures (code 190/10/100/#200) for honest UI states; `check_page_subscription` maps Graph error codes → missing permission names.
- **Pagination**: `get_page_posts(limit, after)` supports Graph cursors; conversational syncs are windowed (30s skip stamps) rather than cursor-paged — fine.
- Note: `_fan_count_cache` is a **class attribute** shared across all FBClient instances (keyed by page_id) — safe while page_ids are unique per tenant (they are, enforced by `uq_botstate_key_value`), but worth an instance-level cache for clarity.

### 5.11 Background jobs (item 12)
- Scheduled posts: atomic claim `scheduled→publishing` **before** Graph; failure releases the claim; `recover_stale_publishing` re-arms crashed publishers (bot.py:107-167). Idempotent ✅.
- Broadcasts/campaigns: outbox (`pending`) + atomic claim; consumers called from the bot cycle end + piggyback + cron — no spawn-after-response (the documented Vercel killer). Double-send protection ✅.
- Sequences: per-tenant dispatcher, fresh engine per due step, `MAX_SEND_ATTEMPTS=3` then durable `failed` (no infinite retry). Calendar scheduler: 3 attempts → durable `schedpost_fail_*` reason rows.
- Gaps: M6 (bot loop per-tenant catch), and the V2 cron-cadence dependency.

### 5.12 Config & secrets (item 13)
- No hardcoded secrets: `SECRET_KEY`, `FERNET_KEY`, `CRON_SECRET` fail-fast in prod (config.py:93-100); default SECRET_KEY refused at lifespan (startup.py:180-183). DB SSL verifies certificates (2026-09-05 MITM fix) with documented escape hatch. Secrets masked in admin GET (`••••+last4`) and mask-echo dropped on POST. Tokens Fernet-encrypted at rest. `extra="ignore"` on Settings is self-annotated as masking misspelled env vars (ponytail note). TELEGRAM_BOT_TOKEN read from env at import — fine.
- One hygiene note: `config.py:81` parses `TELEGRAM_ADMIN_IDS` at import; a malformed value silently drops entries (`.isdigit()` filter) — acceptable, logged nowhere; add a warning.

### 5.13 Migrations vs models (item 14)
- 16 Alembic versions (001→016), linear chain, latest `016_v19_posts_ads_dbfirst`.
- Strategy is belt-and-suspenders: lifespan runs `Base.metadata.create_all` → `_schema_reconcile` (add missing columns, dedup rows, create unique indexes for pre-rebuild DBs) → `alembic upgrade head` (via to_thread; failures logged, non-fatal) → seed plans/admin. `api/index.py` entry boots the same lifespan on Vercel, so schema drift self-heals at cold start. `/api/repair` offers a manual path.
- No column in `models.py` was found lacking either a migration or a reconcile statement (014 backfills NULL token_ver; reconcile handles pre-007 DBs). Residual risk: the reconcile/alembic write path runs on **every cold start** — concurrent cold starts could race (Alembic guards with version table; create_all is IF NOT EXISTS; low risk).
- `SupportTicketReply` has no `tenant_id` (documented; deleted via ticket-id subquery; filters always join through tenant-scoped tickets) — consistent.

---

## 6. Consistency Matrix (router-by-router)

Legend: ✅ conforms · ⚠ minor deviation · ❌ gap

| Router | Auth | Tenant scope | Envelope | Pagination | Body validation | Notes |
|---|---|---|---|---|---|---|
| auth | ✅ | ✅ | ✅ | ✅ page/per_page | ⚠ raw dict + manual (style) | logout blacklist fail-loud (v22) |
| users | ✅ | ✅ | ✅ | n/a (list lives in auth) | ⚠ Form-only | M1 race → 500 |
| bot | ✅ | ✅ (sweeps) | ✅ | n/a | ✅ behavior 422 | cron Bearer ✅ |
| rules | ✅ | ✅ | ✅ | ⚠ limit/offset (bounded) | ✅ dual JSON/Form | plan gate ✅ |
| replies | ✅ | ✅ | ✅ | ✅ | ✅ Form | batch sync ✅ |
| inbox | ✅ | ✅ | ✅ | ✅ page/per_page | n/a | staleness re-sync ✅ |
| webhooks | ✅ | ✅ | ✅ (bounded limit) | ✅ | n/a | M9 json 500 |
| facebook_routes | ✅ | ✅ | ✅ | ⚠ raw lists (bounded 50) | ⚠ mixed | sync_error surfacing ✅ |
| analytics | ✅ | ✅ | ✅ | ✅ days bounded | n/a | export exception documented |
| broadcasts | ✅ | ✅ | ✅ | ✅ bounded | ✅ _json_body | atomic queue claim ✅ |
| sequences | ✅ | ✅ (engine) | ✅ | ⚠ unbounded list | ❌ body["name"] | H3; plan gate ✅ |
| scheduled_posts | ✅ | ✅ | ✅ | ✅ bounded | ✅ Form + TZ normalize | tz fix ✅ (contrast H1) |
| subscribers_tags | ✅ | ✅ | ✅ | ✅ | ✅ _json_body/_required_key | engine-delegated |
| payments/plans | ✅ | ✅ | ✅ | n/a | ✅ _as_int/_as_float | pending-lock + active guard ✅ |
| payments/wallet | ✅ | ✅ | ✅ | ⚠ limit/offset | ✅ | merged invoices ✅ |
| payments/approvals | ✅ platform | ✅ split | ✅ | ⚠ hard 20/page | ✅ | atomic claim ✅; receipt SSRF guard ✅ |
| payments/bank | ✅ | ✅ | ✅ | n/a | ✅ magic bytes | Pillow on-loop (minor) |
| payments/sse | ✅ | ✅ | documented exception | n/a | n/a | cap/lifetime/disconnect ✅ |
| support | ✅ | ✅ | ✅ | ✅ page/limit | ✅ | closed-ticket 400 ✅ |
| team_routes | ✅ | ✅ | ✅ | ⚠ days unbounded | n/a | engine-delegated |
| admin_routes | ✅ platform | ✅ | ✅ | ⚠ raw params (clamped) | ✅ key allowlists | GDPR delete ✅ |
| ai | ⚠ viewer on 2 endpoints (H2) | ✅ | ✅ | n/a | ⚠ Form/dict | M7 swallow |
| marketing | ✅ | ✅ | ✅ | ⚠ limit only | ✅ manual | outbox consumer ✅ |
| offers | ✅ | ✅ | ✅ | ⚠ unbounded | ✅ Form | engine-delegated |
| crm | ✅ | ✅ | ✅ | ✅ | ✅ Form | 409 conflict handling ✅ |
| publisher | ✅ | ✅ | ✅ | n/a | ❌ raw body | **H1 tz**; immediate FB publish unrecorded |
| calendar | ✅ | ✅ | ✅ | n/a | ❌ body["message"]; unvalidated y/m/d | H3 |
| commerce | ✅ platform | ✅ (global by design) | ✅ | ✅ bounded | ⚠ raw body | HMAC webhook ✅ |
| brand | ✅ (write=platform) | ✅ (global by design) | ✅ | n/a | ✅ Form | write-on-read seed (ok) |
| templates | ✅ | ✅ | ✅ | ⚠ unbounded | ✅ pydantic dual | |
| widgets | ✅ | ✅ | ✅ | ⚠ M2/M3 | n/a | |
| flows | ✅ | ✅ | ✅ | ⚠ unbounded | ❌ body["name"] | H3 |
| notifications | ✅ | ✅ | ✅ | ✅ bounded | n/a | M11 user-scoping |
| telegram_config | ✅ platform | ✅ (global) | ✅ | ⚠ unbounded lists | ⚠ M8 | |
| health_alerts | ✅ | ✅ | ✅ | ✅ | n/a | |
| alerts | ✅ | ✅ | ✅ | ✅ fixed 20 | ✅ pref whitelist | |
| diagnostics | ✅ platform | ✅ | ✅ | ⚠ M2 | n/a | |
| reports_routes | ✅ | ✅ | ✅ | ⚠ unbounded | ✅ | PDF off-loop ✅; SSRF logo guard ✅ |
| plans_config | ✅ / public | ✅ / global | ✅ | n/a | ✅ | cleanup-logs idempotent ✅ |
| onboarding | ✅ | ✅ | ✅ | n/a | ✅ pydantic | token gate + 409 double-bind ✅ |
| dashboard_stats | ✅ | ✅ | ✅ | n/a | n/a | tenant-keyed 60s cache ✅ |

---

## 7. Priority Fix List

1. **H1** — `publisher_routes.py:65-73`: normalize tz-aware `scheduled_at` to naive UTC + reject past dates (copy scheduled_posts_routes.py:64-73). 5 lines. Prevents Neon commit failures (v21 bug class).
2. **V1** — central `client_ip(request)` helper honoring `X-Forwarded-For` on Vercel; use in the 7 rate-limit sites. Prevents shared-bucket 429s / ineffective brute-force caps.
3. **H2** — `/api/ai/suggest` + `/api/ai/analyze`: `require_role("editor")` + per-user rate limit. 10 lines. Closes a cost-abuse vector.
4. **H3** — port `_json_body`/`_required_key` to sequences.py, flows.py, calendar_routes.py (+ year/month/day bounds). Eliminates guaranteed 500s + false CRITICAL alerts.
5. **M1** — `users.py create_user`: catch IntegrityError → 409 (register.py pattern).
6. **M4/M5** — delete or fix `APICache.invalidate_on_write` (latent 500) and unify Redis serialization.
7. **M6** — per-tenant try/except inside `_run_bot_loop`.
8. **M7/M8/M9/M10/M11** — targeted hardening (ai_analyze_image logging + to_thread; isActive bool check; webhook json 400; logs-SSE caps; notification user-scoping).
9. **M2/M3** — bound `limit`/`days` on widgets/diagnostics (Query ge/le).
10. **Ops (V2)** — re-arm the 5-minute cron channel or upgrade to sub-daily Vercel crons; verify `/api/cron/status` shows fresh beats.
11. **Strategic** — partial UNIQUE index `(user_id WHERE status='pending')` on subscription_payments (documented in-code as the durable double-submit fix); consider Redis-backed session cache for `get_current_user` hot path.

**Bottom line:** no critical tenant-isolation or money-handling defect found; the three High items are cheap, surgical fixes; the codebase's biggest residual risks are operational (cron cadence) and environmental (proxy IP fidelity), not structural.
