# v16-D2 — Backend Security Audit (2026-09-09)

## LEAD A — p13-ssrf-receipt-dns: GAP CONFIRMED (HIGH)
approvals.py:244-254 receipt branch guards https:// URLs with sync literal-IP-only `_assert_safe_image_url` (ai_service.py:163-180); skips DNS resolution layer of `assert_safe_outbound_url` (ai_service.py:123-160, `_resolve_host_ips` :110-120, `_ip_is_blocked` :92-107). Attacker: any authed user stores https receipt URL (plans.py:63/137/211 accepts receiptImageUrl with https prefix check only); fetch fires when admin opens receipt (approvals.py:251). Fetch-side mitigations already good: no redirects (approvals.py:177), 10MB cap (:165,181), 8s budget (:164,187).
FIX (3 lines): swap to `await assert_safe_outbound_url(receipt, label="رابط الإيصال")` → 400 «رابط الإيصال مرفوض». Perf: one getaddrinfo off-loaded to executor (ai_service.py:118), admin-triggered low-frequency → acceptable. Residual: DNS-rebinding TOCTOU (accepted, same as v15-E4 paths).

## LEAD B — p13-cron-query-token: REMOVE (MEDIUM)
_cron_authorized (bot.py:38-57): Bearer first (constant-time :50), ?token= fallback with warning (:51-56). Same triple-gate in plans_config.py:251-262 (cleanup-logs). Callers: Vercel native crons (vercel.json:93-102) = LIVE via Bearer; cron-job.org channel = DEAD (dec-cron-restore mathematical evidence: ~288 err/day expected, 2 observed); tests assert deprecated path works (test_v15_concurrency.py:1160-1200, test_v6_observability.py:355). Removing ?token= breaks zero live callers; staleness detector (bot.py:298-307) alerts within a beat. Keep POST form token (body never logged). Fix deployment.md:118,138 stale wording.

## LEAD C — outbound-fetch coverage
| Site | Guard | Verdict |
|---|---|---|
| ai_service._fetch_image_bytes (AI images) | FULL (DNS+per-hop recheck) | best-in-class |
| flow_engine.py:523-531 webhook | FULL (DNS) | OK |
| approvals.py:248→177 receipt | SYNC ONLY | HIGH (LEAD A) |
| fb_client.py:115→121 post_to_page_with_image | SYNC ONLY + NO SIZE CAP | HIGH-NEW: fetched bytes uploaded to attacker's FB page = exfil channel |
| pdf_reports_engine.py:52→180→224 logo (WeasyPrint) | SYNC ONLY + WeasyPrint FOLLOWS REDIRECTS, never re-checked | HIGH-NEW: two bypasses; PDF returned to requester = readback |
| Graph calls / telegram / publisher / onboarding | fixed hosts N/A | OK |
| commerce_engine store_domain | admin-only body | LOW (deprecated module) |
Fix sketches: fb_client → await assert_safe_outbound_url + 5MB cap, degrade to text-only post; PDF → guarded pre-fetch via _fetch_image_bytes + data-URI embed + WeasyPrint url_fetcher lockdown (refuse non-data: URLs).

## LEAD D — authz matrix: 15/15 PASS
Money endpoints all gated (wallet.py:158-231, plans.py:77-211, bank.py:29-63, approvals.py:52-217, admin_routes.py:443-446, users.py, reports_routes.py). SSE status-stream: unauth→401, cross-tenant→error event + close, per-tenant cap 429 (sse.py:42-80). JWT cookie + jti blacklist + role hierarchy verified.

## Top-5 security actions
1. approvals.py receipt DNS guard. 2. fb_client image guard + cap. 3. PDF logo lockdown. 4. Remove ?token=. 5. Centralize guarded-fetch helper + enumeration regression test.
