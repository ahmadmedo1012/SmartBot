# SmartBot Deployment Plan — Option B: Separate Domains

## Architecture Summary

```
bot.smart-link.ly (Next.js 16)
  ├── / (Landing page)
  ├── /login (Auth page)
  ├── /dashboard (Authenticated dashboard)
  ├── /subscribe (Subscription flow)
  ├── /demo (Demo dashboard)
  ├── /pricing (Pricing plans)
  └── /api/* → rewrites to api.bot.smart-link.ly/api/*

api.bot.smart-link.ly (Python FastAPI)
  ├── /api/login, /api/me, /api/logout
  ├── /api/plans, /api/subscriptions, /api/subscriptions/*
  ├── /api/admin/subscriptions
  ├── /ws (WebSocket — real-time updates)
  ├── /api/events (SSE)
  ├── /api/telegram/webhook
  ├── /api/payments/*
  ├── /api/rules, /api/replies, /api/comments...
  ├── /api/bot/* (bot engine, status, trigger)
  ├── /api/analytics/*
  ├── /api/facebook/*
  └── /healthz (health check)
```

---

## Phase 0: Preparation

### 0.1 Audit Current Vercel State
```
vercel list --prod            # Current production deployments
vercel project ls              # All projects
vercel domains ls              # Custom domains
vercel env ls                  # Environment variables
```

### 0.2 Inventory Python Backend Env Vars
| Variable | Source | Purpose |
|----------|--------|---------|
| DATABASE_URL | `.env` | Neon PostgreSQL |
| DATABASE_POOLED_URL | `.env` | Pooled Neon connection |
| SECRET_KEY | `.env` | JWT signing |
| FACEBOOK_ACCESS_TOKEN | `.env` | Facebook Graph API |
| FACEBOOK_PAGE_ID | `.env` | Facebook page |
| OPENAI_API_KEY | `.env` | AI service |
| OPENAI_BASE_URL | `.env` | AI proxy URL |
| TELEGRAM_BOT_TOKEN | `.env` | Telegram bot |
| TELEGRAM_ADMIN_IDS | `.env` | Admin chat IDs |
| TELEGRAM_WEBHOOK_SECRET | `.env` | Webhook HMAC |
| CRON_SECRET | `.env` | cron-job.org auth |
| DEBUG | `.env` | Dev mode |
| LOG_LEVEL | `.env` | Logging |
| FERNET_KEY | `.env` | Token encryption |
| START_BOT | `.env` | Auto-start bot |
| BOT_INTERVAL_SECONDS | `.env` | Polling interval |

### 0.3 Files to Modify

| File | Change |
|------|--------|
| `fb_dashboard/runner.py` | Add CORS middleware (allow bot.smart-link.ly) + Authorization header support |
| `next.config.ts` | Rewrites: `/api/*` → `https://api.bot.smart-link.ly/api/*` |
| `fb_dashboard/frontend/middleware.ts` | Remove SSO redirect, read token from cookie |
| `fb_dashboard/frontend/src/lib/csrf-client.ts` | Send `Authorization: Bearer` when cookie present |
| `fb_dashboard/runner.py` | Add OPTIONS handler for CORS preflight |
| `root vercel.json` | Delete or archive (no longer used) |

---

## Phase 1: Set Up Python API (api.bot.smart-link.ly)

### 1.1 Create New Vercel Project
```bash
cd /home/ahmed/Downloads/SmartBot
# Create vercel.json for API-only
cat > vercel.api.json << 'EOF'
{
  "functions": {
    "api/index.py": { "maxDuration": 30 }
  },
  "rewrites": [
    { "source": "/(.*)", "destination": "/api/index.py" }
  ]
}
EOF
```

### 1.2 Deploy Python API
```bash
vercel --prod --name smart-bot-api
vercel domains add api.bot.smart-link.ly
vercel env add TELEGRAM_BOT_TOKEN production
# ... add all env vars from Phase 0.2
```

### 1.3 Add CORS Support
In `runner.py`, modify CORS middleware:
```python
origins = [
    "https://bot.smart-link.ly",
    "https://app.bot.smart-link.ly",  # if needed
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
```

### 1.4 Add Authorization Bearer Support
In `get_current_user()` function:
```python
# Check Authorization header first, then cookie
auth_header = request.headers.get("Authorization", "")
if auth_header.startswith("Bearer "):
    token = auth_header[7:]
else:
    token = request.cookies.get("token", "")
```

### 1.5 Add OPTIONS Preflight Handler
```python
@app.options("/{path:path}")
async def preflight_handler():
    return JSONResponse(content="ok", headers={
        "Access-Control-Allow-Origin": "https://bot.smart-link.ly",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, csrf-token",
        "Access-Control-Allow-Credentials": "true",
    })
```

### 1.6 Register Telegram Webhook
```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://api.bot.smart-link.ly/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

### 1.7 Verify API Health
```bash
curl https://api.bot.smart-link.ly/healthz
# Expected: {"ok": true, "database": "ok", "plans": 5}
curl https://api.bot.smart-link.ly/api/plans
# Expected: [{"id": 1, "name": "Free", ...}]
```

---

## Phase 2: Set Up Next.js Frontend (bot.smart-link.ly)

### 2.1 Update next.config.ts
```ts
const API_HOST = process.env.NEXT_PUBLIC_API_HOST || "https://api.bot.smart-link.ly"

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_HOST}/api/:path*` },
    ]
  },
}
```

### 2.2 Update Auth Flow
Change `csrffetch` / `fetch` to send `Authorization: Bearer` header:
```ts
const token = getCookie("token")
if (token) headers.set("Authorization", `Bearer ${token}`)
```

### 2.3 Update Middleware
```ts
// middleware.ts — remove domain check, keep auth redirect for protected routes
const publicPaths = ["/", "/login", "/pricing", "/subscribe", "/demo"]
```

### 2.4 Build & Deploy
```bash
cd fb_dashboard/frontend
npm run build
vercel --prod --name smart-bot
vercel domains add bot.smart-link.ly
```

### 2.5 Set Environment Variables
```bash
vercel env add NEXT_PUBLIC_API_HOST production  # → https://api.bot.smart-link.ly
vercel env add NEXT_PUBLIC_DOMAIN production      # → https://bot.smart-link.ly
```

### 2.6 Verify
```bash
curl https://bot.smart-link.ly/          # Should return Next.js HTML
curl https://bot.smart-link.ly/api/me    # Should proxy to API (returns 401 if no auth — expected)
```

---

## Phase 3: Migration & Cutover

### 3.1 DNS Changes
1. `bot.smart-link.ly` → CNAME to Vercel Next.js project
2. `api.bot.smart-link.ly` → CNAME to Vercel Python project

### 3.2 Deploy Next.js to Production
```bash
vercel --prod    # Ensure production target
```

### 3.3 Verify End-to-End
```bash
# Test 1: Landing page loads
curl -s https://bot.smart-link.ly/ | grep "SmartBot"

# Test 2: Login works
curl -s -X POST https://bot.smart-link.ly/api/login -d "username=admin&password=admin"

# Test 3: Plans load (no auth needed)
curl -s https://bot.smart-link.ly/api/plans

# Test 4: Dashboard loads with auth
curl -s -H "Authorization: Bearer <token>" https://bot.smart-link.ly/api/stats
```

### 3.4 Rollback Plan
```bash
# Deploy old Python+Vite project with original vercel.json
vercel --prod --name smart-bot
vercel domains add bot.smart-link.ly
```

---

## Phase 4: Cleanup

### 4.1 Remove Old Vercel Project
```bash
vercel project rm smart-bot-old
```

### 4.2 Archive Old Files
- `vercel.json` (root) → `vercel.old.json`
- `api/index.py` stays (the API itself still runs)

### 4.3 Update Documentation
- CLAUDE.md
- PROJECT.md

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Auth cookies don't work cross-domain | High | Switch to Authorization: Bearer header + in-memory token storage |
| CORS preflight failures | Medium | Add explicit OPTIONS handler + test with all endpoints |
| API cold start (10s+ on Vercel) | Medium | Increase maxDuration to 30s, or move to persistent host |
| DNS propagation delay | Low | Deploy API first, then frontend, test via Vercel staging URL before DNS change |
| Telegram webhook URL change | Medium | Re-register webhook after API deploy (script in Phase 1.6) |
| Users lose session on cutover | Medium | Existing JWT tokens remain valid if SECRET_KEY unchanged |
