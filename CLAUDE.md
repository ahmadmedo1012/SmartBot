# SmartBot — Governance & Architecture

---

# Engineering Rules (قوانين هندسية صارمة)

These rules are globally active (see `/home/ahmed/.claude/CLAUDE.md`). Reinforced here for project context:

1. **Deep Analysis** — Full environment/requirement/code examination before any code.
2. **Precise Planning** — Write/update plan before touching code. Plan first, code second.
3. **Continuous Testing** — 100% verification after every step. No skip, no partial.
4. **Multi-Agent Orchestration** — Decompose work, recruit sub-agents, verify adversarially.

*Cost and time irrelevant. Perfect error-free results are the only priority.*

---

## Project Identity
SmartBot: Facebook engagement automation platform (FastAPI + Next.js 16).
Reference architecture: [Smart-Menu](https://github.com/ahmadmedo1012/Smart-Menu) — same cleanliness principles, different backend language.

## Single Entry Points

### Backend (Python/FastAPI)
- **`api/index.py`** — Vercel entrypoint, imports `fb_dashboard.runner.app`
- **`fb_dashboard/runner.py`** — app factory: lifespan, middleware, router includes, SPA catch-all, WebSocket, webhook
- **`fb_dashboard/routers/`** — ALL business logic routes. Never add `@app.get/post/...` in `runner.py`.
- **`fb_dashboard/_services.py`** — shared state: lazy engine proxies, FB client, helpers (get_ai, _track_event, _get_trend_data)

### Frontend (Next.js 16)
- **`fb_dashboard/frontend/`** — App Router, `/api/*` proxied to backend
- Live at `https://bot.smart-link.ly`

### API Backend
- Live at `https://api.smart-link.ly`

## Module Conventions (اصطلاحات الوحدات)

1. **`_`-prefix = internal plumbing, never public API** (`fb_dashboard/_*.py`): `_utils`, `_services`, `_crypto`, `_responses`, `_observability`, `_async`, `_bootstrap`, `_lazy`, `_hash`, `_rate_limit`, `_schema_reconcile`, and `_wallet` (v12). Public engines (`bot_engine/`, `flow_engine`, `subscriber_engine`…) are importable business logic; `_*` modules exist to serve them — import from engines freely, never re-export a `_*` symbol as a public name.
2. **Router naming:** both styles exist (`auth.py`… and `*_routes.py`). New routers follow `*_routes.py` (`admin_routes.py` is the precedent); a domain may decompose into a package — `routers/payments/` is the v13 precedent (see v13 Conventions #1). The envelope contract lives ONLY in `_responses.py` (`ok()`/`fail()`) — see Strict Rules #5.
3. **CSRF (double-submit, since v12):** every mutating request (POST/PUT/PATCH/DELETE) must carry header `X-CSRF-Token` matching the non-HttpOnly `csrf_token` cookie issued on safe GETs — `apiFetch()` in `src/lib/csrf-client.ts` does this automatically; exemptions only via the middleware's documented prefix list (`/api/telegram/`, `/api/webhook/`, `/api/cron/`, `/healthz`, pre-session login/register).

## v17 Conventions (اصطلاحات جولة v17)

1. **JSON+Form endpoints:** mutating endpoints accept BOTH bodies when a live caller sends JSON (templates_routes is the precedent — v17-E-B1; the 422 class of «UI sends JSON, server declares Form» is a contract bug).
2. **Entrance motion:** dashboard pages do NOT hand-roll entry animations — the keyed pathname wrapper in DashboardShell covers all (v17-E-F2); per-page motion is the exception, documented.
3. **Directional icons:** chevrons in pagination/navigators go through DirectionalIcon (variant="chevron") — no raw ChevronLeft/Right imports outside the component (admin/support precedent — v17-E-F8).
4. **Mobile inputs:** raw <input>/<textarea> must carry text-base md:text-sm (16px floor — iOS zoom); design_baseline.py counts violations (1 remaining is a code comment).
5. **Design ratchet:** scripts/design_baseline.py grades structure/fields/color/motion/ai_slop (A-F) — round-close re-seeds with --force; regressions are tracked, not blocked.
6. **Sim battery:** 15 personas (p15 = new-features user); local runs split PART=1/PART=2 (sandbox kills background daemons between calls); uvicorn --timeout-keep-alive 120 prevents the Next-proxy ECONNRESET race.

## v13 Conventions (اصطلاحات جولة v13)

1. **Routers are packages now:** a domain router may decompose into a package — `fb_dashboard/routers/payments/` is the precedent (`wallet.py` · `bank.py` · `approvals.py` · `sse.py` · `plans.py`). Aggregation lives in the package's `__init__.py` via an **untagged** `APIRouter` that includes the sub-routers, preserving the single import surface `fb_dashboard.routers.payments` — importers never see the split. Bodies move verbatim (decomposition = move, not rewrite; the pytest suite guards the money path).
2. **Module-level style injection for lazy client-only components:** when a lazy (`dynamic(ssr: false)`) component needs scoped animations and owns no CSS file, define a module-level CSS string const (precedent: `WIZARD_MOTION_CSS` in `OnboardingWizard.tsx` — `ob-*` classes) and inject it with ONE `<style dangerouslySetInnerHTML={{ __html: CSS }} />` tag at the component root (CSP allows it: `style-src 'unsafe-inline'`). Every keyframe/animation class in that string MUST ship its own `@media (prefers-reduced-motion: reduce)` block in the SAME string; `key={step}`-style remount drives replay — no JS motion engine.
3. **Single-envelope rule (no dual-shape guards):** every `/api` response is exactly `{success, data, error?}` — unwrapped ONLY centrally via `unwrapApi`/`apiJson` in `src/lib/api.ts` (backend mirrors: `ok()`/`fail()` in `_responses.py`). NEVER re-introduce per-call shape guards such as `Array.isArray(d) ? d : (d?.data ?? [])` — v13 pruned the last of them (E5 + the 2 wizard guards by the coordinator; ledger `dec-envelope-prune` closed). `unwrapBody` in `api.ts` is the central unwrap, not a guard — it stays.
4. **Alembic-chain tests are sync `def`:** migration tests (`tests/test_v13_migrations.py`) must be plain synchronous functions — `alembic/env.py` calls `asyncio.run()`, which fails inside a running event loop. Each test uses an isolated database (tmp_path + monkeypatched `settings.DATABASE_URL`/`DATABASE_POOLED_URL` AND `os.environ` — the settings singleton does not re-read the environment). Never touch the shared hermetic DB.

## v14 Conventions (اصطلاحات جولة v14)

1. **Engines are per-tenant, never stateful singletons:** a module-level engine that caches tenant credentials/state across `await` points (the v14 C-ENG1 class) is a bug. Build/fetch a per-tenant engine per request (the broadcast pattern, v4 §3.8, is the repo precedent); module-level proxies must stay stateless dispatchers.
2. **New migrations follow the 012 pattern:** `alembic/versions/013_*.py` — dual dialect (PostgreSQL/SQLite), Inspector guards, idempotent, plus matching `_schema_reconcile.py` entries and sync `def` migration tests (v13 Convention #4 applies).
3. **Simulation battery files are `sim-*`:** user-journey e2e specs live under `e2e/sim-*.spec.ts` + `e2e/sim/helpers/` (personas/session/shots), driven by `scripts/v14_sim_local_battery.sh` (local) and `scripts/v14_postdeploy_battery.sh` (production checks — stateless only).
4. **Gates/CI run on Node 24:** `check_a11y_labels.ts` executes via type stripping (needs Node >=22.6 experimental / >=23.6 default — Node 20 cannot run it). `gate_all.sh` now syncs `fb_dashboard/static/` after `next build` and verifies the buildId freshness (the v12 stale-static incident class).

## v15 Conventions (اصطلاحات جولة v15)

1. **No fire-and-forget after the response** (`spawn()`/bare background tasks that must outlive the request): on Vercel the function freezes — the work never runs. Inline it, or use the **claim pattern**: set a queue status (`draft→pending`), answer immediately, and let a consumer (`process_pending`) claim atomically (`UPDATE ... WHERE status='pending' RETURNING`). Precedents: payments (v14-E1), broadcasts + campaigns (v15-E3), scheduled posts (v15-E4).
2. **Counters are atomic single-UPDATE statements** — never read-then-write (`x = await db.get(); x.value += 1`). Precedent: `credit_wallet`; v15 applied it to `usage_counters` (E1). Concurrent increments must not lose updates.
3. **IntegrityError is a 409, never a raw 500:** duplicate bind/email/customer races get caught at commit and answered with a specific Arabic `detail` (the `uq_*` constraints from migration 014 back this at the DB level). The battery asserts this strictly (`SIM_STRICT_409=1` default).
4. **All external URL fetches pass the SSRF guard** — including DNS resolution (`_resolve_host_ips`) and post-redirect re-checks; private/link-local/loopback ranges (incl. 169.254.169.254) are rejected, with timeouts and size caps. Applies to `ai_service`, `flow_engine` webhook action, receipts, logos.
5. **Plan limits are enforced at the point of use** (`max_replies`/`has_dm`/`has_broadcast`/`has_ai` — one central `get_plan_limits` read); a paid feature with no gate is a bug, not a TODO. Usage counters increment on every reply path (comments webhook included).
6. **Onboarding connects the webhook subscription** (`subscribe_page_webhooks`) — saving credentials without subscribing leaves the bot dead from the first message (v15 C-CORE1).
7. **The battery's verdict is honest:** `checkClaim` throws on red unless the finding is allowlisted in `e2e/sim/fixtures/sim-findings.json` (with reason + TTL); battery exit = playwright exit OR red-claims exit. A green battery with red claims is a bug in the battery, not a pass.
8. **Secrets scan gate on every push** (`scripts/secret_scan.py`): NFKC-normalized patterns (DATABASE_URL with credentials, `ghp_`, `sntryu_`, PRIVATE KEY); uppercase `USER:PASSWORD` placeholders in docs pass intentionally.
9. **weasyprint is a real dependency** (requirements.txt) — the PDF-off-event-loop guard (v14-E2) must actually run in CI.
10. **Cron endpoints accept GET + Bearer header ONLY** (`?token=` query auth was REMOVED in v16 — it leaked the secret into access/proxy logs; it 403s now; the POST form-token path stays because a body is never logged) — Vercel native crons issue GET only; POST-only cron routes are dead routes (v15 D9-H1).

## v16 Conventions (اصطلاحات جولة v16)

1. **Every outbound fetch of a user-influenced URL passes the DNS-resolving guard** — `assert_safe_outbound_url` (async, `_resolve_host_ips` + blocked ranges + redirect re-check) is the ONLY acceptable guard; the old sync literal-IP `_assert_safe_image_url` is a v15-era relic that DNS-rebinding walks straight through. All five call sites now use the async guard: AI images, flow webhooks, receipts (approvals.py), FB post images (fb_client), PDF logos (pre-fetched + `data:` URI embedded; WeasyPrint runs with `url_fetcher` accepting data: URIs ONLY — it follows redirects and would bypass any pre-check otherwise). Size caps mandatory (5MB image fetches).
2. **Calendar-day assertions in tests anchor to day boundaries, never `hours_ago`** — `tests/_dayseed.py::seed_day` (day 0 = midpoint of elapsed today; negative = noon of that day). `hours_ago`-seeded calendar assertions fail 00:00–02:00 UTC (the v16 F1 class, proven live). Tests that must survive wall-clock drift use `at=` params (see `_seed_reply`).
3. **The battery's honesty is itself gated:** the flip-detector greps the ACTUAL `status:"findingClosed"` lines from `sim-findings-live.json` (v15 read a field that never existed there — the counter was structurally zero), and `SIM_ROUND` comes from `scripts/round.env` (never hardcoded) so allowlist TTLs bite. Pruning flipped-green entries at round close is the coordinator's duty — a stale allowlist entry masks real regressions.
4. **Paid features need a production trigger, not just code:** every queue-type feature must be consumed by something that actually runs on Vercel (heartbeat/cycle claim-pattern drains: broadcasts, campaigns, scheduled posts, AND sequence steps since v16-E2). A feature gated behind local-only schedulers is dead product (the v16 sequence-drip finding: sold on Pro/Enterprise, never fired once in production).
5. **Status contracts are closed sets:** writers and readers of any status column/SSE terminal must agree — write-only states (`User.subscription_status`, tenant `"active"`, SSE `"rejected"/"EXPIRED_TRIAL"` on payments) are deleted or wired (v16-E2). New status values require a grep of both directions before merge.
6. **The bundle budget is a hard gate** (`gate_all.sh` 4.6, measure_bundle.py after build): common base ≤190KB gz. Route-extra is informational. AppToaster/toaster code mounts ONLY in layouts whose pages fire toasts (dashboard/admin/auth+subscribe trees); `csrf-client` imports `premium-toast` DYNAMICALLY inside the 401 handler — a static import drags sonner (43KB) into every apiFetch page including public ones.
7. **slop_scan.py is diagnostic-only (exit 0)** — it counts dual-shape guards (v13 Convention #3 violations), silent swallows, and post-unwrap `?? []` drift; the trend goes into round-metrics.jsonl. Never make it blocking; never game it — fix the pattern instead.
8. **One-way-door commands are mechanically guarded** (`.githooks/pre-push` via `core.hooksPath`): force-push to main without `--force-with-lease`, deleting main, `git filter-repo`, `alembic downgrade`, DROP/TRUNCATE on non-test tables, rm -rf outside the repo — all denied with an explanation (gstack careful-mode adapted; protects the dec-git-history-secrets execution window).
9. **SQLite tests enforce FKs** (`PRAGMA foreign_keys=ON` in the test engine since v16-E5): `ondelete` behaviors (SET NULL/CASCADE) are now exercised in the suite — previously PG-only and untested. New FKs must carry `ondelete` and a test.
10. **Support tickets reach the owner:** the platform-admin queue route (`GET /api/admin/support/tickets`) + `/admin/support` page are the owner's in-app channel; Telegram notify is inline-and-guarded (never spawn'd), after commit, best-effort.

## Strict Rules (do not violate)

### DO NOT
1. **Add routes to runner.py** — all new routes go in `routers/`. `runner.py` ONLY includes routers, middleware, lifespan, SPA catch-all, WebSocket, webhook handlers.
2. **Create duplicate entry points** — `api/bot.py` and `api/public.py` are deleted. Only `api/index.py` exists.
3. **Add dead code** — no Vite/SPA remnants, no unconnected API files.
4. **Commit build artifacts** — `.next/`, `tsconfig.tsbuildinfo` in .gitignore and NOT tracked.
5. **Return raw dicts from any router** (docs/plans/latest_plan.md Track A): every endpoint MUST return `{"success": bool, "data": ..., "error"?: str}` via `fb_dashboard/_responses.py` (`ok()` / `fail()`). HTTP transport failures use `HTTPException`. Gate (v14): every file under `fb_dashboard/routers/` — multi-level, incl. the `payments/` package — carries EITHER an inline `"success"` envelope OR a `_responses import`; exemptions only the documented byte-stream/SSE cases (see `routers/__init__.py` docstring; enforced in `gate_all.sh` 5a + CI).
6. **Parse API responses ad hoc in the frontend** (Track A.4): all `/api` fetches go through `src/lib/api.ts` — `unwrapApi(res)` / `apiJson()`. Never `.then(r => r.json())` then read fields directly; the envelope is unwrapped centrally and `success:false` throws `ApiError`.
7. **Hardcode colors/shadows in components** (Track D): every color lives in `globals.css` tokens (incl. `--confetti-*`, `--iphone-*`); icons come from `lucide-react` exclusively; every `<Input>` carries `dir="auto"`. See `docs/design-system.md` (incl. the documented `bg-white` exceptions table and the AI-cliché refuse list).
8. **Ship a mobile-invisible dashboard** (Track F): `MobileBottomNav` must stay wired in `DashboardShell` (`md:hidden`) — nav data is the single exported `defaultNavSections` in `AdminSidebar`. Any new sidebar section MUST be added there (one source, both renders).
9. **Draw charts with manual divs** (Track E): use `src/components/charts/` (recharts wrappers) — no `<div style={{height}}>` bar charts.
10. **Import `facebook_engine` from live app code** (Track G): the MCP engine is ISOLATED until staging parity + owner approval replace `fb_client.py`. A test enforces zero live imports. The `mcp` package is standalone-only (never imported at app runtime).
11. **Use `json:` in Playwright APIRequestContext calls** — this Playwright version silently drops the option (POST arrives with no body). Use `data: {...}` (objects serialize as JSON automatically).

### DO
1. Add new routers in `fb_dashboard/routers/` using `APIRouter(prefix="", tags=["name"])` + `ok()/fail()` envelope.
2. Import shared state from `_services` (fb, engines, helpers) — never re-create.
3. Register new routers in `runner.py` with `app.include_router(...)`.
4. Keep .gitignore up to date — exclude build artifacts, env files, test outputs.
5. Add per-page backend proof to `tests/test_track_e_pages_gate.py` (PAGE_API_MAP) when a page gets a new API dependency. Test files live in `tests/` (root conftest.py owns sys.path + hermetic env) — NEVER in `fb_dashboard/` (v5 §1).
6. Run the E2E gates before shipping UI changes: `e2e/journey.spec.ts` (full customer journey) + `e2e/mobile-nav.spec.ts` (375px) — server + `scripts/sync_next_static.py` first.
7. Run `bash scripts/gate_all.sh` (ruff + pytest + tsc + build) before every push — CI runs the same gates on push/PR (`.github/workflows/ci.yml`). Ruff config: `ruff.toml`. The pytest suite MUST stay green in reverse order too (hermeticity is a gate, v5 §0).

## Deployment
- Vercel (two projects linked to same repo):
  - **smart-bot-api** — serves `api/index.py` at `api.smart-link.ly`
  - **smart-bot-frontend** — serves Next.js at `bot.smart-link.ly`, proxies `/api/*` to API project
- `vercel.json` defines `api/index.py` as sole function entry.
- `.vercel/project.json` has project ID for `smart-bot-api`.
- Local single-server mode: `python -m uvicorn runner:app --app-dir fb_dashboard --port 8000` serves API + the built frontend from `fb_dashboard/static/` (sync with `scripts/sync_next_static.py` after `npm run build`).

## Governing plan
`docs/plans/latest_plan.md` (2026-09-03) is the historical master plan (superseded by v3/v4/v5 plans in `docs/plans/`). Delivery evidence: `docs/reports/master-plan-2026-09-03-delivery-report.md`. Historical plans live in `docs/plans/` + `docs/history/` (superseded).
