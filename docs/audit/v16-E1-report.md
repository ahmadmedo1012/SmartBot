# v16-E1 — SSRF DNS Family Closure Execution Report (2026-09-09)

Agent: E1 (BACKEND-SSRF). Mandate: plan §1-E1 (3 tasks), diagnostics from `audit-reports/v16-D2-security.md` LEAD C (fb_client image path + PDF logo path — the two sites of the three-site SSRF/DNS family owned by this agent; the third, approvals.py receipt, is E2's). Surgical-only; every change carries a `v16-E1` comment at the edit site. Files touched: `fb_dashboard/fb_client.py`, `fb_dashboard/pdf_reports_engine.py`, `fb_dashboard/routers/reports_routes.py`, `tests/test_v16_ssrf.py` (new) — nothing else.

## Task 1 — fb_client.post_to_page_with_image: DNS-resolving guard + 5MB cap — DONE
- `fb_dashboard/fb_client.py:12` — import changed from the sync-only `_assert_safe_image_url` to the **full guarded stack**: `from ai_service import _IMAGE_MAX_BYTES, UnsafeImageUrlError, assert_safe_outbound_url` (the v15-E4 DNS-resolving async guard: fast literal-IP layer + `getaddrinfo` off the event loop + fail-closed on unresolvable hosts).
- `post_to_page_with_image` (:121-134): `_assert_safe_image_url(image_url)` → **`await assert_safe_outbound_url(image_url, label="صورة المنشور")`**. On `UnsafeImageUrlError`: log warning + degrade to the existing text-only contract (`return await self.post_to_page(message)`) — unchanged envelope for callers; a hostname resolving to 169.254.169.254 / RFC1918 / ULA is now refused *before any HTTP client is built* (previously only literal IPs were caught — D2: "SYNC ONLY + NO SIZE CAP").
- **5MB cap**: after `resp = await client.get(image_url)`, `len(resp.content) > _IMAGE_MAX_BYTES` (the exact ai_service constant, 5*1024*1024) → log + text-only posting, BEFORE the bytes are relayed to the Graph photo endpoint (closes the uncapped exfil channel D2 flagged: "fetched bytes uploaded to attacker's FB page").
- Method signature/return contract untouched (async, `dict | None`, same degrade path) — publisher/scheduler/agent callers unaffected.

## Task 2 — PDF branding logo lockdown (router pre-fetch + WeasyPrint structural lock) — DONE
### reports_routes.py (pre-fetch + data: URI)
- New `_image_data_uri(raw)` helper (:22-39): base64 embed with **mime sniffed from magic signatures** (PNG/JPEG/GIF/WEBP, default `image/png`).
- `generate_pdf_report` (:82-99): when `branding.logo_url` is set, the route now runs the full guarded stack **before any HTML is built**: `await assert_safe_outbound_url(logo_url, label="شعار التقرير")` (DNS resolve) → `await _fetch_image_bytes(logo_url)` (ai_service's guarded fetch: 10s timeout + 5MB streaming cap + `follow_redirects=False` with **per-hop full guard re-check**, max 3 hops). Guard rejection **or** failed fetch → `HTTPException(400, "شعار التقرير مرفوض")` (exact Arabic contract from the plan). Success → `branding.logo_url` is swapped to the `data:` URI, so the engine's `<img src=…>` never carries a remote URL. Lazy ai_service import inside the route (flow_engine.py:523 pattern) keeps it monkeypatch-friendly.
- Response shapes untouched: `/api/reports/generate` still returns raw PDF bytes; every other reports endpoint still returns `ok(...)` envelopes.
### pdf_reports_engine.py (url_fetcher lockdown)
- New module-level **`_data_only_url_fetcher(url)`** (:36-71): WeasyPrint `url_fetcher` that **only accepts `data:` URIs** and raises `ValueError` for any http/https/file/ftp/gopher/non-URI. Parsing mirrors the stdlib `urllib.request.DataHandler` (RFC 2397: `unquote_to_bytes` for both forms, `;base64` suffix, default `text/plain`, control-char rejection in the mediatype) and returns a real `weasyprint.urls.URLFetcherResponse`; the lazy weasyprint import keeps the **fpdf2 fallback fully intact** (probe untouched, fallback branch untouched).
- `_render` (:273): the engine's single `weasyprint.HTML(...).write_pdf()` call is now `weasyprint.HTML(string=html, url_fetcher=_data_only_url_fetcher).write_pdf()` — verified repo-wide that this is the ONLY weasyprint call site. With a callable fetcher, weasyprint 68's `urls.fetch()` catches the raise → logs + skips the image → rendering continues; the remote fetch **never happens** — redirects/remote fetches are impossible **by construction**, closing D2's "WeasyPrint follows redirects, never re-checked" bypass even for any future URL that slips into the HTML.
- `BrandingConfig`'s fast sync check stays as the engine-boundary first layer (docstring updated); `html.escape` is a no-op on data URIs (base64 alphabet has no escapables — documented at `_header_html`).

## Task 3 — tests/test_v16_ssrf.py (new, 15 tests) — DONE
Repo conventions followed: `v10_seed`/`v10_world` fixtures from tests/conftest.py, `_fake_dns` monkeypatch of `ai_service._resolve_host_ips` (test_v15_concurrency.py:726-732 pattern), recording fake HTTP client (test_v12_engines_security.py:182 pattern), Arabic assertions on every user-facing contract, `pytest.importorskip("weasyprint")` for renderer-dependent tests.

| # | Test | Proves |
|---|---|---|
| 1-2 | `test_fb_image_dns_internal_ip_degrades_to_text_post` ×[169.254.169.254, 10.0.0.5] | hostname passes literal-IP layer, DNS resolves internal → guard rejects → text endpoint called exactly once, **zero** HTTP calls (no image GET, no `{page}/photos` POST) |
| 3 | `test_fb_image_dns_failure_fails_closed_to_text_post` | NXDOMAIN → fail-closed → text-only |
| 4 | `test_fb_image_oversized_body_degrades_to_text_post` | >`_IMAGE_MAX_BYTES` body → text-only; the recording client shows the GET happened but the **photo upload endpoint was NOT called** |
| 5 | `test_fb_image_public_dns_full_image_path` | positive: 93.184.216.34 passes → image fetched & uploaded with the exact fetched bytes → feed post carries `attached_media` media_fbid |
| 6 | `test_fb_image_guard_uses_public_dns_pass_with_label` | positive: public IP passes the guard with the «صورة المنشور» label |
| 7-8 | `test_report_logo_dns_internal_ip_rejected_400` ×[169.254.169.254, 10.0.0.5] | route → **400 «شعار التقرير مرفوض»**; honest-signal: `_fetch_image_bytes` is faked to return bytes, so a missing guard would 200 and fail the test |
| 9 | `test_report_logo_guarded_fetch_failure_rejected_400` | guarded fetch returns None (timeout/cap/redirect-refused) → same 400; engine never renders |
| 10 | `test_report_logo_public_dns_embedded_as_data_uri` | positive: engine receives `data:image/png;base64,…` decoding to the exact fetched bytes, tenant-scoped, PDF 200 — no remote URL reaches the engine |
| 11 | `test_image_data_uri_mime_sniffing` | magic-signature sniff + default + roundtrip for all 5 cases |
| 12 | `test_pdf_url_fetcher_refuses_every_non_data_scheme` | https/http/file/ftp/gopher/non-URI all raise (tested directly, weasyprint not required) |
| 13 | `test_pdf_url_fetcher_accepts_data_uris` | base64 + percent-encoded + default-mediatype forms decode; content_type correct (importorskip weasyprint) |
| 14 | `test_render_pins_weasyprint_to_the_data_only_fetcher` | `_render` passes `_data_only_url_fetcher` to `weasyprint.HTML` (fake HTML class captures kwargs) and the captured fetcher refuses the remote URL in the document |
| 15 | `test_real_render_survives_remote_img_and_renders_data_uri` | REAL weasyprint render: a document with a remote `<img>` + a data: `<img>` renders to `%PDF` — remote image skipped/logged, never fetched, render never breaks |

Regression-first property verified live: with the three source edits stashed, 12 of the 15 new tests fail on the pre-fix code (the 3 that pass are the ones exercising pre-existing behavior); with the edits restored all 15 pass.

## Gates (terminal evidence)
- **Mandated gate:** `cd SmartBot && DATABASE_URL="sqlite+aiosqlite:///:memory:" SECRET_KEY=test-secret CRON_SECRET=test-cron-secret FB_ACCESS_TOKEN=test-token FB_PAGE_ID=0 .venv/bin/python -m pytest tests/test_v16_ssrf.py tests/test_v14_security.py -q` → **39 passed** (15 new + 24 v14-security), 8.65s.
- **Ruff:** `.venv/bin/python -m ruff check fb_dashboard/fb_client.py fb_dashboard/pdf_reports_engine.py fb_dashboard/routers/reports_routes.py tests/test_v16_ssrf.py` → **All checks passed!** (3 import-order autofixes applied first).
- **Adjacent regression files** (all code paths touching my owned files): `pytest tests/test_v12_engines_security.py tests/test_v14_engines.py tests/test_v9_security.py tests/test_v15_concurrency.py -q` → **90 passed** (includes the v12 SSRF degradations, the v14 off-event-loop PDF render with `url_fetcher=` kwarg, the v15 DNS-guard family).
- **Full-suite paranoia run:** `pytest tests -q` → **800 passed / 0 failed** (800 collected incl. the 15 new; 128s). One intermittent flake observed once in three full runs (`test_v12_routers_security.py::test_cron_heartbeat_authorization_header_preferred` — bot.py cron auth, E2's area): it passes standalone, and passed with my edits on the confirming re-run; the baseline run without my edits failed only my own new tests — i.e. **not E1-caused**; flagged for the coordinator/E6 awareness anyway.

## Rejected / not done
- None of the 3 mandate tasks rejected. Deliberately NOT done (outside ownership): approvals.py receipt DNS guard (E2-م1), any ai_service.py change (its `_fetch_image_bytes` does not DNS-check the *initial* URL — I compensate by calling `assert_safe_outbound_url` explicitly before it in both new call sites; centralizing the guard inside ai_service is D2 action #5, owner: coordinator/E2 wave).
- Residual (accepted, same class as v15-E4): DNS-rebinding TOCTOU between the guard's resolve and the fetch connection; size-cap check happens post-download (bounded by the 15s client timeout) rather than mid-stream — the ai_service streaming cap covers the PDF logo path; the fb_client path checks len before upload per the plan's "فحص len قبل الرفع" option.

## Footprint audit
`git status` — modified: exactly `fb_client.py`, `pdf_reports_engine.py`, `routers/reports_routes.py` (+ new `tests/test_v16_ssrf.py`, untracked). All other modified files in the tree belong to parallel wave-1 agents (E3/E4 frontend) and were untouched, per protocol. No commits made.
