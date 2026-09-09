#!/usr/bin/env bash
# v16-E6 (تصميم D3 §6) — بطارية المحاكاة المحلية v16 الكاملة (14 شخصية)
#
# الوظيفة (من نسخة v15-E8 حرفياً): يقلع الخادمين (uvicorn + next start
# بوكيل) على قاعدة SQLite نظيفة (v16-sim.db) ثم يشغّل بطارية Playwright
# كاملة (p01→p14) ثم يطفئ الخوادم نظيفاً — مع تقرير عربي لكل شخصية +
# **خروج مركّب صادق**: exit = playwright_exit || claims_exit.
#
# جديد v16 على نمط v15 (صدق البطارية — إصلاحا D3):
#   1. كاشف الانقلاب مُصلَح: v15 كان يقرأ '"findingClosed": *true' من
#      sim-findings-live.json بينما db-claims.mjs يكتب هناك سطور
#      {status:'findingClosed', …} → العدّاد صفر دائماً بنيوياً. الآن
#      نقرأ الصيغة الفعلية: status=findingClosed من الملف الحي (+ عرض
#      معرّفات المنقلبة لحذفها من قائمة السماح).
#   2. SIM_ROUND تصدَّر فعلياً: من scripts/round.env (ROUND=v16 — يبذره
#      E7) وإلا v16 صريحة. db-claims.mjs يقرؤها فيعضّ TTL إدخالات
#      expires (كان عالقاً في v15: 10/12 إدخالات منتهية ظلت تُطبَّق).
#   3. قائمة السماح (sim-findings.json) مقلَّمة v16-E6: 6 إدخالات —
#      3 عائلة R3 بexpires=prod (قياس إنتاج بتوكن Graph حي) + 3 إدخالات
#      expires=v16 «أثبت-ثم-احذف» (p13-ssrf-receipt-dns/p12-wizard-focus/
#      p11-rtl-tab-order — إصلاحات E2/E3 هذه الجولة): تنقلب أخضر →
#      الكاشف أعلاه يعلنها → يحذفها المنسّق فيصبح العقد صارماً.
#   4. الحارس المتزامن 409 والإنفاذ والادعاءات كما في v15 (SIM_STRICT_409=1
#      وSIM_ENFORCE_CLAIMS=1 افتراضياً) + p14 بتدوير الأسرار منتصف الجولة.
#
# ملاحظة توافق: متغيرات V15_BACKEND_ENV/V15_SIM_API_PORT/V15_SIM_DB/
# V15_ROTATE_SCRIPT تصدَّر بأسمائها القديمة عمداً — sim-p14-secret-rotation
# وscripts/v15_sim_rotate_secret.sh يقرآنها حرفياً (قيمها v16).
#
# التشغيل من جذر المستودع:
#   bash scripts/v16_sim_local_battery.sh
# متغيرات:
#   SIM_STRICT_409=0        — تليين قفل p06 (تشخيص فقط)
#   SIM_ROUND               — تُحترم إن صُدِّرت خارجياً (وإلا round.env/v16)
#   V16_SIM_FRONT_PORT      — منفذ الواجهة (افتراضي 3200)
#   V16_SIM_API_PORT        — منفذ الخلفية (افتراضي 8000)
#   SKIP_FRONT_BUILD=1      — لا يبني الواجهة (تشخيص فقط)
set -uo pipefail

ROOT="/home/z/my-project/SmartBot"
FRONT="$ROOT/fb_dashboard/frontend"
DB_DIR="/home/z/my-project/db"
SIM_DB="$DB_DIR/v16-sim.db"
FRONT_PORT="${V16_SIM_FRONT_PORT:-3200}"
API_PORT="${V16_SIM_API_PORT:-8000}"
EVID="$ROOT/docs/evidence/v16"
REPORT="$EVID/sim-local-report.txt"
ENVFILE="/tmp/v16-backend.env"

if [ -x "$ROOT/.venv/bin/python" ]; then PY="$ROOT/.venv/bin/python"
else PY="/home/z/.venv/bin/python3"; fi

# ── 0) الجولة (SIM_ROUND — TTL قائمة السماح يعضّ بها) ─────────────────────
# round.env (E7) هو المصدر الوحيد للجولة عند الدمج؛ قبل وجوده نثبت v16
# صريحة. المتغير الخارجي SIM_ROUND إن وُجد يُحترم (تشخيص جولات أخرى).
if [ -f "$ROOT/scripts/round.env" ]; then
  # shellcheck disable=SC1091
  . "$ROOT/scripts/round.env"
fi
if [ -z "${SIM_ROUND:-}" ]; then
  SIM_ROUND="${ROUND:-v16}"
fi
export SIM_ROUND

# ── 1) نظافة البداية ──────────────────────────────────────────────────────
pkill -f "next-server" 2>/dev/null; pkill -f "next start" 2>/dev/null; pkill -f "uvicorn runner:app" 2>/dev/null
sleep 1
mkdir -p "$DB_DIR" "$EVID"
rm -f "$SIM_DB" "$SIM_DB"-wal "$SIM_DB"-shm
rm -rf "$ROOT/fb_dashboard/static/uploads/receipts" 2>/dev/null
SIM_ART="$FRONT/e2e_artifacts/sim"
rm -f "$SIM_ART/.current-run" "$SIM_ART/.admin_token" "$SIM_ART"/.p0*_token "$SIM_ART"/.p0*_username 2>/dev/null
rm -f /tmp/v16-uvicorn.log /tmp/v16-uvicorn-rotated.log /tmp/v16-playwright.log

# ── 2) أسرار الجلسة (SK/FK/CS → /tmp/v16-backend.env) ─────────────────────
SK=$("$PY" -c "import secrets;print(secrets.token_urlsafe(48))")
FK=$("$PY" -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())")
CS=$("$PY" -c "import secrets;print(secrets.token_urlsafe(32))")
printf '%s\n%s\n%s\n' "$SK" "$FK" "$CS" > "$ENVFILE"
chmod 600 "$ENVFILE"

ADMIN_USER="${SIM_ADMIN_USER:-v16admin}"
ADMIN_PASS="${SIM_ADMIN_PASS:-V16Admin#2026}"

# ── 3) إقلاع الخلفية (uvicorn) على قاعدة نظيفة ────────────────────────────
cd "$ROOT"
DATABASE_URL="sqlite+aiosqlite:///$SIM_DB" \
SECRET_KEY="$SK" FERNET_KEY="$FK" CRON_SECRET="$CS" DEBUG=1 \
SENTRY_DSN=off SENTRY_BOOT_CANARY=off \
FB_WEBHOOK_VERIFY_TOKEN="sim-verify-token" FACEBOOK_APP_SECRET="sim-app-secret" \
INITIAL_ADMIN_USERNAME="$ADMIN_USER" INITIAL_ADMIN_PASSWORD="$ADMIN_PASS" \
SMARTBOT_MUTATE_RATE_LIMIT=500 SMARTBOT_MUTATE_RATE_LIMIT_WINDOW=60 \
setsid nohup "$PY" -m uvicorn runner:app --app-dir fb_dashboard --host 127.0.0.1 --port "$API_PORT" \
  > /tmp/v16-uvicorn.log 2>&1 < /dev/null &
disown
echo "── الخلفية تقلع على :$API_PORT (python: $PY) ──"
for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$API_PORT/healthz" > /dev/null 2>&1 && break; sleep 1; done
if ! curl -sf "http://127.0.0.1:$API_PORT/healthz" > /dev/null 2>&1; then
  echo "فشل إقلاع الخلفية — آخر سجل:"; tail -20 /tmp/v16-uvicorn.log
  exit 2
fi
echo "الخلفية جاهزة: $(curl -s "http://127.0.0.1:$API_PORT/healthz" | head -c 120)"

# ── 4) إقلاع الواجهة (next start + وكيل API) ──────────────────────────────
cd "$FRONT"
probe_ok() { curl -s -m 8 "http://localhost:$FRONT_PORT/api/plans" 2>/dev/null | head -c 1 | grep -q '{'; }

# v15-fix محفوظ: الفحص يجب أن يتحقق من headless shell تحديداً (chromium
# وحدها لا تكفي — بطارية v15 21:37 فشلت كلها لغياب chromium_headless_shell)
if [ ! -d "$HOME/.cache/ms-playwright" ] || [ -z "$(ls -d "$HOME/.cache/ms-playwright"/chromium_headless_shell-* 2>/dev/null | head -1)" ]; then
  echo "── متصفحات Playwright (headless shell) غائبة — تثبيت chromium ──"
  npx playwright install chromium > /tmp/v16-pw-install.log 2>&1 || {
    echo "فشل تثبيت المتصفحات:"; tail -10 /tmp/v16-pw-install.log; exit 2; }
fi

start_front() {
  LOCAL_API_PROXY="http://127.0.0.1:$API_PORT" setsid nohup npx next start -p "$FRONT_PORT" \
    > /tmp/v16-next.log 2>&1 < /dev/null &
  disown
  for i in $(seq 1 40); do curl -sf "http://localhost:$FRONT_PORT/" > /dev/null 2>&1 && break; sleep 1; done
}

if [ ! -f .next/BUILD_ID ]; then
  echo "── لا بناء موجود — next build (بالوكيل) ──"
  LOCAL_API_PROXY="http://127.0.0.1:$API_PORT" npm run build > /tmp/v16-next-build.log 2>&1 || {
    echo "فشل البناء:"; tail -25 /tmp/v16-next-build.log; pkill -f "uvicorn runner:app"; exit 2; }
fi
start_front
if ! probe_ok; then
  echo "── تحقيق الوكيل فشل (بناء قديم؟) — إعادة بناء ──"
  pkill -f "next-server" 2>/dev/null; pkill -f "next start" 2>/dev/null; sleep 2
  if [ "${SKIP_FRONT_BUILD:-0}" != "1" ]; then
    LOCAL_API_PROXY="http://127.0.0.1:$API_PORT" npm run build > /tmp/v16-next-build.log 2>&1 || {
      echo "فشل إعادة البناء:"; tail -25 /tmp/v16-next-build.log; pkill -f "uvicorn runner:app"; exit 2; }
  fi
  start_front
fi
if ! probe_ok; then
  echo "الوكيل مكسور رغم إعادة البناء — أوقف"; pkill -f "next-server"; pkill -f "next start"; pkill -f "uvicorn runner:app"; exit 2
fi
echo "الواجهة جاهزة على :$FRONT_PORT"

# ── 5) البطارية (p01→p14 — تسلسل واحد مثل مستخدم حقيقي) ───────────────────
RUN_STAMP=$(date -u '+%Y-%m-%dT%H-%M-%S')
mkdir -p "$SIM_ART"
echo "$RUN_STAMP" > "$SIM_ART/.current-run"
echo "── البطارية v16 تبدأ (RUN=$RUN_STAMP · SIM_ROUND=$SIM_ROUND) — 14 شخصية ──"

# v15 محفوظ: القفل الصارم + الإنفاذ افتراضياً (D13-F1/D7-F1)
export SIM_STRICT_409="${SIM_STRICT_409:-1}"
export SIM_ENFORCE_CLAIMS="${SIM_ENFORCE_CLAIMS:-1}"
export SIM_ROUND
export V14_SIM_BASE_URL="http://localhost:$FRONT_PORT" SIM_BASE_URL="http://localhost:$FRONT_PORT" \
       SIM_FRONT="http://localhost:$FRONT_PORT" SIM_API="http://127.0.0.1:$API_PORT" \
       SIM_ADMIN_USER="$ADMIN_USER" SIM_ADMIN_PASS="$ADMIN_PASS" \
       SIM_SECRET_KEY="$SK" SIM_CRON_SECRET="$CS" \
       SIM_APP_SECRET="sim-app-secret" SIM_WEBHOOK_VERIFY_TOKEN="sim-verify-token" \
       SIM_DB="$SIM_DB" SIM_PYTHON="$PY" \
       V15_BACKEND_ENV="$ENVFILE" V15_SIM_API_PORT="$API_PORT" V15_SIM_DB="$SIM_DB" \
       V15_ROTATE_SCRIPT="$ROOT/scripts/v15_sim_rotate_secret.sh"

PW_LOG=/tmp/v16-playwright.log
npx playwright test -c playwright.sim.config.ts 2>&1 | tee "$PW_LOG"
PW_EXIT=${PIPESTATUS[0]}

# ── 6) الخروج المركّب الصادق: ادعاءات حمراء = فشل حتى لو playwright أخضر ──
# الحمراء الموثقة (allowlisted — findings بقائمة سماح) لا تفشل البطارية
# (بقاؤها مقصوداً حتى إغلاق الإيجاد) — الفشل = أحمر غير موثق فقط
CLAIMS_EXIT=0
CLAIMS="$SIM_ART/$RUN_STAMP/sim-claims.json"
if [ -f "$CLAIMS" ]; then
  RED=$(grep '"ok": *false' "$CLAIMS" 2>/dev/null | grep -vc '"allowlisted": *true' || true)
  if [ "${RED:-0}" -gt 0 ]; then CLAIMS_EXIT=1; fi
fi

# ── 7) تقرير عربي (شخصية×شخصية + الادعاءات + TTL + كاشف الانقلاب المُصلَح) ─
{
  echo "══════════════════════════════════════════════════════════"
  echo "تقرير بطارية المحاكاة المحلية v16 (E6 — إصلاحا D3 لصدق البطارية)"
  echo "══════════════════════════════════════════════════════════"
  echo "التاريخ: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "الجولة (RUN): $RUN_STAMP · SIM_ROUND=$SIM_ROUND (round.env: $([ -f "$ROOT/scripts/round.env" ] && echo نعم || echo غائب — افتراضي v16))"
  echo "المنافذ: الواجهة :$FRONT_PORT (وكيل) · الخلفية :$API_PORT · القاعدة: $SIM_DB"
  echo "py: $PY · node: $(node --version 2>/dev/null)"
  echo "SIM_STRICT_409=$SIM_STRICT_409 · SIM_ENFORCE_CLAIMS=$SIM_ENFORCE_CLAIMS"
  echo ""
  echo "── نتيجة الشخصيات (14) ──"
  for pn in p01 p02 p03 p04 p05 p06 p07 p08 p09 p10 p11 p12 p13 p14; do
    passed=$(grep -E '✓|✔' "$PW_LOG" 2>/dev/null | grep -c "sim-$pn-" || true)
    failed=$(grep -E '✘|✗' "$PW_LOG" 2>/dev/null | grep -c "sim-$pn-" || true)
    skipped=$(grep -E '^\s*-\s|skipped' "$PW_LOG" 2>/dev/null | grep -c "sim-$pn-" || true)
    if   [ "${failed:-0}" -gt 0 ]; then verdict="فشل ✘"
    elif [ "${passed:-0}" -gt 0 ]; then verdict="نجاح ✓"
    else verdict="لم تُنفَّذ (راجع السجل)"; fi
    echo "  $pn: $verdict — ناجحة: ${passed:-0} · فاشلة: ${failed:-0} · متخطاة: ${skipped:-0}"
  done
  echo ""
  echo "── الادعاءات (المفروضة) ──"
  if [ -f "$CLAIMS" ]; then
    green=$(grep -c '"ok": *true' "$CLAIMS" 2>/dev/null || true)
    red=$(grep -c '"ok": *false' "$CLAIMS" 2>/dev/null || true)
    findings=$(grep -c '"finding": *"[^"]' "$CLAIMS" 2>/dev/null || true)
    echo "  المجموع: $(grep -c . "$CLAIMS" || true) · خضراء: ${green:-0} · حمراء: ${red:-0} · findings موثقة: ${findings:-0}"
    if [ "${red:-0}" -gt 0 ]; then
      echo "  الادعاءات الحمراء (تُفشل البطارية):"
      grep '"ok": *false' "$CLAIMS" | head -12
    fi
  else
    echo "  (لا ملف ادعاءات — راجع السجل)"
  fi
  echo ""
  echo "── TTL قائمة السماح (SIM_ROUND=$SIM_ROUND) ──"
  EXPIRED=$(grep -c 'إدخال منتهي الجولة' "$PW_LOG" 2>/dev/null || true)
  echo "  إدخالات منتهية الصلاحية عوملت غير مُدرجة (صرامة): ${EXPIRED:-0}"
  if [ "${EXPIRED:-0}" -gt 0 ]; then
    grep 'إدخال منتهي الجولة' "$PW_LOG" | head -12
  fi
  echo ""
  echo "── كاشف الانقلاب (status=findingClosed — مُصلَح v16) ──"
  LIVE="$SIM_ART/$RUN_STAMP/sim-findings-live.json"
  if [ -f "$LIVE" ]; then
    # v16-fix (D3 #1): db-claims.mjs يكتب في الملف الحي سطور
    # {id,…,status:'findingClosed',…} — v15 قرأ صيغة '"findingClosed":true'
    # غير الموجودة هناك أبداً → العدّاد صفر بنيوياً. الصيغة الصحيحة:
    CLOSED=$(grep -c '"status": *"findingClosed"' "$LIVE" 2>/dev/null || true)
    echo "  إدخالات كانت حمراء وصارت خضراء: ${CLOSED:-0} — راجعها واحذفها من sim-findings.json (العقد يصبح صارماً)"
    if [ "${CLOSED:-0}" -gt 0 ]; then
      grep '"status": *"findingClosed"' "$LIVE" | sed -n 's/.*"id": *"\([^"]*\)".*/    - \1/p'
    fi
  else
    echo "  (لا ملف findings-live — لا انقلابات)"
  fi
  echo ""
  echo "── الأدلة ──"
  RUN_DIR="$SIM_ART/$RUN_STAMP"
  if [ -d "$RUN_DIR" ]; then
    shots=$(find "$RUN_DIR" -name '*.png' 2>/dev/null | wc -l)
    hars=$(find "$RUN_DIR" -name '*.har' 2>/dev/null | wc -l)
    echo "  اللقطات: $shots · ملفات HAR: $hars"
    echo "  المجلد: $RUN_DIR"
  fi
  echo ""
  echo "── الحكم النهائي (الخروج المركّب) ──"
  echo "  playwright exit=$PW_EXIT · claims exit=$CLAIMS_EXIT"
  if [ "$PW_EXIT" -eq 0 ] && [ "$CLAIMS_EXIT" -eq 0 ]; then
    echo "  البطارية خضراء بالكامل وصادقة — PASS"
  else
    echo "  فشل — راجع /tmp/v16-playwright.log و $RUN_DIR — FAIL"
  fi
} | tee "$REPORT"

# ── 8) إطفاء نظيف ─────────────────────────────────────────────────────────
pkill -f "next-server" 2>/dev/null; pkill -f "next start" 2>/dev/null; pkill -f "uvicorn runner:app" 2>/dev/null

FINAL_EXIT=$(( PW_EXIT | CLAIMS_EXIT ))
echo "خروج السكربت: $FINAL_EXIT"
exit $FINAL_EXIT
