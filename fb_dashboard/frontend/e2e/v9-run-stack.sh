#!/bin/bash
# v9-D5 runner: boots backend (8000) + next prod (3199, LOCAL_API_PROXY) then runs the sweep.
# Sandbox note: background daemons do not survive between tool invocations, so the
# full stack lifecycle (start → wait healthy → sweep → teardown) lives in ONE run.
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
node e2e/v9-axe-sweep.mjs
SWEEP=$?
pkill -f "next-server" 2>/dev/null
pkill -f "next start" 2>/dev/null
pkill -f "uvicorn runner:app" 2>/dev/null
echo "sweep exit=$SWEEP"
exit $SWEEP
