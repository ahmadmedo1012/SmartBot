# SmartBot Data-Layer Audit — Task v24-B3

**Agent:** DATALAYER (Diagnostic Agent) · **Mode:** READ-ONLY static analysis · **Scope:** `fb_dashboard/models.py`, `fb_dashboard/database.py`, `alembic/versions/*` (16 migrations), query patterns across `routers/`, `bot_engine/`, `sequence_engine.py`, `broadcast_engine.py`, `analytics_engine.py`, `content_calendar.py`, `messenger_service.py`, `_wallet.py`, `_services.py`, `app/`.

**Verdict in one line:** the data layer is *unusually well-hardened for a small SaaS* (atomic claim doctrine everywhere, dual-dialect partial indexes, self-healing reconcile), but it carries **4 real defects** (1 session-poisoning bug, 1 broken offer-dedup design, 2 hot-path index gaps on cron sweeps), **~12 missing/mismatched indexes** versus actual query patterns, **zero retention/rollup strategy** for the two fastest-growing tables, and a **migration chain that is a moving target by design** (`001` = `create_all`).

---

## 1. Executive Summary

| Dimension | Grade | One-liner |
|---|---|---|
| Models / index coverage | **B** | Tenant+status+created composites exist for most list endpoints; the *global cron claim sweeps* and `messages(tenant, created_at)` are the gaps. |
| Migration integrity | **B−** | Linear 001→016, idempotent, dual-dialect; but 001 runs `create_all` (chain is not a frozen snapshot) and reconciles carry it. |
| Query performance | **B−** | N+1s were systematically fixed (subscriber search, inbox sync, admin ticket queue); OFFSET pagination + per-request `COUNT(*)` on growing tables remain; sequence due-scan is O(N×2 queries). |
| Session discipline | **A−** | `get_db` is correct; engines own their sessions; **one missing `rollback()`** in pipeline CRM path poisons the bot cycle session. |
| Concurrency / races | **A−** | Wallet credit, post/sequence/broadcast/campaign claims, payment approvals — all atomic `UPDATE…WHERE status RETURNING` + savepoints. Offer dedup is **in-memory only** (broken on serverless). |
| Data integrity | **B** | FKs only where models declare them; tenant_id is a *logical* reference (no FK) — tenant delete manually enumerates 39 tables; money is `Numeric` everywhere (no Float bug). |
| Multi-tenancy | **B+** | tenant_id on every business table except `support_ticket_replies` + platform-level globals; RLS is feasible but would break the global cron sweeps unless they run as BYPASSRLS. |
| SQLite↔PG parity | **B** | Partial + expression indexes declared for both dialects (rare discipline); FK PRAGMA only in tests; **CI never runs Postgres**; legacy `timestamptz` drift in 003/004 branches. |
| Data volume design | **C+** | No retention for messages/analytics_events/bot_logs/notifications/audit_logs; no rollup tables; analytics is on-the-fly `COUNT` per poll. |
| Serialization | **B+** | Ad-hoc dicts + `ok()` + `iso_z()` convention; only 4 pydantic models; drift risk managed by tests, not by a schema layer. |

**Money check (explicit):** no `Float` columns anywhere (`grep Float(` = 0 hits). `Numeric(10,3)` for PaymentRequest (LYD dirham ✓), `Numeric(10,2)` for plans/SubscriptionPayment. Wallet balance is stored as **TEXT in `bot_state`** and only ever touched via `Decimal(str(v)).quantize(0.001)` + atomic SQL CAST — fragile-but-correct; `AdAccount.amount_spent/balance` are String display caches only.

**Timezone check (explicit):** canonical `_utils.utcnow()` = **naive-UTC**, used consistently (~120 call sites). Stragglers: `_rate_limit.py:12` `datetime.utcnow()` (deprecated in 3.12, same semantics), `_observability.py:397` + `runner.py:161` (display strings only). `iso_z()` appends `Z` for JS. No tz-aware datetimes enter comparisons *except* the legacy-migration divergence in §4-D4.

---

## 2. Missing / Mismatched Indexes (verified against actual queries)

| # | Table | Column(s) | Query pattern affected (file:line) | Suggested DDL | Sev |
|---|---|---|---|---|---|
| 1 | `messages` | `(tenant_id, created_at)` | DM-rule attribution: `tenant + is_from_page + created_at >= cutoff GROUP BY rule_id` — `routers/analytics.py:74-80`; message totals `dashboard_stats.py:175-181` | `CREATE INDEX ix_messages_tenant_created ON messages (tenant_id, created_at);` | **HIGH** — largest table, polled dashboard |
| 2 | `broadcasts` | `(status, created_at)` | Outbox claim: `WHERE status='pending' ORDER BY created_at LIMIT …` **global, every cron beat** — `broadcast_engine.py:535-539` | `CREATE INDEX ix_broadcast_status_created ON broadcasts (status, created_at);` | **HIGH** — beats scale with fan base |
| 3 | `marketing_campaigns` | `(status, scheduled_at)` | Campaign claim: `status='scheduled' AND scheduled_at <= now` global — `routers/marketing.py:332-338` | `CREATE INDEX ix_campaign_status_sched ON marketing_campaigns (status, scheduled_at);` | **HIGH** |
| 4 | `scheduled_posts` | `(status, scheduled_at)` | Due sweep + stale recovery are **global**; existing composite leads with `tenant_id` → unusable — `content_calendar.py:420`, `bot.py:114` | `CREATE INDEX ix_schedpost_status_sched2 ON scheduled_posts (status, scheduled_at);` (name 002-reuse is taken) | **HIGH** |
| 5 | `sequence_subscriptions` | `(status)` (or `(status, entered_at)`) | Due scan `WHERE status='active'` global + stale-claim scan `status='sending'` — `sequence_engine.py:337-341, 558-561`; `ix_seqsub_tenant_status` leads with tenant | `CREATE INDEX ix_seqsub_status ON sequence_subscriptions (status);` | **HIGH** |
| 6 | `subscription_payments` | `(tenant_id, created_at)` | Billing history `tenant + ORDER BY created_at DESC OFFSET/LIMIT` — `routers/payments/wallet.py:302-307`; existing `(tenant,status,created)` cannot serve the ordering | `CREATE INDEX ix_sub_payment_tenant_created ON subscription_payments (tenant_id, created_at);` | MED |
| 7 | `audit_logs` | `(tenant_id, created_at)` | Audit list `tenant + ORDER BY created_at DESC` — `routers/auth.py:404-405`; only single-col tenant index → sort of whole tenant history | `CREATE INDEX ix_auditlog_tenant_created ON audit_logs (tenant_id, created_at);` | MED (grows forever) |
| 8 | `offer_claims` | `(tenant_id, offer_id, fb_user_id)` UNIQUE | Claim dedup — **constraint entirely absent AND the table is unused by code** (see §5-R7) | `CREATE UNIQUE INDEX uq_offerclaim_tenant_offer_user ON offer_claims (tenant_id, offer_id, fb_user_id);` | MED (business) |
| 9 | `conversation_labels` | `(tag_id)` | Tag deletion `DELETE WHERE tag_id=…` — `routers/inbox.py:658,688,720`; seq scan per tag delete; `conversation_id` *is* indexed | `CREATE INDEX ix_conversation_label_tag ON conversation_labels (tag_id);` | LOW-MED |
| 10 | `support_tickets` | `(status, created_at)` | Platform-admin cross-tenant queue `status filter + ORDER BY created_at` — `routers/support.py:341-350` | `CREATE INDEX ix_ticket_status_created ON support_tickets (status, created_at);` | LOW-MED |
| 11 | `tenants` | `(subscription_status, plan_end)` | Expiry checks (`_subscription.py:69`, `pipeline.py:77`) + startup migration sweep | `CREATE INDEX ix_tenant_status_plan_end ON tenants (subscription_status, plan_end);` | LOW (small table) |
| 12 | `blacklisted_tokens` | `(expires_at)` | Startup purge `expires_at < utcnow()` — `_bootstrap.py:72`, `plans_config.py:351` | `CREATE INDEX ix_blacklist_expires ON blacklisted_tokens (expires_at);` | LOW |
| 13 | `rate_limit_entries` | `(window_end)` | Global purge — `plans_config.py:348` (only purge path besides per-key) | `CREATE INDEX ix_rate_limit_window ON rate_limit_entries (window_end);` | LOW |
| 14 | *(type, not index)* | all JSON columns | `JSON` renders as PG `json` (not `jsonb`): no GIN, slower containment. No JSON operators used today — latent ceiling for `segment_filters`/`custom_data` queries | Migrate to `JSONB` on next schema reset (with `with_variant`) | LOW |

**Verified-good hot coverage** (for the record): replies `(tenant, created_at)` ✓ (010), comments `(tenant, created_at)` + `(tenant, fb_post_id)` ✓, subscribers `(tenant, last_interaction_at)` + `(tenant, platform, status)` ✓, bot_state `(key, value)` + partial uniques ✓ (011/012/013), offers `(tenant, is_active)` ✓ (015), bot_logs `(tenant, created_at)` + `(level, created_at)` ✓, messages `(conversation_id, created_at)` ✓, fb_posts/ads tenant composites ✓ (016), users `lower(email)` partial unique ✓ (v15).

---

## 3. Query Performance Patterns

**N+1 — fixed historically, two remain:**

- ✅ `subscriber_engine.search` — one grouped tag query per page (v5 §4 fix), `subscriber_engine.py:135-147`.
- ✅ inbox live sync — batch `IN(…)` upsert, 30s skip (v8-A12), `inbox.py:229-247`.
- ✅ admin ticket queue — one `IN(…)` replies fetch, `support.py:358-365`.
- ⚠️ **`SequenceEngine.get_due_subscriptions` (`sequence_engine.py:337-396`)**: loads **ALL** active `sequence_subscriptions` (no tenant filter, no limit), then **2 queries per subscription** (steps + `session.get(Subscriber)`) → O(2N+1) queries every beat. Fix: one join query with `entered_at + delay` computed in SQL, or at least `selectinload` + batched subscriber fetch.
- ⚠️ `recover_stale_publishing` / `recover_stale_sequence_claims`: per-row BotState marker SELECT (bounded by `status='publishing'/'sending'` — small in practice; becomes a problem exactly when the claim index of §2-#5 is missing).

**Pagination:** OFFSET pagination in 10+ routers (`subscriber_engine:129`, `support:350`, `admin_routes:461`, `auth:405/509`, `crm_routes:50`, `replies:123`, `rules:147`, `facebook_routes:1059`, `payments/wallet:300-306`, `scheduled_posts_routes:38`). All are page ≤ ~100 with `LIMIT` caps — fine at current scale; deep-page keyset (`(tenant, created_at) < last_seen`) is the upgrade path and pairs naturally with the §2 composites.

**COUNT(\*) per request:** dashboard_stats, analytics, widgets, pdf_reports run 4-12 `COUNT`/`GROUP BY` aggregations per request *and the frontend polls them* (v24-A2: analytics 6×60s, activity 15s). With no rollup tables this is the single biggest future cost center (§7).

**Eager-loading:** the only ORM relationships are `Subscriber.tags` / `Tag.subscribers`, both `lazy="selectin"` (`models.py:374,388`). `Tag.subscribers` is a **latent bomb**: loading any Tag row eagerly loads *all its subscribers* (a whole-tenant audience per tag). Production code avoids it (explicit joins), but any future `select(Tag)` + serialization will trigger it. Recommend `lazy="select"` + explicit `selectinload` at call sites, or `lazy="raise"` for `Tag.subscribers`.

**Good patterns confirmed:** single-aggregation overview (`analytics_engine.py:51-62`, 6 COUNTs → 1), WS stats via grouped count (`app/startup.py:313-321`), BotState single-snapshot query (`dashboard_stats.py:118-122`), `ix_messages_fb_conversation_id` used by inbox staleness probe.

---

## 4. Schema Drift — chain vs models vs legacy DBs

The chain's architecture: **001 runs `Base.metadata.create_all`** then migrations 002-016 patch *legacy* databases with Inspector guards, while `_schema_reconcile.reconcile_schema` (run at startup AND by 007/014) adds any missing model columns/indexes. Chain integrity itself: **linear 001→016, no branches, every `down_revision` correct, env.py imports `from models import Base` (all 52 tables — single models.py, nothing orphaned).**

| # | Finding | Impact |
|---|---|---|
| D1 | **001 = `create_all`**: the migration chain is a *moving target* — re-running history on a fresh DB yields *today's* schema, not the historical one; `alembic autogenerate`/diff reviews are meaningless; a bad model edit silently becomes "migration 001". | Architectural risk, documented as deliberate. |
| D2 | **004's `report_schedules`** lacks model columns `schedule`, `last_sent` (created only with report_type/email/enabled/created_at/updated_at). Healed by reconcile (007/014/startup) — but the *chain alone* (004) is insufficient. | Drift in the chain itself; self-healed in practice. |
| D3 | Dead columns from 001/004 (`users.onboarding_completed`, `payment_requests.amount_numeric`) and the duplicate `ix_schedpost_status_sched` — **dropped by 014** ✓ (resolved; kept for history). | Closed. |
| D4 | **`DateTime(timezone=True)` drift**: the create_table branches of 003 (`tenants.created_at/updated_at`) and 004 (`notification_preferences.updated_at`, `rate_limit_entries.window_end/created_at`, `report_schedules.*`) declare **timestamptz**, while the model says naive `DateTime`. On any PG DB where those branches actually executed (tables not pre-created by create_all — i.e., true legacy prod), asyncpg returns **aware** datetimes → `window_end <= naive_now` comparisons in `_rate_limit.py:17,32` raise `TypeError`. Fresh create_all DBs are naive. | Latent, conditional on DB lineage; verify with `\d rate_limit_entries` on Neon. |
| D5 | `alembic/env.py` `context.configure(...)` sets `target_metadata` but **not `compare_type`/`compare_server_default`** — autogenerate would miss type/default drift (incl. D4). | Tooling gap. |
| D6 | Index-name drift between lineages: legacy DBs carry `ix_messages_tenant` (008) / `ix_comments_created` (009) while create_all DBs carry `ix_messages_tenant_id` / `ix_comments_created_at`. Functionally identical sets; reconciles only heal model-named ones — no duplicates detected (create_all skip prevents overlap). | Cosmetic. |
| D7 | Model-declared indexes that **no migration ever creates** on legacy DBs and the reconcile heal list doesn't include either (e.g. `ix_conversations_tenant` single-col, `conversation_labels` inline indexes, `brand_config` — none). Model↔legacy drift persists for those. | Low (small tables). |
| D8 | `JSON` vs `JSONB` (see §2-#14). | Low today. |
| D9 | 014's NOT-NULL tightening runs **on PostgreSQL only** — SQLite legacy DBs keep nullable columns for `nullable=False` model contracts (documented; values backfilled). | Known, documented. |
| D10 | 015 rebuilds `telegram_approvers.added_by_id` FK as **NOT VALID** — enforced for new writes, legacy orphans tolerated by design. | Accepted. |

---

## 5. Race Conditions & Concurrency

**The claim doctrine (verified good ×6):** every scheduled/async worker claims its row with a single atomic `UPDATE … WHERE status IN (claimable) RETURNING id`, commits *before* the slow Graph call, and writes a `bot_state` timestamp marker for stale-claim recovery:

- ✅ **Wallet credit** (`_wallet.py:75-116`): atomic in-SQL `CAST(… NUMERIC(12,3)) + :amt` UPDATE; insert path inside `begin_nested`, `IntegrityError` → re-run UPDATE on the winner's row (`uq_botstate_tenant_key` makes it work). No debit path exists today (credit-only) → no negative-balance race yet; **when a spend-from-wallet flow is added it must use the same atomic pattern with a balance guard in the WHERE clause.**
- ✅ **Scheduled posts** (`content_calendar.py:30-65`) + stale recovery (112-159).
- ✅ **Sequence steps** (`sequence_engine.py:684-708`) + stale recovery (541-594).
- ✅ **Broadcasts** (`broadcast_engine.py:535-560`, `244-260`): `pending→sending` claim; per-recipient sends open their **own** sessions (asyncio.gather safety, documented at 419-431).
- ✅ **Marketing campaigns** (`routers/marketing.py:332-341`).
- ✅ **Payment approvals** (`app/telegram.py:92-93,160-161`, `routers/payments/approvals.py:110-111`): conditional `UPDATE … WHERE status='pending'` + partial unique `ix_sub_payment_user_pending` (TOCTOU closed in 002/v16).
- ✅ Subscriber & conversation upserts on the webhook path: savepoint + IntegrityError re-read (`messenger_service.py:78-84, 260-281`); message redelivery race handled at commit with honest rollback (322-330).
- ✅ Usage counters: atomic increment with savepoint insert + constraint-race retry (`bot_engine/pipeline.py:142-196`); normalized DATE anchors kill period-split rows.
- ✅ `NO with_for_update anywhere` — consistent with the doctrine; not needed given the status-claim pattern.

**Defects / latent races:**

| # | Finding | Evidence | Severity |
|---|---|---|---|
| R7 | **Offer delivery dedup is in-memory only** (`offer_engine.py:23-29`: `self._delivered: dict[str, set[int]]`). The `OfferClaim` table exists in the model but **zero code writes/reads it** (only the tenant-delete cleanup references it). On Vercel (multi-instance, cold starts) or after any restart the same user gets the same offer again. The intended DB dedup (`uq` on offer_claims + check before send) was never wired. | `grep OfferClaim` → models.py + admin_routes.py only | **HIGH (product correctness)** |
| R8 | **CRM lead upsert race + missing rollback poisons the bot session.** `pipeline.py:746-773`: check-then-insert on `Customer` (no savepoint); on a concurrent duplicate (`uq_customer_tenant_fbuser`, v15) the `IntegrityError` is caught by a broad `except Exception` that **never calls `session.rollback()`** → the session stays in PendingRollback state → every subsequent comment in the same cycle fails in stage 9 ("DB log failed") → **replies silently lost for the rest of the cycle**. | `pipeline.py:771-773` | **HIGH** |
| R9 | `subscriber_engine.get_or_create` (19-68): check-then-insert **without** savepoint/IntegrityError handling, and it **commits a caller-owned session** (side effect: caller's pending changes commit prematurely). Not on any production path today (messenger path is protected) — latent trap. | `subscriber_engine.py:36-68` | MED (latent) |
| R10 | **Conversation counters read-modify-write**: `conv.message_count/unread_count += 1` (`messenger_service.py:204-208`, `inbox.py:124`) — two concurrent messages → lost update → counts drift (inbox badges wrong; no money impact). | | LOW-MED |
| R12 | Plan-limit gate TOCTOU: read SUM → gate → atomic increment; a burst of concurrent replies can overshoot `max_replies` by the in-flight count. Billing-tolerant; document or accept. | `pipeline.py:91-139` | LOW |
| R13 | `_rate_limit.py`: insert-then-count per attempt; concurrent attempts each count before the others commit → limit overshoot by concurrency factor. Also every payment POST does a DELETE+INSERT+COUNT+COMMIT. | `_rate_limit.py:10-36` | LOW |

---

## 6. Data Integrity

- **ON DELETE:** real FKs with CASCADE: `messages.conversation_id` ✓, `subscriber_tags` ✓, `flow_executions` ✓, `sequence_steps`/`sequence_subscriptions` ✓, `broadcast_recipients` ✓, `conversation_assignees.user_id` ✓; `telegram_approvers.added_by_id` SET NULL (015) ✓. **BUT** SQLite enforces FKs only with `PRAGMA foreign_keys=ON` — enabled in tests (`tests/conftest.py:84-88`) **but not in dev runtime** → orphaned messages in dev after conversation deletes; PG is validated.
- **tenant_id is a logical reference everywhere** (no `ForeignKey("tenants.id")` on any business table). Consequence: no DB-level cascade on tenant delete — `admin_routes.py:360-385` manually enumerates **39 tables** (and deletes `SupportTicketReply` via ticket subquery first). Any new table must be remembered there (drift-prone; nothing enforces it).
- **Nullable-should-be-not-null:** `SubscriptionPayment.user_id/tenant_id` nullable (pre-registration rows — documented); `Notification.user_id` nullable (tenant-broadcast semantics — fine); everything else `nullable=False` where it matters. Reconcile adds columns NULLABLE on SQLite legacy (D9).
- **Defaults:** overwhelmingly Python-side (`default=utcnow`) with `server_default` only on `users.token_ver`/`is_platform_admin` (v15, the live-login-500 fix). Raw SQL writes outside the ORM are rare (reconcile backfills handle them). Risk is low but new bulk paths must use ORM defaults or add `server_default`.
- **Timezone:** naive-UTC end-to-end (see §1). The one aware/naive hazard is D4.
- **Money:** Numeric everywhere; wallet-in-TEXT handled via Decimal+quantize; **serialization converts to float** (`float(r.amount)` in history/balance endpoints) — display-only, 3dp safe; keep an eye on it.

## 7. Data Volume Design

- **messages**: every inbound/outbound Messenger event persists forever. No per-tenant retention, no archival, no partitioning. Dedup (`uq_messages_tenant_fb`) at least prevents redelivery bloat. Access pattern is `(tenant, conversation_id, created_at)` → hash-partition by `tenant_id` (or monthly range) is feasible *after* adding §2-#1; recommend a retention policy (e.g. purge conversations idle > N months behind a tenant-configurable flag) before the first 10M-row tenant.
- **bot_logs**: manual `/api/logs/clear` (default 30d) — no automatic retention; writes are throttled for gate logs; the 48h cutoff query exists (`engine.py:491`).
- **analytics_events / ai_suggestions / notifications / audit_logs / broadcast_recipients**: no retention policies at all. `rate_limit_entries`: purged only when an admin opens `/api/admin/config` (plans_config:348) or per-key cleanup — grows with unique IP×route keys otherwise.
- **Analytics computation**: 100% on-the-fly (`COUNT`/`GROUP BY` per request, polled by the frontend). No aggregation/rollup tables, no materialized views. The `AnalyticsEvent` table (designed for exactly this) is written by… let's say: it exists but the dashboards compute from `replies`/`messages` instead. First rollup candidate: `daily_stats(tenant_id, day, replies, messages, dms, new_subs)` maintained by the existing cron beat; every dashboard/analytics/PDF endpoint then reads ≤ 90 rows.

## 8. Multi-Tenancy at DB Level

- `tenant_id` present on **all** business tables except: `support_ticket_replies` (reached only through ticket joins with tenant checks — acceptable but forces the special-case delete), and platform-level globals (`system_config`, `subscription_plans`, `telegram_approvers`, `telegram_broadcast_targets`, `rate_limit_entries` (IP-keyed), `blacklisted_tokens` (jti-keyed)) — by design.
- Legacy `tenant_id=0` bootstrap space is still a live convention (platform admin, env-credential fallback in `dashboard_stats.py:136-151` — now correctly gated to tenant 0 only).
- **RLS feasibility (PG/Neon):** high — every tenant query is a bare `Table.tenant_id == :tid` equality, `get_db` yields a per-request session over NullPool, so a `SET app.tenant_id = :tid` (or `set_config` in a `begin()`) + policy `USING (tenant_id = current_setting('app.tenant_id')::int)` is a clean drop-in. **Caveats:** (a) the global cron sweeps (broadcast/campaign/sequence/post claims) would need a `BYPASSRLS` cron role or `SECURITY DEFINER` helpers; (b) SQLite tests are unaffected (no RLS) — keep the app-level filters as the test parity layer; (c) `tenant_id=0` rows need policy treatment.

## 9. SQLite ↔ PostgreSQL Divergence

- **Good discipline:** every partial index declares both `postgresql_where` and `sqlite_where` (`models.py:94-100, 142-144, 800-802`); expression index `lower(email)` works on both; `RETURNING` (SQLite ≥3.35 via aiosqlite ✓), savepoints ✓, `extract()`/`cast(Date)` compile on both ✓.
- **Gaps:** (1) **CI runs SQLite only** (no Postgres service in `ci.yml`) — PG-only classes (FK RESTRICT→500 that motivated 015, partial-index WHERE semantics, timestamptz, NOT VALID constraints, sequence/setval behavior that 003 explicitly fixed) are never regression-tested; (2) dev aiosqlite runs **without** the FK PRAGMA → cascade deletes untested in dev; (3) D4 timestamptz lineage drift; (4) `Numeric` on SQLite stores floats (Decimal via str round-trip; wallet quantizes at 0.001 so tests are within tolerance — but money assertions run in float space).

## 10. Serialization

- No central schema layer: responses are hand-built dicts through `ok()`/`fail()` envelopes with the `iso_z()` naive→Z convention; only 4 pydantic request models repo-wide. Silent-field-drop risk is real but historically managed (documented fixes: `D8-X1` double-consume, v15 invoice merge). A pydantic response layer would freeze the contracts; medium effort, deferred is defensible.
- `to_dict()` implementations are ad-hoc (`content_calendar._post_to_dict`, `monitor.to_dict`) — consistent with the envelope pattern.

---

## Priority Fix List

| Pri | Fix | Where | Effort |
|---|---|---|---|
| **P0** | Add `await session.rollback()` in the CRM-upsert except handler + wrap the Customer check-then-insert in `begin_nested` (IntegrityError → re-read & update) — stops cycle-wide reply loss | `bot_engine/pipeline.py:746-773` | hours |
| **P1** | Wire offer dedup to the DB: unique `(tenant_id, offer_id, fb_user_id)` on `offer_claims` + insert-before-send (savepoint) replacing the in-memory `_delivered` dict | `offer_engine.py`, migration 017 | 0.5 day |
| **P1** | Claim-sweep indexes: `broadcasts(status, created_at)`, `marketing_campaigns(status, scheduled_at)`, `scheduled_posts(status, scheduled_at)`, `sequence_subscriptions(status)` — one migration (017), Inspector-guarded, both dialects | models + alembic 017 | 0.5 day |
| **P1** | `messages(tenant_id, created_at)` composite (analytics DM counts + future retention pruning) | models + 017 | 15 min |
| **P1** | Rewrite `get_due_subscriptions` as one SQL join (due = `entered_at + delays <= now`) or batch-load steps/subscribers — kills the O(2N) per-beat scan | `sequence_engine.py:330-396` | 0.5 day |
| **P2** | Retention + rollups: cron job purging `bot_logs`/`rate_limit_entries`/`notifications`/`analytics_events` past policy; daily rollup table feeding dashboard/analytics/PDF | new `_retention.py` + beat step | 1-2 days |
| **P2** | `subscriber_engine.get_or_create`: savepoint + no-commit-on-shared-session (align with messenger_service pattern) | `subscriber_engine.py:19-68` | 1 h |
| **P2** | Add PG service to CI (even just `alembic upgrade head` + smoke tests) — closes the dialect-parity blind spot; add `compare_type=True` to env.py | `.github/workflows/ci.yml`, `alembic/env.py` | 0.5 day |
| **P2** | Verify on Neon whether `rate_limit_entries.window_end` is `timestamptz` (D4); if yes, migrate those columns to `timestamp` (or switch code to aware UTC) | migration 017 | 0.5 day |
| **P3** | Indexes #6, #7, #9-#13 of §2; flip `Tag.subscribers` to `lazy="raise"`; keyset pagination on the 3 hottest lists; `blacklisted_tokens` purge from startup → beat | see §2/§3 | backlog |

---

## Counts (for the ledger)

- **Missing/mismatched indexes:** 13 concrete + 1 type-level (JSONB) — 5 HIGH, 5 MED, 4 LOW.
- **Race conditions:** 6 verified-atomic patterns (no bugs) vs **2 real defects (R7, R8)**, 1 latent (R9), 2 minor (R10, R13), 2 accepted TOCTOU notes (R12 + wallet-debit-when-added).
- **Schema drift items:** 10 (D1-D10) — 1 architectural (D1), 1 latent-hazard (D4), 1 chain-incomplete (D2), 1 closed (D3), rest tooling/cosmetic.
- **Data-integrity risks:** FK-less tenant_id + 39-table manual delete enumeration; SQLite dev FK-off; money-as-TEXT wallet; float() serialization.
- **Volume risks:** 6 tables without retention; zero rollup tables; per-request COUNTs on polled endpoints.

*No source files were modified. All claims carry file:line evidence verified by static reading during this audit.*
