# v16-E7 — Gates + gstack import (GATES-METHOD) — 2026-09-09

**Agent:** E7 · **Ownership:** `scripts/gate_all.sh` · `scripts/round.env` (NEW) · `scripts/slop_scan.py` (NEW) · `scripts/round_metrics.py` (NEW) · `scripts/check_careful.sh` (NEW) · `.githooks/pre-push` (NEW) · `docs/evidence/round-metrics.jsonl` (NEW seed)
**Design:** v16-D7 §adopt G1/G2/G3/G6 + v16-D5 §Top-5-1 (E-CI-4: measure_bundle wired into NO gate) + خطة v16 §1-E7.
**Constraint honored:** the FULL gate was NOT run (parallel wave-1 agents are mid-edit on Python/frontend files); validation = `bash -n` + standalone script runs + isolated harnesses of the new gate logic. No git commit. Zero files touched outside the ownership list above.

---

## Task 1 — Bundle gate in gate_all.sh [4.6] — DONE

**What:** after gate 4.5 (sync_next_static, `scripts/gate_all.sh:174-222`) a new **gate 4.6** runs `.venv/bin/python scripts/measure_bundle.py` against THIS run's fresh build and **hard-fails** (`FAILURES+=("bundle-budget")`) when the common base gzip > 190KB. Threshold untouched (E4's current build: base 602.2 raw / **186.3 gz** — PASS with 3.7KB headroom).

**Parse robustness (fail-closed):** verdict = measure_bundle's own exit code (0=PASS, 2=budget-FAIL, 1=no-build) **AND** a text parse of its `budget check (...)` line; if that line ever drifts, the number is **recomputed from the `COMMON BASE` row** (awk `$3/$4`); if neither parses positively the gate FAILS (no fail-open). The per-route **route-extra table** (per-route total − common base) is printed informationally (the ~60.6KB Next-infra share of the arm is not app-controllable — documented in the gate comment, per D5).

**Validation (no full gate run — isolated harness of the exact parse logic):**

```
== A: good output rc=0 ==        RESULT: PASS (base 605.3 raw / 187.3 gz) + route-extra table rendered
== B: over-budget rc=2 ==        RESULT: FAIL (rc=2 verdict=FAIL base_gz=200.5)
== C: format drift rc=0, 186.3 == RESULT: PASS (recomputed from COMMON BASE) — no budget line needed
== D: no build rc=1 ==           RESULT: FAIL (rc=1 verdict=UNPARSED base_gz=unparsed)
== E: drift rc=0, base 250.0 ==  RESULT: FAIL (recompute says >190 — fail-closed)
```

Real-world check (read-only, against E4's leftover fresh build — not a gate run):

```
$ .venv/bin/python scripts/measure_bundle.py
COMMON BASE        602.2     186.3
budget check (common base gzip <= 190KB): PASS      rc=0
```

Route-extra table rendered from that real output (what gate 4.6 will print):

```
route-extra (per-route total − common base):
(landing)   raw +65.2 KB · gz +22.2 KB     login   raw +104.8 KB · gz +35.5 KB
connect     raw +100.2 KB · gz +31.5 KB    pricing raw +60.5 KB · gz +21.8 KB
demo        raw +90.4 KB · gz +28.6 KB     privacy raw +55.1 KB · gz +19.8 KB ...
```

Gate numbering/docs in the header comment updated (v16-E7 block, `gate_all.sh:10-19`).

## Task 2 — scripts/slop_scan.py (D7-G1, diagnostic-only) — DONE

194 lines (incl. bilingual doctrine docstring), `os.walk` + compiled regex, **no AST**, comment lines skipped for the frontend rules (a comment documenting the RETIRED pattern is not a violation — OnboardingWizard.tsx:173,203 match the C patterns inside comments only). **Exit 0 always** (even on scan errors / nonexistent root — fail-open BY DOCTRINE). Runtime **0.062s** (budget was ~30s).

Current output (terminal evidence — dual-shape = **0** after E4's cleanup, exactly the predicted 0-2; silent swallows **78** vs the "~80" expectation and D7's 84 — D7's sample used its own broader matcher; hotspots match D7's list):

```
$ .venv/bin/python scripts/slop_scan.py
slop-scan (v16-E7 · D7-G1) — DIAGNOSTIC ONLY: counts + hotspots, never gates
  [A] dual-shape guards after unwrapApi : 0  (unwrapApi files: 37)
  [B] silent swallows (except→pass/continue/return None): 78 across 39 files  (backend files: 110)
      · fb_dashboard/bot_engine/engine.py ×9 (e.g. lines 184, 215, 239)
      · fb_dashboard/bot_engine/pipeline.py ×9 (e.g. lines 209, 250, 258)
      · fb_dashboard/_observability.py ×5 (e.g. lines 160, 307, 318)
      · fb_dashboard/monitor.py ×4 · routers/facebook_routes.py ×4 · telegram_bot.py ×4
      · ai_service.py ×3 · messenger_service.py ×3 · routers/onboarding.py ×3 · _schema_reconcile.py ×2
  [C] centralized-unwrap violations (.data ?? [] / d?.data): 0
  trend: vs v15: dual-shape 2→0 ↓ · swallows 84→78 ↓
```

Rule B includes `pass|continue|return None` per the plan's rule text (the mandate's "approximate: except…pass" hint is the dominant subset — pass-only would read ~66; all-three reads 78, inside the ~80 expectation and closer to D7's 84).

**Wired as gate [1.5]** — placed **after ruff** per the direct E7 mandate ("runs after ruf; exit 0 always"); the plan doc's "بوابة 5.8" label was superseded by the mandate's explicit placement — documented here as the only plan-vs-mandate discrepancy. Output never enters PASSED/FAILURES (truly informational; script errors print a warning and are ignored).

## Task 3 — scripts/round_metrics.py + seed — DONE

Appends ONE JSONL line per invocation to `docs/evidence/round-metrics.jsonl`: `{round, ts, pytest_total, coverage_pct, allowlist_entries, dual_shape_guards, silent_swallows, battery_red_claims}`. Auto-derivation when args absent: allowlist = `len(entries)` of the battery allowlist (probes `fb_dashboard/frontend/e2e/sim/fixtures/sim-findings.json`, short-path fallback); slop counts = rules A/B **imported directly** from `slop_scan` (no subprocess). `--round` defaults to `scripts/round.env`'s ROUND. Guards: refuses to re-record an already-recorded round without `--force` (evidence integrity); `--dry-run` prints without writing; `--out` for alternate targets. NOT wired into gate_all.sh (coordinator-only at round close, per mandate).

**Seed (exactly the mandated documented v15 numbers — docs/reports/v15-world-class-report.md §4-5; slop fields = D7's scan of the v15-closed tree, its only honest baseline):**

```json
{"round": "v15", "ts": "2026-09-08T23:37:00Z", "pytest_total": 785, "coverage_pct": 61.77, "allowlist_entries": 12, "dual_shape_guards": 2, "silent_swallows": 84, "battery_red_claims": 6}
```

**Terminal evidence (file still contains ONLY the seed line — test writes went to /tmp and were removed):**

```
$ .venv/bin/python scripts/round_metrics.py --round v16 --dry-run
[dry-run] would append to docs/evidence/round-metrics.jsonl:
{"round": "v16", "ts": "…", "pytest_total": null, "coverage_pct": null, "allowlist_entries": 6,
 "dual_shape_guards": 0, "silent_swallows": 78, "battery_red_claims": null}
```

(`allowlist_entries: 6` = E6's in-flight trimmed allowlist — auto-derive reports the live file at invocation time, which is what the coordinator wants at round close.) Duplicate guard verified: second invocation of the same round → `ERROR: round 'v16' already recorded … rc=1`; `--out /tmp/...` write + `json.loads` round-trip = valid JSONL. **Suggested close invocation:** `python scripts/round_metrics.py --round v16 --pytest-total <N> --coverage <F> --battery-red <N>`.

## Task 4 — scripts/check_careful.sh + .githooks/pre-push — DONE

**check_careful.sh** (129 lines, standalone, agent/human-facing): greps ONE command string (argv or stdin) for one-way-door patterns and exits 1 with a bilingual explanation + "document it in the decisions ledger first" escape protocol; exit 0 safe; exit 2 empty usage. Patterns: `git filter-repo` (owner-protocol-only, dec-git-history-secrets) · `alembic downgrade` (forward-only doctrine) · `DROP TABLE/DATABASE|TRUNCATE` unless the command explicitly targets `/tmp` or a test file · `rm` with recursive+force flags whose targets are absolute/`~`/`$HOME` **outside the repo root** (segments split on `; | && ||`, quoting peeled, relative targets assumed in-repo — documented heuristic).

```
[alembic downgrade 003]→rc=1  [psql -c 'DROP TABLE users']→rc=1  [TRUNCATE orders]→rc=1
[rm -rf /var/lib/data]→rc=1   [rm -rf /home/z/other-project]→rc=1 [rm -fr ~/some-dir]→rc=1
[rm -rf fb_dashboard/frontend/.next]→rc=0 (in-repo)   [DROP TABLE test_users]→rc=0 (test)
[TRUNCATE /tmp/db.sqlite]→rc=0 (/tmp)   [cd /tmp && rm -rf build]→rc=0 (relative target)
[pytest -q]→rc=0  [git push origin main]→rc=0 (normal push — pre-push's job)  [git reset --hard]→rc=0 (not a mandated pattern)
echo "alembic downgrade base" | bash scripts/check_careful.sh → rc=1 (stdin mode) ; empty → rc=2 (usage) ; 0.007s
```

**.githooks/pre-push** (72 lines, executable): reads the push ref lines from stdin; protects `main` + the remote default branch. DENIES (exit 1, Arabic+English one-way-door message): **deleting** the protected branch (`local_sha` zero, remote real) and **non-fast-forward (force) updates** of the protected branch — detected via `git merge-base --is-ancestor`, so `git push --force`/`-f` to main is caught regardless of flag spelling — **unless** the push command itself carries `--force-with-lease` (read best-effort from `/proc/$PPID/cmdline`; unreadable ⇒ conservative deny of force, never of normal pushes). Normal FF pushes, new-branch pushes, tag pushes, and force pushes to non-main branches all pass. **0.004s.**

```
1. FF push to main ……………… rc=0     5. force to non-main branch … rc=0
2. delete main …………………… rc=1 ✗   6. empty stdin …………………… rc=0
3. force to main, no lease …… rc=1 ✗   7. new branch (remote ZERO) … rc=0
4. force to main + --force-with-lease → rc=0 (lease detected from parent cmdline)
8. tag push …………………………… rc=0
```

**Wired:** `git config core.hooksPath .githooks` executed (local config, not a tracked-file change) + `chmod +x .githooks/pre-push scripts/check_careful.sh`. Verified: `git config core.hooksPath` → `.githooks`.

## Task 5 — round.env + ROUND parameterization + evidence fingerprint — DONE

- **`scripts/round.env`**: `ROUND=v16` (one line + comment). gate_all.sh sources it with a `v16` fallback when absent/empty (verified by harness: env present → v16; env absent → v16).
- **Readiness gate [6] de-hardcoded** (`gate_all.sh:293-354`): round plan resolved by glob `smartbot-world-class-${ROUND}-plan-*.md` (finds `…v16-plan-2026-09-09.md`); D/E report counts read `audit-reports/${ROUND}-{D,E}*.md` (currently 7 D / 3 E); docs markers are now `docs/INDEX.md:${ROUND}`, `README.md:${ROUND}`, `CLAUDE.md:${ROUND} Conventions`, `docs/deployment.md:إجراءات المالك الإلزامية بعد ${ROUND}` (dec-cron-restore marker unchanged). All other gate behavior byte-identical.
- **Evidence fingerprint (G6):** on an ALL-GREEN run the gate writes `docs/evidence/gate-run.json` `{ts, head, wtree_sha, round}` where `wtree_sha = sha256(git-status-porcelain ‖ HEAD)` (`_wtree_sha`, `gate_all.sh:40-43`). In readiness 6b, a PREVIOUS run's fingerprint is compared to the live one — **mismatch ⇒ `⚠️ ADVISORY (G6) evidence fingerprint: MISMATCH …` printed only** (no FAILURES entry, no blocker — advisory this round per mandate; hard-blocking is a post-v16 decision). Harness proof: write → match ✓ → simulated worktree change → mismatch warning path fires ✓ → JSON valid ✓.
- `bash -n scripts/gate_all.sh` (final, post-fix) → syntax OK. `ruff check scripts` → clean (gate 1 scope includes scripts/; the two new .py files pass E/F/W/I/B/UP at line-length 100).

---

## Noteworthy decisions & coordinator notes

1. **Placement of slop-scan = gate 1.5 (after ruff), not the plan's "5.8"** — the direct E7 mandate explicitly says "runs after ruf; exit 0 always", which supersedes the plan doc's numbering label. Same behavior, earlier visibility, zero gate cost.
2. **Gate 14-D-report expectation**: the soft (non-blocking) `⚠️ expected 14 diagnostic reports (v15-class baseline)` line now says `for v16` — v16 ran **7** diagnosticians by design, so the merge-time gate WILL print this advisory ⚠️. It is informational only (never a blocker); kept as the historical v15-class baseline rather than silently re-basing it.
3. **Readiness docs markers now require `v16`** — the full gate will (correctly) BLOCK until the coordinator round-updates INDEX/README/CLAUDE/deployment at close; that is the parameterized intent (docs not round-updated ⇒ no push), identical to v15's semantics with the round now flowing from round.env.
4. **allowlist auto-derive reads E6's live file** (`fb_dashboard/frontend/e2e/sim/fixtures/sim-findings.json` — the plan's `e2e/…` path resolves under `fb_dashboard/frontend/`; both probed) — currently 6 entries mid-E6; the v15 SEED keeps the documented 12.
5. **gate-run.json semantics:** it is (re)written ONLY on all-green runs; the 6b advisory compares against the LAST green run, so a dirty/post-commit worktree surfaces as "re-run the full gate before pushing" — advisory in v16, candidate for hard-block later (as the plan's 6b intends once proven stable).
6. **E4→E7 contract (worklog §E4):** bundle AFTER table pinned — gate 4.6 will re-measure the merge build; the 186.3 gz PASS with 3.7KB headroom is the bar the coordinator's full gate enforces.
7. Full gate_all.sh NOT run (parallel in-flight edits) per mandate — validated via `bash -n` + isolated logic harnesses + standalone runs of every new script; merge-time full run belongs to the coordinator.
