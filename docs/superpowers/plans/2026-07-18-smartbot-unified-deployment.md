# SmartBot Unified Deployment Architecture

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reunite SmartBot into a single Vercel project so `bot.smart-link.ly` serves both the Next.js frontend AND the Python FastAPI backend — no split projects, no proxy, one entry point.

**Architecture:** Restore the original monolith pattern from `4c6cca17`: Vercel builds Next.js to `fb_dashboard/static/`, then the Python FastAPI function serves those static files alongside the APIs. The SPA catch-all route in `runner.py` handles frontend routing. All traffic goes through one Vercel function at `api/index.py`.

**Tech Stack:** Vercel (monolith function), FastAPI (Python 3.12), Next.js 16, Tailwind 4, Vite 8 (for old SPA remnants)

---

## Global Constraints

- No force-push. Ever. All branch changes via PR.
- `bot.smart-link.ly` is the single production domain — serves frontend AND API.
- `api.smart-link.ly` becomes an alias/backup or decommissioned.
- No `.env.local` secrets in git. `.gitignore` pattern `.env*` already set.
- Vercel Authentication must be OFF for `bot.smart-link.ly`.
- Bundle size must stay under Vercel's 50MB function limit.

---

### Task 1: Build Next.js to `fb_dashboard/static/`

**Files:**
- Modify: `vercel.json` — add buildCommand + outputDirectory

**Interfaces:**
- Consumes: Next.js source in `fb_dashboard/frontend/`
- Produces: Built Next.js output in `fb_dashboard/static/` (read by runner.py)

- [ ] **Step 1: Update vercel.json**

Replace the current config with one that builds the frontend AND serves it via Python:

```json
{
  "buildCommand": "cd fb_dashboard/frontend && npm install && npm run build && rm -rf ../../fb_dashboard/static && cp -r out ../../fb_dashboard/static",
  "outputDirectory": ".",
  "installCommand": "pip install -r requirements.txt",
  "framework": "fastapi",
  "regions": ["iad1"],
  "cleanUrls": true,
  "headers": [
    {
      "source": "/static/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/static/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=86400" }
      ]
    }
  ],
  "functions": {
    "api/index.py": {
      "maxDuration": 30,
      "memory": 512,
      "includeFiles": "fb_dashboard/**",
      "excludeFiles": "{fb_dashboard/frontend/node_modules/**,__pycache__/**,.pytest_cache/**,tests/**,mobile/**,docs/**,e2e_artifacts/**,.playwright-mcp/**,*.md,*.db,botlogo.png}"
    }
  },
  "rewrites": [
    { "source": "/(.*)", "destination": "/api/index.py" }
  ]
}
```

- [ ] **Step 2: Verify build locally**

```bash
cd fb_dashboard/frontend && npm run build
ls -la ../static/  # should have index.html, assets/ folder
```

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat: unify deployment — Vercel builds Next.js into static/ for FastAPI to serve"
```

---

### Task 2: Harden runner.py for Vercel monolith mode

**Files:**
- Modify: `fb_dashboard/runner.py` — lines near SPA catch-all (820-850)

**Interfaces:**
- Consumes: Built static files in `fb_dashboard/static/`
- Produces: Correct SPA serving for all frontend routes including dashboard pages

- [ ] **Step 1: Audit SPA catch-all route**

The current catch-all at line 826 `<f1>def spa_catch_all(path)` explicitly rejects dashboard paths (`login`, `register`, `pricing`, etc.) by returning 404. In the unified architecture, these paths MUST be served the SPA `index.html` because Next.js static export generates them.

Change the exclusion list to only reject true API/system paths:

```python
@app.get("/{path:path}", response_class=HTMLResponse, include_in_schema=False)
async def spa_catch_all(path: str):
    # Unchanged: reject paths that must hit actual endpoints
    if path.startswith(("api/", "static/", "healthz", "webhook", "ws")):
        return HTMLResponse("", status_code=404)
    # Everything else: serve the SPA (Next.js static export handles routing client-side)
    return HTMLResponse(_get_spa())
```

- [ ] **Step 2: Verify Next.js static export config**

Ensure `fb_dashboard/frontend/next.config.ts` generates static export (not server):

```ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "export",  // <-- ADD THIS for static generation
  images: { unoptimized: true },  // <-- ADD THIS for static export
  async rewrites() {
    return []
  },
}

export default nextConfig
```

Remove the old rewrites since the proxy is no longer needed — the Python backend serves APIs from the same domain.

- [ ] **Step 3: Commit**

```bash
git add fb_dashboard/runner.py fb_dashboard/frontend/next.config.ts
git commit -m "fix: SPA catch-all accepts dashboard paths; Next.js static export"
```

---

### Task 3: Disable Vercel Authentication for `bot.smart-link.ly`

**Background:** Vercel Authentication (SSO) was enabled on the domain when the new project was created. This must be disabled so public visitors can access the site.

- [ ] **Step 1: Disable via Vercel CLI**

```bash
npx vercel project update smart-bot-api --sso-protection disabled
```

If that fails, disable via Vercel Dashboard → Settings → Deployment Protection.

- [ ] **Step 2: Verify**

```bash
# Should return 200, not Vercel login page
curl -sL -o /dev/null -w "%{http_code}" https://bot.smart-link.ly/
```

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "fix: disable Vercel Authentication on bot.smart-link.ly"
```

---

### Task 4: Re-assign domain & decommission split project

- [ ] **Step 1: Assign `bot.smart-link.ly` to the main project**

```bash
npx vercel alias set <deployment-url> bot.smart-link.ly --scope ahmadmedo1012-9441s-projects
```

- [ ] **Step 2: Remove `smartbot-frontend` project** (the split project)

```bash
npx vercel project remove smartbot-frontend --yes
```

- [ ] **Step 3: Verify all traffic flows through one project**

```bash
curl -sL -o /dev/null -w "%{http_code}" https://bot.smart-link.ly/  # → 200
curl -sL -o /dev/null -w "%{http_code}" https://bot.smart-link.ly/api/plans  # → 200
curl -sL -o /dev/null -w "%{http_code}" https://bot.smart-link.ly/pricing  # → 200
curl -sL -o /dev/null -w "%{http_code}" https://bot.smart-link.ly/login  # → 200
```

---

### Task 5: Final verification (Playwright E2E test)

- [ ] **Step 1: Verify all pages render correctly**

```bash
# Via Vercel Web Fetch MCP or curl
echo "=== Frontend ==="
curl -sL -o /dev/null -w "%{http_code}" https://bot.smart-link.ly/         # 200
curl -sL -o /dev/null -w "%{http_code}" https://bot.smart-link.ly/pricing  # 200
curl -sL -o /dev/null -w "%{http_code}" https://bot.smart-link.ly/login    # 200
curl -sL -o /dev/null -w "%{http_code}" https://bot.smart-link.ly/register # 200
curl -sL -o /dev/null -w "%{http_code}" https://bot.smart-link.ly/demo     # 200
echo "=== API (same domain, no proxy) ==="
curl -s -o /dev/null -w "%{http_code}" https://bot.smart-link.ly/api/plans     # 200
curl -s -o /dev/null -w "%{http_code}" https://bot.smart-link.ly/api/healthz   # 200
echo "=== Plans have real prices ==="
curl -s https://bot.smart-link.ly/api/plans | python3 -c "
import json, sys
data = json.loads(sys.stdin.read())
paid = [p for p in data if p.get('price', 0) > 0]
print(f'Paid plans: {len(paid)}/4 — prices are real ✅' if len(paid) >= 3 else '❌')
"
```

- [ ] **Step 2: Take screenshots of key pages**

Use Playwright or Chrome DevTools MCP to capture:
- `bot.smart-link.ly/pricing` — verify plan cards show correct prices
- `bot.smart-link.ly/login` — verify form renders
- `bot.smart-link.ly/api/plans` — verify JSON response contains 4 plans

---

## Rollback Plan

If the monolith build fails (e.g., Next.js export size exceeds 50MB):

1. Revert vercel.json to current config (no buildCommand)
2. Revert next.config.ts to proxy mode
3. Re-create `smartbot-frontend` project from git history
4. Re-assign `bot.smart-link.ly` to the frontend project

The codebase continues to support both modes — the split architecture is still valid, just not active.
