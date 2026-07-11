# Comprehensive Diagnosis Report — SmartBot

## Root Cause Summary

**PRIMARY: bot is completely non-functional on Vercel serverless** due to 300s function timeout killing all background tasks. Secondary bugs compound issues with DM delivery, cooldown logic, and CalendarScheduler.

---

## 🔴 CRITICAL — Vercel 300s Timeout Kills Bot

| File | Line | Issue |
|------|------|-------|
| runner.py | 306-313 | `_run_bot_loop()` runs while True with 10s sleep |
| runner.py | 2137-2139 | Webhook comments processed via fire-and-forget `asyncio.create_task` |
| runner.py | 228-233 | SequenceScheduler + CalendarScheduler also fire-and-forget |

**Root cause**: Vercel Fluid Compute kills functions after 300s hard limit. Every background task (`_run_bot_loop`, CalendarScheduler, SequenceScheduler, health_push) dies when the function is recycled. Webhook processing via `asyncio.create_task` also dies.

**Evidence from runtime logs**: "Vercel Runtime Timeout Error: Task timed out after 300 seconds" — recurring every ~5 min.

**Impact**: Bot runs for max ~30 cycles (300s / 10s interval) then dies. Webhook comments received shortly before function death are lost silently. The bot appears "completely non-functional" because:
- Polling loop gets killed = no periodic comment checking
- Webhook async tasks get killed = real-time processing unreliable
- CalendarScheduler + SequenceScheduler never publish scheduled content

**Fix path**: Replace polling + fire-and-forget with Vercel Cron jobs (serverless-friendly pattern). Polling endpoint triggered every N minutes by Cron → no long-lived background process needed.

---

## 🔴 HIGH — CooldownManager Extends Block Indefinitely

| File | Line | Issue |
|------|------|-------|
| bot.py | 302-312 | `is_blocked()` updates `self._store[user_id]` even when returning True (blocked) |

**Root cause**: When a user IS blocked (line 308-310), the code still writes `self._store[user_id] = now`. This pushes the cooldown window forward on every comment from a blocked user, effectively locking them out forever.

```python
if last and (now - last) < window:
    self._store[user_id] = now  # ← BUG: extends block
    return True
self._store[user_id] = now
return False
```

**Impact**: User comments once → gets reply. Comments again within 60s → gets blocked. Each subsequent comment within the window pushes the block further. User never enters the "reply" window again.

**Fix**: Remove `self._store[user_id] = now` from the blocked branch.

---

## 🔴 HIGH — CalendarScheduler DB Schema Mismatch

| File | Line | Issue |
|------|------|-------|
| runner.py | 213 | ALTER TABLE silently swallows errors |
| models.py | ~123 | ScheduledPost has `platform` column |
| production DB | — | column `scheduled_posts.platform` MISSING |

**Root cause**: The lifespan migration runs `ALTER TABLE scheduled_posts ADD COLUMN platform VARCHAR(20) DEFAULT 'facebook'` wrapped in `try/except: pass`. The migration silently fails (Postgres doesn't auto-commit DDL inside a transaction? Or column already exists from a different state). Every CalendarScheduler loop iteration crashes:

> column scheduled_posts.platform does not exist

**Impact**: CalendarScheduler completely non-functional. All scheduled posts never publish. Flood error log every 60s.

**Fix**: Run DDL outside transaction or verify column exists after migration. Also: the ALTER TABLE likely needs to be run manually once, or use proper migration framework.

---

## 🔴 HIGH — MESSAGE_TAG DM Strategy Missing Required `tag` Field

| File | Line | Issue |
|------|------|-------|
| fb_client.py | 212-223 | `send_dm()` sends `messaging_type="MESSAGE_TAG"` without required `tag` param |
| bot.py | 503-506 | Strategy 2: MESSAGE_TAG silently fails |

**Root cause**: Facebook Graph API requires a `tag` field when using `messaging_type=MESSAGE_TAG`. Valid tags: `CONFIRMED_EVENT_UPDATE`, `POST_PURCHASE_UPDATE`, `ACCOUNT_UPDATE`, `HUMAN_AGENT`. Without `tag`, FB rejects the message with an error. The code logs a warning then falls through to Strategy 3 (RESPONSE).

**Impact**: Strategy 2 always fails. If user hasn't messaged page in 24h (common for FB auto-reply), Strategy 3 (RESPONSE) also fails. DM never delivered.

**Fix**: Add `"tag": "HUMAN_AGENT"` parameter when `messaging_type="MESSAGE_TAG"`. Or use `POST_PURCHASE_UPDATE` for post-purchase replies.

---

## 🟡 MEDIUM — Phase 1 Intent Matching Skips Keyword Verification

| File | Line | Issue |
|------|------|-------|
| bot.py | 255-263 | Intent-first matching returns first rule matching intent name without checking actual keywords |

**Root cause**: Phase 1 checks `rule.get("name") == rule_name` and immediately returns. It doesn't verify the comment text contains any relevant keywords. If multiple rules share the same intent name prefix, only the first (by priority sort) is used, regardless of actual content match.

**Impact**: Wrong/mismatched reply template selected for some intents. E.g., if "interest_want" has two rules (one for Smart Menu, one for subscriptions), the first one matched always wins regardless of what the user actually said.

**Fix**: After finding a rule by name, also run keyword scan against that rule's keywords before returning. Fall through to Phase 2 keyword scan if intent-matched rule doesn't have matching keywords.

---

## 🟡 MEDIUM — Cooldown `adjust_window` Called on Every Reply

| File | Line | Issue |
|------|------|-------|
| bot.py | 413-420 | `adjust_window()` called on every reply, not just when user context exists |

**Root cause**: Stage 5c calls `adjust_window(ctx.from_id, 30)` for frequent users and `adjust_window(ctx.from_id, 60)` for others. But `user_ctx` can be None (if context engine fails or first-time user), in which case the except:pass at line 366 means `user_ctx` stays None and the `is_frequent()` check crashes or defaults.

Wait, actually looking at lines 415-418:
```python
if user_ctx and user_ctx.is_frequent():
    self.cooldown.adjust_window(ctx.from_id, 30)
else:
    self.cooldown.adjust_window(ctx.from_id, 60)
```

If `user_ctx` is None, this falls to `else` and sets 60s. That's actually fine. But the issue is `adjust_window` sets per-user window to 30s or 60s on every reply — this is correct behavior but note that the window is reset every time, preventing natural escalation.

Marking as MEDIUM — not a crash, but design concern.

---

## 🟢 LOW — Phase 1 Match Returns First Rule by Priority, Not Best Content Match

| File | Line | Issue |
|------|------|-------|
| bot.py | 255-263 | `_all_rules` sorted by priority, first match wins by intent name |

Same root as above but less severe. Documenting for completeness.

---

# Repair Plans

## Plan A: Convert Bot to Cron-Triggered (PRIMARY)

Replace polling loop with Vercel Cron jobs:

1. Add `"crons": [{"path": "/api/bot/tick", "schedule": "*/5 * * * *"}]` to vercel.json
2. Create `/api/bot/tick` endpoint that runs ONE cycle of process()
3. Remove `_run_bot_loop()` background task background loop
4. Keep webhook endpoint for real-time processing
5. Webhook now runs inline (NOT fire-and-forget `create_task`) — function stays alive for the webhook response
6. Add `/api/bot/catchup` endpoint that processes any missed comments

**Why it fixes non-functionality**: Cron jobs run in their own invocation — no 300s timeout killing the loop mid-cycle. Each Cron tick is a fresh function, handles its comments, returns.

**Files touched**: runner.py, vercel.json

## Plan B: Fix Cooldown Bug

1. Remove line 309 `self._store[user_id] = now` from blocked branch
2. Simple one-line deletion

## Plan C: Fix MESSAGE_TAG DM Delivery

1. Add `tag` parameter to `send_dm()` when `messaging_type="MESSAGE_TAG"`
2. Or change DM strategy to use `POST_PURCHASE_UPDATE` tag which doesn't need prior conversation

## Plan D: Fix CalendarScheduler

1. Run ALTER TABLE manually on Neon DB via SQL console
2. Or wrap migration in explicit `commit()` to persist DDL

## Plan E: Improve Intent Matching

1. After Phase 1 finds a rule by name, verify at least one keyword matches before returning
2. If keywords don't match, fall through to Phase 2 keyword scan

---

## Priority Order for Council

1. **Plan A** (Cron migration) — fixes "completely non-functional"
2. **Plan B** (Cooldown) — one line, fixes perma-block
3. **Plan C** (DM tag) — fixes silent DM failure
4. **Plan D** (DB migration) — fixes CalendarScheduler
5. **Plan E** (Intent match) — improves accuracy
