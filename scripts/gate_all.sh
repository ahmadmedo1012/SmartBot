#!/usr/bin/env bash
# SmartBot unified quality gate — v5 §2
# Runs EVERY gate that protects this repository. Exit code 0 = all green.
# Usage: bash scripts/gate_all.sh [--skip-build] [--skip-frontend]
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
if $PY -m pytest -q; then
  echo "✅ pytest: all green"
else
  FAILURES+=("pytest")
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

  if [[ "${1:-}" == "--skip-build" || "${2:-}" == "--skip-build" ]]; then
    echo "(next build skipped by flag)"
  else
    # ── Gate 4: production build ──────────────────────────────────
    echo "── [4/5] next build ──"
    if (cd fb_dashboard/frontend && npx next build); then
      echo "✅ build: success"
    else
      FAILURES+=("build")
    fi
  fi
fi

# ── Gate 5: contracts that must never regress ───────────────────────
echo "── [5/5] static contracts ──"
CONTRACT_OK=1
# 5a. every router carries the response-contract note
MISSING_CONTRACT=$(grep -L '"success"' fb_dashboard/routers/*.py 2>/dev/null)
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
[[ $CONTRACT_OK -eq 1 ]] || FAILURES+=("contracts")

echo "────────────────────────────────────────────────────────────────"
if [[ ${#FAILURES[@]} -eq 0 ]]; then
  echo "  ✅ ALL GATES GREEN"
  exit 0
else
  echo "  ❌ FAILED GATES: ${FAILURES[*]}"
  exit 1
fi
