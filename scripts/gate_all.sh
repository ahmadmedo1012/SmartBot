#!/usr/bin/env bash
# SmartBot unified quality gate — v5 §2
# Runs EVERY gate that protects this repository. Exit code 0 = all green.
# Usage: bash scripts/gate_all.sh [--skip-build] [--skip-frontend]
# v14: [4.5] sync_next_static + buildId freshness after build (v12 stale-static
# incident class); [5a] router contracts now multi-level (payments/ package).
# v15-E9: [5.6] secret-scan (D11-G3 — NFKC/zero-width/entity-decode patterns,
# worktree-wide); [6] READINESS GATE (D11-G4) — before any push: a boxed
# REVIEWS/TESTS/DOCS summary; a failed gate BLOCKS the readiness verdict.
# v16-E7 (gstack import — D7 G1/G6 + D5 E-CI-4): [1.5] slop-scan DIAGNOSTIC
# (counts + hotspots + trend; exit 0 by doctrine — never gates); [4.6] bundle
# budget gate — scripts/measure_bundle.py wired in: common base gzip > 190KB
# HARD-FAILS the gate + an informational per-route route-extra table (the
# 60.6KB Next-infra share of the arm is not app-controllable — documented);
# [6] readiness now takes the round from scripts/round.env (ROUND) instead of
# a hardcoded v15, and cross-checks the evidence fingerprint in
# docs/evidence/gate-run.json (ADVISORY this round — a mismatch warns, does
# not fail). On an all-green run the gate WRITES gate-run.json
# {ts, head, wtree_sha, round} (wtree_sha = sha256 of porcelain + HEAD).
# v17-S5 (gstack import — D11-G2): [1.6] design-baseline INFORMATIONAL —
# seeds docs/evidence/design-baseline.json on the first run (pre-wave
# snapshot), later runs print the delta vs the held baseline (ratchet; the
# round-close re-seed is `--force`); never blocks by doctrine, and slop-scan
# [1.5] now carries the §D UI-slop rule counts (transition-all · bounce
# easing · multi-color glow · bare rounded · emoji icons).
set -euo pipefail
cd "$(dirname "$0")/.."

PY=.venv/bin/python
FAILURES=()
PASSED=()

# ── v16-E7 (G6): الجولة الحالية من scripts/round.env — لا تصلب v15 ──
# بوابة الجاهزية [6] تستعمل ${ROUND} لخطة الجولة وتقارير D/E وعلامات
# الوثائق. غياب الملف أو فراغ القيمة = التراجع إلى v16 (سقف هذه الجولة).
ROUND="v16"
if [[ -f scripts/round.env ]]; then
  # shellcheck source=scripts/round.env
  . scripts/round.env
fi
ROUND="${ROUND:-v16}"

# ── v16-E7 (G6): بصمة الأدلة — sha256(نص حالة شجرة العمل + HEAD) ──
# تُكتب في docs/evidence/gate-run.json عند النجاح، وتُقارن (advisory) في
# بوابة الجاهزية 6b: اختلافها = شجرة العمل تغيرت منذ آخر اخضرار موثق.
_wtree_sha() {
  printf '%s%s' "$(git status --porcelain 2>/dev/null)" "$(git rev-parse HEAD 2>/dev/null)" \
    | sha256sum | awk '{print $1}'
}

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

# ── Gate 1.5: slop-scan (v16-E7 · D7-G1) — تشخيصي لا يحجب أبداً ──────
# عقيدة gstack: الماسح يطبع عدادات القواعد الثلاث (حراس الشكل المزدوج
# بعد unwrapApi · الابتلاع الصامت · خرق الفك المركزي) وبؤرها الساخنة
# واتجاهها مقابل آخر سجل في docs/evidence/round-metrics.jsonl — exit 0
# دائماً حتى عند خلل السكربت نفسه: البوابة لا تتحقق بشيء هنا (الفائدة
# الاتجاه فقط؛ المقاييس تُسجل عند إغلاق الجولة بـ round_metrics.py).
echo "── [1.5/6] slop-scan (diagnostic — never blocks) ──"
if $PY scripts/slop_scan.py; then
  echo "✅ slop-scan: completed (diagnostic)"
else
  echo "⚠️  slop-scan: script error — ignored (diagnostic by doctrine)"
fi

# ── Gate 1.6: design-baseline (v17-S5 · D11-G2) — معلوماتي، لا يحجب ──
# يقيس خط أساس التصميم من المصدر (PageHeader/الحقول الخام to-white/
# useCountUp + قسم D من slop-scan) ويطبع درجة A-F مركبة. أول تشغيل
# «يبذر» docs/evidence/design-baseline.json (حالة ما قبل موجة E موثقة)؛
# التشغيلات التالية تطبع دلتا مقابل الأساس دون تحديثه (ratchet — إعادة
# البذر المقصودة عند إغلاق الجولة بـ --force من المكتّب). عقيدة أول
# جولة: الدرجة لا تحجب أبداً حتى لو كانت F — القيمة في الاتجاه فقط،
# تماماً مثل slop-scan؛ حتى خلل السكربت نفسه يُتجاهل (معلوماتي حصراً).
echo "── [1.6/6] design-baseline (informational — seeds on first run, never blocks) ──"
if $PY scripts/design_baseline.py; then
  echo "✅ design-baseline: measured (informational)"
else
  echo "⚠️  design-baseline: script error — ignored (informational by doctrine)"
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

    # ── Gate 4.6: bundle budget (v16-E7 · D5 — closes E-CI-4) ───────
    # dec-js-budget العقد الصارم: الأساس المشترك المضغوط ≤ 190KB gz —
    # خروجه يُحمرّ البوابة (القياس الحالي 186.3gz — لا تعديل للعتبة).
    # الحسم مزدوج الصمود: رمز خروج measure_bundle (2 = تجاوز الميزانية)
    # + تحليل نصي لسطر budget check، مع إعادة حساب احتياطية من سطر
    # COMMON BASE إن انزلق تنسيق المخرجات (فشل مغلق: ما لم يُثبت PASS
    # إيجابياً فالحكم FAIL). جدول route-extra معلوماتي — 60.6KB منه
    # بنية Next غير قابلة للتحكم على مستوى التطبيق (موثق بتأجيل صريح).
    if [[ $BUILD_OK -eq 1 ]]; then
      echo "── [4.6/6] measure_bundle (common base gz ≤ 190KB — HARD GATE) ──"
      _MB_RC=0
      _MB_OUT=$($PY scripts/measure_bundle.py 2>&1) || _MB_RC=$?
      printf '%s\n' "$_MB_OUT"
      _BUDGET_LINE=$(printf '%s\n' "$_MB_OUT" | grep -i 'budget check' | tail -n 1 || true)
      _BASE_RAW=$(printf '%s\n' "$_MB_OUT" | awk '/^COMMON BASE/ {print $3}' | tail -n 1)
      _BASE_GZ=$(printf '%s\n' "$_MB_OUT" | awk '/^COMMON BASE/ {print $4}' | tail -n 1)
      _VERDICT="UNPARSED"
      case "$_BUDGET_LINE" in
        *PASS*) _VERDICT="PASS" ;;
        *FAIL*) _VERDICT="FAIL" ;;
      esac
      _BUDGET_OK=0
      if [[ $_MB_RC -eq 0 && "$_VERDICT" == "PASS" ]]; then
        _BUDGET_OK=1
      elif [[ $_MB_RC -eq 0 && "$_VERDICT" == "UNPARSED" && -n "$_BASE_GZ" ]]; then
        # انزلاق تنسيق: أعد الحساب من سطر COMMON BASE مباشرة
        if awk -v v="$_BASE_GZ" 'BEGIN {exit (v <= 190) ? 0 : 1}'; then
          _BUDGET_OK=1
          echo "ℹ️  budget line unparsed — recomputed from COMMON BASE gz ${_BASE_GZ}KB ≤ 190"
        fi
      fi
      if [[ $_BUDGET_OK -eq 1 ]]; then
        echo "✅ bundle budget: common base ${_BASE_RAW:-?}KB raw / ${_BASE_GZ:-?}KB gz ≤ 190KB"
        PASSED+=("bundle-budget")
        # جدول route-extra (معلوماتي فقط): ما يدفعه كل مسار فوق الأساس
        if [[ -n "$_BASE_RAW" && -n "$_BASE_GZ" ]]; then
          printf '%s\n' "$_MB_OUT" | awk -v BR="$_BASE_RAW" -v BG="$_BASE_GZ" '
            /^route[[:space:]]+raw/ { intab = 1; print "    route-extra (per-route total − common base):"; next }
            /^COMMON BASE/ { intab = 0 }
            intab && NF >= 3 { printf "    %-16s raw %+.1f KB · gz %+.1f KB\n", $1, $2 - BR, $3 - BG }
          '
        fi
      else
        echo "❌ bundle budget: common base gz > 190KB (rc=$_MB_RC verdict=$_VERDICT base_gz=${_BASE_GZ:-unparsed}) — dec-js-budget breach"
        FAILURES+=("bundle-budget")
      fi
    else
      echo "(measure_bundle skipped — build failed)"
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
# v16-E7 (G6): خطة الجولة من ${ROUND} (glob — بلا تصلب تاريخ v15)
ROUND_PLAN=""
for _plan in smartbot-world-class-${ROUND}-plan-*.md; do
  if [[ -f "$_plan" ]]; then
    ROUND_PLAN="$_plan"
  fi
done
READINESS_BLOCKERS=0

# ─ 6a. REVIEWS ──────────────────────────────────────────────────────
D_REPORTS=$(ls audit-reports/${ROUND}-D*.md 2>/dev/null | wc -l | tr -d ' ' || true)
E_REPORTS=$(ls audit-reports/${ROUND}-E*.md 2>/dev/null | wc -l | tr -d ' ' || true)
echo "  [REVIEWS]"
if [[ -f "$ROUND_PLAN" ]]; then
  echo "    round plan: $ROUND_PLAN — present"
else
  echo "    ❌ round plan MISSING: smartbot-world-class-${ROUND}-plan-*.md"
  READINESS_BLOCKERS=$((READINESS_BLOCKERS+1))
fi
echo "    diagnostic reports: ${D_REPORTS} (${ROUND}-D*) · execution reports: ${E_REPORTS} (${ROUND}-E*)"
if [[ "$D_REPORTS" -lt 14 ]]; then
  echo "    ⚠️  expected 14 diagnostic reports (v15-class baseline) for ${ROUND} — found $D_REPORTS"
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
# بصمة الأدلة (v16-E7 · G6 — advisory هذه الجولة): هل شجرة العمل الحالية
# هي نفسها التي اخضرّت في آخر تشغيل موثق (docs/evidence/gate-run.json)؟
# عند عدم التطابق: تحذير BLOCKED معلوماتي فقط — لا يُحمرّ التقرير في
# v16 (موثّق كـ advisory؛ التشدد يُقرر بعد استقرار الجولات المتتالية).
if [[ -f docs/evidence/gate-run.json ]]; then
  _WTREE_NOW=$(_wtree_sha)
  _WTREE_RECORDED=$($PY -c 'import json; print(json.load(open("docs/evidence/gate-run.json", encoding="utf-8")).get("wtree_sha", ""))' 2>/dev/null || true)
  if [[ -n "$_WTREE_RECORDED" && "$_WTREE_RECORDED" != "$_WTREE_NOW" ]]; then
    echo "    ⚠️  ADVISORY (G6) evidence fingerprint: MISMATCH — worktree/HEAD changed since the last green gate run; re-run the full gate before pushing"
  elif [[ -n "$_WTREE_RECORDED" ]]; then
    echo "    ✓ evidence fingerprint matches the last green gate run (gate-run.json)"
  fi
else
  echo "    ℹ️  evidence fingerprint: no docs/evidence/gate-run.json yet (first gate run)"
fi

# ─ 6c. DOCS ──────────────────────────────────────────────────────────
# فحوص حيوية: وثائق الجولة محدّثة فعلاً (لا أرقام متقادمة تمر الدفع)
echo "  [DOCS]"
_docs_checks=(
  "docs/INDEX.md:${ROUND}"
  "README.md:${ROUND}"
  "CLAUDE.md:${ROUND} Conventions"
  "docs/deployment.md:إجراءات المالك الإلزامية بعد ${ROUND}"
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
  # v16-E7 (G6): عند النجاح فقط — تُكتب بصمة الأدلة لهذه اللحظة
  # {ts, head, wtree_sha, round}؛ جولة الدمج التالية تقارنها قبل الدفع
  # (advisory) فيتضح إن تغيرت الشجرة بعد آخر اخضرار موثق.
  mkdir -p docs/evidence
  _GATE_TS=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  _GATE_HEAD=$(git rev-parse HEAD 2>/dev/null || echo unknown)
  _GATE_WTREE=$(_wtree_sha)
  printf '{\n  "ts": "%s",\n  "head": "%s",\n  "wtree_sha": "%s",\n  "round": "%s"\n}\n' \
    "$_GATE_TS" "$_GATE_HEAD" "$_GATE_WTREE" "$ROUND" > docs/evidence/gate-run.json
  echo "  ℹ️  evidence fingerprint written → docs/evidence/gate-run.json (round ${ROUND})"
  exit 0
else
  echo "  ❌ FAILED GATES: ${FAILURES[*]:-none} · READINESS BLOCKERS: $READINESS_BLOCKERS"
  exit 1
fi
