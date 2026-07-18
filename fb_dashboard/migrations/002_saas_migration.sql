-- Sprint 1: Multi-tenant migration
-- Add tenant_id columns (default 0 for single-tenant existing data)
-- All new models already bake tenant_id; this migrates existing tables.

ALTER TABLE rules ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE replies ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bot_logs ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bot_state ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reply_templates ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_suggestions ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversation_tags ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversation_labels ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bot_alerts ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE offer_claims ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriber_tags ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE flows ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE flow_executions ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sequence_steps ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sequence_subscriptions ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversation_notes ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversation_assignees ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE brand_config ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT 0;

-- Users: add SaaS columns (email already added by runner.py migration, but idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(200) DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(100) DEFAULT '';

-- Index tenant_id on all tables for multi-tenant query filtering
CREATE INDEX IF NOT EXISTS ix_rules_tenant ON rules (tenant_id);
CREATE INDEX IF NOT EXISTS ix_replies_tenant ON replies (tenant_id);
CREATE INDEX IF NOT EXISTS ix_bot_logs_tenant ON bot_logs (tenant_id);
CREATE INDEX IF NOT EXISTS ix_bot_state_tenant ON bot_state (tenant_id);
CREATE INDEX IF NOT EXISTS ix_users_tenant ON users (tenant_id);
CREATE INDEX IF NOT EXISTS ix_reply_templates_tenant ON reply_templates (tenant_id);
CREATE INDEX IF NOT EXISTS ix_ai_suggestions_tenant ON ai_suggestions (tenant_id);
CREATE INDEX IF NOT EXISTS ix_conversation_tags_tenant ON conversation_tags (tenant_id);
CREATE INDEX IF NOT EXISTS ix_conversation_labels_tenant ON conversation_labels (tenant_id);
CREATE INDEX IF NOT EXISTS ix_scheduled_posts_tenant ON scheduled_posts (tenant_id);
CREATE INDEX IF NOT EXISTS ix_analytics_events_tenant ON analytics_events (tenant_id);
CREATE INDEX IF NOT EXISTS ix_bot_alerts_tenant ON bot_alerts (tenant_id);
CREATE INDEX IF NOT EXISTS ix_offers_tenant ON offers (tenant_id);
CREATE INDEX IF NOT EXISTS ix_offer_claims_tenant ON offer_claims (tenant_id);
CREATE INDEX IF NOT EXISTS ix_subscribers_tenant ON subscribers (tenant_id);
CREATE INDEX IF NOT EXISTS ix_tags_tenant ON tags (tenant_id);
CREATE INDEX IF NOT EXISTS ix_subscriber_tags_tenant ON subscriber_tags (tenant_id);
CREATE INDEX IF NOT EXISTS ix_flows_tenant ON flows (tenant_id);
CREATE INDEX IF NOT EXISTS ix_flow_executions_tenant ON flow_executions (tenant_id);
CREATE INDEX IF NOT EXISTS ix_sequences_tenant ON sequences (tenant_id);
CREATE INDEX IF NOT EXISTS ix_sequence_steps_tenant ON sequence_steps (tenant_id);
CREATE INDEX IF NOT EXISTS ix_sequence_subscriptions_tenant ON sequence_subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS ix_broadcasts_tenant ON broadcasts (tenant_id);
CREATE INDEX IF NOT EXISTS ix_broadcast_recipients_tenant ON broadcast_recipients (tenant_id);
CREATE INDEX IF NOT EXISTS ix_conversation_notes_tenant ON conversation_notes (tenant_id);
CREATE INDEX IF NOT EXISTS ix_conversation_assignees_tenant ON conversation_assignees (tenant_id);
CREATE INDEX IF NOT EXISTS ix_brand_config_tenant ON brand_config (tenant_id);
CREATE INDEX IF NOT EXISTS ix_customers_tenant ON customers (tenant_id);
CREATE INDEX IF NOT EXISTS ix_report_schedules_tenant ON report_schedules (tenant_id);

-- Create new tables
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) DEFAULT '',
    plan VARCHAR(50) DEFAULT 'free',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_configs (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    config_key VARCHAR(100) NOT NULL,
    config_value TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tenant_configs_tenant ON tenant_configs (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_configs_key ON tenant_configs (tenant_id, config_key);

-- Replace old single-column unique constraints with composite (tenant_id + column)
-- replies: was UNIQUE(fb_comment_id), now UNIQUE(tenant_id, fb_comment_id)
ALTER TABLE replies DROP CONSTRAINT IF EXISTS replies_fb_comment_id_key;
ALTER TABLE replies ADD CONSTRAINT uq_reply_tenant_comment UNIQUE (tenant_id, fb_comment_id);

-- users: was UNIQUE(username), now UNIQUE(tenant_id, username)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users ADD CONSTRAINT uq_user_tenant_username UNIQUE (tenant_id, username);
