#!/usr/bin/env bash
# SmartBot unified quality gate — v5 §2
# Runs EVERY gate that protects this repository. Exit code 0 = all green.
# Usage: bash scripts/gate_all.sh [--skip-build] [--skip-frontend]
# v14: [4.5] sync_next_static + buildId freshness after build (v12 stale-static
# incident class); [5a] router contracts now multi-level (payments/ package).
# v15-E9: [5.6] secret-scan (D11-G3 — NFKC/zero-width/entity-decode patterns,
# worktree-wide); [6] READINESS GATE (D11-G4) — before any push: a boxed
# REVIEWS/TESTS/DOCS summary; a failed gate BLOCKS the readiness verdict.
set -euo pipefail
cd "$(dirname "$0")/.."

PY=.venv/bin/python
FAILURES=()
PASSED=()

echo "════════════════════════════════════════════════════════════════"
echo "  SmartBot unified quality gate (v5 §2 + v6 §A/§B) — $(date -u '+%Y-%m-%d %H:%M:%SZ')"
echo "════════════════════════════════════════════════════════════════"

# ── Gate 1: ruff (lint) ────────────────────────────────────────────
echo "── [1/6] ruff (lint) ──"
if $PY -m ruff check fb_dashboard api tests scripts; then
  echo "✅ ruff: clean"
  PASSED+=("ruff")
else
  FAILURES+=("ruff")
fi

# ── Gate 2: pytest (hermetic suite) ─────────────────────────────────
echo "── [2/6] pytest (full suite) ──"
# v10-F3: coverage floor 50% (measured 52% at v10) — ratchets up only
# v15-E9: floor comment corrected — the flag enforces 60 (measured 61.77%)
if $PY -m pytest -q --cov=fb_dashboard --cov-fail-under=60; then
  echo "✅ pytest: all green"
  PASSED+=("pytest")
else
  # v13: ONE transparent retry for the documented in-memory-StaticPool
  # flake class ("database is locked" — fire-and-forget sweep tasks from a
  # previous beat colliding with the next test's write on the ONE shared
  # connection; production is PostgreSQL + NullPool and unaffected — see
  # docs/reports/v13-world-class-report.md §flakes). A second consecutive
  # failure still fails the gate.
  echo "⚠️  pytest failed once — retrying (known in-memory flake class, see v13 report)…"
  if $PY -m pytest -q --cov=fb_dashboard --cov-fail-under=60; then
    echo "✅ pytest: green on documented-flake retry"
    PASSED+=("pytest(retry)")
  else
    FAILURES+=("pytest")
  fi
fi

if [[ "${1:-}" == "--skip-frontend" || "${2:-}" == "--skip-frontend" ]]; then
  echo "(frontend gates skipped by flag)"
else
  # ── Gate 3: TypeScript ───────────────────────────────────────────
  echo "── [3/6] tsc --noEmit ──"
  if (cd fb_dashboard/frontend && npx tsc --noEmit); then
    echo "✅ tsc: 0 errors"
    PASSED+=("tsc")
  else
    FAILURES+=("tsc")
  fi

  # ── Gate 3.5: frontend unit tests (v11-A5) ───────────────────────
  echo "── [3.5/6] vitest (frontend unit tests) ──"
  if (cd fb_dashboard/frontend && npx vitest run); then
    echo "✅ vitest: all green"
    PASSED+=("vitest")
  else
    FAILURES+=("vitest")
  fi

  if [[ "${1:-}" == "--skip-build" || "${2:-}" == "--skip-build" ]]; then
    echo "(next build skipped by flag)"
  else
    # ── Gate 4: production build ──────────────────────────────────
    echo "── [4/6] next build ──"
    BUILD_OK=0
    if (cd fb_dashboard/frontend && npx next build); then
      echo "✅ build: success"
      PASSED+=("build")
      BUILD_OK=1
    else
      FAILURES+=("build")
    fi

    # ── Gate 4.5: sync + freshness of fb_dashboard/static (v14) ──
    # v12 incident (docs/reports/v12-world-class-report.md §0.1): the
    # api-domain served an OLD build because scripts/sync_next_static.py
    # was forgotten after `next build` (a class that already fired once).
    # The gate now syncs deterministically AFTER a successful build, then
    # verifies the synced buildId matches .next/BUILD_ID — and refuses
    # accumulated stale generations.
    if [[ $BUILD_OK -eq 1 ]]; then
      echo "── [4.5/6] sync_next_static + freshness ──"
      if $PY scripts/sync_next_static.py; then
        _BID_FILE=fb_dashboard/frontend/.next/BUILD_ID
        if [[ -f "$_BID_FILE" ]]; then
          _BID=$(<"$_BID_FILE")
          if [[ -d "fb_dashboard/static/_next/static/$_BID" ]]; then
            # anything that is not the CURRENT buildId/chunks/media is a
            # leftover generation from an older build
            _STALE=$(cd fb_dashboard/static/_next/static \
                      && ls -1 | grep -v -x -e "$_BID" -e chunks -e media || true)
            if [[ -n "$_STALE" ]]; then
              echo "❌ static freshness: stale generation(s) present: $_STALE"
              FAILURES+=("static-freshness")
            else
              echo "✅ static freshness: synced buildId $_BID"
              PASSED+=("static-freshness")
              # informational only: refreshed static must be committed before
              # pushing — the api-domain serves it from the repo
              if [[ -n "$(git status --porcelain -- fb_dashboard/static)" ]]; then
                echo "ℹ️  fb_dashboard/static refreshed — commit it before pushing"
              fi
            fi
          else
            echo "❌ static freshness: buildId $_BID (.next/BUILD_ID) missing from fb_dashboard/static/_next/static"
            FAILURES+=("static-freshness")
          fi
        else
          echo "⚠️  no .next/BUILD_ID — static freshness not verified"
        fi
      else
        echo "❌ sync_next_static failed"
        FAILURES+=("sync-static")
      fi
    else
      echo "(sync_next_static skipped — build failed)"
    fi
  fi
fi

# ── Gate 5: contracts that must never regress ───────────────────────
echo "── [5/6] static contracts ──"
CONTRACT_OK=1
# 5a. every router carries the response-contract note
# v11: the contract evidence is EITHER an inline "success" envelope (legacy/
# documented extended envelopes) OR the canonical helpers from _responses
# (ok/fail) — after the v11 unification most routers use the helpers only.
# v14: MULTI-LEVEL — the decomposed routers/payments/ package (v13-L4) is
# covered too. Documented exemptions (see the routers package docstring):
# payments/__init__.py (pure include aggregator — no endpoints; its five
# modules each carry ok()) and payments/sse.py (text/event-stream byte-stream).
_CONTRACT_EXEMPT=' fb_dashboard/routers/payments/__init__.py fb_dashboard/routers/payments/sse.py '
MISSING_CONTRACT=""
while IFS= read -r _r; do
  [[ "$_CONTRACT_EXEMPT" == *" $_r "* ]] && continue
  if ! grep -q '"success"' "$_r" && ! grep -q '_responses import' "$_r"; then
    MISSING_CONTRACT="$MISSING_CONTRACT $_r"
  fi
done < <(find fb_dashboard/routers -name '*.py' -type f | LC_ALL=C sort)
if [[ -n "$MISSING_CONTRACT" ]]; then
  echo "❌ router(s) missing the response contract: $MISSING_CONTRACT"; CONTRACT_OK=0
fi
# 5b. no duplicated CSS custom property per mode (v4 §1 gate)
if $PY scripts/check-css-token-duplication.py >/dev/null 2>&1; then
  echo "✅ css tokens: no duplication"
  PASSED+=("css-tokens")
else
  echo "❌ css token duplication detected"; CONTRACT_OK=0
fi
# 5c. v6 §A — zero direct toLocale* calls outside the format.ts seam
if $PY scripts/check_i18n_calls.py >/dev/null 2>&1; then
  echo "✅ i18n: all numbers/dates through format.ts"
  PASSED+=("i18n")
else
  echo "❌ i18n: direct locale calls found outside format.ts"; CONTRACT_OK=0
fi
# 5d. v6 §B — every icon-only interactive control has an accessible name
if (cd fb_dashboard/frontend && node ../../scripts/check_a11y_labels.ts >/dev/null 2>&1); then
  echo "✅ a11y labels: all icon-only controls named"
  PASSED+=("a11y-labels")
else
  echo "❌ a11y: unnamed icon-only control(s) found"; CONTRACT_OK=0
fi
# 5e. v6 §B — WCAG AA contrast, measured (oklch -> sRGB -> WCAG ratio)
if (cd fb_dashboard/frontend && node ../../scripts/check_contrast.mjs >/dev/null 2>&1); then
  echo "✅ contrast: all core pairs >= 4.5:1 (AA)"
  PASSED+=("contrast")
else
  echo "❌ contrast: pair(s) below AA"; CONTRACT_OK=0
fi
[[ $CONTRACT_OK -eq 1 ]] || FAILURES+=("contracts")

# ── Gate 5.6: secret-scan (v15-E9 · D11-G3) ──────────────────────────
# مسح الشجرة كلها بأنماط NFKC+zero-width+entity-decode — صنف حادثة
# fb_dashboard/.env (D6-H1). --staged (diff vs HEAD) موجود للمطور قبل
# الدفع؛ هنا نمسح كل الشجرة (بوابة الجولة: دفعة واحدة).
echo "── [5.6/6] secret-scan ──"
if $PY scripts/secret_scan.py; then
  PASSED+=("secret-scan")
else
  FAILURES+=("secret-scan")
fi

# ── Gate 6: READINESS GATE (v15-E9 · D11-G4) ─────────────────────────
# تقرير جاهزية صندوقي قبل أي دفع: REVIEWS / TESTS / DOCS — كل قسم يعيد
# ملخصاً؛ أي بوابة فاشلة = READINESS: BLOCKED (الخروج 1). لا «أخضر» بلا
# استيفاء الأقسام الثلاثة — لا يُقبل التقرير الذاتي (gstack readiness-gate).
echo "── [6/6] readiness (REVIEWS / TESTS / DOCS) ──"
ROUND_PLAN="smartbot-world-class-v15-plan-2026-09-08.md"
READINESS_BLOCKERS=0

# ─ 6a. REVIEWS ──────────────────────────────────────────────────────
D_REPORTS=$(ls audit-reports/v15-D*.md 2>/dev/null | wc -l | tr -d ' ')
E_REPORTS=$(ls audit-reports/v15-E*.md 2>/dev/null | wc -l | tr -d ' ')
echo "  [REVIEWS]"
if [[ -f "$ROUND_PLAN" ]]; then
  echo "    round plan: $ROUND_PLAN — present"
else
  echo "    ❌ round plan MISSING: $ROUND_PLAN"
  READINESS_BLOCKERS=$((READINESS_BLOCKERS+1))
fi
echo "    diagnostic reports: ${D_REPORTS} (v15-D*) · execution reports: ${E_REPORTS} (v15-E*)"
if [[ "$D_REPORTS" -lt 14 ]]; then
  echo "    ⚠️  expected 14 diagnostic reports for v15 — found $D_REPORTS"
fi

# ─ 6b. TESTS ─────────────────────────────────────────────────────────
echo "  [TESTS]"
if [[ ${#PASSED[@]} -gt 0 ]]; then
  echo "    gates passed this run: ${PASSED[*]}"
else
  echo "    (no gates passed yet — frontend gates skipped?)"
fi
if [[ ${#FAILURES[@]} -gt 0 ]]; then
  echo "    ❌ gates failed this run: ${FAILURES[*]}"
  READINESS_BLOCKERS=$((READINESS_BLOCKERS+1))
else
  echo "    gates failed this run: none"
fi

# ─ 6c. DOCS ──────────────────────────────────────────────────────────
# فحوص حيوية: وثائق الجولة محدّثة فعلاً (لا أرقام متقادمة تمر الدفع)
echo "  [DOCS]"
_docs_checks=(
  "docs/INDEX.md:v15"
  "README.md:v15"
  "CLAUDE.md:v15 Conventions"
  "docs/deployment.md:إجراءات المالك الإلزامية بعد v15"
  "docs/decisions-ledger.md:dec-cron-restore"
)
for _pair in "${_docs_checks[@]}"; do
  _file="${_pair%%:*}"; _marker="${_pair#*:}"
  if [[ -f "$_file" ]] && grep -q "$_marker" "$_file"; then
    echo "    ✓ $_file carries '$_marker'"
  else
    echo "    ❌ $_file missing marker '$_marker' — docs not round-updated"
    READINESS_BLOCKERS=$((READINESS_BLOCKERS+1))
  fi
done

# ─ 6d. Verdict ──────────────────────────────────────────────────────
if [[ $READINESS_BLOCKERS -eq 0 && ${#FAILURES[@]} -eq 0 ]]; then
  echo "  ✅ READINESS: READY — reviews in place, all gates green, docs current"
else
  echo "  ❌ READINESS: BLOCKED ($READINESS_BLOCKERS doc/section blocker(s) + ${#FAILURES[@]} failed gate(s)) — DO NOT PUSH"
fi

echo "────────────────────────────────────────────────────────────────"
if [[ ${#FAILURES[@]} -eq 0 && $READINESS_BLOCKERS -eq 0 ]]; then
  echo "  ✅ ALL GATES GREEN — readiness READY"
  exit 0
else
  echo "  ❌ FAILED GATES: ${FAILURES[*]:-none} · READINESS BLOCKERS: $READINESS_BLOCKERS"
  exit 1
fi
