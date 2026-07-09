# SmartBot Agent Overhaul — Design Spec

**Date:** 2026-07-09
**Status:** Approved Design
**Author:** Claude Opus 4.8

---

## 1. Objective

Transform SmartBot's AI Agent from a simple command interpreter into a **full LLM Orchestrator** — the intelligent brain of the entire system. The existing bot engine (keyword-based auto-replies with templates) remains untouched. All AI-related code (`agent_engine.py`, `ai_service.py` as consumed by the agent, `agent-chat.jsx`) is rebuilt from scratch.

**Key principles:**
- Bot engine (keyword reply pipeline, templates, cooldown) stays as-is
- AI agent becomes the orchestrator, not a command mapper
- Zero confirmation required — full autonomous execution
- Image intelligence: analyze before publishing
- Memory: DB-backed session + persistent user memory (Vercel-serverless compatible)
- Tools: every capability is a registered, schema-defined tool, classified by risk level
- **Deployment:** Vercel serverless — WebSocket not available; SSE (`/api/events`) is realtime channel
- **Realtime:** Agent messages broadcast via `event_bus` (not `ws_manager`) to reach SSE clients

---

## 2. Architecture

```
User Input → Agent Brain Core → Intent Analysis → Tool Selection → Execution → Response + Memory Update
                                        ↕
                                Memory System
                          (session + persistent DB)
```

### 2.1 Agent Brain Core (`agent_brain.py`)

The central reasoning engine. Single LLM call wrapped with a structured system prompt that defines:
- Available tools (their schemas, when to use them)
- Auto-confirm policy (always execute)
- Memory/context injection
- Response format (JSON with action + message + data)

**Flow:**
1. Receive user text + optional image
2. Inject session history + user memory into prompt
3. Call LLM with `response_format={"type": "json_object"}`
4. Parse response — extract `action`, `params`, `response_ar`
5. If action matches a registered tool → execute it
6. Update session + user memory
7. Return result

### 2.2 Tool Registry (`agent_tools.py`)

All capabilities as registered tools with JSON Schema definitions and **risk classification**:

| Tool | Description | Params | Risk | Auto-exec |
|------|-------------|--------|------|-----------|
| `publish_post` | Publish a Facebook post with AI-enhanced content | `message`, `image_url?`, `scheduled_at?` | reversible | ✅ |
| `reply_to_comment` | AI-generated reply to a comment | `comment_id`, `message?` (auto if omitted) | reversible | ✅ |
| `analyze_comment` | Analyze comment sentiment/intent/urgency | `comment_text` | read_only | ✅ |
| `enhance_content` | Rewrite/improve text without publishing | `text`, `style?` | read_only | ✅ |
| `image_analyze` | Analyze image and generate caption | `image_url` | read_only | ✅ |
| `create_rule` | Create auto-reply rule | `name`, `keywords`, `reply_template`, `dm_template?` | reversible | ✅ |
| `toggle_bot` | Start/stop bot | `action` (start/stop) | reversible | ✅ |
| `list_stats` | Show bot statistics | — | read_only | ✅ |
| `system` | System commands | `command`, `args` | irreversible | ✅ |
| `unknown` | Fallback — clarify intent | — | read_only | ✅ |

**Risk classifications:**
- **read_only:** No side effects — data copy or analysis only
- **reversible:** Action can be undone via dashboard (delete post, disable rule, restart bot)
- **irreversible:** Setting/interval changes — not destructive but persistent; agent logs a clear post-action message

**Removed from original design:** `create_campaign` — `fb_client.py` has read-only ad functions (`get_campaigns`, `get_ads`) only. No create/spend capability exists. Will be added in a future phase when Facebook Ads creation API is implemented.

### 2.3 Memory System (`agent_memory.py`)

**This is dashboard-operator memory (who runs the dashboard), NOT Facebook commenter tracking.**

Three-tier memory:

1. **Session Memory** (DB-backed via `BotState` key `ai_session_{username}`)
   - Last N turns of current conversation
   - Reads/writes to DB every turn — Vercel serverless compatible
   - Max 50 turns stored as JSON array under one key
   - TTL: session cleared on explicit `/api/agent/memory/clear`

2. **User Memory** (DB-backed via `BotState` key `ai_memory_{username}`)
   - Persistent preferences: preferred tone, publishing style, recurring topics
   - History of decisions: `{timestamp, action, params, outcome}`
   - Not tied to Facebook user IDs — this is **dashboard operator memory**

3. **Context Engine** (existing `context_engine.py`, untouched)
   - Tracks **Facebook commenters** (people who comment on the page)
   - In-memory only — per-bot-cycle context for keyword matching
   - Used by `bot.py` pipeline for reply personalization
   - **Completely separate concern** from Agent Memory

### 2.4 Image Intelligence

When an image is attached:
1. Save to `static/uploads/` (existing logic, keep)
2. Pass image URL as part of the agent prompt or call `ai_service.analyze_image()`
3. LLM with vision capability analyzes the image
4. Returns: `{description, objects, text_in_image, suggested_caption}`
5. The caption is merged into the publish message
6. For `publish_post`, image is sent via `fb_client.post_to_page_with_image()`

No separate vision model needed — `ai_service.py` now has `analyze_image()` using OpenAI vision (base64 content type) or Gemini vision.

---

## 3. Deployment Context & Changes

### 3.1 Platform: Vercel Serverless

**Verified config:**
- `vercel.json`: rewrites all routes → `api/index.py` → `runner.app`
- `_IS_VERCEL = True` in `runner.py` → background tasks skipped
- No `render.yaml`, no `Procfile`, no Dockerfile — Vercel only

### 3.2 WebSocket vs SSE

| Channel | Status | Reason |
|---------|--------|--------|
| WebSocket `/ws` | ❌ Not functional on Vercel | Serverless functions are HTTP-only |
| SSE `/api/events` | ✅ Works | HTTP streaming — Vercel supports it |

**Fix applied in runner.py:** SSE endpoint now subscribes to `agent_message` events from `event_bus`, so agent responses reach the dashboard in real time.

### 3.3 Session Memory — Must Be DB-Backed

In-memory state (`self._history: list[dict]`) does not survive Vercel cold starts. Session memory is stored in `BotState` table as `ai_session_{username}` key — read at request start, written at request end.

---

## 4. File Changes

### New Files
| File | Purpose |
|------|---------|
| `fb_dashboard/agent_brain.py` | LLM Orchestrator core — reasoning, tool dispatch |
| `fb_dashboard/agent_tools.py` | Tool definitions and execution wrappers |
| `fb_dashboard/agent_memory.py` | DB-backed session + user memory management |

### Rewritten Files
| File | From → To |
|------|-----------|
| `fb_dashboard/agent_engine.py` | Command interpreter → Orchestrator with tool registry, auto-confirm, memory integration |
| `fb_dashboard/frontend/src/pages/agent-chat.jsx` | Basic chat → Smart chat with image preview, analysis display, activity history, auto-suggest |

### Modified Files
| File | Change |
|------|--------|
| `fb_dashboard/ai_service.py` | Fix `available` property (check actual import, not env var); add `analyze_image()` vision function; add `_openai_vision()` and `_gemini_vision()` methods |
| `fb_dashboard/runner.py` | SSE endpoint now subscribes to `agent_message` events (agent responses reach dashboard) |
| `requirements.txt` | Added `openai>=1.0.0` (was missing); commented `google-generativeai` as optional |

### Untouched Files
`bot.py`, `fb_client.py`, `config.py`, `models.py`, `database.py`, `context_engine.py`, `enhanced_intent.py`, `cache_layer.py`, `diagnostics.py`, `monitor.py`, all other pages.

---

## 5. Data Flow — Execution Path

```
POST /api/agent/interpret
  1. Receive text + optional image file
  2. Read image → save to static/uploads → get URL
  3. Load user memory from BotState (key: `ai_memory_{username}`)
  4. Load session history from BotState (key: `ai_session_{username}`)
  5. Build prompt: system + context + tools + history + user input
  6. Call LLM with response_format=json_object
  7. Parse result → {action, params, response_ar}
  8. If image and action == publish_post → attach image URL to params
  9. Execute tool (always — no confirmation gate)
  10. Update user memory + session history in BotState
  11. Broadcast via event_bus → SSE to dashboard clients
  12. Return result

POST /api/agent/confirm → REMOVED (not needed)
All actions auto-execute. need_confirmation is always false.
```

---

## 6. Auto-Confirm Policy

All actions execute immediately. The `need_confirmation` field is **always false**. The agent:
- Executes the action
- Returns a clear message of what was done
- If action failed, returns error with reason
- If action is `irreversible` risk (system settings), includes a warning in `response_ar` **after** execution

**Risk-aware execution:**
| Risk level | Auto-exec? | Post-action behavior |
|------------|-----------|---------------------|
| read_only | ✅ Yes | Return results normally |
| reversible | ✅ Yes | Return success with action summary |
| irreversible | ✅ Yes | Return success + warning message confirming the change |

---

## 7. API Changes

### `/api/agent/interpret` (modified)
- Removed: `need_confirmation` logic
- Added: auto-execute always
- Memory: reads/writes `ai_session_{username}` and `ai_memory_{username}` from `BotState`
- Broadcasting: uses `event_bus.emit("agent_message", ...)` → SSE to all dashboard clients
- Response: `{action, params, response_ar, data, success}`

### `/api/agent/confirm` (removed)
- No longer needed — all actions auto-execute

### Agent memory endpoints (new)
- `GET /api/agent/memory` — view current session + persistent memory
- `POST /api/agent/memory/clear` — reset session history only (keeps user preferences)

---

## 7. Frontend Changes

### `agent-chat.jsx` — rewritten
- **Image upload + preview:** existing, keep but add **AI analysis overlay** showing what the agent "sees" in the image
- **Message display:** enhanced with action badges, success/failure icons, timing
- **Auto-suggest:** agent proactively suggests actions based on context
- **Activity timeline:** left sidebar or embedded showing recent agent actions
- **Loading states:** shimmer/skeleton for agent "thinking"
- **Empty state:** quick action buttons + helpful examples
- **Error state:** retry option, error details expandable

---

## 8. Migration & Backward Compatibility

- `agent_engine.py` is replaced entirely. Old `get_agent()` returns new Engine.
- The `agent/confirm` endpoint returns 404 — frontend removes "confirm" button.
- `agent-chat.jsx` is replaced entirely.
- No DB schema changes.
- Existing `BotState` entries are reused for memory storage.
- New keys: `ai_memory_{username}` for user-level memory.

---

## 9. Error Handling

- LLM call failure → return friendly error in Arabic, no crash
- Tool execution failure → return error with action name + reason
- Image processing failure → continue without image, warn user
- Memory save failure → log warning, continue (non-critical)
- Invalid tool output → log, return "لم تتم العملية — حاول مرة ثانية"

---

## 10. Testing & Verification

After each phase:
1. **Unit:** new agent files have `if __name__ == "__main__"` self-checks
2. **Integration:** agent interpret + execute flow tested against mock FB client
3. **End-to-end:** manual test via dashboard — publish, reply, analyze, image
4. **Rollback:** old agent_engine.py backed up as `agent_engine.py.bak`
