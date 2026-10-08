# v16-D6 — Data & Migrations Integrity (2026-09-09)

## Migration chain (001-014): pattern-compliant except
- **003_tenants.py:90-94 [VERIFY→fix]: fresh-PG dies — setval(seq, COALESCE(MAX(id),0)) with only seeded id=0 → setval(...,0) out of bounds → chain aborts at 002, swallowed at startup.** Prod unaffected (past 003). v13 edited 003 in-place — precedent.
- 002_indexes.py:66-69: 2 indexes not in models (parity drift, minor write amplification).
- 008: bare except around trailing reconcile call.

## create_all vs chain parity: empirically identical (Inspector + DDL diff on fresh SQLite both paths) except alembic_version + 2 chain-only indexes. Reconcile heal-list misses (matters only if chain fails): uq_user_tenant_username (models.py:132), ix_sub_payment_user_pending (:695), uq_*_tenant_fb ×3, uq_notif_pref_user, plans.name unique, 11/15 hot indexes.

## Integrity gaps
1. [VERIFY] CRITICAL-if-real: 003 setval above.
2. HIGH: user delete 500s on PG — telegram_approvers.added_by_id ONLY FK without ON DELETE (models.py:750); users.py:69-80 no sweep of notification_preferences (unique on user_id). SQLite tests never enforce FKs (no PRAGMA foreign_keys=ON) → all CASCADE behavior PG-only, untested.
3. MED: write-only User.subscription_status (models.py:159).
4. MED: status-contract mismatches (sse.py:86; Tenant "REJECTED" never written — engine.py:352 branch dead; plans_config.py:140 "active" never written).
5. MED: orphan rows on user delete (notifications, prefs, tickets, campaigns, audit_logs — app-level only).
6. LOW: money columns all Numeric (zero Float money — no new class); wallet TEXT by design w/ atomic Decimal SQL. Timestamps: single UTC-naive convention, clean.
7. LOW: dead tables conversation_notes/conversation_assignees/offer_claims.

## tenant_id index coverage: 41/50 tables indexed. 9 without: **offers (HOT PATH — full scan per inbound comment/DM: offer_engine.py:41-43 via pipeline.py:331/333)**, report_schedules, brand_config, broadcast_recipients, sequence_steps, conversation_labels + 3 dead tables.

## Retention/PII
Receipts: no cleanup of any kind — Vercel stores base64 data: URLs in subscription_payments.extra_data forever after decision (approvals.py:107-156 never strips). cleanup-logs covers only BotLog>30d/RateLimit/BlacklistedToken. Unbounded: analytics_events, ai_suggestions, notifications, audit_logs, messages. PII: FB/X/LinkedIn creds Fernet-encrypted OK; 2FA column dead; plaintext emails/phones + bank receipts (most sensitive, indefinite).

## Top-5: 1) 003 setval guard 2) FK ondelete + users delete sweep + PRAGMA in tests 3) retention pass (events>90d, read notifications>90d, strip receipt data-URLs post-terminal) 4) status contract alignment 5) offers index + reconcile heal-list completion + 002 index parity.
