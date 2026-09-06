#!/bin/bash
# v9 authed re-run with DEBUG=1 (csrf origin check allows localhost browser POSTs)
set -uo pipefail
pkill -f "next-server" 2>/dev/null; pkill -f "next start" 2>/dev/null; pkill -f "uvicorn runner:app" 2>/dev/null
sleep 1
SK=$(sed -n 1p /tmp/v9-backend.env); FK=$(sed -n 2p /tmp/v9-backend.env)
CS=$(/home/z/my-project/SmartBot/.venv/bin/python -c "import secrets;print(secrets.token_urlsafe(32))")
cd /home/z/my-project/SmartBot
DATABASE_URL="sqlite+aiosqlite:////home/z/my-project/db/custom.db" SECRET_KEY="$SK" FERNET_KEY="$FK" CRON_SECRET="$CS" DEBUG=1 \
  setsid nohup /home/z/my-project/SmartBot/.venv/bin/python -m uvicorn runner:app --app-dir fb_dashboard --host 127.0.0.1 --port 8000 > /tmp/v9-uvicorn.log 2>&1 < /dev/null &
disown
for i in $(seq 1 30); do curl -sf http://127.0.0.1:8000/healthz > /dev/null && break; sleep 1; done; echo "backend up"
cd /home/z/my-project/SmartBot/fb_dashboard/frontend
LOCAL_API_PROXY=http://127.0.0.1:8000 setsid nohup npx next start -p 3199 > /tmp/v9-next.log 2>&1 < /dev/null &
disown
for i in $(seq 1 20); do curl -sf http://localhost:3199/ > /dev/null && break; sleep 1; done; echo "front up"

echo "── plans probe via proxy ──"
curl -s http://localhost:3199/api/plans | head -c 120; echo

echo "══ authed axe ══"
node e2e/v9-authed-axe.mjs 2>&1 | tail -14
SWEEP=$?

echo "══ dashboard HTML chunk check ══"
node -e '
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3199/login", { waitUntil: "networkidle" });
  await p.fill("#username", "v9probe").catch(()=>p.fill("input[type=text]", "v9probe"));
  await p.fill("input[type=password]", "V9Probe#2026");
  await p.click("button[type=submit]");
  await p.waitForURL("**/dashboard**", { timeout: 20000 }).catch(()=>{});
  const url = p.url();
  const scripts = await p.$$eval("script[src]", els => els.map(e => e.getAttribute("src")));
  const html = await p.content();
  console.log("URL:", url);
  console.log("script tags:", scripts.length);
  // the recharts chunk marker
  const rechartsChunk = "1ekh7de615s3-";
  console.log("recharts chunk referenced in dashboard HTML:", html.includes(rechartsChunk) ? "EAGER ❌" : "LAZY ✓");
  // joyride eager?
  console.log("joyride marker in HTML scripts:", scripts.some(s => s.includes("29eqgm")) ? "check" : "not in initial scripts ✓");
  await b.close();
})();
' 2>&1 | tail -6

pkill -f "next-server" 2>/dev/null; pkill -f "next start" 2>/dev/null; pkill -f "uvicorn runner:app" 2>/dev/null
echo "authed exit=$SWEEP"