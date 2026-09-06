#!/bin/bash
# v9 authed battery v2 — verified stack: backend + frontend proxy + authed axe + dashboard chunk proof
set -uo pipefail
pkill -f "next-server" 2>/dev/null; pkill -f "next start" 2>/dev/null; pkill -f "uvicorn runner:app" 2>/dev/null
sleep 2
SK=$(sed -n 1p /tmp/v9-backend.env); FK=$(sed -n 2p /tmp/v9-backend.env)
CS=$(/home/z/my-project/SmartBot/.venv/bin/python -c "import secrets;print(secrets.token_urlsafe(32))")
cd /home/z/my-project/SmartBot
(DATABASE_URL="sqlite+aiosqlite:////home/z/my-project/db/custom.db" SECRET_KEY="$SK" FERNET_KEY="$FK" CRON_SECRET="$CS" DEBUG=1 \
  /home/z/my-project/SmartBot/.venv/bin/python -m uvicorn runner:app --app-dir fb_dashboard --host 127.0.0.1 --port 8000 > /tmp/v9-uvicorn.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://127.0.0.1:8000/healthz > /dev/null && break; sleep 1; done; echo "backend up"
cd /home/z/my-project/SmartBot/fb_dashboard/frontend
(LOCAL_API_PROXY=http://127.0.0.1:8000 npx next start -p 3201 > /tmp/v9-next2.log 2>&1 &)
for i in $(seq 1 25); do curl -sf http://localhost:3201/ > /dev/null && break; sleep 1; done; echo "front up"
PLANS=$(curl -s http://localhost:3201/api/plans | head -c 40)
echo "plans probe: $PLANS"
case "$PLANS" in
  '{'*) echo "PROXY OK";;
  *) echo "PROXY BROKEN — aborting"; pkill -f "next-server"; pkill -f "uvicorn runner:app"; exit 2;;
esac

echo "══ authed axe ══"
BASE_URL=http://localhost:3201 node e2e/v9-authed-axe.mjs 2>&1 | tail -12
SWEEP=$?

echo "══ dashboard HTML chunk proof ══"
node -e '
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push(String(e).slice(0,80)));
  await p.goto("http://localhost:3201/login", { waitUntil: "networkidle" });
  await p.fill("#username", "v9probe");
  await p.fill("input[type=password]", "V9Probe#2026");
  await p.click("button[type=submit]");
  await p.waitForURL(/dashboard|admin/, { timeout: 20000 }).catch(()=>{});
  console.log("URL:", p.url());
  if (!/dashboard|admin/.test(p.url())) { console.log("LOGIN FAILED"); await b.close(); return; }
  await p.goto("http://localhost:3201/dashboard", { waitUntil: "networkidle", timeout: 25000 }).catch(()=>{});
  await p.waitForLoadState("networkidle", {timeout: 20000}).catch(()=>{});
  const html = await p.content();
  console.log("recharts eager in dashboard HTML:", html.includes("1ekh7de615s3-") ? "YES ❌" : "NO ✓ (lazy)");
  const scripts = await p.$$eval("script[src]", els => els.map(e => e.getAttribute("src")).filter(Boolean));
  console.log("initial script tags:", scripts.length);
  const bodyFont = await p.evaluate(() => getComputedStyle(document.body).fontFamily.slice(0, 40));
  console.log("dashboard body font:", bodyFont);
  console.log("pageErrors:", errs.length, errs.slice(0,2));
  await p.screenshot({ path: "e2e/e2e_artifacts/v9-final-dashboard.png", fullPage: false });
  await b.close();
})();
' 2>&1 | tail -7

pkill -f "next-server" 2>/dev/null; pkill -f "next start" 2>/dev/null; pkill -f "uvicorn runner:app" 2>/dev/null
echo "authed exit=$SWEEP"