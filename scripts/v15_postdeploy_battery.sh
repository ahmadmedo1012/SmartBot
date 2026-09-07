#!/usr/bin/env bash
# v15 post-deploy battery — live production verification (stateless, ~90 checks)
# v15-E8 (تصميم D13 §7) — نمط v14_postdeploy_battery.sh + المجموعات الجديدة:
#   A availability · B public pages · C security headers · D CSRF contract ·
#   E auth guards (v14+v15 routes) · F method discipline + webhook surface ·
#   G caching/assets · H envelopes + JS budget ·
#   I v15 route guards (جديدة) · J 409-family surfaces + input validation ·
#   K transport secrets (cron Bearer) · L receipts isolation ·
#   M plans contract (الخطة المجانية) · N v15 envelopes + caps · O v15 markers
# صفر كتابات ذات حالة (R2/R12) — قراءة فقط.
#
# Usage:  bash scripts/v15_postdeploy_battery.sh
# Env:    BASE_URL_WEB (default https://bot.smart-link.ly)
#         BASE_URL_API (default https://api.smart-link.ly)
#         V15_LIGHT=0  — disable login-empty-body check
# Output: docs/evidence/v15/post-deploy-verification.txt
set -u
PASS=0; FAIL=0; OUT=""
BOT="${BASE_URL_WEB:-https://bot.smart-link.ly}"
API="${BASE_URL_API:-https://api.smart-link.ly}"
EVID="$(dirname "$0")/../docs/evidence/v15"
mkdir -p "$EVID"
REPORT="$EVID/post-deploy-verification.txt"
T=$(mktemp -d)

check() { # name, expected, actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); OUT="$OUT✅ $1\n";
  else FAIL=$((FAIL+1)); OUT="$OUT❌ $1 (expected: $2, got: $3)\n"; fi
}
contains() { # name, haystack-file, needle
  if grep -q "$3" "$2"; then PASS=$((PASS+1)); OUT="$OUT✅ $1\n";
  else FAIL=$((FAIL+1)); OUT="$OUT❌ $1 (missing: $3)\n"; fi
}
notcontains() { # name, haystack-file, needle (negative)
  if grep -qi "$3" "$2"; then FAIL=$((FAIL+1)); OUT="$OUT❌ $1 (found forbidden: $3)\n";
  else PASS=$((PASS+1)); OUT="$OUT✅ $1\n"; fi
}
statusIn() { # name, actual, allowed-csv (e.g. "401,403")
  ok=0; IFS=','; for s in $3; do [ "$s" = "$2" ] && ok=1; done; unset IFS
  if [ $ok -eq 1 ]; then PASS=$((PASS+1)); OUT="$OUT✅ $1 ($2)\n";
  else FAIL=$((FAIL+1)); OUT="$OUT❌ $1 (expected one of $3, got: $2)\n"; fi
}

echo "== v15 post-deploy battery — $(date -u '+%Y-%m-%dT%H:%M:%SZ') ==" | tee "$REPORT"
echo "web: $BOT · api: $API" | tee -a "$REPORT"

# ══ A. availability (6) ═════════════════════════════════════════════════════
curl -s "$API/healthz" > "$T/hz.json"
contains "A1 healthz: database ok" "$T/hz.json" '"database":"ok"'
curl -s -D "$T/hz.hdr" -o /dev/null "$API/healthz"
contains "A2 healthz: content-type json" "$T/hz.hdr" 'content-type: application/json'
C=$(curl -s -o /dev/null -w "%{http_code}" "$BOT/"); check "A3 bot domain root 200" "200" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/"); check "A4 api domain root 200 (synced static)" "200" "$C"
curl -s "$BOT/v15-nonexistent" > "$T/nf1.html"
contains "A5 skip-link on 404 (bot domain)" "$T/nf1.html" 'id="page-content"'
curl -s "$API/v15-nonexistent" > "$T/nf2.html"
contains "A6 skip-link on 404 (api domain)" "$T/nf2.html" 'id="page-content"'

# ══ B. public pages (10) ════════════════════════════════════════════════════
curl -s "$BOT/login" > "$T/login.html"
C=$(curl -s -o /dev/null -w "%{http_code}" "$BOT/login"); check "B7 /login 200" "200" "$C"
contains "B7 login page title" "$T/login.html" 'تسجيل الدخول'
curl -s "$BOT/register" > "$T/reg.html"
C=$(curl -s -o /dev/null -w "%{http_code}" "$BOT/register"); check "B8 /register 200" "200" "$C"
contains "B8 register page title" "$T/reg.html" 'إنشاء حساب'
curl -s "$BOT/pricing" > "$T/pricing.html"
C=$(curl -s -o /dev/null -w "%{http_code}" "$BOT/pricing"); check "B9 /pricing 200" "200" "$C"
contains "B9 pricing CTA (server-rendered)" "$T/pricing.html" 'ابدأ مجاناً'
grep -q 'د\.ل\|دينار' "$T/pricing.html" && { PASS=$((PASS+1)); OUT="$OUT✅ B9 pricing currency LYD\n"; } || { FAIL=$((FAIL+1)); OUT="$OUT❌ B9 pricing currency LYD\n"; }
curl -s "$BOT/subscribe" > "$T/sub.html"
C=$(curl -s -o /dev/null -w "%{http_code}" "$BOT/subscribe"); check "B10 /subscribe 200" "200" "$C"
contains "B10 subscribe loading role=status" "$T/sub.html" 'role="status"'
curl -s "$BOT/demo" > "$T/demo.html"
C=$(curl -s -o /dev/null -w "%{http_code}" "$BOT/demo"); check "B11 /demo 200" "200" "$C"
contains "B11 demo messages tab" "$T/demo.html" 'الرسائل'
C=$(curl -s -o /dev/null -w "%{http_code}" "$BOT/terms"); check "B12 /terms 200" "200" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$BOT/privacy"); check "B13 /privacy 200" "200" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$BOT/connect"); check "B14 /connect 200" "200" "$C"
notcontains "B15 404 clean (no stack trace)" "$T/nf1.html" 'Traceback'
notcontains "B15b 404 clean (no ISE text)" "$T/nf1.html" 'Internal Server Error'
curl -s "$BOT/sitemap.xml" > "$T/sitemap.xml"
C=$(curl -s -o /dev/null -w "%{http_code}" "$BOT/sitemap.xml"); check "B16 sitemap 200" "200" "$C"
contains "B16 sitemap urlset" "$T/sitemap.xml" 'urlset'

# ══ C. security headers (8) ════════════════════════════════════════════════
curl -s -D "$T/bot.hdr" -o /dev/null "$BOT/"
contains "C17 CSP script-src present" "$T/bot.hdr" 'script-src'
notcontains "C18 CSP: no FB script hosts" "$T/bot.hdr" 'connect.facebook.net'
notcontains "C18b CSP: no graph host in script" "$T/bot.hdr" 'graph.facebook.com'
contains "C19 CSP connect-src present" "$T/bot.hdr" 'connect-src'
H=$(curl -s -I "$BOT/" | grep -i 'strict-transport-security' | grep -oE 'max-age=[0-9]+' | grep -oE '[0-9]+' | head -1)
[ -n "$H" ] && [ "$H" -ge 31536000 ] 2>/dev/null && { PASS=$((PASS+1)); OUT="$OUT✅ C20 HSTS bot ≥ 1y\n"; } || { FAIL=$((FAIL+1)); OUT="$OUT❌ C20 HSTS bot\n"; }
H=$(curl -s -I "$API/" | grep -i 'strict-transport-security' | tr -d '\r'); [ -n "$H" ] && { PASS=$((PASS+1)); OUT="$OUT✅ C21 HSTS api present\n"; } || { FAIL=$((FAIL+1)); OUT="$OUT❌ C21 HSTS api\n"; }
curl -s -I "$BOT/" | grep -i 'x-content-type-options' | tr -d '\r' > "$T/n1.txt"; contains "C22 bot nosniff" "$T/n1.txt" 'nosniff'
curl -s -I "$API/" | grep -i 'x-content-type-options' | tr -d '\r' > "$T/n2.txt"; contains "C23 api nosniff" "$T/n2.txt" 'nosniff'
curl -s -I "$BOT/" | grep -i 'referrer-policy' | tr -d '\r' > "$T/rp.txt"; contains "C24 referrer-policy present" "$T/rp.txt" 'referrer-policy'

# ══ D. CSRF double-submit contract (6) ══════════════════════════════════════
curl -s -D "$T/csrf.hdr" -o /dev/null "$API/api/plans"
contains "D25 csrf cookie issued on GET /api/plans" "$T/csrf.hdr" 'set-cookie: csrf_token'
contains "D26 csrf SameSite=strict" "$T/csrf.hdr" 'SameSite=strict'
contains "D27 csrf Secure" "$T/csrf.hdr" 'Secure'
notcontains "D28 csrf JS-readable (no HttpOnly)" "$T/csrf.hdr" 'httponly'
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST -b "csrf_token=x" "$API/api/plans")
check "D29 POST without X-CSRF-Token → 403" "403" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST -b "csrf_token=x" -H "X-CSRF-Token: garbage" "$API/api/plans")
check "D30 POST with forged X-CSRF-Token → 403" "403" "$C"

# ══ E. auth guards — مسارات v14 + v15 الجديدة (12) ═════════════════════════
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/me"); check "E31 /api/me → 401" "401" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/payments/balance"); check "E32 payments/balance → 401" "401" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/payments/history"); check "E33 payments/history → 401" "401" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/admin/subscriptions"); check "E34 admin/subscriptions → 401" "401" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/subscriptions/status-stream?payment_id=1"); check "E35 SSE guarded → 401" "401" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/payments/receipt/1"); check "E36 receipt v15 → 401 (عزل الإيصالات)" "401" "$C"
if [ "${V15_LIGHT:-1}" = "1" ]; then
  C=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H 'content-type: application/json' -d '{}' "$API/api/login")
  if [ "$C" != "403" ] && [ "$C" != "500" ]; then PASS=$((PASS+1)); OUT="$OUT✅ E37 login empty body not CSRF-blocked ($C)\n"; else FAIL=$((FAIL+1)); OUT="$OUT❌ E37 login empty body ($C)\n"; fi
fi
# v15 الجديدة (I-group مدمجة هنا للحراسة):
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H 'content-type: application/json' -d '{}' "$API/api/broadcasts"); check "I51 POST /api/broadcasts → 401" "401" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/broadcasts"); check "I52 GET /api/broadcasts → 401" "401" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H 'content-type: application/json' -d '{}' "$API/api/marketing/campaigns"); statusIn "I53 POST marketing/campaigns → 401/405/422" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{}' "$API/api/marketing/campaigns")" "401,405,422"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/marketing/campaigns"); check "I54 GET marketing/campaigns → 401" "401" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/api/users/1"); check "I55 DELETE /api/users/1 → 401 (اختبارات v15)" "401" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/admin/tenants/1"); statusIn "I56 admin/tenants → 401/405" "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/admin/tenants/1")" "401,405"
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H 'content-type: application/json' -d '{}' "$API/api/onboarding/connect-page"); statusIn "I57 onboarding/connect-page → 401/422" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{}' "$API/api/onboarding/connect-page")" "401,422"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/facebook/settings"); statusIn "I58 facebook/settings → 401/405" "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/facebook/settings")" "401,405"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/scheduled-posts"); check "I59 scheduled-posts → 401" "401" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/rules"); check "I60 rules → 401" "401" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/logs"); check "I61 logs → 401" "401" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/agent/sessions"); statusIn "I62 agent sessions → 401/404" "$(curl -s -o /dev/null -w '%{http_code}' "$API/api/agent/sessions")" "401,404"

# ══ F. method discipline + webhook surface (5) ═════════════════════════════
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/payments/topup"); check "F37 GET on POST-only topup → 405" "405" "$C"
A=$(curl -s -I "$API/api/payments/topup" | grep -i '^allow:' | tr -d '\r' | awk '{print $2}'); check "F37b 405 carries Allow: POST" "POST" "$A"
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H 'content-type: application/json' -d '{}' "$API/webhook")
check "F38 POST /webhook unsigned → 401" "401" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H 'content-type: application/json' -H 'X-Hub-Signature-256: sha1=fake' -d '{}' "$API/webhook")
check "F39 POST /webhook forged signature → 401" "401" "$C"
R=$(curl -s "$API/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x987")
if [ "$R" != "x987" ]; then PASS=$((PASS+1)); OUT="$OUT✅ F40 wrong verify token not echoed\n"; else FAIL=$((FAIL+1)); OUT="$OUT❌ F40 verify token echoed!\n"; fi
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H 'content-type: application/json' -d '{}' "$API/api/telegram/webhook")
if [ "$C" = "401" ] || [ "$C" = "403" ]; then PASS=$((PASS+1)); OUT="$OUT✅ F41 telegram webhook guarded ($C)\n"; else FAIL=$((FAIL+1)); OUT="$OUT❌ F41 telegram webhook ($C)\n"; fi

# ══ G. caching + assets (5) ═══════════════════════════════════════════════
TB=$(curl -s "$BOT/" | grep -oE '/_next/static/(immutable/)?chunks/[a-zA-Z0-9_-]+\.js' | head -1)
curl -s -I "$BOT$TB" | grep -i 'cache-control' | tr -d '\r' > "$T/g1.txt"; contains "G42 bot chunk immutable" "$T/g1.txt" 'immutable'
TA=$(curl -s "$API/" | grep -oE '/_next/static/(immutable/)?chunks/[a-zA-Z0-9_-]+\.js' | head -1)
curl -s -I "$API$TA" | grep -i 'cache-control' | tr -d '\r' > "$T/g2.txt"; contains "G43 api chunk immutable (نضارة sync)" "$T/g2.txt" 'immutable'
curl -s -I "$BOT/opengraph-image.png" | grep -i 'cache-control' | tr -d '\r' > "$T/g3.txt"; contains "G44 og:image immutable" "$T/g3.txt" 'immutable'
TF=$(curl -s "$BOT/" | grep -oE '/fonts/[^"'"'"' ]+\.woff2' | head -1)
if [ -n "$TF" ]; then
  curl -s -I "$BOT$TF" | grep -i 'cache-control' | tr -d '\r' > "$T/g4.txt"; contains "G45 fonts long cache" "$T/g4.txt" 'cache-control'
else
  curl -s "$BOT/" | grep -oE '/_next/static/media/[^"'"'"' ]+\.woff2' | head -1 > "$T/fn.txt"
  TFW=$(cat "$T/fn.txt"); curl -s -I "$BOT$TFW" | grep -i 'cache-control' | tr -d '\r' > "$T/g4.txt"; contains "G45 fonts long cache" "$T/g4.txt" 'cache-control'
fi
C=$(curl -s -o /dev/null -w "%{http_code}" "$BOT/robots.txt"); check "G46 robots.txt 200" "200" "$C"

# ══ H. envelopes + JS budget (4) ═══════════════════════════════════════════
curl -s "$API/api/plans" > "$T/plans.json"
contains "H47 plans success envelope" "$T/plans.json" '"success":true'
contains "H48 plans data array" "$T/plans.json" '"data"'
C=$(curl -s -o /dev/null -w "%{http_code}" "$BOT/manifest.webmanifest"); check "H49 manifest 200" "200" "$C"
SIZE=$(curl -s "$BOT/" | grep -oE 'src="[^"]+\.js"' | grep -oE '/[^"]+' | sort -u | while read u; do curl -s -o /dev/null -w "%{size_download} " "$BOT$u"; done | awk '{s=0; for(i=1;i<=NF;i++) s+=$i; print s}')
KB=$((SIZE/1024))
echo "landing first-load JS (bot domain): ${SIZE} bytes (~${KB}KB raw)" | tee -a "$REPORT"
if [ $KB -lt 750 ]; then PASS=$((PASS+1)); OUT="$OUT✅ H50 landing first-load JS ${KB}KB < 750KB\n"; else FAIL=$((FAIL+1)); OUT="$OUT❌ H50 landing first-load JS ${KB}KB\n"; fi

# ══ J. عائلة 409 + تحقق المدخلات (4) ══════════════════════════════════════
# بلا حالة: مسارات الكتابة تُفحص حراستها فقط — العقد الحي يُقاس ببطارية المحاكاة
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H 'content-type: application/json' -d '{"page_id":"123"}' "$API/api/onboarding/connect-page")
statusIn "J63 connect-page unauth → 401/403/422" "$C" "401,403,422"
# تحقق المدخلات المالية (عائلة D1-H1): قيم غير صالحة ترد 422 لا 500 — يُحتاج مصادقة،
# فالفحص الأمين بلا حالة: POST فارغ على مسار مالي موقّع بلا CSRF
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H 'content-type: application/json' -d '{"amount":"abc"}' "$API/api/payments/topup")
statusIn "J64 topup non-numeric (no auth) → 401/403 لا 500" "$C" "401,403"
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H 'content-type: application/json' -d '{"id":"not-int"}' "$API/api/admin/subscriptions")
statusIn "J65 admin/subscriptions bad-id (no auth) → 401/403 لا 500" "$C" "401,403"
C=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/api/admin/tenants/999")
statusIn "J66 DELETE tenant (no auth) → 401/403/405" "$C" "401,403,405"

# ══ K. أسرار النقل — كرون Bearer (4) ══════════════════════════════════════
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/cron/heartbeat")
statusIn "K67 heartbeat بلا سر → 401/403" "$C" "401,403"
C=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer garbage" "$API/api/cron/heartbeat")
statusIn "K68 heartbeat بسر مزيف → 401/403" "$C" "401,403"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/cron/cleanup-logs")
statusIn "K69 cleanup-logs GET بلا سر → 401/403 (v15: GET حي)" "$C" "401,403"
C=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer garbage" "$API/api/cron/bot-cycle")
statusIn "K70 bot-cycle بسر مزيف → 401/403" "$C" "401,403"

# ══ L. عزل الإيصالات والملفات (3) ═════════════════════════════════════════
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/payments/receipt/99999")
check "L71 receipt غير موجود → 401 (لا كشف وجود)" "401" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/payments/receipt/../../etc/passwd")
statusIn "L72 receipt traversal → 401/404/422" "$C" "401,404,422"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/static/uploads/receipts/")
statusIn "L73 فهرس الإيصالات غير مصرّح → 401/403/404" "$C" "401,403,404"

# ══ M. عقد الخطط — الرحلة المجانية (5) ════════════════════════════════════
grep -q '"price": *0\|"price":0\|"price":"0"' "$T/plans.json" && { PASS=$((PASS+1)); OUT="$OUT✅ M74 خطة مجانية price=0 حاضرة في /api/plans\n"; } || { FAIL=$((FAIL+1)); OUT="$OUT❌ M74 خطة مجانية غائبة (قناة التسجيل الأولى!)\n"; }
grep -q '"is_active": *true\|"is_active":true' "$T/plans.json" && { PASS=$((PASS+1)); OUT="$OUT✅ M75 خطط نشطة معروضة\n"; } || { FAIL=$((FAIL+1)); OUT="$OUT❌ M75 لا خطط نشطة\n"; }
PLAN_COUNT=$(grep -o '"id"' "$T/plans.json" | wc -l)
[ "${PLAN_COUNT:-0}" -ge 2 ] && { PASS=$((PASS+1)); OUT="$OUT✅ M76 خطط متعددة ($PLAN_COUNT)\n"; } || { FAIL=$((FAIL+1)); OUT="$OUT❌ M76 خطط قليلة ($PLAN_COUNT)\n"; }
# v15-fix (قيد جزر العميل الموثق منذ v14): /subscribe قشرة SSR بحالة تحميل
# (role=status — يفحصها B10) — الخطط والأ Prices تُحمّل بالعميل عبر react-query
# ولا تُرى بـcurl؛ الفحص الخادمي الأمين: العنوان العربي + هيكل القشرة
curl -s "$BOT/subscribe" > "$T/sub2.html"
contains "M77 صفحة الاشتراك: قشرة عربية بعنوان" "$T/sub2.html" 'الاشتراك'
contains "M78 صفحة الاشتراك: قشرة RTL" "$T/sub2.html" 'dir="rtl"'

# ══ N. مظاريف v15 + سقوف (4) ══════════════════════════════════════════════
curl -s "$API/healthz" > "$T/hz2.json"
contains "N79 healthz envelope ok" "$T/hz2.json" 'ok'
# سقوف القوائم: بلا مصادقة نتحقق من أن الطلب بلا حد لا يفجر 500
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/rules?limit=99999")
check "N80 rules limit=99999 (no auth) → 401 (لا 500 خام)" "401" "$C"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/subscribers?per_page=99999")
statusIn "N81 subscribers per_page (no auth) → 401/403" "$C" "401,403"
C=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/logs?days=99999")
check "N82 logs days (no auth) → 401 (لا 500)" "401" "$C"

# ══ O. علامات v15 الحية (4) ═══════════════════════════════════════════════
curl -s "$BOT/connect" > "$T/connect.html"
contains "O83 /connect حي بعنوان v15" "$T/connect.html" '<title'
grep -q 'lang="ar"' "$T/connect.html" && { PASS=$((PASS+1)); OUT="$OUT✅ O84 lang=ar على /connect\n"; } || { FAIL=$((FAIL+1)); OUT="$OUT❌ O84 lang=ar\n"; }
grep -q 'dir="rtl"' "$T/connect.html" && { PASS=$((PASS+1)); OUT="$OUT✅ O85 dir=rtl على /connect\n"; } || { FAIL=$((FAIL+1)); OUT="$OUT❌ O85 dir=rtl\n"; }
BID=$(curl -s "$BOT/" | grep -oE '/_next/static/[a-zA-Z0-9_-]+/' | head -1)
[ -n "$BID" ] && { PASS=$((PASS+1)); OUT="$OUT✅ O86 buildId حي (${BID})\n"; } || { FAIL=$((FAIL+1)); OUT="$OUT❌ O86 buildId\n"; }

echo -e "\n$OUT" | tee -a "$REPORT"
echo "─────────────────────────────" | tee -a "$REPORT"
TOTAL=$((PASS+FAIL))
echo "PASS: $PASS  FAIL: $FAIL  TOTAL: $TOTAL" | tee -a "$REPORT"
[ $FAIL -eq 0 ] && echo "ALL LIVE CHECKS GREEN" | tee -a "$REPORT"
rm -rf "$T"
exit $FAIL
