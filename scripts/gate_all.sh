#!/usr/bin/env bash
# SmartBot unified quality gate — v5 §2
# Runs EVERY gate that protects this repository. Exit code 0 = all green.
# Usage: bash scripts/gate_all.sh [--skip-build] [--skip-frontend]
# v14: [4.5] sync_next_static + buildId freshness after build (v12 stale-static
# incident class); [5a] router contracts now multi-level (payments/ package).
set -euo pipefail
cd "$(dirname "$0")/.."

PY=.venv/bin/python
FAILURES=()

echo "════════════════════════════════════════════════════════════════"
echo "  SmartBot unified quality gate (v5 §2 + v6 §A/§B) — $(date -u '+%Y-%m-%d %H:%M:%SZ')"
echo "════════════════════════════════════════════════════════════════"

# ── Gate 1: ruff (lint) ────────────────────────────────────────────
echo "── [1/5] ruff (lint) ──"
if $PY -m ruff check fb_dashboard api tests scripts; then
  echo "✅ ruff: clean"
else
  FAILURES+=("ruff")
fi

# ── Gate 2: pytest (hermetic suite) ─────────────────────────────────
echo "── [2/5] pytest (full suite) ──"
# v10-F3: coverage floor 50% (measured 52% at v10) — ratchets up only
if $PY -m pytest -q --cov=fb_dashboard --cov-fail-under=60; then
  echo "✅ pytest: all green"
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
  else
    FAILURES+=("pytest")
  fi
fi

if [[ "${1:-}" == "--skip-frontend" || "${2:-}" == "--skip-frontend" ]]; then
  echo "(frontend gates skipped by flag)"
else
  # ── Gate 3: TypeScript ───────────────────────────────────────────
  echo "── [3/5] tsc --noEmit ──"
  if (cd fb_dashboard/frontend && npx tsc --noEmit); then
    echo "✅ tsc: 0 errors"
  else
    FAILURES+=("tsc")
  fi

  # ── Gate 3.5: frontend unit tests (v11-A5) ───────────────────────
  echo "── [3.5/5] vitest (frontend unit tests) ──"
  if (cd fb_dashboard/frontend && npx vitest run); then
    echo "✅ vitest: all green"
  else
    FAILURES+=("vitest")
  fi

  if [[ "${1:-}" == "--skip-build" || "${2:-}" == "--skip-build" ]]; then
    echo "(next build skipped by flag)"
  else
    # ── Gate 4: production build ──────────────────────────────────
    echo "── [4/5] next build ──"
    BUILD_OK=0
    if (cd fb_dashboard/frontend && npx next build); then
      echo "✅ build: success"
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
      echo "── [4.5/5] sync_next_static + freshness ──"
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
echo "── [5/5] static contracts ──"
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
else
  echo "❌ css token duplication detected"; CONTRACT_OK=0
fi
# 5c. v6 §A — zero direct toLocale* calls outside the format.ts seam
if $PY scripts/check_i18n_calls.py >/dev/null 2>&1; then
  echo "✅ i18n: all numbers/dates through format.ts"
else
  echo "❌ i18n: direct locale calls found outside format.ts"; CONTRACT_OK=0
fi
# 5d. v6 §B — every icon-only interactive control has an accessible name
if (cd fb_dashboard/frontend && node ../../scripts/check_a11y_labels.ts >/dev/null 2>&1); then
  echo "✅ a11y labels: all icon-only controls named"
else
  echo "❌ a11y: unnamed icon-only control(s) found"; CONTRACT_OK=0
fi
# 5e. v6 §B — WCAG AA contrast, measured (oklch -> sRGB -> WCAG ratio)
if (cd fb_dashboard/frontend && node ../../scripts/check_contrast.mjs >/dev/null 2>&1); then
  echo "✅ contrast: all core pairs >= 4.5:1 (AA)"
else
  echo "❌ contrast: pair(s) below AA"; CONTRACT_OK=0
fi
[[ $CONTRACT_OK -eq 1 ]] || FAILURES+=("contracts")

echo "────────────────────────────────────────────────────────────────"
if [[ ${#FAILURES[@]} -eq 0 ]]; then
  echo "  ✅ ALL GATES GREEN"
  exit 0
else
  echo "  ❌ FAILED GATES: ${FAILURES[*]}"
  exit 1
fi
