# v24-B2 — Security Deep Audit (Backend + Frontend Middleware)

- **Task ID:** v24-B2 · **Agent:** Diagnostic Agent SECURITY
- **Date:** 2026-09-10 (repo state: post-v23, SmartBot @ `docs/reports/v22-*`, VERSION v23-era)
- **Scope:** READ-ONLY static audit — `fb_dashboard/` backend (routers, auth, crypto, middleware, webhooks, payments), `fb_dashboard/frontend/` (middleware.ts, lib/csrf-client, AuthGuard), deployment configs (vercel.json ×2), secrets hygiene (working tree + git history), plus cross-checks of engine-level money/token paths (`_wallet.py`, `_crypto.py`, `_hash.py`, `_bootstrap.py`).
- **Method:** full read of auth/crypto/middleware/webhooks/payments; systematic auth-dependency scan of **all 39 router modules + 5 payments sub-modules** (~10.5k LOC of routers) with an automated decorator/signature pass to detect endpoints lacking auth deps; targeted greps for SQLi/XSS/path-traversal/mass-assignment/secret patterns; the repo's own `scripts/secret_scan.py` (NFKC-normalizing scanner) run on working tree **and git history**.
- **Verdict up front:** the application layer is **genuinely hardened** (8+ prior security rounds visible in code archaeology: v8→v22). **No exploitable Critical exists in the code itself.** The one **Critical is operational**: production secrets committed in git history of a **public** repo, with the documented owner rotation (dec-owner-rotations) **still open** per `docs/decisions-ledger.md:74`.

**Severity counts: 1 Critical · 1 High · 4 Medium · 9 Low.**

---

## 1. Executive Summary

SmartBot's backend shows unusually mature security engineering for its size: JWT HS256 pinned on both encode and decode, token-version revocation (`token_ver`) on every password write path, per-tenant user lookup scoped by the JWT's `tid`, argon2id password hashing (t=3, m=64MB, p=4) with bcrypt legacy fallback, Fernet encryption for FB tokens with fail-fast key requirements, constant-time compares on every webhook secret (FB X-Hub-Signature-256, Telegram secret-token, Shopify HMAC, CRON_SECRET Bearer), CSRF Origin exact-host allowlist + double-submit token, exact-origin CORS with credentials, full security-header suite (CSP, HSTS, XFO DENY), atomic SQL claims on all money mutations (wallet credit, payment approvals — no replay/double-activation), platform-admin vs tenant-admin role split with delegated flag, and tenant scoping verified on essentially every id-taking endpoint across all 44 router modules scanned.

The residual risk is concentrated in (a) **one operational Critical** — leaked Neon DB credentials + old `SECRET_KEY` sitting in the public git history with the mandated three-way rotation still unexecuted; (b) **one deployment-mode High** — receipt images written under the unauthenticated `/static` mount on single-server (non-Vercel) deployments; (c) configuration-sensitive controls (`DEBUG=true` silently downgrades cookie security + origin allowlist), per-IP-only login throttling, a 24h token lifetime, and bounded `str(e)` slices in a handful of responses.

---

## 2. CRITICAL — exploitable now (conditional on unverified rotation)

### C-1. Production Neon password + old SECRET_KEY are in PUBLIC git history; the mandated rotation is still open

- **Evidence (verified live in this audit):**
  - `git rev-list --all --objects` → blob `2e6a618a00c6d214fd468e789eabb88c774ecc54` = `fb_dashboard/.env` **still present** in object store, reachable from `origin/main` (removed from tracking only at `c1eb1d78` "cleanup: remove garbage, slim from 822MB to 46MB"; introduced at `d7e5d8db`, 2026-07-06).
  - `python3 scripts/secret_scan.py --history` → 2 findings: `fb_dashboard/.env` (D6-H1 class) + `scripts/round.env` (benign: `ROUND=v17`).
  - `docs/decisions-ledger.md:66-74` (dec-owner-rotations): status **"عاجل — إجراء مالك"**, re-escalated 2026-09-07 (v13-D10): "التدوير لم يُنفّذ بعد" — the blob contains **Neon DATABASE_URL password + the old SECRET_KEY**; no closure line exists (unlike sibling items that carry "أُغلق في جولة v13").
- **Exploit scenario (repo is public per ledger):**
  1. `git clone <repo> && git cat-file -p 2e6a618a` → Neon DSN with password → direct DB connectivity (ingest/exfiltrate all tenant data) if Neon credentials were never rotated.
  2. If the live Vercel `SECRET_KEY` still equals the blob value → forge `{"sub":"admin","tid":0,"ver":0,"jti":…,"exp":…}` HS256 tokens (mirror of `routers/auth.py:30-47` `make_token`) → **full platform-admin takeover** (every `require_platform_admin` surface opens: payment approvals, admin config with bank details, tenant deletion).
  3. Compounding crypto detail: `_crypto.py:10-19` derives the legacy Fernet key as `sha256(SECRET_KEY)` — a leaked SECRET_KEY also decrypts **pre-rotation FB page tokens** stored under the legacy path (the dual-read fallback at `_crypto.py:34-38` keeps those ciphertexts live).
- **Caveat:** a static audit cannot read the live Vercel env. If the owner already rotated silently (no ledger closure), impact collapses to "history hygiene". Treat as Critical until verified.
- **Exact fix (owner runbook, mirrors the documented one-way-door protocol):**
  1. Rotate **Neon credentials** (user password / re-provision DSN) and update `DATABASE_URL`/`DATABASE_POOLED_URL`.
  2. Rotate **SECRET_KEY** (all JWT sessions drop — expected, one-time) and **FERNET_KEY** (requires FB page re-binding or a re-encrypt sweep; the dual-read fallback keeps old tokens readable only under the OLD key — with the old key leaked, force re-bind).
  3. Purge history: `git filter-repo --path fb_dashboard/.env --invert-paths` → force-push → re-clone everywhere; verify with `scripts/secret_scan.py --history` → 0 findings (except benign `round.env`).
  4. Add the history check to CI (`scripts/secret_scan.py --staged` already exists; wire `--history` for fresh clones).
  5. Post-rotation verification: assert live `SECRET_KEY != blob value` (compare prefixes only, never print values).

---

## 3. HIGH

### H-1. Receipt uploads (and agent images) are world-readable through the unauthenticated `/static` mount on single-server deployments

- **Where:**
  - Mount: `fb_dashboard/runner.py:292` — `app.mount("/static", StaticFiles(directory=STATIC_DIR))` (no auth; middlewares only guard `/api/*`).
  - Writes: `fb_dashboard/routers/payments/bank.py:23` (`_UPLOAD_DIR = … static/uploads/receipts`) and `:76-81` (writes `{secrets.token_hex(12)}.jpg`); `fb_dashboard/routers/ai.py:152-165` (agent images → `STATIC_DIR/uploads/agent_*.jpg`).
- **Exploit scenario:** on Vercel the FS is read-only so uploads become `data:` URIs (no file lands — safe). But the repo explicitly supports **single-server / self-hosted mode** (`docs/deployment.md`, uvicorn entry): there, `GET /static/uploads/receipts/<name>` serves payment receipts (PII — bank transfer evidence) **without authentication** to anyone who obtains the URL. The URL is stored in `subscription_payments.extra_data.receipt_url`, returned in upload responses, and appears in uploader browser history / any log that captures the 200 body. The authenticated route `GET /api/payments/receipt/{id}` (approvals.py:207, correctly owner/tenant/platform-gated) was built precisely to replace this — but the raw file path remains live, so the "exclusively via this authenticated route" claim in its docstring only holds on Vercel.
- **Mitigations already present:** 96-bit random filename (unguessable); Pillow re-encode (content XSS impossible, and the 2026-09-05 fixed-extension fix closed the stored-HTML variant).
- **Exact fix:** move the upload root **outside** `STATIC_DIR` (e.g. `BASE_DIR/data/uploads/receipts`) and serve bytes only through the existing authenticated route (swap `_UPLOAD_DIR` import in approvals.py:250, update the `/static/uploads/receipts/` legacy prefix check to also accept the new location or migrate rows); alternatively reject `/static/uploads/` in a tiny guard wrapping the mount. Apply the same to `routers/ai.py` agent uploads.

---

## 4. MEDIUM

### M-1. `DEBUG=true` silently disables cookie `secure`, adds localhost to the CSRF origin allowlist, and bypasses all production fail-fast guards
- **Where:** `routers/auth.py:178,314` (`secure = not DEBUG` on the session cookie); `app/middleware.py:123-124` (DEBUG → `localhost/127.0.0.1` allowed origins); `config.py:91` (`_IS_PROD = not DEBUG and …` — DEBUG flips every guard at config.py:93-116 to no-op).
- **Exploit scenario:** a single mis-typed env var in production → session cookies without `Secure` (transmissible over HTTP downgrade/MITM), CSRF Origin trust extended to `http://localhost:*` (usable by a malicious local app / SSRF-adjacent page during dev-in-prod confusion), and no boot-time secret validation. Nothing warns when `VERCEL_ENV=production && DEBUG=true`.
- **Fix:** add a loud boot alarm (or refusal) for `DEBUG && VERCEL_ENV=production`; derive cookie `secure` from the request scheme / `X-Forwarded-Proto` instead of DEBUG; keep localhost origins strictly behind a separate `DEV` flag that cannot combine with `VERCEL_ENV=production`.

### M-2. Login throttle is per-IP only (10/min) — no per-account lockout
- **Where:** `routers/auth.py:135-138` (`check_rate_limit(db, f"login:{ip}", 10, 60)`).
- **Exploit scenario:** distributed password spray / botnet — each IP gets 10 guesses/min against the **same account**; per-account attempts are unbounded. Argon2id (t=3/m=64MB) bounds each guess to ~100ms CPU, so throughput is low but the platform also pays the KDF cost for every guess (parallel DoS-ish cost). Registration (5/300s) and change-password (per-user, 5/3600 — auth.py:474) already do it right.
- **Fix:** add a second counter `login:user:{username}` (e.g. 20 failures / 15 min → 429 with uniform Arabic message, matching the existing style); keep the IP limiter as-is.

### M-3. 24-hour access token with no rotation/refresh mechanism
- **Where:** `routers/auth.py:27` (`ACCESS_TOKEN_EXPIRE = timedelta(hours=24)`); cookie max_age mirrors it (auth.py:187-188).
- **Exploit scenario:** a stolen cookie (XSS-adjacent steal, log leakage, shared machine) is valid up to 24h with no idle timeout and no server-side session record; revocation requires the victim to logout (blacklist) or change password (`token_ver`). Detection of anomalous reuse is impossible (stateless JWT, jti never tracked beyond blacklist).
- **Fix (pick one):** shorten to 2-8h; or mint short access + rotating refresh with reuse-detection; or persist issued `jti` rows and support "revoke all sessions" (the token_ver bump already provides the mechanism — a per-tenant "force re-login" button is cheap).

### M-4. Bounded `str(e)` slices reach client responses at six sites
- **Where:**
  - `routers/dashboard_stats.py:153→251` — `connection_error = str(e)[:120]` returned as `"error"` in the dashboard bundle (any authenticated viewer; Graph/FB client exception text can embed hostnames, page ids, partial URLs).
  - `routers/webhooks.py:96` — `subscribe_error = str(e)[:160]` (any authenticated user via `/api/webhook/check`).
  - `routers/onboarding.py:202` — `webhook_result = {"_error": True, "body": str(e)[:200]}` rides the ok() response.
  - `routers/bot.py:528, 675` — `fail(f"…: {str(e)[:120]}")` (cron + bot-trigger; **platform-admin only**, so low exposure).
  - `routers/telegram_config.py:221, 310` — `dryRunResult: f"err: {e}"`, `last_err = str(e)[:160]` (platform-admin only).
- **Assessment:** slices are short and mostly provider strings (the codebase elsewhere fixed exactly this class — ai.py:179-181, plans_config healthz v12-E2.5). Not a direct secret leak path, but provider exception bodies are not a stable contract and have historically contained tokens/URLs.
- **Fix:** replace each with the site-local generic Arabic message + log the detail server-side (copy the ai.py pattern). Keep `dashboard_stats`'s honest-fallback string, which is a static literal.

---

## 5. LOW

| # | Finding | Where | Note / Fix |
|---|---------|-------|-----------|
| L-1 | Username/email enumeration on register (distinct 400/409 per field) | `routers/auth.py:273-274, 311-312` | Rate-limited 5/300s; login error is uniform (good). Acceptable; if tightened, return one generic "بيانات غير صالحة" for both. |
| L-2 | No email ownership verification — email is a login identifier + support identity | `routers/auth.py:254-320` | Anyone can claim an unused email. No email-sent flows exist (also means no reset-token attack surface). Add verification before email-based flows ever appear. |
| L-3 | WS legacy `?token=` query param | `app/ws.py:42` | Documented legacy fallback (header-first is implemented). Tokens in URLs can land in proxy/access logs. Retire the query path when frontend is confirmed header-only. |
| L-4 | Unbounded `limit` on top-keywords widget | `routers/widgets_routes.py:102` | `limit: int = Query(10)` without `ge/le` (all sibling widgets are bounded). Tenant-scoped aggregate of own data; heavy-query nuisance only. Add `ge=1, le=50`. |
| L-5 | Bootstrap admin random password logged once in plaintext | `fb_dashboard/_bootstrap.py:48-54` | Standard first-boot pattern; prod never gets the "admin" literal (DEBUG-gated). Ensure log access is restricted; prefer printing once to stderr at deploy time. |
| L-6 | CSRF double-submit only enforced when the browser already holds the csrf cookie; `Authorization`-bearing requests skip the token check | `app/middleware.py:187-192` | Additive rollout by design; **Origin exact-host allowlist still applies to every mutating /api call**, and SameSite=Lax blocks cross-site POST cookies — actual CSRF risk low. Consider making the check mandatory after a cookie-issuance grace period. |
| L-7 | `X-XSS-Protection: 1; mode=block` set | `app/middleware.py:329` | Deprecated header (modern browsers ignore it). Harmless; remove for hygiene. |
| L-8 | No explicit request-body size cap outside Vercel's 4.5MB platform limit | all JSON/`Body(None)` endpoints | Receipts have 5MB + 2M-char caps (bank.py:24, plans.py:69); everything else relies on the platform. Single-server mode is unbounded → add a body-size middleware (e.g. reject >1MB JSON on non-upload paths). |
| L-9 | `/api/ai/suggest` + `/api/ai/analyze` open to any role (viewer) with no rate limit | `routers/ai.py:22-51` | AI provider cost abuse by low-privilege tenant users (quota/billing, not data exposure — generate-reply correctly requires editor). Add `_payment_rate_limit`-style limiter or require editor. |

**Reviewed and cleared (no finding):** mass-assignment on user update (`routers/users.py` whitelists role to `{admin,editor,viewer}` + platform-admin gate for admin grants; `platform_update_user` accepts only the boolean `is_platform_admin` — `admin_routes.py:487-491`); role changes take effect immediately (authorization re-reads `user.role` from DB per request — no stale-role token issue); SQL injection (zero raw f-string SQL over user input; the `_schema_reconcile.py` f-SQL composes only internal table/column identifiers; all `ilike(f"%{search}%")` uses bound parameters); XSS in frontend (only `dangerouslySetInnerHTML` on constant JSON-LD + constant CSS string; no `eval`/`new Function`; no token in localStorage — session is httpOnly cookie); path traversal (SPA catch-all refuses `..`/absolute/dot paths — app/spa.py:83-84; receipt path uses `os.path.basename` + SSRF double-guard — approvals.py:249-269); payment replay (all resolutions are `UPDATE … WHERE status='pending' RETURNING` atomic claims; wallet credit is a single atomic SQL CAST update — `_wallet.py:89-115`); payment amount tampering (wallet amounts must **equal** plan price server-side; bank amounts are client-supplied but floor-capped at 50% of plan price and land in a **platform-admin manual review queue** — a deliberate human workflow, not an automated activation); open redirect (login `safeRedirect` is same-origin-only — login/page.tsx:37-55; middleware redirect target is the request's own pathname).

---

## 6. Secrets hygiene — results

**Working tree: CLEAN.**
- `scripts/secret_scan.py` (NFKC + zero-width + entity-decode normalizing, ReDoS-safe, fail-closed caps): **0 findings**.
- Independent greps for `sk-`, `EAAG…`, `ghp_/gho_/github_pat_`, `npg_`, `vcp_`, `sntry_/sntryu_`, `AIza…`, `xox[baprs]-`, `password = "…"`, `SECRET_KEY = "…"` literals, DB URLs with embedded credentials → **only intentional fixtures**: `tests/conftest.py:26` (`V10_TEST_PASSWORD = "pass123456"`), `tests/test_v17_telegram_users.py:36` (same pattern), `fb_dashboard/_bootstrap.py:46` (`password = "admin"`, DEBUG-gated, prod generates random). None are production credentials.
- `.gitignore` covers `.env*` (plus `*.db`, `.vercel`, `node_modules`); tracked env-like files: `.env.example` (all values EMPTY — clean template with correct generation commands in comments) and `scripts/round.env` (`ROUND=v17` — inert).
- `alembic.ini` ships `sqlalchemy.url = placeholder`; `alembic/env.py` reads the URL from settings (env).
- Fail-fast guards in `config.py:93-100`: production refuses empty `SECRET_KEY`, `CRON_SECRET`, `FERNET_KEY` (with "separate key from SECRET_KEY" note), and `config.py:111-116` refuses the `TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED=true` dev hatch in prod.

**Git history: 1 CRITICAL-class residue → C-1.** `fb_dashboard/.env` blob `2e6a618a` (Neon password + old SECRET_KEY) reachable from public `origin/main`; ledger item dec-owner-rotations open; `scripts/secret_scan.py --history` flags it today. The documented D6-H1 incident (leaked ~100 commits) was purged from tracking but the object was never history-rewritten and the keys never rotated (per ledger). `scripts/round.env` also flags in history-mode — benign by content.

---

## 7. Verified-strong controls (positive ledger)

These were explicitly targeted by the checklist and found **correct** — recorded so future rounds don't re-litigate:

1. **JWT**: HS256 pinned in both directions (`auth.py:46,55`; logout:220; WS:59; piggyback:127) — no `alg=none`/algorithm-confusion surface (PyJWT symmetric + explicit algorithms list). Claims: `sub/tid/jti/ver/iat/nbf/exp`; `jti` blacklisted on logout (v22 FIX-A made the insert fail-loud with naive-UTC contract); `ver` checked per request (password change/reset/user-update bump it — auth.py:85, 442, 489; users.py:104; WS parity at ws.py:95). No refresh/access type confusion (single token type).
2. **Password hashing**: argon2id (time=3, memory=64MiB, parallelism=4) primary, bcrypt fallback for legacy hashes, exceptions swallowed to `False` (never 500/oracle) — `_hash.py`. 8-char minimum enforced on all four password-setting paths.
3. **Tenant lookup**: `get_current_user` scopes the username lookup by the JWT's `tid` (per-tenant username uniqueness), deterministic `.order_by(id).limit(1)` fallback for legacy tokens, tenant-active check (auth.py:87-91). WS mirrors it (ws.py:74-102).
4. **Authorization**: role hierarchy admin>editor>viewer via `require_role`; platform-vs-tenant split via `is_platform_admin` (tenant 0/None or delegated flag) enforced with `require_platform_admin` on every global surface (admin config, tenant delete guard, platform users, diagnostics, logs stream/SSE, bot engine controls, cron status, telegram config, shopify catalog/orders, support platform queue, scheduler check).
5. **Webhooks**: FB — X-Hub-Signature-256 HMAC-SHA256 with `hmac.compare_digest`, **fails closed** when no app secret (401, app/webhooks.py:79-87); verify-token likewise constant-time + fails closed. Telegram — `x-telegram-bot-api-secret-token` constant-time + admin-id check + dev hatch refused in prod. Shopify — base64 HMAC constant-time. Cron — Bearer + `secrets.compare_digest`, empty secret never validates (bot.py:38-53; plans_config.py:337-341).
6. **CSRF/CORS**: exact-host Origin/Referer allowlist (v15-E5 env-tunable, safe default), double-submit `csrf_token` (Strict SameSite, JS-readable by design, echoed by `lib/csrf-client.ts`), CORS exact origins + credentials (runner.py:210-224). Frontend session cookie: **httpOnly + SameSite=Lax + Secure(prod)**.
7. **Rate limiting**: DB-backed cross-instance limiter with commit-before-count; login 10/60s IP, register 5/300s IP, change-password 5/3600 **per user**, payments 5-10/60s, tickets 10/3600 per user, global mutate 30/60s with graceful degradation (documented trade-off).
8. **Money paths**: wallet credit atomic SQL; approvals platform-admin only (C-SEC1 fix) with atomic pending-claims; receipt serving authenticated + basename + SSRF guard (literal-IP + DNS-resolving, no redirects, size/time caps); uploads Pillow-re-encoded with fixed extension.
9. **Headers**: full suite on every response incl. early 403/429 (outermost registration order documented); CSP narrowed (no unsafe-eval, no FB script hosts, connect-src allowlist).
10. **Error surfaces**: global 500 handler generic Arabic; healthz root-cause server-side only; 422 Arabic contract for client typos (v15-E3 family); `_mask_secret` last-4 masking on admin config GET.

---

## 8. Coverage matrix — endpoint groups × auth checks

Legend: **Auth** = session dependency · **Role** = min role (PA = platform-admin) · **Scope** = tenant filter on every row/id · **Notes**.

| Endpoint group (module) | Auth | Role | Tenant scope | Notes |
|---|---|---|---|---|
| login/register/logout (auth.py) | none/by-design | — | — | login+register rate-limited; logout blacklists jti (fail-loud); enumeration L-1 |
| me / auth/change-password / onboarding complete|skip | ✓ | user | own-tenant writes only | change-password verifies current pw + token_ver bump + per-user limit |
| users CRUD (users.py, auth.py /api/users) | ✓ | admin | ✓ every query | admin-role grant platform-gated (v17-E-B2); team seat limit; delete self-blocked |
| admin reset-password | ✓ | admin | ✓ tenant-scoped unless PA | token_ver bump; audit committed (v22 FIX-A) |
| platform users / delegated admins (admin_routes) | ✓ | PA | global by design | only `is_platform_admin` boolean accepted (no mass assignment) |
| admin config GET/POST | ✓ | PA | global | allowlist keys; masked secrets; masked-echo drop; secret flags set |
| admin tenants delete | ✓ | admin+guard | cross-tenant blocked (403) | 39-table GDPR sweep incl. subquery ticket replies |
| rules/replies/templates/flows/sequences/broadcasts/scheduled-posts/calendar/marketing/offers/tags/subscribers | ✓ | viewer→read, editor→write, admin→admin ops | ✓ (verified per-id `where(Model.tenant_id == current_user._tenant_id)` + 404-not-403 pattern) | plan-feature gates (sequences/broadcasts) |
| comments hide/delete/reply (replies.py) | ✓ | editor | acts via **tenant's own** FB client | cross-tenant comment ids fail at Graph; DB rows tenant-scoped |
| inbox + tags (inbox.py) | ✓ | viewer→read, editor→write | ✓ (fb_conversation_id lookups always tenant-prefixed) | mark-read/bulk-read tenant-scoped |
| facebook settings/posts/conversations (facebook_routes.py) | ✓ | admin for connect, editor for publish | ✓ | tokens never returned (booleans only); double-bind 409 |
| publisher routes | ✓ | admin configure / editor publish | ✓ per-request engine load | credentials saved tenant-scoped |
| payments topup/confirm/balance/history (wallet.py) | ✓ | any | ✓ (confirm 404s cross-tenant) | rate-limited; wallet-cap server-side from DB row |
| subscriptions create/status/pending/cancel/upgrade + SSE (plans.py, sse.py) | ✓ | any | ✓ owner-or-tenant (uniform 404) | amount==plan.price for wallets; bank ≥50% floor → manual review; SSE tenant cap 5 |
| upload receipt (bank.py) | ✓ | any | n/a (data: URI on Vercel) | **H-1** on single-server: public /static path |
| receipt download (approvals.py) | ✓ | any | ✓ owner/same-tenant/PA | basename + SSRF guards; uniform 404 |
| admin subscriptions list/resolve | ✓ | admin list (PA sees all) / **PA resolve** | ✓ | atomic claim; rejection marks tenant REJECTED; in-app notify |
| telegram config (telegram_config.py) | ✓ | PA | global | approvers/broadcast targets PA-only |
| support tickets + /info (support.py) | ✓ (tickets) / public /info (allowlisted keys only) | user/admin close | ✓ | rate 10/h; closed tickets immutable |
| notifications + prefs (notifications.py, alerts_routes.py) | ✓ | user | ✓ (per-user prefs; tenant broadcast) | broadcast via WS tenant-scoped |
| analytics/dashboard/widgets/health-alerts | ✓ | viewer / admin (system stats) | ✓ | days/limit bounded (except L-4) |
| AI/agent (ai.py) | ✓ | viewer (suggest/analyze) / editor (generate/interpret) | ✓ (agent gets role + tenant) | L-9 cost note |
| diagnostics (diagnostics.py) + logs stream/SSE/stats (logs_api.py) | ✓ | **PA** | global by design | buffer is global (documented) |
| bot controls (bot.py non-cron) | ✓ | read any / editor cycle / PA restart-stop-interval-trigger | ✓ | clear_logs admin |
| cron bot-cycle/heartbeat/cleanup-logs | Bearer CRON_SECRET only | PA-equivalent (secret) | global sweeps | constant-time; empty secret fails closed; ?token removed |
| FB webhook GET/POST (/webhook) | verify-token / HMAC sig | — | tenant resolved **from page id** | fails closed without app secret |
| Telegram webhook (/api/telegram/webhook) | secret-token header | + admin-id check | — | dev hatch prod-refused |
| Shopify webhook (/api/commerce/shopify/webhook/{topic}) | HMAC | — | flow context only | 503 when unconfigured |
| commerce status/configure/products/orders | ✓ / PA for configure+catalog | | global store | access_token encrypted at rest |
| public: /api/plans, /api/config, /api/public/stats, /api/public/testimonials, /api/support/info, /healthz, /api/version | none | — | — | strict key allowlists (v8-A1/v10-A3); aggregates only; no str(e) (v12-E2.5) |
| SPA catch-all + static mounts | none | — | — | traversal-refused; **H-1** for /static/uploads on single-server |
| WS /ws + SSE /api/events | JWT (header→query→cookie) | any | tenant from DB user | blacklist + token_ver parity; SSE tenant-scoped subscribe |
| Frontend middleware.ts | cookie presence gate (/admin,/dashboard) | UX only | — | real auth = server /api/me + API guards; full header set incl. 307 branch |

---

## 9. Priority next actions

1. **[CRITICAL, owner, before anything else]** Execute dec-owner-rotations (Neon + SECRET_KEY + FERNET_KEY), verify live values differ from blob `2e6a618a`, purge history with filter-repo, wire `secret_scan.py --history` into CI. (C-1)
2. **[HIGH, code]** Move upload roots out of the public static mount; serve receipts/agent images only through authenticated routes. (H-1)
3. **[MEDIUM, code]** Boot-time alarm for `DEBUG && VERCEL_ENV=production`; make `secure` cookie scheme-derived. (M-1)
4. **[MEDIUM, code]** Per-username login throttle alongside the per-IP one. (M-2)
5. **[MEDIUM, config]** Decide token lifetime policy (≤8h or refresh rotation). (M-3)
6. **[MEDIUM, code]** Replace the six `str(e)[:n]` client surfaces with generic Arabic + server-side detail. (M-4)
7. **[LOW batch]** L-4 `ge/le` on top-keywords limit; L-9 rate-limit/role-raise AI suggest; L-3 retire WS query token; L-7 drop X-XSS-Protection; L-8 body-size cap for single-server mode.

---

*Static audit only — no runtime exploitation, no source modifications, no secret values printed (blob contents confirmed by existence and ledger, not by exfiltration). Report agent: Diagnostic Agent SECURITY (v24-B2).*
