# ENGINEERING_STATE.md — Persistent Engineering State

> **Purpose:** Single source of truth across sessions. Never rely on conversation memory.
> **Protocol:** Inspect git + this file at session start. Update continuously. Commit with every verified batch.
> **Created:** 2026-09-12 (v26 session) · **Frozen at v26/063d7eed** (state-doc commit `fa57bdb3`, 2026-09-11) after the v26 close — 155 commits landed without an update, violating this file's own protocol.
> **Re-anchored:** 2026-10-20 (P21-W7-C session) — this file is now TRUE at HEAD: state re-verified, every open item re-checked against source, and the full P17→P21-W6 arc chronicled below (§4.2) with SHAs.
> **Advanced:** 2026-10-20 (P21-W7-F session) — D-05 (the last HIGH) + S-06 closed in code, CHANGELOG arc back-filled, gates re-run: pytest 1231 forward green.

---

## 1. ARCHITECTURE (verified from source, P21-W7-C)

| Layer | Location | Stack | Entry point |
|---|---|---|---|
| Backend/API | `fb_dashboard/` | FastAPI (async SQLAlchemy 2) | `api/index.py` → `fb_dashboard/runner.py` → 38 routers (41 files: `routers/payments/` is a v13 package) |
| Web | `fb_dashboard/frontend/` | Next.js 16 App Router, React Query, Tailwind, RTL-Arabic | `src/app/**` — 38 pages (25 under `/dashboard`, incl. W6's `/dashboard/flows` + the `[...slug]` catch-all; 13 public/admin) + 5 metadata routes → 44 static pages at build |
| Mobile | `mobile/` | Expo + React Native (expo-router) | `mobile/src/app/**` — 29 screens (5 tabs + auth 2 + app detail/stack + root) |
| Database | `alembic/` (001–018) | Neon PostgreSQL (prod) / SQLite (test) + `_schema_reconcile.py` at boot + `TestLivePostgresExecution` runs live-PG in CI (P11-1) | `fb_dashboard/models.py` |
| Engines | `fb_dashboard/*.py` | bot_engine/, flow_engine, sequence_engine, broadcast_engine, agent_engine/brain (AI multi-agent), analytics_engine, commerce_engine | per-tenant, claim-pattern queues |
| Plan gates | `fb_dashboard/_plan_gates.py` | ONE `enforce_plan_feature()` guard for the 5 enforced flags: `has_scheduling` `has_flows` `has_offers` `has_reports` `has_analytics_advanced` (P21-W3-B/W4-B); joins the v15 `max_*` family + v22-D4 `has_sequences` + v17 `max_team` + P14 `max_pages` at the single `get_plan_limits` read |
| Deployment | `vercel.json` | 2 Vercel projects: smart-bot-api (api.smart-link.ly) + smartbot-frontend (bot.smart-link.ly); push main → auto production | `scripts/gate_all.sh` quality gate |

**Envelope contract:** every `/api` response is `{success, data, error?}` — central unwrap only (`src/lib/api.ts` / `_responses.py`).
**Auth:** JWT cookie (web) + Bearer `/api/auth/token` (mobile); jti blacklist; tenant_id isolation (claim `tid` is only a lookup filter — effective tenant always from DB row); CSRF double-submit (Bearer-header requests exempt by design — B-18).
**Mobile contracts:** `mobile/src/lib/envelope.ts` mirrors backend envelope.
**Design canon:** **Machine Instrument** (P17) — ink `#050506`/`#0A0B0E`, cream `#F4F4F6`, cyan `#56E2F2` (machine voice), violet `#9380FF` (AI register), amber `#FF9A69` (human/handoff), 3-line instrument grid, ChainGPT-grammar shell (80px icon rail, 70px top band, ticker strip, persistent AI bar). Supersedes Circuit Petrol (r152, which superseded Madarek r125). Contract: `design-system/smartbot-phase17/ART-DIRECTION.md`. Parity ledger: **582 GREEN** (see CLAUDE.md ledger history).

## 2. CURRENT STATE

- **Branch:** `main` @ **this commit** — the P21-W7-F docs close-out (`docs(state,changelog,W7-F): …`), atop `835d188` "feat(auth,P21-W7-F): S-06 closes…" atop `cea91d6` "feat(db,P21-W7-F): D-05 closes…", atop `30625c8` (the P21-W7-C re-anchor). HEAD at session start was `30625c85d3c8077a8ceaaff7df013f5ecfad65ae` (2026-10-20 00:43 UTC), tree clean.
- **Working tree (this commit):** CHANGELOG.md + this file only. The two code commits (`cea91d6` D-05, `835d188` S-06) landed first; no web/mobile file touched this session.
- **Production (verified 2026-10-20, session start):** `api.smart-link.ly/api/version` = `30625c85` exactly (W7-C is live) · `/healthz` 200 · `bot.smart-link.ly` HTTP 200. This wave's push must be re-verified post-push (§6/§7).
- **CI at `30625c8`:** quality-gates run success (2026-10-20 00:43 UTC).
- **Verdict:** see §8.

## 3. KNOWN DEFECTS / OPEN ITEMS (each re-verified against HEAD source by P21-W7-C)

| ID | Severity | Status | Notes (evidence at HEAD) |
|---|---|---|---|
| S-01 | CRITICAL→inert | hygiene-only | leaked key token → live-verified dead (401) at v26; blob `2e6a618a` still in history; `git filter-repo` cleanse still pending (guarded by pre-push hook; P21-W5-C1 documented the history-scan tooling in SECURITY.md) |
| D-05 | HIGH | **CLOSED** (P21-W7-F, `cea91d6`) | migration **019** `alembic/versions/019_p21w7_fk_validate.py` VALIDATEs every 015-era FK: delegates to `_schema_reconcile`'s new `_FK_VALIDATE` family (the 007/014 lineage — ONE spec for chain and net, never a copy), `convalidated` guard, SET NULL-mirroring orphan heal BEFORE the scan so the chain can never strand at 019; SQLite no-op by dialect (FKs native + PRAGMA-on in tests since v16-E5); ShareUpdateExclusive lock scope documented; downgrade no-op (018 precedent). 7 sync migration tests (`tests/test_p21w7_fk_validate.py`, fake-catalog PG branch — no PG server locally) + the 15 chain-head assertions across 6 migration test files re-anchored 018→019. Reaches Neon on the next deploy via the startup chain (create_all → reconcile → upgrade head). |
| B-08 | MED | **OPEN** (bounded) | `_rate_limit.py::check_rate_limit` = DB-backed, 3 statements (delete-stale + insert-commit + count) per mutating request via middleware. Documented; latency acceptable. |
| D-09 | P3 | **CLOSED** (v9-A3) | inbox tags: ONE batched `IN(...)` join query (ConversationLabel⋈ConversationTag, tenant-filtered) serves all conversations — no per-row tag queries. |
| D-10 | P3 | **CLOSED** (v26-F4 + v15-E3) | broadcast fan-out counters: SQL-aggregated single atomic UPDATE (`_aggregate_fanout_counters`, commit `61321e3f`); per-recipient Graph DMs are irreducible external calls, bounded per beat. |
| D-12 | P3 | **CLOSED** (bounded by design) | inbox search: one ≤200-row query then in-Python filter (inbox_list) — no query multiplication; acceptable bounded pattern. |
| W-11 | P3 | **CLOSED** (v24-C4) | sequences list `step_count`: ONE grouped COUNT over `sequence_steps` (routers/sequences.py:46-66), following the subscriber_count pattern. |
| B-18 | MED | **OPEN** (by design) | CSRF exempt for requests carrying `Authorization` (app/middleware.py:199) — mobile Bearer clients have no cookies; rate-limit still applies. Documented, unchanged. |
| S-06 | MED | **CLOSED** (P21-W7-F, `835d188`) | ONE validator `_hash.password_policy_error` (8 chars AND ≥1 letter AND ≥1 digit) replaces the length-only checks at all five sites (register / change-password / admin reset in `auth.py`; create_user / update_user in `users.py`); also kills the raw-500 on non-str JSON values. Applies ONLY at set/change/reset — login never judges a weak existing password. Zero fixture churn (choice documented in the validator); 15 new tests incl. the login-never-judges contract + the retroactive fixture belt. Breach-list checks deliberately not added (no external dependency wanted). |
| W-27 | LOW | **OPEN** | still exactly **19** direct `AsyncSessionLocal()` usages in 8 router files (inbox×8, bot×3, payments×3 [plans/sse/wallet], plans_config×2, marketing×2, admin_routes×1) — functional (tenant-scoped) but bypass DI override. |
| flake watch | — | **MONITORED, not reproducing** | v26's `test_webhook_message_replay_does_not_reply_twice` CPU-load flake: root-caused across r136/r136b/r137/r140 (spawn-drain before dispose `61e92ba`, settle-beat `5455e1f6`, importlib class-identity fix `237118ad`, fb_client loop-bound client reset `9fc15ed6`/r140) + bounded infra retry `ab916b2e` (r136c). The W5-C1 "flake dies at root" (`bca999dd`) was the FRONTEND vitest flake (AuthGuard jsdom 401-timer, cleaned in afterEach); W2-CI (`652d9ccf`) fixed the PDF event-loop test's reverse-order cold-start (warm-up). P21-W7-C evidence: full suite green FORWARD (4:46) AND reverse (3:40) on a busy 2-CPU sandbox, zero retries. |
| CHANGELOG gap | LOW | **CLOSED** (P21-W7-F) | CHANGELOG.md unreleased section now carries the full P12→P21-W7 arc in user language (13 back-fill entries: identity reset, dashboard shell, flows surface, segmentation UI, honesty waves, gates, pricing truth, landing arc, robot hero) + the W7-F pair (D-05, S-06). Every claim traced to commit diffs. |
| **ENV hazard** (not a repo defect) | verification | **KNOWN — affects tool OUTPUT only, not files** | The sandbox toolchain's output rendering strips ANSI-SGR-shaped byte runs (left-bracket + digits/semicolons/dashes + «m») from RETURNED text. Consequence caught this session: rg/sed/git-show DISPLAYS of `.github/workflows/ci.yml` appear to read `branches: ain, develop]`, but the file on disk is INTACT (`od -c` proves the true bytes `bracket m a i n, develop]`) — a near-miss false defect, kept out of this file's defect table by byte-level re-proof. Rule for every future session: any «corruption» finding whose evidence is a bracket-bearing string MUST be re-proven with `od -c`/base64 before it may enter this file. |

## 4. SESSION LOG

### 4.1 Lineage (pre-anchor)

- **v26 (063d7eed, 2026-09-11):** adversarial cross-tenant sweep (40 vectors blocked), mobile destructive confirms, full battery green — original verdict READY FOR REAL DEVICE TESTING; this file created at fa57bdb3.
- **v27 (bd3d4576, 2026-09-12):** mobile RTL-from-first-open + brand logo + auth alignment.
- Then the file froze. 155 commits landed (below) without a single state update — every session since relied on nothing.

### 4.2 The 155-commit arc (fa57bdb3 → 525d1686, 2026-09-11 → 2026-10-18) — honest chronicle

**Era 1 — Madarek interlude + hardening waves (r125–r140, 2026-10-07 → 10-10):**
- Ecosystem Madarek parity flip (night/gold + cream/copper, IBM Plex Sans Arabic self-hosted): `cfe6aeab`, `f74364d0`, `71e29ce0`; parity ledger born at 75 pins `fbed0727` → 82 `552aaf24` → 185 `655dd453`/`552aaf24`.
- Supply-chain floor: PyJWT ≥2.15.0 (9 advisories incl. critical 9.1) + next 16.3.8 (CVE) `35668060`.
- Test-infra resurrection: LoopLocalLock event-loop binding (24/26 CI-red repaired) `13132eac`; strictNullChecks enabled `18006eee`; eslint adopted `7010a68f`.
- Product polish canon: 44px touch floors + typography scale + de-glow + world-class sweep across `12fc8fb8`→`f78ddb49` (r130–r149); −39% repo weight `7f2eda19` (r132).
- Libya-first doctrine: Tripoli-midnight day boundaries `d797207d` + Libyan phone gate `358a850a` + fleet-unified phone contract `a9dffacc` (r137/r138-SO, maxLength→16).
- CI walls root-caused (the r137/r140 epic): SSE `is_disconnected` park `e0ca53c9`; teardown park named `91339fcc`; watchdog v2 `64422116`; light-status AA inks re-run `d16cdd2e`; contrast third layer `391755f6`; reverse-order importlib class-identity root `237118ad`; spawn-drain before dispose `61e92ba` + settle-beat `5455e1f6` + bounded cooldown retry `ab916b2e`; httpx loop-bound global client root + retry narrows `9fc15ed6` (r140) with bundle budget recalibrated 190→195 by measurement; faulthandler-tee capture chain `aa804663`/`a28a2714`/`388339e7` (phase8); battery 114/114 green for the first time `0a09b8a4`.

**Era 2 — Circuit Petrol (r152–r154 + phase6, 2026-10-13 → 10-14):**
- Identity flip to Circuit Petrol: petrol `#071A21` + signal teal `#17C3A4` + lime-for-AI `4f8cbb79` (r152); dashboard cascade `b20d1765`/`d7704a41`/`c3f67666`; SVG robot 5-state family `e32a022a`; brand rasters regenerated `58a4d078`/`b454a7a0` (pixel-verified: zero night-Madarek hex); mobile petrol re-anchor `7af9286c` + 18-pin theme suite `0b546d55`; data-surface waves r154 (`e36baf3d` + 7 waves); parity 465→477→482; docs truth `cd8f5115` (MASTER.md petrol constitution — later superseded by P17); sim battery ported to live :3200 `37db4bd9`/`5cc111a2`; P11-1 live-Postgres execution proof in CI `97d7a59a`; migration 018 `768e0765`/`907be55d`.

**Era 3 — Character-led hero (P12–P16, 2026-10-14 → 10-16):**
- Three.js chibi robot takes the hero (ssr:false mount wrapper) `b060b835` (P12-2c); apiFetch 20s clock `932aac8b` + ruff/404 wave (P13-1c/2c); plans truth `d53c84e0` «صفحة فيسبوك واحدة» + max_pages reconciliation `961283db` (P14-P0A); character-led hero `99e7c6e9`/`058a9f83` (P15-A/3) + auth/demo stage-4 coherence `740cc645`; cinematic hero + protagonist `86311e5e`/`56cf174d` + pointer-events fix `1d078b5f` (P16).

**Era 4 — Machine Instrument reset → THE VESSEL → the boxy machine (P17–P21-C, 2026-10-16 → 10-17):**
- **P17** (`0723fee2`, `78cd53ef`): ChainGPT-inspired Machine Instrument replaces Circuit Petrol across landing + product tokens; ART-DIRECTION.md contract.
- **P18** (`00bdd9a9` Obelisk Attendant → `2d6ead03` aperture un-buried → `992cbb54` hero-demo real transcript/intent/handoff → `5d5b5873` ads+settings real surfaces → `339f1f80` polish 94/100 → `83cd9fff` **90-second lost-wakeup auth deadlock dies at root** — off-loop argon2 + loop-bound test clients → `888c887d` parity twin).
- **P19-W2C** (`1916a63f`): THE VESSEL — character rebuild from a different foundation.
- **P20-C1** (`eabbd8e6`): P19-contract grid hairlines die for real + demo joins its real twins.
- **P21-C** (`96677499`): THE VESSEL retires; the ChainGPT reference character (boxy machine) arrives.

**Era 5 — Machine joins the interface + honesty gates (P21-W2→W6, 2026-10-17 → 10-18):**
- W2-C1 `ffac5184`: circuit traces + continuous spectrum sweep + chibi proportion law. W2-C2a `3099aa02`: ChainGPT-grammar dashboard app shell (80px icon rail, 70px top band, ticker strip, persistent AI bar). W2-C2b `9c60f631`/`0c4fb266`: thread no-data verdicts render honest states (404/400 never error overlays) + pins. W2-C3 `c5800ea2`: claims meet enforcement (24/7 chip, encryption scope, «غير محدود» wording). W2-CI: TickerStrip i18n seam `a3c4d826` + deployment re-trigger `a7d8810f` + event-loop test warm-up (measurement artifact) `652d9ccf`.
- **W3-B** `42929cb1`: the plan-gates wave — shared guard `_plan_gates.py` for the four then-open flags (has_scheduling Premium+, has_reports Basic+, has_offers Premium+, has_analytics_advanced Premium+); single `get_plan_limits` read; lapsed→Free degradation; fail-open ONLY on missing plan rows (unknown flag = ValueError); 403 Arabic upgrade copy; creation-time gating only.
- W3-A/A2 `7350fa51`/`7c63ce73`: robot converges with reference (bezel geometry, dot eyes, no stripes); hero traces recalibrated.
- W4-A `a1cad700`: low-key premium voice. **W4-B** `66c91e2c`: has_flows joins the enforced family (the fifth gate) — API-only capability, UI consumer deliberately not built (documented in flows.py).
- **W5-C1** `bca999dd`: frontend suite flake dies at root (AuthGuard jsdom 401-timer cleanup); 403s stop masquerading (plan-lock discriminator reads the gate family's contract-pinned «رقِّ خطتك» suffix — suspension no longer renders the upsell); SECURITY.md honest history record. W5-C5 `ac9284da`: shell micro-geometry (authored procedural maps + two-step studio temper).
- **W6-B1** `65e558f2`: the Premium flows surface ships — dormant flow engine gets an honest test-mode home (`/dashboard/flows` + PremiumLock; 14 vitest).
- **W6-B5R** `525d1686`: segmentation reaches the UI — rule templates (autoreply), audience tags (+manager), broadcast tag filter, leads edit dialog; 28 new vitest; parity 582/582; vitest 590/590.

### 4.3 P21-W7-C session (2026-10-20) — this re-anchor

1. Fresh clone verified at `525d1686` (tree clean); worklog baseline P21-W7-0 read; this file's 155-commit drift identified as the task.
2. Canonical env per repo docs: `.venv` + `requirements.txt`; frontend + mobile `npm ci` (strict, lockfile-clean).
3. **All gates run locally, sequentially, on the fresh clone — ALL GREEN, zero retries:**
   - pytest forward: **1209 passed, 3 skipped** in 4:46 (cov 68.41% ≥ floor 60) · pytest **reverse order: 1209 passed, 3 skipped** in 3:40 (v5 §0 hermeticity contract).
   - web: tsc 0 errors · vitest **590/590** (62 files) · eslint `--max-warnings 0` clean · parity **582/582** · `next build` PASS — **44/44 static pages** · bundle budget PASS (common base 617.0KB raw / **192.1KB gz** ≤ 195) · static sync 138 files, buildId fresh.
   - static contracts: i18n 287 files 0 direct locale calls · a11y labels 239 files 0 unnamed · contrast all pairs ≥ AA · css tokens 288 unique 0 dupes · secret-scan clean · ruff clean.
   - mobile (node-based): vitest **87/87** (7 files) · tsc 0 errors · `expo lint` clean. EAS build + emulator/real-device: **OUT of sandbox scope** (no emulator in environment — unchanged since v25; CI covers typecheck/vitest/lint only).
4. §3 open items each re-verified against HEAD source (evidence cited in the table). One false-defect near-miss caught and kept out: ci.yml's trigger looked mangled through rg/sed displays — `od -c` proved the file intact; the artifact is the toolchain's output rendering (documented as an ENV hazard in §3, not a repo defect).
5. Production re-verified: `/api/version` == `525d1686` pre-push; post-push the deployment must serve this commit (protocol below).

### 4.4 P21-W7-F session (2026-10-20) — D-05 + S-06 close, CHANGELOG back-fill

1. Fresh clone verified at `30625c8` (tree clean). W7-C post-push check done by the coordinator: `/api/version` == `30625c85` (production serves W7-C) + CI green at `30625c8`.
2. `cea91d6` — D-05 closed (see §3 row): migration 019 + the reconcile `_FK_VALIDATE` family + 7 sync tests + chain-head re-anchors.
3. `835d188` — S-06 closed (see §3 row): `_hash.password_policy_error` at 5 sites + 15 tests, login never judges.
4. CHANGELOG back-fill: 13 arc entries (P21-W7 ledger · W6 segmentation + flows · W5 403-honesty + micro-geometry · W3/W4 gates · W2/W3 shell · W2 promises · P17 identity · P18 landing + auth-thread fix · P12→P16 robot hero · P13/P14 pricing + timeouts · phase9/10 touches) + the 2 W7-F entries — all claims traced to diffs.
5. Gates (this session, backend scope — zero web/mobile files touched): ruff clean · secret-scan clean · targeted new files 22/22 (9.02s) · full `pytest -q` **1231 passed, 3 skipped** (4:23) · reverse-order suite green. Web/mobile batteries ride on W7-C §5 + CI-green at `30625c8` (unchanged code).

## 5. TESTS EXECUTED (P21-W7-C, fresh clone @ 525d1686)

| Gate | Command | Result |
|---|---|---|
| Backend | `.venv/bin/python -m pytest -q --cov=fb_dashboard --cov-fail-under=60` | **1209 passed, 3 skipped** (4:46, cov 68.41%) |
| Backend reverse | `pytest -q $(ls tests/test_*.py \| sort -r)` | **1209 passed, 3 skipped** (3:40) |
| Web types | `npx tsc --noEmit` | 0 errors |
| Web unit | `npx vitest run` | 590/590 (62 files) |
| Web lint | `eslint src/ --max-warnings 0` | clean |
| Parity | `npm run test:parity` (tests/parity.mjs) | **582/582** |
| Build | `npm run build` | PASS — 44/44 static pages |
| Bundle | `scripts/measure_bundle.py` | 192.1KB gz ≤ 195 PASS |
| Static sync | `scripts/sync_next_static.py` | 138 files, buildId fresh |
| ruff | `.venv/bin/python -m ruff check fb_dashboard api tests scripts` | clean |
| secret-scan | `scripts/secret_scan.py` | clean |
| i18n | `scripts/check_i18n_calls.py` | PASS (287 files) |
| a11y labels | `scripts/check_a11y_labels.ts` | PASS (239 files) |
| contrast | `scripts/check_contrast.mjs` | PASS (≥ AA, 1.4.11 floors) |
| css tokens | `scripts/check-css-token-duplication.py` | PASS (288 unique) |
| Mobile unit | `npx vitest run` (mobile/) | **87/87** (7 files) |
| Mobile types | `npx tsc --noEmit` (mobile/) | 0 errors |
| Mobile lint | `npx expo lint` | clean |
| CI @ HEAD | actions run 39166063567 | ALL 4 jobs success (2026-10-18) |
| Live | version/healthz/health/cron-guard/web | 200s · version==HEAD pre-push |

Not run this session (documented, not faked): EAS cloud build, emulator/real-device pass (no emulator in sandbox — unchanged), full Playwright sim battery (no product code changed this wave; the battery guards product surfaces, this wave touches docs only).

## 6. LAST VERIFIED COMMIT

`30625c8` (P21-W7-C) — production-verified via `/api/version` == `30625c85` at this session's start + CI green. This session's trio (`cea91d6` D-05, `835d188` S-06, + this docs commit) must be production-verified post-push: `/api/version` == new HEAD; CI green for the pushed SHA; and the Neon deploy boot must run the startup chain through 019 cleanly — watch `/api/health` + deploy logs for reconcile/migration errors (a strand there means the 019 orphan-heal assumption met data the heal cannot fix — §7.1).

## 7. NEXT EXACT ACTIONS (next session)

1. **Post-push check** (if not already recorded): `/api/version` == W7-F HEAD; CI run for the pushed SHA green; the deploy boot ran create_all → reconcile → upgrade head through **019** on Neon (FK VALIDATEs + orphan heal — verify via `/api/health` + logs; if the migration strands, the fallback is the documented 018-precedent manual path, never a downgrade).
2. **Verification hygiene (ENV hazard, §3)**: bracket-bearing «corruption» evidence is a display artifact until proven by `od -c`/base64 — never cite it from rg/sed/cat output alone.
3. Real-device pass (EAS build) — unchanged since v25, the only mobile gap.
4. Optional P3s: B-08 rate-limiter Redis/edge offload (bounded, documented), W-27 DI migration (19 sites), S-01 `git filter-repo` history cleanse (blob `2e6a618a`, guarded).
5. Any web-code change → re-run the full local battery + sim specs (e2e contract, CLAUDE.md DO-6); any api change → full pytest + reverse + this file's §5 discipline.

## 8. VERDICT (P21-W7-F)

# ALL GATES GREEN — THE LAST HIGH DEBT IS PAID

**Evidence:** session opened with production verified at `30625c8` (`/api/version`) + CI green — then closed the two oldest open engineering items in code: **D-05** (HIGH — migration 019 VALIDATE + reconcile `_FK_VALIDATE` family + 7 tests + orphan heal) and **S-06** (MED — policy breadth at 5 sites + 15 tests, login never judges), plus the CHANGELOG arc back-fill (13 + 2 entries). Gates: ruff clean, secret-scan clean, full pytest **1231 passed, 3 skipped** (4:23) forward + reverse green, zero retries; web untouched (its green battery carried by W7-C §5 + CI at the base commit). Open items after this wave (§3): 3 engineering (B-08 bounded · B-18 by-design · W-27 LOW) + S-01 hygiene (dead leak blob, guarded) + the unchanged EAS/mobile-env gap. Keeping this file TRUE at every HEAD remains every future session's first duty.
