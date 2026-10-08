# v16-D7 — gstack Methodology Import (2026-09-09)

## Parity: SmartBot BEATS gstack on: decisions-ledger lifecycle, secret scan (NFKC+zero-width, its own source), sim-battery claim honesty (gstack has nothing comparable). Parity on readiness gate shape, adversarial waves, investigate Iron Law.

## Adopt list (gapped methods)
1. **G1 slop-scan (S/HIGH):** scripts/slop_scan.py — 3 SmartBot rules: dual-shape guards after unwrapApi · except→pass/continue/return-None counter · ?? [] after unwrapApi. Informational only (never gates). Live sample found: **2 NEW dual-shape guards in admin/telegram/page.tsx:94,122 (regressions of closed dec-envelope-prune) + dead branch plan-comparison.ts:53-57** (features never a string repo-wide, models.py:681 JSON default list).
2. **G2 careful-mode hook (S/HIGH):** .githooks/pre-push + check_careful.sh — hard-deny force-push main, git filter-repo, alembic downgrade, DROP/TRUNCATE, rm -rf outside repo. Guards dec-git-history-secrets execution window.
3. **G3 round-metrics JSONL (S-M/HIGH):** docs/evidence/round-metrics.jsonl {round, pytest_total, coverage, allowlist_entries, expired_still_red, dual_shape_guards, silent_swallows, battery_red} + "Trends vs v15" report section. Auto-surfaces D3's audit class.
4. **G4 canary browser pass (M/MED-HIGH):** post-deploy battery section P: Playwright console-error/unhandledrejection hook on 4 routes vs committed baseline-console.json; optional --watch 10m. Catches D1-class (focus/hydration) + transient breaks a curl pass cannot see. NOT adopting full staged Vercel promote.
5. **G5 anti-anchoring + confidence gates (S/MED):** D-wave template: quote verbatim motivating line + confidence N/10 + verifiers get file:line only.
6. **G6 evidence fingerprint (S/MED):** gate writes evidence/gate-run.json {ts, head, wtree_sha}; readiness re-computes and BLOCKS on mismatch; parameterize ROUND_PLAN/SIM_ROUND from round.env (gate_all.sh:203 hardcodes v15).

## Slop sample on SmartBot: 249 except-Exception/62 files; 84 silent swallows (hotspots pipeline×10, engine×7, _observability×5, monitor×4, facebook_routes×4); 2 new dual-shape guards + 1 dead branch; 18 legitimate ?? []. Clean: 6 commented-out py lines, 0 console.log, 0 TODO/FIXME, 0 dead flags. Verdict: dramatically cleaner than gstack's own pre-cleanup baseline.
