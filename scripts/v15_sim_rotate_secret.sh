#!/usr/bin/env bash
# v15-E8 (تصميم D13 §4.7) — تدوير أسرار الخلفية الحية منتصف البطارية (p14)
#
# الوظيفة: يستبدل SECRET_KEY وCRON_SECRET (يُبقي FERNET_KEY — وإلا ضاعت
# توكنات الصفحات المشفرة) ويعيد إقلاع uvicorn على نفس القاعدة، ثم ينتظر
# الجاهزية. النتيجة: كل توكنات JWT القديمة تُبطل (401) والدخول الجديد
# يعمل، بينما بيانات Fernet المشفرة تبقى قابلة للفك.
#
# الاستدعاء: من sim-p14-secret-rotation.spec.ts عبر execSync، أو يدوياً:
#   bash scripts/v15_sim_rotate_secret.sh
# المتغيرات: V15_SIM_API_PORT (افتراضي 8000) · V15_BACKEND_ENV (افتراضي /tmp/v15-backend.env)
# الخروج: 0 نجاح · 2 فشل إقلاع
set -uo pipefail

# phase6 (P6-2-d5): ROOT مشتق من موقع السكربت (كان صلبًا على تخطيط
# صندوق v15 القديم /home/z/my-project/SmartBot — ميت في أي نسخة أخرى).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${V15_SIM_API_PORT:-8000}"
ENVFILE="${V15_BACKEND_ENV:-/tmp/v15-backend.env}"
SIM_DB="${V15_SIM_DB:-$ROOT/db/v15-sim.db}"

if [ -x "$ROOT/.venv/bin/python" ]; then PY="$ROOT/.venv/bin/python"
else PY="/home/z/.venv/bin/python3"; fi

# أسرار الجولة الأصلية (السكربت الأب كتبها: SK/FK/CS أسطراً)
SK_OLD=$(sed -n 1p "$ENVFILE")
FK=$(sed -n 2p "$ENVFILE")
CS_OLD=$(sed -n 3p "$ENVFILE")

SK_NEW=$("$PY" -c "import secrets;print(secrets.token_urlsafe(48))")
CS_NEW=$("$PY" -c "import secrets;print(secrets.token_urlsafe(32))")

# أوقف الخلفية الحالية (تواقيعها كلها بالسر القديم)
# phase8 (إعادة 7a98a52): قتل محصور بالمنفذ — pkill -f كان يقتل أي uvicorn
# runner:app في الجهاز كله (أرصات الآخرين في الصناديق المشتركة). هنا الخلفية
# فقط: هذا السكربت لا يلمس الواجهة أصلًا.
# phase8-fix: lsof -t -TCP -sTCP:LISTEN يُرجع فراغًا في هذا الصندوق — ss
# بدله (لاحقة العمود الرابع + قتل المجموعة setsid TERM→KILL).
mypgid=$(ps -o pgid= -p $$ 2>/dev/null | tr -d ' ')
for pid in $(ss -tlnp 2>/dev/null | awk -v port=":$API_PORT" 'substr($4, length($4)-length(port)+1) == port {print}' | grep -oP 'pid=\K[0-9]+' | sort -u); do
  pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
  if [ -n "$pgid" ] && [ "$pgid" != "$mypgid" ] && [ "$pgid" != "1" ]; then
    kill -TERM -- "-$pgid" 2>/dev/null || true
  fi
  kill -TERM "$pid" 2>/dev/null || true
done
sleep 2
for pid in $(ss -tlnp 2>/dev/null | awk -v port=":$API_PORT" 'substr($4, length($4)-length(port)+1) == port {print}' | grep -oP 'pid=\K[0-9]+' | sort -u); do
  pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
  if [ -n "$pgid" ] && [ "$pgid" != "$mypgid" ] && [ "$pgid" != "1" ]; then
    kill -KILL -- "-$pgid" 2>/dev/null || true
  fi
  kill -KILL "$pid" 2>/dev/null || true
done
sleep 1

# أعد الإقلاع بنفس القاعدة ونفس FERNet وسر الويبهوك — بأسرار جلسة/كرون مدورة
cd "$ROOT"
DATABASE_URL="sqlite+aiosqlite:///$SIM_DB" \
SECRET_KEY="$SK_NEW" FERNET_KEY="$FK" CRON_SECRET="$CS_NEW" DEBUG=1 \
SENTRY_DSN=off SENTRY_BOOT_CANARY=off \
FB_WEBHOOK_VERIFY_TOKEN="${SIM_WEBHOOK_VERIFY_TOKEN:-sim-verify-token}" \
FACEBOOK_APP_SECRET="${SIM_APP_SECRET:-sim-app-secret}" \
SMARTBOT_MUTATE_RATE_LIMIT=500 SMARTBOT_MUTATE_RATE_LIMIT_WINDOW=60 \
INITIAL_ADMIN_USERNAME="${SIM_ADMIN_USER:-v15admin}" INITIAL_ADMIN_PASSWORD="${SIM_ADMIN_PASS:-V15Admin#2026}" \
setsid nohup "$PY" -m uvicorn runner:app --app-dir fb_dashboard --host 127.0.0.1 --port "$API_PORT" \
  > /tmp/v15-uvicorn-rotated.log 2>&1 < /dev/null &
disown

for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$API_PORT/healthz" > /dev/null 2>&1 && break; sleep 1; done
if ! curl -sf "http://127.0.0.1:$API_PORT/healthz" > /dev/null 2>&1; then
  echo "ROTATE_FAIL: الخلفية لم تعد بعد التدوير — آخر سجل:" >&2
  tail -20 /tmp/v15-uvicorn-rotated.log >&2
  exit 2
fi

# اكتب الأسرار الجديدة لملف البيئة (p14 والسكربت الأب يقرآنها لاحقاً)
printf '%s\n%s\n%s\n' "$SK_NEW" "$FK" "$CS_NEW" > "$ENVFILE"
chmod 600 "$ENVFILE"

echo "ROTATED ok (port $API_PORT): SECRET_KEY + CRON_SECRET — FERNET_KEY وAPP_SECRET كما هما"
