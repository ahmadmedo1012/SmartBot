## Architecture Deep-Dive Results

### Backend:
**All existing models (29 classes):**

| # | Model | Table | Key Columns | FK/Relationships | Constraints |
|---|-------|-------|-------------|------------------|-------------|
| 1 | Rule | `rules` | id(PK), name(100), keywords(JSON), reply_template(Text), dm_template(Text), enabled(Bool), description(255), priority(999), bot_type(20), created_at, updated_at | -- | -- |
| 2 | Reply | `replies` | id(PK), fb_comment_id(100), fb_post_id(100), commenter_name(200), comment_text(Text), reply_text(Text), rule_id(Int nullable), created_at | -- | `fb_comment_id` UNIQUE |
| 3 | BotLog | `bot_logs` | id(PK), level(20), message(Text), created_at | -- | -- |
| 4 | BotState | `bot_state` | id(PK), key(100), value(Text) | -- | `key` UNIQUE |
| 5 | User | `users` | id(PK), username(100), password_hash(255), role(20 default "viewer"), created_at | -- | `username` UNIQUE |
| 6 | ReplyTemplate | `reply_templates` | id(PK), name(100), text(Text), category(50), shortcut(20), created_at | -- | -- |
| 7 | AISuggestion | `ai_suggestions` | id(PK), comment_id(100), comment_text(Text), suggestions(JSON), chosen(500), intent(50), sentiment(50), confidence(Int), latency_ms(Int), created_at | -- | -- |
| 8 | ConversationTag | `conversation_tags` | id(PK), name(50), color(7), created_at | -- | `name` UNIQUE |
| 9 | ConversationLabel | `conversation_labels` | id(PK), conversation_id(100), tag_id(Int), created_at | -- | -- |
| 10 | ScheduledPost | `scheduled_posts` | id(PK), message(Text), image_url(500), platform(20), scheduled_at, status(20), fb_post_id(100), created_by(100), created_at, published_at | -- | -- |
| 11 | AnalyticsEvent | `analytics_events` | id(PK), event_type(50), metadata_json(Text), created_at | -- | -- |
| 12 | BotAlert | `bot_alerts` | id(PK), alert_type(50), severity(20), message(Text), resolved(Bool), created_at, resolved_at | -- | -- |
| 13 | Offer | `offers` | id(PK), title(200), code(50), description(Text), discount_type(20), discount_value(Int), min_purchase(Int), max_uses(Int), used_count(Int), auto_reply_rule_id(Int), is_active(Bool), starts_at, expires_at, created_at | -- | -- |
| 14 | OfferClaim | `offer_claims` | id(PK), offer_id(Int), fb_user_id(100), user_name(200), claimed_at | -- | -- |
| 15 | Subscriber | `subscribers` | id(PK), fb_user_id(100), name(200), first_name(100), username(100), locale(20), gender(10), platform(20), page_id(100), status(20), first_seen_at, last_interaction_at, last_comment_text(Text), reply_count(Int), custom_data(JSON), created_at | `tags` M:N via `subscriber_tags` | `fb_user_id` UNIQUE |
| 16 | Tag | `tags` | id(PK), name(50), color(7), created_at | `subscribers` M:N via `subscriber_tags` | `name` UNIQUE |
| 17 | SubscriberTag | `subscriber_tags` | id(PK), subscriber_id(Int), tag_id(Int), created_at | FK(subscriber_id → subscribers.id CASCADE), FK(tag_id → tags.id CASCADE) | UNIQUE(subscriber_id, tag_id) |
| 18 | Flow | `flows` | id(PK), name(200), description(Text), nodes(JSON), edges(JSON), status(20), version(Int), created_by(100), total_replies(Int), last_triggered_at, created_at, updated_at | -- | -- |
| 19 | FlowExecution | `flow_executions` | id(PK), flow_id(Int), subscriber_id(Int nullable), trigger_type(50), trigger_data(JSON), current_node_id(100), status(20), started_at, completed_at, error_log(JSON) | FK(flow_id → flows.id), FK(subscriber_id → subscribers.id) | -- |
| 20 | Sequence | `sequences` | id(PK), name(200), description(Text), status(20), created_by(100), total_subscribers(Int), total_sent(Int), created_at, updated_at | -- | -- |
| 21 | SequenceStep | `sequence_steps` | id(PK), sequence_id(Int), step_order(Int), delay_days(Int), delay_hours(Int), message_template(Text), message_type(20), action_on_complete(JSON), created_at | FK(sequence_id → sequences.id CASCADE) | -- |
| 22 | SequenceSubscription | `sequence_subscriptions` | id(PK), subscriber_id(Int), sequence_id(Int), current_step(Int), status(20), entered_at, completed_at | FK(subscriber_id → subscribers.id CASCADE), FK(sequence_id → sequences.id CASCADE) | UNIQUE(subscriber_id, sequence_id) |
| 23 | Broadcast | `broadcasts` | id(PK), name(200), message_template(Text), platform_filter(JSON), segment_filters(JSON), status(20), total_recipients(Int), sent_count(Int), failed_count(Int), opened_count(Int), created_by(100), created_at, sent_at | -- | -- |
| 24 | BroadcastRecipient | `broadcast_recipients` | id(PK), broadcast_id(Int), subscriber_id(Int), status(20), error_message(Text), sent_at | FK(broadcast_id → broadcasts.id CASCADE), FK(subscriber_id → subscribers.id CASCADE) | -- |
| 25 | ConversationNote | `conversation_notes` | id(PK), conversation_id(100), content(Text), created_by(100), created_at | -- | -- |
| 26 | ConversationAssignee | `conversation_assignees` | id(PK), conversation_id(100), user_id(Int), assigned_at | FK(user_id → users.id) | -- |
| 27 | BrandConfig | `brand_config` | id(PK), brand_name(100), tagline(300), copyright_text(500), website(200), whatsapp(50), projects(JSON), updated_at | -- | -- |
| 28 | Customer | `customers` | id(PK), fb_user_id(100), name(200), phone(50), email(200), source(50), stage(30), notes(Text), total_interactions(Int), last_intent(50), interested_in(200), custom_fields(JSON), first_seen_at, last_contacted_at, converted_at, created_at | -- | `fb_user_id` UNIQUE |
| 29 | ReportSchedule | `report_schedules` | id(PK), report_type(50), email(200), enabled(Bool), schedule(50), last_sent, created_at | -- | -- |

---

**Changes needed — add these 3 models at the bottom of the file:**

```python
class SubscriptionPlan(Base):
    """Stripe product/price mirror."""
    __tablename__ = "subscription_plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    price_id = Column(String(100), unique=True, nullable=False)  # Stripe Price ID
    price = Column(Integer, nullable=False)                       # cents (Stripe convention)
    interval = Column(String(20), default="month")                # month, year
    features = Column(JSON, default=list)                         # list of feature strings
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)


class Tenant(Base):
    """Multi-tenant org."""
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    stripe_customer_id = Column(String(100), unique=True, nullable=False)
    subscription_status = Column(String(20), default="inactive")  # inactive, active, past_due, canceled, trialing
    plan_id = Column(Integer, ForeignKey("subscription_plans.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    plan = relationship("SubscriptionPlan", lazy="selectin")


class Payment(Base):
    """Stripe PaymentIntent records."""
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)                      # cents
    currency = Column(String(3), default="usd")
    stripe_payment_intent_id = Column(String(100), unique=True, nullable=False)
    status = Column(String(20), default="pending")                # pending, succeeded, failed, refunded
    description = Column(String(255), default="")
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    tenant = relationship("Tenant", lazy="selectin")
```

**Migration concerns:**

1. **No existing tables need backfilling** — the three new tables have zero FK references to/from existing tables. Adding them is purely additive. Zero migration risk on current data.

2. **Multi-tenancy on existing tables is not addressed.** Tables like `flows`, `users`, `subscribers` have no `tenant_id`. Making this app truly multi-tenant requires adding `tenant_id` to every entity table, backfilling data, and switching queries. That's a separate project — the Tenant model here is the foundation, not the completion. `ponytail: add tenant_id FKs to existing entity tables when you decide to isolate tenant data.`

3. **`amount` is in cents** (Integer), not Float. Matches Stripe convention. Avoids floating-point rounding. Display in UI by dividing by 100.

4. **`price_id` on SubscriptionPlan is UNIQUE** so you can upsert from Stripe webhooks without duplication.

5. **`stripe_customer_id` on Tenant is UNIQUE** — one-to-one with Stripe Customer.

6. **No Alembic migration** exists in this codebase. You will need to either run `Base.metadata.create_all(engine)` (which adds tables but won't migrate existing ones) or introduce Alembic for proper versioned migrations. For now, `create_all` will pick up these three new models on next restart if the DB connection runs metadata creation.

---

### Auth/Routes:
Here is the complete anatomy of `runner.py` covering all six questions:

---

## 1. Auth (JWT in cookies)

**Token creation** — `make_token` (line 149-154):
```python
def make_token(username: str) -> str:
    return jwt.encode(
        {"sub": username, "exp": utcnow() + ACCESS_TOKEN_EXPIRE},
        settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )
```
Uses `HS256`, 24h expiry, `utcnow()` from `_utils.py` (UTC-naive datetime, compatible with SQLAlchemy/Postgres).

**Auth dependency** — `get_current_user` (line 157-171):
```python
async def get_current_user(request: Request, db=Depends(get_db)):
    token = request.cookies.get("token")          # reads from cookie
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])  # decode
    user = await db.execute(select(User).where(User.username == payload["sub"]))
    return user.scalar_one_or_none()               # raises 401 if missing/invalid/expired
```
Token lives in an `httponly`, `secure=True`, `samesite="strict"` cookie.

**Role enforcement** — `require_role` (line 177-182):
```python
ROLE_HIERARCHY = {"admin": 3, "editor": 2, "viewer": 1}
def require_role(min_role: str):
    async def checker(current_user: User = Depends(get_current_user)):
        if ROLE_HIERARCHY.get(current_user.role, 0) < ROLE_HIERARCHY.get(min_role, 0):
            raise HTTPException(403, "Insufficient permissions")
        return current_user
    return checker
```

**Usage in endpoints**:
- Unauthenticated access: no auth dependency (`/api/login`, `/healthz`)
- Authenticated (any role): `_=Depends(get_current_user)`
- Role-gated: `_=Depends(require_role("editor"))` or `_=Depends(require_role("admin"))`
- Need the user object: `current_user: User = Depends(get_current_user)`

**Login endpoint** (line 348-360): form-based (`username` + `password`), bcrypt check, returns `JSONResponse` with cookie set.

---

## 2. User model + seed_admin

**Model** (`models.py` lines 56-63):
```python
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="viewer")  # admin, editor, viewer
    created_at = Column(DateTime, default=utcnow)
```

**seed_admin** (runner.py lines 185-195): called inside `lifespan` after `Base.metadata.create_all`. Seeds if no users exist:
```python
async def seed_admin(db):
    count = await db.scalar(select(func.count(User.id))) or 0
    if count > 0: return
    username = os.environ.get("INITIAL_ADMIN_USERNAME", "admin")
    password = os.environ.get("INITIAL_ADMIN_PASSWORD", "admin")
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    db.add(User(username=username, password_hash=pw_hash, role="admin"))
    await db.commit()
```

**Existing user endpoints**: `GET /api/users`, `POST /api/users`, `PUT /api/users/{id}`, `DELETE /api/users/{id}` — all admin-only, form-based.

---

## 3. DB session setup

**`config.py`** (`Settings` class): `DATABASE_URL` from env or `.env`, auto-converts `postgresql://` → `postgresql+asyncpg://` via `async_database_url` property. Falls back to `sqlite+aiosqlite:///data.db`.

**`database.py`**:
```python
engine = create_async_engine(settings.async_database_url, echo=False, ...)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
```
- `NullPool` for Vercel/Neon (serverless-safe, no stale connections).
- `get_db` is a FastAPI `Depends` generator.

---

## 4. Pattern for a `/api/register` endpoint

Follow the existing `/api/login` + `/api/users` POST patterns. Exact template:

```python
@app.post("/api/register")
async def register(
    username: str = Form(...),
    password: str = Form(...),
    db=Depends(get_db),
):
    existing = await db.execute(select(User).where(User.username == username))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Username exists")
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user = User(username=username, password_hash=pw_hash, role="viewer")  # default role
    db.add(user)
    await db.commit()
    await db.refresh(user)
    # auto-login: return token as cookie, same as /api/login
    token = make_token(username)
    resp = JSONResponse({"ok": True, "role": "viewer", "username": username})
    resp.set_cookie(key="token", value=token, httponly=True, secure=True, samesite="strict",
                    max_age=int(ACCESS_TOKEN_EXPIRE.total_seconds()))
    return resp
```

Key points for any new endpoint:
- Import `Depends`, `Form`, `Query`, `Body`, `File`, `UploadFile` from fastapi as needed (already at line 16).
- Use `db=Depends(get_db)` for DB access.
- Use `_=Depends(get_current_user)` for auth, `current_user: User = Depends(get_current_user)` if you need the user object.
- Use `_=Depends(require_role("editor"))` or `_=Depends(require_role("admin"))` for RBAC.
- Use `Form(...)` for form data, `Query(...)` for query params, `Body(None)` for JSON bodies.
- Use `utcnow()` from `_utils` for timestamps (not `datetime.now`).
- Use `HTTPException(status_code, "message")` for errors.
- Use `await db.execute(...)`, `await db.scalar(...)`, `await db.get(...)`, `await db.refresh(...)`.
- For mutations: `db.add()`, `await db.commit()`.
- Return dicts (FastAPI auto-serializes to JSON) or `JSONResponse(...)`.

The file has ~2200 more lines of exactly these patterns for flows, subscribers, sequences, broadcasts, teams, commerce, reports, etc. — any new endpoint just clones an existing one.

---

## 5. Env vars loading

**`config.py`**: `Settings` extends `pydantic_settings.BaseSettings`. Loaded from:
1. Environment variables (highest priority)
2. `.env` file in CWD (`SettingsConfigDict(env_file=".env")`)

Instantiated at module level: `settings = Settings()`

Key vars: `DATABASE_URL`, `FACEBOOK_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`, `SECRET_KEY`, `DEBUG`, `LOG_LEVEL`, `BOT_INTERVAL_SECONDS`, `START_BOT`.

Add-on env vars read via `os.getenv()` in runner.py:
- `CRON_SECRET` (line 1027)
- `FB_WEBHOOK_VERIFY_TOKEN` (line 1064)
- `FACEBOOK_APP_SECRET` (line 1065)
- `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` (line 190-191)
- `VERCEL` flag (line 146)
- `RENDER_EXTERNAL_URL` / `VERCEL_URL` (line 459)

---

## 6. Lifespan (startup/shutdown)

**`lifespan`** (line 220-288):
1. **Fail-fast check**: default `SECRET_KEY` in production raises `RuntimeError`.
2. **Create all tables**: `Base.metadata.create_all` via engine.connect().
3. **Safe migrations**: `ALTER TABLE ADD COLUMN IF NOT EXISTS` for 5 columns across 2 tables.
4. **Seed**: `seed_admin(session)` then `_seed_dm_templates(session)`.
5. **Start background tasks** (skipped on Vercel):
   - Bot loop (`_run_bot_loop`) — infinite cycle
   - Sequence scheduler — starts
   - Calendar scheduler — starts
   - Event bus → WebSocket bridge (subscribe `stats_update`)
   - Health push (every 30s) — broadcasts bot status over WS
6. **Yield** — FastAPI serves requests.
7. **Shutdown**: cancel bot task, close FB client, dispose engine.

---

### Config:
## Findings

**`/home/ahmed/Downloads/SmartBot/fb_dashboard/config.py`**

**Eight env vars** defined via `pydantic-settings` `BaseSettings`:

| Var | Default | Required |
|---|---|---|
| `DATABASE_URL` | `""` (SQLite fallback) | No |
| `FACEBOOK_ACCESS_TOKEN` | `""` | No (but bot won't work without it) |
| `FACEBOOK_PAGE_ID` | `""` | No |
| `SECRET_KEY` | `smartbot-fallback-dev-key-change-in-production` | Yes (fail-fast in non-DEBUG) |
| `DEBUG` | `False` | No |
| `LOG_LEVEL` | `INFO` | No |
| `BOT_INTERVAL_SECONDS` | `10` | No |
| `START_BOT` | `True` | No |

Plus one non-pydantic env var checked after init:
- `CRON_SECRET` — required in production (non-DEBUG), raises `RuntimeError` if missing.

**Loading**: `pydantic-settings` reads `.env` file + env vars (`.env` takes lower priority). Instantiated as module-level singleton `settings = Settings()`. `extra="ignore"` silently drops any undefined env vars. Has an `async_database_url` property that rewrites `postgresql://` to `postgresql+asyncpg://` for async SQLAlchemy.

**Stripe / payment / tenant config**: None whatsoever. No Stripe fields, no payment provider references, no tenant isolation config. Zero payment-related env vars.

**`/home/ahmed/Downloads/SmartBot/requirements.txt`**

No payment library. Dependencies are: FastAPI, SQLAlchemy+asyncpg, pydantic-settings, Jinja2, python-multipart, httpx, bcrypt, PyJWT, python-dotenv, openai, sse-starlette, tenacity, jsonschema, Pillow. Nothing Stripe, Braintree, PayPal, or similar.

**Bottom line**: Adding payments means adding Stripe (or whichever processor) to requirements.txt and adding the relevant env vars (e.g. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`) as pydantic-settings fields — the config pattern already supports that cleanly. No existing tenant awareness to thread into.

---

### Frontend API client:
Here is the API client structure in 40 lines:

**Core `api(path, opts)`** — wraps `fetch`. If body is `FormData`, no Content-Type header (browser sets multipart boundary), else defaults to `application/json`. Throws on non-2xx with first 200 chars, returns `res.json()`.

**Three patterns:**

**(1) GET** — no method, no body. Query params via `URLSearchParams`.
```js
export function fetchPlans() {
  return api("/api/plans");
}
export function fetchPlan(id) {
  return api(`/api/plans/${id}`);
}
```

**(2) POST with FormData** — build `fd`, append each field, pass as body.
Used when backend processes `multipart/form-data` (usually for file uploads or form-encoded). Every `createX` that takes discrete params uses this.
```js
export function register(username, password, email) {
  const fd = new FormData();
  fd.append("username", username);
  fd.append("password", password);
  fd.append("email", email);
  return api("/api/register", { method: "POST", body: fd });
}
```

**(3) POST/PUT with JSON body** — `body: JSON.stringify(data)`. Used when the function receives a data object rather than discrete params.
```js
export function createPlan(data) {
  return api("/api/plans", { method: "POST", body: JSON.stringify(data) });
}
export function updatePlan(id, data) {
  return api(`/api/plans/${id}`, { method: "PUT", body: JSON.stringify(data) });
}
```

**Naming convention:** `fetchX` / `createX` / `updateX` / `deleteX`. Action verbs for side-effects: `subscribePlan(id)`, `cancelSubscription(id)`, `fetchBillingHistory()`.

---

Here are the exact functions for your four domains. Append after line 533.

```js
// ── Auth / Register ──
export function register(email, password, name = "") {
  const fd = new FormData();
  fd.append("email", email);
  fd.append("password", password);
  if (name) fd.append("name", name);
  return api("/api/register", { method: "POST", body: fd });
}

// ── Plans ──
export function fetchPlans() {
  return api("/api/plans");
}

// ── Subscription ──
export function fetchSubscription() {
  return api("/api/subscription");
}
export function subscribePlan(planId) {
  return api("/api/subscription", { method: "POST", body: JSON.stringify({ plan_id: planId }) });
}
export function cancelSubscription() {
  return api("/api/subscription/cancel", { method: "POST" });
}

// ── Billing ──
export function fetchBillingHistory(page = 1, perPage = 20) {
  const params = new URLSearchParams({ page, per_page: perPage });
  return api(`/api/billing/history?${params}`);
}
export function fetchInvoice(invoiceId) {
  return api(`/api/billing/invoices/${invoiceId}`);
}
```

Patterns used:

| Domain | Pattern | Why |
|---|---|---|
| `register` | POST FormData | Matches existing `login` — form fields, not a rich object |
| `fetchPlans` | GET no args | Simple list fetch |
| `fetchSubscription` | GET | Current user's subscription |
| `subscribePlan` | POST JSON | Takes a single ID, but convention in this file for entity creation is JSON object (see `createSequence`, `createFlow`) |
| `cancelSubscription` | POST no body | Action-only, like `logout`, `restartBot` |
| `fetchBillingHistory` | GET with query params | Paginated, matches `fetchReplies` / `fetchPosts` |
| `fetchInvoice` | GET with dynamic path | Matches `fetchPostDetail` |

Ponytail note — `register` uses FormData (parallels `login`). If your backend expects JSON, swap to `body: JSON.stringify({email, password, name})`.

---

### Login page:
Build clean. Here's the full summary.

---

## Analysis of login.jsx

**File:** `/home/ahmed/Downloads/SmartBot/fb_dashboard/frontend/src/pages/login.jsx`

### Imports
- `useState`, `useEffect` from React
- `login` from `@/lib/api`

### Component Structure (3 components, 1 exported)

1. **`AnimatedBg`** (now exported) — decorative background layer (grid overlay + 3 radial-gradient blobs). Uses `animate-blob-1/2/3` classes, `pointer-events-none`, `z-0`, `absolute inset-0`.

2. **`AnimatedGradientBorder`** (now exported) — wrapper that renders a shimmering gradient border via `::mask` + `maskComposite: 'exclude'`. Has `relative group`, `-inset-[1px]`, `shimmer` animation.

3. **`Login({ onAuth })`** (the main export) — full-screen centered card layout:
   - Outer: `min-h-screen flex items-center justify-center login-bg-light`
   - Card: `max-w-sm mx-auto p-4 sm:p-5 login-card-enter`
   - Inner card: `glass-liquid rounded-2xl p-6 sm:p-8`
   - State: `username, password, showPw, error, loading, fieldErrors`
   - Flow: `onSubmit` calls `validate()` (email check if `@`, password >= 4 chars) → `login(username, password)` posts FormData to `/api/login` → `onAuth(res)` bubbles up to App.

### Key CSS Classes
| Category | Classes |
|----------|---------|
| Layout | `min-h-screen`, `flex items-center justify-center`, `max-w-sm mx-auto`, `relative`, `z-10` |
| Card | `login-bg-light`, `login-card-enter`, `glass-liquid`, `rounded-2xl`, `p-6 sm:p-8` |
| Input | `peer w-full h-11 pr-10 pl-3 rounded-xl text-sm transition-all` |
| Button | `btn btn-primary` |
| Animations | `login-card-enter`, `login-logo-enter`, `login-fade-in`, `login-error-in`, `animate-blob-1/2/3`, `animate-spin`, `shimmer` |
| Typography | `text-3xl font-bold text-iridescent`, `text-center` |

Inline styles use CSS custom properties (`var(--fg)`, `var(--accent)`, `var(--muted)`, `var(--bg)`, `var(--border)`, `var(--danger)`) with `color-mix(in oklch, ...)` for transparency.

---

## What was changed

### 1. `/home/ahmed/Downloads/SmartBot/fb_dashboard/frontend/src/pages/login.jsx`
- Exported `AnimatedBg` and `AnimatedGradientBorder` so `register.jsx` can reuse them.
- Added "Create account" link inside the form card (lines 168-174), below the submit button, linking to `/register`.

### 2. `/home/ahmed/Downloads/SmartBot/fb_dashboard/frontend/src/lib/api.js`
- Added `register(username, password, email, companyName)` that POSTs FormData to `/api/register`.
- Removed duplicate `register` function that a worktree had left behind.

### 3. `/home/ahmed/Downloads/SmartBot/fb_dashboard/frontend/src/pages/register.jsx`
- Removed duplicated `AnimatedBg` and `AnimatedGradientBorder` defs; imports them from login instead.
- Full register page: username, email (optional), company name (optional), password (min 6 chars with show/hide toggle), confirm password with mismatch check.
- Field-level validation errors per field.
- Success state: checkmark icon, success message, link to `/login`.
- "Already have an account?" link back to `/login`.
- Identical visual pattern: same glass-liquid card, same footer, same blob background.

### 4. Routing (App.jsx — already in place)
- `if (currentPath === '/register')` lazy-loads `<Register />` with no auth wrapper.

### 5. Backend (`/home/ahmed/Downloads/SmartBot/fb_dashboard/runner.py`, line 425)
- `POST /api/register` already existed: accepts `username`, `password`, `email`, `company_name` as FormData, validates password >= 6, checks uniqueness, creates Tenant + User in a transaction, returns `{ ok, tenant_id }`.

**Files modified:**
- `/home/ahmed/Downloads/SmartBot/fb_dashboard/frontend/src/pages/login.jsx` — exported `AnimatedBg`, `AnimatedGradientBorder`; added register link
- `/home/ahmed/Downloads/SmartBot/fb_dashboard/frontend/src/pages/register.jsx` — reused shared components, added confirm password + per-field validation
- `/home/ahmed/Downloads/SmartBot/fb_dashboard/frontend/src/lib/api.js` — added `register()` export, removed duplicate

No new dependencies. Build passes cleanly (427ms).

---

### Billing & Routing:
خريطة الملف:

**billing.jsx** يتكون من:

- **الصادرات**: `Billing` وظيفة المكون (التسمية باسكال تطابق `toPascal("billing")` → `"Billing"`)
- **وظائف API المستدعاة** (تم استيرادها من `@/lib/api`):
  1. `fetchPlans` — queryKey `["plans"]`
  2. `fetchSubscription` — queryKey `["subscription"]`
  3. `createCheckoutSession(planId, "monthly")` — عند النقر على الخطة (إعادة التوجيه إلى رابط Stripe أو الرجوع إلى mock)
  4. `fetchBillingPortal()` — عند النقر على "إدارة وسائل الدفع" (إعادة التوجيه إلى رابط بوابة الفوترة)
  5. `fetchPaymentHistory` — queryKey `["payments"]`

- **عمليات التصيير**:
  - محمل دوار أثناء التحميل الأولي
  - بطاقة حالة الاشتراك الحالية (نشط / past_due / غير نشط + اسم الخطة والشركة وتاريخ الانتهاء)
  - زر "إدارة وسائل الدفع" الذي يستدعي `fetchBillingPortal`
  - شبكة الخطط (`PlanCard`): الاسم، الوصف، السعر (د.ل/شهر)، قائمة الميزات، زر الاختيار (يستدعي `createCheckoutSession`)
  - جدول سجل المدفوعات: التاريخ، المبلغ، الحالة، رابط الإيصال
  - مقابض لكل من وضعي Stripe الفعلي (إعادة التوجيه `window.location.href = result.url`) ووضع mock (`alert` + `reload`)

**التوجيه** — لا يوجد react-router-dom أو أي مكتبة توجيه. **توجيه قائم على الحالة**:

- `App.jsx` يحتوي على `const [page, setPage] = useState("dashboard")`
- `const navigate = useCallback((pageKey) => { setPage(pageKey); ... }, [])`
- يتم تحميل وحدات الصفحات عبر `import.meta.glob("./pages/[abcef-z]*.jsx", { eager: false })` — تتضمن glob الملفات التي تبدأ بـ a, b, c, e, f, ... z (تستبعد 'd' لأن Dashboard مستورد بشكل ثابت)
- يتم تعيين كل ملف في `pageModules[key] = lazy(() => loader().then(m => ({ default: m[exportName] })))` — `"billing"` → `toPascal("billing")` → `"Billing"` → يطابق الصادر المسماة `Billing`
- `const Page = pages[page] || Dashboard` — عندما يكون `page === "billing"`، يتم تصيير `Billing`
- تعيين `pageNames.billing = "الفواتير"` لشريط العنوان
- ينقل `Topbar` عن طريق استدعاء `onNavigate("billing")`
- لا توجد مسارات قائمة على URL على الإطلاق — كل شيء يعتمد على حالة React

**التبعيات** (`package.json`):
- `react` / `react-dom` 19.x
- `@tanstack/react-query` 5.x (إحضار البيانات / التخزين المؤقت)
- `@vercel/analytics`
- `sonner` (الإشعارات)
- `tailwindcss` 4.x + `@tailwindcss/postcss` + `postcss` + `autoprefixer`
- `date-fns`
- أدوات التطوير: `vite` 8.x، `@vitejs/plugin-react`، `oxlint`، `@playwright/test`، أنواع React
- **لا يوجد `react-router-dom`**، لا يوجد `react-router`، لا توجد مكتبة توجيه — توجيه الحالة المخصص بالكامل
