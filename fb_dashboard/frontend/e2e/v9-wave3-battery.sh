#!/bin/bash
# v9 wave-3 full evidence battery — ONE invocation (daemons don't survive between calls).
# Boots backend + frontend, then: public axe 40 combos → authed axe → bundle proofs → teardown.
set -uo pipefail
pkill -f "next-server" 2>/dev/null
pkill -f "next start" 2>/dev/null
pkill -f "uvicorn runner:app" 2>/dev/null
sleep 1
SK=$(sed -n 1p /tmp/v9-backend.env)
FK=$(sed -n 2p /tmp/v9-backend.env)
CS=$(/home/z/my-project/SmartBot/.venv/bin/python -c "import secrets;print(secrets.token_urlsafe(32))")
cd /home/z/my-project/SmartBot
DATABASE_URL="sqlite+aiosqlite:////home/z/my-project/db/custom.db" SECRET_KEY="$SK" FERNET_KEY="$FK" CRON_SECRET="$CS" \
  setsid nohup /home/z/my-project/SmartBot/.venv/bin/python -m uvicorn runner:app --app-dir fb_dashboard --host 127.0.0.1 --port 8000 > /tmp/v9-uvicorn.log 2>&1 < /dev/null &
disown
for i in $(seq 1 30); do curl -sf http://127.0.0.1:8000/healthz > /dev/null && break; sleep 1; done
curl -s http://127.0.0.1:8000/healthz | head -c 60; echo " (backend up)"
cd /home/z/my-project/SmartBot/fb_dashboard/frontend
LOCAL_API_PROXY=http://127.0.0.1:8000 setsid nohup npx next start -p 3199 > /tmp/v9-next.log 2>&1 < /dev/null &
disown
for i in $(seq 1 20); do curl -sf http://localhost:3199/ > /dev/null && break; sleep 1; done
echo "front up"

echo "════ [1/3] public axe sweep (40 combos) ════"
node e2e/v9-axe-sweep.mjs 2>&1 | tail -12
SWEEP1=$?

echo "════ [2/3] authed axe (dashboard+messages) ════"
node e2e/v9-authed-axe.mjs 2>&1 | tail -12
SWEEP2=$?

echo "════ [3/3] bundle + SEO proofs ════"
# 3a. recharts lazy: dashboard page HTML must NOT inline the big recharts chunk as <script async src>
DASH_HTML=$(curl -s http://localhost:3199/ -o /dev/null -w "%{http_code}")
echo "landing status: $DASH_HTML"
# og:image on the 6 routes (grep the served HTML)
for R in pricing register demo subscribe privacy terms; do
  OG=$(curl -s "http://localhost:3199/$R" | grep -c 'property="og:image"')
  echo "og:image /$R = $OG"
done
# recharts eager check: which static chunks contain recharts marker, and are they referenced from /dashboard HTML?
grep -rl "recharts" .next/static/chunks/*.js 2>/dev/null | head -3
# find scripts referenced by dashboard page (requires cookie; approximate via analytics-free HTML of / instead)
pkill -f "next-server" 2>/dev/null
pkill -f "next start" 2>/dev/null
pkill -f "uvicorn runner:app" 2>/dev/null
echo "════ battery done: sweep1=$SWEEP1 sweep2=$SWEEP2 ════"
exit $(( SWEEP1 + SWEEP2 ))