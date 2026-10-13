#!/usr/bin/env bash
# v17 (منسق) — بطارية المحاكاة المحلية v17 مقسمة لجزأين (قيد البيئة:
# الخلفيات لا تنجو بين استدعاءات الأدوات، ومهلة الاستدعاء 10 دقائق).
#
#   PART=1 bash scripts/v17_sim_battery_split.sh  # قاعدة نظيفة + p01→p07
#   PART=2 bash scripts/v17_sim_battery_split.sh  # نفس القاعدة + p08→p15
#
# الجولة بالكامل (الجزءان) تعادل v17_sim_local_battery.sh:
#   - الجزء 1: يبذر الأسرار والقاعدة ويشغّل p01-p07 ثم يطفئ الخوادم
#     (القاعدة وملفات التوكن/الأسس تبقى على القرص).
#   - الجزء 2: يعيد إقلاع الخوادم على نفس القاعدة ونفس الأسرار (من
#     /tmp/v17-backend.env) ويشغّل p08-p15 (p15 الجديدة: ميزات v17).
#     .current-run يبقى نفسه → اللقطات والادعاءات تتراكم في مجلد واحد.
#   - الحكم النهائي: يجمع المنسّق جزأَي سجل playwright (نفس ملف السجل
#     يُلحق لا يُمسح: PW_LOG_APPEND=1 في الجزء 2).
set -uo pipefail

# phase6 (P6-2-d5): ROOT مشتق من موقع السكربت (كان صلبًا على /home/z/
# my-project/SmartBot — تخطيط صندوق v15 فقط، ميت في أي نسخة مستودع أخرى).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONT="$ROOT/fb_dashboard/frontend"
DB_DIR="$ROOT/db"
SIM_DB="$DB_DIR/v17-sim.db"
FRONT_PORT="${V17_SIM_FRONT_PORT:-3200}"
API_PORT="${V17_SIM_API_PORT:-8000}"
EVID="$ROOT/docs/evidence/v17"
PART="${PART:-1}"
ENVFILE="/tmp/v17-backend.env"

if [ -x "$ROOT/.venv/bin/python" ]; then PY="$ROOT/.venv/bin/python"; else PY=python3; fi

# phase7 (إعادة 7a98a52 — فقدت بإعادة تعيين الصندوق): القتل محصور بالمنافذ.
# pkill -f "next-server" كان يقتل أي خادم next في الجهاز كله — لوحة المنسق
# على :3000 وأرصات المنتجات الشقيقة تعمل في نفس الصندوق ولا يجوز لمسها.
# phase8-fix (P8- مباشر): lsof -t -TCP -sTCP:LISTEN -i :PORT يُرجع فراغًا في
# هذا الصندوق، وlsof الأعجاز يفوّت مستمعي *:PORT أصلًا — فبقيت رصّة عتيقة
# حيّة ماسّة المنفذ ففشل الربط الجديد وقاضت المواصفات قاعدة محذوفة inode.
# البديل: ss يرى كلًا (IPv4/IPv6/البدل) — مطابقة لاحقة العمود الرابع
# (substring suffix — لا regex يلتقط منافذ أطول) ثم قتل المجموعة (setsid)
# TERM→KILL. لا يلمس مجموعتنا ومجموعة init أبدًا.
kill_stack() {
  local p pid pgid mypgid
  mypgid=$(ps -o pgid= -p $$ 2>/dev/null | tr -d ' ')
  for p in "$FRONT_PORT" "$API_PORT"; do
    for pid in $(ss -tlnp 2>/dev/null | awk -v port=":$p" 'substr($4, length($4)-length(port)+1) == port {print}' | grep -oP 'pid=\K[0-9]+' | sort -u); do
      pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
      if [ -n "$pgid" ] && [ "$pgid" != "$mypgid" ] && [ "$pgid" != "1" ]; then
        kill -TERM -- "-$pgid" 2>/dev/null || true
      fi
      kill -TERM "$pid" 2>/dev/null || true
    done
  done
  sleep 2
  for p in "$FRONT_PORT" "$API_PORT"; do
    for pid in $(ss -tlnp 2>/dev/null | awk -v port=":$p" 'substr($4, length($4)-length(port)+1) == port {print}' | grep -oP 'pid=\K[0-9]+' | sort -u); do
      pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
      if [ -n "$pgid" ] && [ "$pgid" != "$mypgid" ] && [ "$pgid" != "1" ]; then
        kill -KILL -- "-$pgid" 2>/dev/null || true
      fi
      kill -KILL "$pid" 2>/dev/null || true
    done
  done
  return 0
}

if [ -f "$ROOT/scripts/round.env" ]; then . "$ROOT/scripts/round.env"; fi
if [ -z "${SIM_ROUND:-}" ]; then SIM_ROUND="${ROUND:-v17}"; fi
export SIM_ROUND

# ── 1) نظافة البداية (الجزء 1 فقط: قاعدة وأسرار جديدة) ────────────────────
kill_stack
mkdir -p "$DB_DIR" "$EVID"
SIM_ART="$FRONT/e2e_artifacts/sim"

if [ "$PART" = "1" ]; then
  rm -f "$SIM_DB" "$SIM_DB"-wal "$SIM_DB"-shm
  rm -rf "$ROOT/fb_dashboard/static/uploads/receipts" 2>/dev/null
  # phase8 (إعادة 3b83f76): ملفات حالة الشخصيات الدائمة (إعادة تشغيل العامل)
  # + دليل الإيصالات الخاص (v24-R3: fb_dashboard/data/uploads/receipts) —
  # جزء نظافة الجولة الجديدة: الاسم المخزن من جولة سابقة يفشل التسجيل فورًا.
  rm -rf "$ROOT/fb_dashboard/data/uploads/receipts" 2>/dev/null
  rm -f "$SIM_ART/.current-run" "$SIM_ART/.admin_token" "$SIM_ART"/.p0*_token "$SIM_ART"/.p0*_username "$SIM_ART"/.p1*_token "$SIM_ART"/.p1*_username \
        "$SIM_ART"/.p0*_state.json "$SIM_ART"/.p1*_state.json 2>/dev/null
  rm -f /tmp/v17-uvicorn.log /tmp/v17-uvicorn-rotated.log /tmp/v17-playwright.log
  SK=$("$PY" -c "import secrets;print(secrets.token_urlsafe(48))")
  FK=$("$PY" -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())")
  CS=$("$PY" -c "import secrets;print(secrets.token_urlsafe(32))")
  printf '%s\n%s\n%s\n' "$SK" "$FK" "$CS" > "$ENVFILE"
  chmod 600 "$ENVFILE"
else
  # الجزء 2: نفس الأسرار (وإلا كل الجلسات/التوكنات المخزنة تبطل)
  SK=$(sed -n 1p "$ENVFILE")
  FK=$(sed -n 2p "$ENVFILE")
  CS=$(sed -n 3p "$ENVFILE")
  if [ -z "$SK" ] || [ -z "$FK" ] || [ -z "$CS" ]; then
    echo "جزء 2 بلا أسرار جزء 1 — شغّل PART=1 أولاً"; exit 2
  fi
fi
ADMIN_USER="${SIM_ADMIN_USER:-v17admin}"
ADMIN_PASS="${SIM_ADMIN_PASS:-V17Admin#2026}"

# ── 2) إقلاع الخلفية على القاعدة (نفس ملف SQLite في الجزأين) ──────────────
cd "$ROOT"
DATABASE_URL="sqlite+aiosqlite:///$SIM_DB" \
SECRET_KEY="$SK" FERNET_KEY="$FK" CRON_SECRET="$CS" DEBUG=1 \
SENTRY_DSN=off SENTRY_BOOT_CANARY=off \
FB_WEBHOOK_VERIFY_TOKEN="sim-verify-token" FACEBOOK_APP_SECRET="sim-app-secret" \
INITIAL_ADMIN_USERNAME="$ADMIN_USER" INITIAL_ADMIN_PASSWORD="$ADMIN_PASS" \
SMARTBOT_MUTATE_RATE_LIMIT=500 SMARTBOT_MUTATE_RATE_LIMIT_WINDOW=60 \
setsid nohup "$PY" -m uvicorn runner:app --app-dir fb_dashboard --host 127.0.0.1 --port "$API_PORT" --timeout-keep-alive 120 \
  > /tmp/v17-uvicorn.log 2>&1 < /dev/null &
disown
for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$API_PORT/healthz" > /dev/null 2>&1 && break; sleep 1; done
if ! curl -sf "http://127.0.0.1:$API_PORT/healthz" > /dev/null 2>&1; then
  echo "فشل إقلاع الخلفية — آخر سجل:"; tail -20 /tmp/v17-uvicorn.log; exit 2
fi
echo "الخلفية جاهزة (جزء $PART): $(curl -s "http://127.0.0.1:$API_PORT/healthz" | head -c 100)"

# ── 3) الواجهة ────────────────────────────────────────────────────────────
cd "$FRONT"
if [ ! -f .next/BUILD_ID ]; then
  LOCAL_API_PROXY="http://127.0.0.1:$API_PORT" npm run build > /tmp/v17-next-build.log 2>&1 || {
    echo "فشل البناء:"; tail -25 /tmp/v17-next-build.log; kill_stack; exit 2; }
fi
LOCAL_API_PROXY="http://127.0.0.1:$API_PORT" setsid nohup npx next start -p "$FRONT_PORT" > /tmp/v17-next.log 2>&1 < /dev/null &
disown
for i in $(seq 1 40); do curl -sf "http://localhost:$FRONT_PORT/" > /dev/null 2>&1 && break; sleep 1; done
if ! curl -s -m 8 "http://localhost:$FRONT_PORT/api/plans" 2>/dev/null | head -c 1 | grep -q '{'; then
  echo "الوكيل مكسور — أوقف"; kill_stack; exit 2
fi
echo "الواجهة جاهزة على :$FRONT_PORT (جزء $PART)"

# ── 4) الشخصيات (التقسيم) ─────────────────────────────────────────────────
if [ "$PART" = "1" ]; then
  SPECS="e2e/sim-p01-visitor-3g.spec.ts e2e/sim-p02-new-subscriber-wallet.spec.ts e2e/sim-p03-new-subscriber-bank-receipt.spec.ts e2e/sim-p04-returning-subscriber.spec.ts e2e/sim-p05-platform-admin.spec.ts e2e/sim-p06-duplicate-page-tenant.spec.ts e2e/sim-p07-attacker.spec.ts"
else
  SPECS="e2e/sim-p08-bot-customer.spec.ts e2e/sim-p09-messenger-multisession.spec.ts e2e/sim-p10-plan-limits-tenant.spec.ts e2e/sim-p11-arabic-rtl-browser.spec.ts e2e/sim-p12-screenreader-axe.spec.ts e2e/sim-p13-race-attacker.spec.ts e2e/sim-p14-secret-rotation.spec.ts e2e/sim-p15-v17-features.spec.ts"
fi

mkdir -p "$SIM_ART"
if [ "$PART" = "1" ]; then
  RUN_STAMP=$(date -u '+%Y-%m-%dT%H-%M-%S')
  echo "$RUN_STAMP" > "$SIM_ART/.current-run"
else
  RUN_STAMP=$(cat "$SIM_ART/.current-run" 2>/dev/null || date -u '+%Y-%m-%dT%H-%M-%S')
fi
echo "── البطارية v17 (جزء $PART · RUN=$RUN_STAMP · SIM_ROUND=$SIM_ROUND) ──"

export SIM_STRICT_409="${SIM_STRICT_409:-1}"
export SIM_ENFORCE_CLAIMS="${SIM_ENFORCE_CLAIMS:-1}"
export V14_SIM_BASE_URL="http://localhost:$FRONT_PORT" SIM_BASE_URL="http://localhost:$FRONT_PORT" \
       SIM_FRONT="http://localhost:$FRONT_PORT" SIM_API="http://127.0.0.1:$API_PORT" \
       SIM_ADMIN_USER="$ADMIN_USER" SIM_ADMIN_PASS="$ADMIN_PASS" \
       SIM_SECRET_KEY="$SK" SIM_CRON_SECRET="$CS" \
       SIM_APP_SECRET="sim-app-secret" SIM_WEBHOOK_VERIFY_TOKEN="sim-verify-token" \
       SIM_DB="$SIM_DB" SIM_PYTHON="$PY" \
       V15_BACKEND_ENV="$ENVFILE" V15_SIM_API_PORT="$API_PORT" V15_SIM_DB="$SIM_DB" \
       V15_ROTATE_SCRIPT="$ROOT/scripts/v15_sim_rotate_secret.sh"

PW_LOG=/tmp/v17-playwright.log
npx playwright test -c playwright.sim.config.ts $SPECS 2>&1 | tee -a "$PW_LOG"
PW_EXIT=${PIPESTATUS[0]}

# ── 5) إطفاء نظيف (القاعدة والأدلة تبقى للجزء التالي/المنسّق) ──────────────
# محصور بالمنافذ (3200/8000) — لا يلمس :3000 ولا أرصات الآخرين أبدًا
kill_stack

CLAIMS="$SIM_ART/$RUN_STAMP/sim-claims.json"
CLAIMS_EXIT=0
if [ -f "$CLAIMS" ]; then
  RED=$(grep '"ok": *false' "$CLAIMS" 2>/dev/null | grep -vc '"allowlisted": *true' || true)
  if [ "${RED:-0}" -gt 0 ]; then CLAIMS_EXIT=1; fi
fi
echo "جزء $PART: playwright exit=$PW_EXIT · claims red exit=$CLAIMS_EXIT"
exit $(( PW_EXIT | CLAIMS_EXIT ))
