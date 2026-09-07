#!/usr/bin/env bash
# v14-E7 (تصميم D13 §6.1.1) — بطارية المحاكاة المحلية الكاملة (8 شخصيات)
#
# الوظيفة: يقلع الخادمين (uvicorn + next start بوكيل) على قاعدة SQLite
# نظيفة (v14-sim.db) ثم يشغّل بطارية Playwright كاملة ثم يطفئ الخوادم
# نظيفاً — مع تقرير نصي عربي لكل شخصية في docs/evidence/v14/sim-local-report.txt
#
# التشغيل من جذر المستودع (أو من أي مكان — المسارات مطلقة):
#   bash /home/z/my-project/SmartBot/scripts/v14_sim_local_battery.sh
#
# متغيرات دعم:
#   SIM_STRICT_409=1      — قفل شخصية P06 على 409 حصراً (بعد إصلاح D13-F1)
#   V14_SIM_FRONT_PORT    — منفذ الواجهة (افتراضي 3200)
#   V14_SIM_API_PORT      — منفذ الخلفية (افتراضي 8000)
#   SKIP_FRONT_BUILD=1    — لا يبني الواجهة حتى لو فشل التحقيق (تشخيص فقط)
set -uo pipefail

ROOT="/home/z/my-project/SmartBot"
FRONT="$ROOT/fb_dashboard/frontend"
DB_DIR="/home/z/my-project/db"
SIM_DB="$DB_DIR/v14-sim.db"
FRONT_PORT="${V14_SIM_FRONT_PORT:-3200}"
API_PORT="${V14_SIM_API_PORT:-8000}"
EVID="$ROOT/docs/evidence/v14"
REPORT="$EVID/sim-local-report.txt"
ENVFILE="/tmp/v14-backend.env"

# بيثون البيئة: .venv المحلي إن وُجد وإلا بيثون الصندوق (الخلفية وsqlite واحد)
if [ -x "$ROOT/.venv/bin/python" ]; then PY="$ROOT/.venv/bin/python"
else PY="/home/z/.venv/bin/python3"; fi

# ── 0) نظافة البداية (R10/R13: DB + إيصالات + توكنات القرص + RUN) ──────
pkill -f "next-server" 2>/dev/null; pkill -f "next start" 2>/dev/null; pkill -f "uvicorn runner:app" 2>/dev/null
sleep 1
mkdir -p "$DB_DIR" "$EVID"
rm -f "$SIM_DB" "$SIM_DB"-wal "$SIM_DB"-shm
rm -rf "$FRONT/fb_dashboard/static/uploads/receipts" 2>/dev/null
rm -rf "$ROOT/fb_dashboard/static/uploads/receipts" 2>/dev/null
SIM_ART="$FRONT/e2e_artifacts/sim"
rm -f "$SIM_ART/.current-run" "$SIM_ART/.admin_token" "$SIM_ART"/.p0*_token "$SIM_ART"/.p0*_username 2>/dev/null

# ── 1) أسرار الجلسة (نمط /tmp/v9-backend.env → /tmp/v14-backend.env) ─────
SK=$("$PY" -c "import secrets;print(secrets.token_urlsafe(48))")
FK=$("$PY" -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())")
CS=$("$PY" -c "import secrets;print(secrets.token_urlsafe(32))")
printf '%s\n%s\n%s\n' "$SK" "$FK" "$CS" > "$ENVFILE"
chmod 600 "$ENVFILE"

ADMIN_USER="${SIM_ADMIN_USER:-${INITIAL_ADMIN_USERNAME:-v14admin}}"
ADMIN_PASS="${SIM_ADMIN_PASS:-${INITIAL_ADMIN_PASSWORD:-V14Admin#2026}}"

# ── 2) إقلاع الخلفية (uvicorn) على قاعدة نظيفة ──────────────────────────
cd "$ROOT"
DATABASE_URL="sqlite+aiosqlite:///$SIM_DB" \
SECRET_KEY="$SK" FERNET_KEY="$FK" CRON_SECRET="$CS" DEBUG=1 \
SENTRY_DSN=off SENTRY_BOOT_CANARY=off \
FB_WEBHOOK_VERIFY_TOKEN="sim-verify-token" FACEBOOK_APP_SECRET="sim-app-secret" \
INITIAL_ADMIN_USERNAME="$ADMIN_USER" INITIAL_ADMIN_PASSWORD="$ADMIN_PASS" \
SMARTBOT_MUTATE_RATE_LIMIT=500 SMARTBOT_MUTATE_RATE_LIMIT_WINDOW=60 \
setsid nohup "$PY" -m uvicorn runner:app --app-dir fb_dashboard --host 127.0.0.1 --port "$API_PORT" \
  > /tmp/v14-uvicorn.log 2>&1 < /dev/null &
disown
echo "── الخلفية تقلع على :$API_PORT (python: $PY) ──"
for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$API_PORT/healthz" > /dev/null 2>&1 && break; sleep 1; done
if ! curl -sf "http://127.0.0.1:$API_PORT/healthz" > /dev/null 2>&1; then
  echo "فشل إقلاع الخلفية — آخر سجل:"; tail -20 /tmp/v14-uvicorn.log
  exit 2
fi
echo "الخلفية جاهزة: $(curl -s "http://127.0.0.1:$API_PORT/healthz" | head -c 120)"

# ── 3) إقلاع الواجهة (next start + وكيل API) — بناء عند الحاجة ──────────
cd "$FRONT"
# v14-fix: الاستدعاء المقتبس "$PROBE" يمنع تقسيم الكلمات (bash يعدّ السطر
# كله اسم أمر واحد → command not found يبتلع بـ2>/dev/null) — دالة مباشرة بدلاً منه
probe_ok() { curl -s -m 8 "http://localhost:$FRONT_PORT/api/plans" 2>/dev/null | head -c 1 | grep -q '{'; }

# متصفحات Playwright: تثبيت فقط عند غياب الكاش (لا تنزيل بلا داعٍ)
if [ ! -d "$HOME/.cache/ms-playwright" ] || [ -z "$(ls "$HOME/.cache/ms-playwright" 2>/dev/null | head -1)" ]; then
  echo "── متصفحات Playwright غائبة — تثبيت chromium ──"
  npx playwright install chromium > /tmp/v14-pw-install.log 2>&1 || {
    echo "فشل تثبيت المتصفحات:"; tail -10 /tmp/v14-pw-install.log; exit 2; }
fi

start_front() {
  LOCAL_API_PROXY="http://127.0.0.1:$API_PORT" setsid nohup npx next start -p "$FRONT_PORT" \
    > /tmp/v14-next.log 2>&1 < /dev/null &
  disown
  for i in $(seq 1 40); do curl -sf "http://localhost:$FRONT_PORT/" > /dev/null 2>&1 && break; sleep 1; done
}

if [ ! -f .next/BUILD_ID ]; then
  echo "── لا بناء موجود — next build (بالوكيل لتُخبز إعادة الكتابة) ──"
  LOCAL_API_PROXY="http://127.0.0.1:$API_PORT" npm run build > /tmp/v14-next-build.log 2>&1 || {
    echo "فشل البناء:"; tail -25 /tmp/v14-next-build.log; pkill -f "uvicorn runner:app"; exit 2; }
fi
start_front
if ! probe_ok; then
  echo "── تحقيق الوكيل فشل (بناء قديم بلا وكيل؟) — إعادة بناء ──"
  pkill -f "next-server" 2>/dev/null; pkill -f "next start" 2>/dev/null; sleep 2
  if [ "${SKIP_FRONT_BUILD:-0}" != "1" ]; then
    LOCAL_API_PROXY="http://127.0.0.1:$API_PORT" npm run build > /tmp/v14-next-build.log 2>&1 || {
      echo "فشل إعادة البناء:"; tail -25 /tmp/v14-next-build.log; pkill -f "uvicorn runner:app"; exit 2; }
  fi
  start_front
fi
if ! probe_ok; then
  echo "الوكيل مكسور رغم إعادة البناء — أوقف"; pkill -f "next-server"; pkill -f "next start"; pkill -f "uvicorn runner:app"; exit 2
fi
echo "الواجهة جاهزة على :$FRONT_PORT — تحقيق الخطط: $(curl -s -m 8 "http://localhost:$FRONT_PORT/api/plans" | head -c 80)"

# ── 4) تشغيل البطارية (الشخصيات بالترتيب الأبجدي p01→p08) ────────────────
RUN_STAMP=$(date -u '+%Y-%m-%dT%H-%M-%S')
mkdir -p "$SIM_ART"
echo "$RUN_STAMP" > "$SIM_ART/.current-run"
echo "── البطارية تبدأ (RUN=$RUN_STAMP) — 8 شخصيات، تسلسل واحد ──"
export V14_SIM_BASE_URL="http://localhost:$FRONT_PORT" SIM_BASE_URL="http://localhost:$FRONT_PORT" \
       SIM_FRONT="http://localhost:$FRONT_PORT" SIM_API="http://127.0.0.1:$API_PORT" \
       SIM_ADMIN_USER="$ADMIN_USER" SIM_ADMIN_PASS="$ADMIN_PASS" \
       SIM_SECRET_KEY="$SK" SIM_CRON_SECRET="$CS" \
       SIM_APP_SECRET="sim-app-secret" SIM_WEBHOOK_VERIFY_TOKEN="sim-verify-token" \
       SIM_DB="$SIM_DB" SIM_PYTHON="$PY"

PW_LOG=/tmp/v14-playwright.log
npx playwright test -c playwright.sim.config.ts 2>&1 | tee "$PW_LOG"
PW_EXIT=${PIPESTATUS[0]}

# ── 5) تجميع التقرير العربي (شخصية×شخصية + الادعاءات + الأدلة) ──────────
CLAIMS="$SIM_ART/$RUN_STAMP/sim-claims.json"
{
  echo "══════════════════════════════════════════════════════════"
  echo "تقرير بطارية المحاكاة المحلية v14 (E7 — تنفيذ تصميم D13)"
  echo "══════════════════════════════════════════════════════════"
  echo "التاريخ: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "الجولة (RUN): $RUN_STAMP"
  echo "المنافذ: الواجهة :$FRONT_PORT (وكيل) · الخلفية :$API_PORT · القاعدة: $SIM_DB"
  echo "py: $PY · node: $(node --version 2>/dev/null)"
  echo ""
  echo "── نتيجة الشخصيات ──"
  for pn in p01 p02 p03 p04 p05 p06 p07 p08; do
    # v14-fix: مُبلّغ list يوسم بالملف لا بالشخصية — العدّ عبر اسم ملف الشخصية
    passed=$(grep -E '✓|✔' "$PW_LOG" 2>/dev/null | grep -c "sim-$pn-" || true)
    failed=$(grep -E '✘|✗' "$PW_LOG" 2>/dev/null | grep -c "sim-$pn-" || true)
    skipped=$(grep -E '^\s*-\s|skipped' "$PW_LOG" 2>/dev/null | grep -c "sim-$pn-" || true)
    if   [ "${failed:-0}" -gt 0 ]; then verdict="فشل ✘"
    elif [ "${passed:-0}" -gt 0 ]; then verdict="نجاح ✓"
    else verdict="لم تُنفَّذ (راجع السجل)"; fi
    echo "  $pn: $verdict — اختبارات ناجحة: ${passed:-0} · فاشلة: ${failed:-0} · متخطاة: ${skipped:-0}"
  done
  echo ""
  echo "── الادعاءات (sim-claims.json) ──"
  if [ -f "$CLAIMS" ]; then
    total=$(grep -c . "$CLAIMS" || true)
    green=$(grep -c '"ok": *true' "$CLAIMS" 2>/dev/null || true)
    red=$(grep -c '"ok": *false' "$CLAIMS" 2>/dev/null || true)
    findings=$(grep -c '"finding": *"[^"]' "$CLAIMS" 2>/dev/null || true)
    echo "  المجموع: ${total:-0} · خضراء: ${green:-0} · حمراء: ${red:-0} · موثقة كـ findings: ${findings:-0}"
    if [ "${red:-0}" -gt 0 ]; then
      echo "  الادعاءات الحمراء (للمراجعة):"
      grep '"ok": *false' "$CLAIMS" | head -10
    fi
  else
    echo "  (لا ملف ادعاءات — راجع السجل)"
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
  echo "── الحكم النهائي ──"
  if [ "$PW_EXIT" -eq 0 ]; then
    echo "البطارية خضراء بالكامل (playwright exit=0) — PASS"
  else
    echo "يوجد إخفاقات (playwright exit=$PW_EXIT) — راجع $PW_LOG و e2e_artifacts/sim/test-results — FAIL"
  fi
  echo "خروج السكربت: $PW_EXIT"
} > "$REPORT" 2>&1

# نسخ الأدلة إلى docs/evidence (بوابة الدفع — عند النجاح فقط)
if [ "$PW_EXIT" -eq 0 ] && [ -d "$SIM_ART/$RUN_STAMP" ]; then
  mkdir -p "$EVID/sim-local"
  cp -r "$SIM_ART/$RUN_STAMP" "$EVID/sim-local/" 2>/dev/null || true
  echo "نُسخت أدلة الجولة إلى $EVID/sim-local/$RUN_STAMP"
fi
cp "$PW_LOG" "$EVID/sim-local-playwright.log" 2>/dev/null || true

# ── 6) إطفاء نظيف + طباعة الملخص ─────────────────────────────────────────
pkill -f "next-server" 2>/dev/null; pkill -f "next start" 2>/dev/null; pkill -f "uvicorn runner:app" 2>/dev/null
sleep 1
echo ""
cat "$REPORT"
echo ""
echo "التقرير الكامل: $REPORT"
exit "$PW_EXIT"
