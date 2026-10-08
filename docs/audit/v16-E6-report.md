# v16-E6 — Battery Honesty & Time Determinism (TESTS-BATTERY) — 2026-09-09

**Agent:** E6 · **Mandate:** plan §1 E6 (from D3 diagnostic) · **Files owned:** `tests/_dayseed.py` (new) · `tests/test_v15_perf.py` · `tests/test_v14_sse.py` · `e2e/sim/fixtures/sim-findings.json` · `e2e/sim/helpers/db-claims.mjs` · `scripts/v16_sim_local_battery.sh` (new) · `scripts/v16_postdeploy_battery.sh` (new)

---

## Task 1 — tests/_dayseed.py + F1 fix (test_b3_trend) — ✅ DONE

**New file `tests/_dayseed.py`:**
- `utc_day_start(ref=None)` — UTC calendar midnight, an exact mirror of the app's bucket boundary in `_services.py:357-382` (`today_start = datetime(now.year, now.month, now.day)` on the UTC-naive `_utils.utcnow()`).
- `seed_day(day_offset=0, *, hour=None, ref=None)` — day 0 = **midpoint of the elapsed part of today** (always past, always today); negative offsets = `hour` (default 12 = noon) hours after that day's UTC midnight (always inside that day, always past). Positive offsets → `ValueError` (future = wall-clock dependent, refused). `hour∉[0,24)` → `ValueError`. `ref` overrides "now" for the determinism self-test only.

**test_v15_perf.py:**
- `_seed_reply` (:76-102) gained `at=` (absolute timestamp) alongside `hours_ago=` — one-of-the-two enforced with `ValueError`. The other 9 call sites (14 sites total incl. b3's 5) keep `hours_ago` (relative windows, time-of-day-safe per D3).
- `test_b3_trend_matches_get_trend_data` (:311-353): the 5 seeds converted to `at=seed_day(...)` — today / yesterday×2 (`seed_day(-1)` + `seed_day(-1, hour=11)` for distinct timestamps) / day-3 / day-9. Assertions **unchanged** (`got == expected`, `got["today"] == -50.0`).
- Midnight-crossing skip guard added **after the request/measurement, before the assertions** (:346-350): if `utcnow().date() != seeded_today` → `pytest.skip` (D3: negligible probability, honest skip beats a false nightly CI failure).
- New self-test `test_dayseed_deterministic` (:356-396): sweeps **24h of simulated wall clocks** (30-min steps + midnight edges 0/1/59/719/1439) and proves: day-0 midpoint always inside today & past; every negative offset lands inside its intended calendar day (`utc_day_start(seed) == start+offset`) and strictly before today; live-now invariants (`seed_day(0).date() == utcnow().date()`, `seed_day(-1).date() == yesterday`); future/hour-misuse rejections.

**Wall-clock proof (scratch, not committed — `/home/z/e6-scratch/dayseed_proof.py`):** ran the REAL `_get_trend_data` + REAL `seed_day` with `utcnow`/`_services.utcnow` monkeypatched **in the throwaway process only** (the repo test file stays clock-clean, per instructions) over **152 simulated wall clocks** (10-min sweep of 24h + boundary edges):

```
simulated wall clocks: 152 · failures: 0
PROOF OK: today == -50.0 at every simulated wall-clock minute
```

Including the old failure window: at wall 01:00 UTC → buckets today_start=09-09 00:00, seeds day0=09-09 00:30 / -1=09-08 12:00 / -3=09-06 12:00 / -9=08-31 12:00 → today=-50.0 (v15's hours_ago seeds gave 0.0 there — live-reproduced by D3).

## Task 2 — SSE de-flake (test_v14_sse.py) — ✅ DONE

**test 1 (`test_sse_poll_exception_is_swallowed_and_stream_survives`)** — the D3-reproduced hazard: approver timer (0.45s) can beat the first successful poll on a stalled loop → first delivered snapshot already terminal → `statuses[0] == "pending"` failed (this exact failure was observed live in the v16 full-suite baseline). Minimal change preserving documented intent (docstring §1: exception swallowed, stream SURVIVES, terminal update delivered, clean close, no leak):
- `assert statuses[0] == "pending"` → **order-tolerant**: `statuses[0] in ("pending", "verified")` + comment explaining why (contract is not second-level ordering).
- Added **deterministic** replacement evidence: `assert sse_env.factory.fail_polls == 0` — proves the two injected poll exceptions were actually raised and swallowed inside the loop (the old ordering assertion never proved this deterministically).

**test 4 (`test_sse_two_concurrent_streams_both_receive_the_update`)** — same hazard class (0.4s approver): the first-snapshot extraction `next(e[1] for e in events if e[0] == "data")` blindly took the first data line and would `KeyError` on the close marker `data: {}` if it ever preceded a snapshot; now it selects the first **id-bearing snapshot** (`"id" in e[1]`) with an explicit `assert snapshot is not None`, + comment. The verified-delivery/close/identity assertions are untouched.

**Race reproduction proof (scratch test, run then deleted from the file):** injected a stalled loop (every `get` sleeps 0.6s > approver's 0.45s) — the race happened (`statuses[0] == "verified"` asserted) and all de-flaked assertions passed:

```
tests/test_v14_sse.py::test_e6_scratch_race_stall — 1 passed
```

Under that same stall the OLD `statuses[0] == "pending"` would have failed → the flake is now structurally impossible while the exception-swallow evidence got *stronger*. Stability: 4 consecutive full-file runs green (5 passed × 4).

## Task 3 — Flip-detector fix (v16_sim_local_battery.sh) — ✅ DONE

Read `db-claims.mjs:251-254` myself: the live file (`sim-findings-live.json`, JSONL) receives `{id, persona, ts, status: 'findingClosed', ref, action}` — compact JSON, no `"findingClosed": true` key ever exists there → v15's grep was structurally always 0. **Correct form chosen: grep the live file for the `status` field.** v16 script counts `grep -c '"status": *"findingClosed"'` (tolerates compact/spaced JSON) and additionally lists the flipped ids for the coordinator:

```
v16 pattern count: 2   v15 broken pattern count: 0   (synthetic 3-line live file)
    - p13-ssrf-receipt-dns
    - p12-wizard-focus-advance
```

The report section header marks it as "مُصلَح v16" with the root cause documented in the script header.

## Task 4 — SIM_ROUND=v16 — ✅ DONE

- `db-claims.mjs:169` (was :161): `const currentRound = process.env.SIM_ROUND || 'v16'` + v16-E6 comment (header + inline). TTL now bites: entries with `expires < SIM_ROUND` are dropped as "غير مُدرج (صرامة)".
- `v16_sim_local_battery.sh` sources `scripts/round.env` (E7 seeds `ROUND=v16`) **if present**, else hardcodes v16; an externally exported `SIM_ROUND` is respected; then `export SIM_ROUND`.
- Verified via CLI: `SIM_ROUND=v16 node e2e/sim/helpers/db-claims.mjs findings` → `count: 6` (exactly the 6 intended entries; no expired warnings). `env -u SIM_ROUND … findings` → same 6 (default v16 confirmed).

## Task 5 — sim-findings.json prune/annotate — ✅ DONE

**Deleted (6):** `p10-broadcast-gate`, `p10-max-replies`, `p13-changepw-429`, `p13-register-race-500`, `p10-free-funnel` (green-flipped, verified v15 report §3/§5) + `p13-cron-query-token` (E2 removes `?token=` this round → 403 contract now measured un-allowlisted; the post-deploy battery has a new K69b check for it — if the sim battery later shows it red, the coordinator re-adds it).

**Kept (6):**
| id | expires | change |
|---|---|---|
| p08-crm-lead | prod | unchanged |
| p10-dm-gate | **v15→prod** | reason rewritten: R3 family — measurement needs a live Graph token in production (same status as p08-crm-lead); cannot flip green locally ever |
| p10-replies-used-comments | **v15→prod** | same R3 one-line reason update |
| p13-ssrf-receipt-dns | **v15→v16** | annotated: E2-م1 swaps the sync guard for `assert_safe_outbound_url` (DNS) — battery proves green (findingClosed) then coordinator deletes |
| p12-wizard-focus-advance | **v15→v16** | annotated: E3-م2 fixed back/skip focus (focusStepTitle) — proof-then-delete |
| p11-rtl-tab-order | v16 | reason updated: E3-م1 fixed the skip-link (focus:fixed focus:start-4); persona test 7 (sim-p11 t7) measures skip-link capture + leftward focus |

`$schema` kept (`sim-findings-v15` = the file-format version, unchanged) and the `comment` extended with the v16-E6 pruning note. JSON validity: `python -m json.tool` → OK.

## Task 6 — scripts/v16_postdeploy_battery.sh — ✅ DONE

Derived from v15's (all ~96 checks A–O preserved verbatim in contract style: `check`/`contains`/`notcontains`/`statusIn` + curl patterns; `V15_LIGHT`→`V16_LIGHT`; evidence → `docs/evidence/v16/`; plus one new v16-relevant check **K69b**: `?token=` on cron heartbeat must now 401/403 per E2's removal — same statusIn contract). **New section P (canary browser pass, dec-canary-watch):**

- Embedded Node/Playwright script (heredoc, resolved against the frontend's `node_modules` via `createRequire(cwd)`; run with `cd fb_dashboard/frontend`) loads `/, /pricing, /login, /dashboard` on `BASE_URL_WEB` **read-only, no auth**:
  - console errors (`msg.type()==='error'`) + uncaught exceptions (`pageerror`) + **unhandledrejection** events (init-script forwards them as tagged `console.error` so they survive cross-document navigations — pageerror also counts them in both metrics, deliberate conservatism, documented in-code);
  - `/dashboard` (no cookie) must end at `/login` (AuthGuard `window.location.href`), waited via `waitForURL(/\/login/, 15s)`;
  - compares against `docs/evidence/baseline-console.json`: **missing → seeded with the measured counts and PASS with a "baseline seeded" note (P91) — documented in the script header and the file's own `comment` field**; present → per-page AND total budgets must hold (`measured ≤ baseline` for both metrics), any exceedance = FAIL;
  - jq summary lines in the report (totals + per-page counts + finalUrls).
- Checks: P87 pages loaded · P88 console within baseline · P89 rejections within baseline · P90 dashboard→/login · P91 baseline seeded (first-run note). Node crash (no playwright/network) → honest FAILs, no silent skip.
- **Functional smoke test (local static server, not production):** run 1 → baseline seeded, exit 0, counts collected (incl. resource-load 404 console errors — proves the listener class); run 2 vs a zero baseline → exit 1 with per-page+total violations enumerated; run 3 → `/dashboard` client-redirect detected (`dashboardRedirected: true`, finalUrl=/login). Playwright chromium/headless-shell (v1243) installed on this machine as a side effect (the sim battery auto-installs it anyway).

**scripts/v16_sim_local_battery.sh** header docs updated: describes round v16 (battery honesty), the fixed flip-detector (root cause: db-claims writes `status:'findingClosed'`), SIM_ROUND semantics (round.env → TTL bites), and the compatibility note (V15_BACKEND_ENV/V15_SIM_API_PORT/V15_SIM_DB/V15_ROTATE_SCRIPT exported under their old names **on purpose** — sim-p14-secret-rotation.spec.ts and v15_sim_rotate_secret.sh read them literally; values are v16: `v16-sim.db`, `/tmp/v16-backend.env`). Also reports TTL-dropped entries (`إدخال منتهي الجولة` count from the playwright log).

---

## Gates (terminal evidence)

```
$ DATABASE_URL="sqlite+aiosqlite:///:memory:" SECRET_KEY=test-secret CRON_SECRET=test-cron-secret \
  FB_ACCESS_TOKEN=test-token FB_PAGE_ID=0 .venv/bin/python -m pytest tests/test_v15_perf.py tests/test_v14_sse.py -q
37 passed, 53 warnings in 12.19s          (+ re-run after all edits: 37 passed in 14.49s)
$ bash -n scripts/v16_sim_local_battery.sh && bash -n scripts/v16_postdeploy_battery.sh   → OK
$ node --check fb_dashboard/frontend/e2e/sim/helpers/db-claims.mjs                       → OK
$ .venv/bin/python -m json.tool e2e/sim/fixtures/sim-findings.json                       → OK
$ node --check <extracted embedded canary JS>                                            → OK
SSE stability: 4× consecutive runs → 5 passed each
Day-seed 24h proof: 152 simulated wall clocks → 0 failures (today == -50.0 everywhere)
db-claims CLI TTL: SIM_ROUND=v16 / default → 6 live entries
Flip-detector: v16 pattern 2 vs v15 pattern 0 on the same synthetic live file
```

## Parallel-conflict watch

Other agents edited their OWN files during my run (backend: fb_client.py; frontend: layout/providers/etc.; tests/conftest.py + several test files owned by E2/E5) — none of my 7 owned files collided; my gate runs executed against the current in-flight tree and stayed green. No retry-with-wait was needed. **No git commit performed** (per instructions).

## Handed to the coordinator (not E6's job)

1. Run the full local sim battery (`bash scripts/v16_sim_local_battery.sh`) — expect the 3 `expires:v16` entries to flip `findingClosed` (E2/E3 fixes land first) → then delete them from sim-findings.json (target ≤4 entries; 3 prod R3 entries remain).
2. Run the post-deploy battery after deploy — first run seeds `docs/evidence/baseline-console.json` (P91 note) → **commit the seeded baseline** so subsequent runs compare against it.
3. If `p13-cron-query-token` measures RED in the sim battery after E2's `?token=` removal is verified live, re-add it (per plan §2 interface contract E2→E6).
4. `scripts/round.env` (E7) absent at my run time — my script hardcodes v16 fallback; once E7 lands it, SIM_ROUND follows it automatically.
