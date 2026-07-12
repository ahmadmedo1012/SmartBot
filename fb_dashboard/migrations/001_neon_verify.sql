-- Neon DB verification: verify + migrate schema for P3/P5
-- Run this against the Neon DB after setting DATABASE_URL

-- Verify all columns exist
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'scheduled_posts';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'rules';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'replies';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bot_logs';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'subscribers';

-- Add platform column to scheduled_posts if missing (needed for multi-platform scheduling in content_calendar.py)
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'facebook';
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS fb_post_id VARCHAR(100) DEFAULT '';

-- Add image_url to scheduled_posts if missing (used by Facebook/Instagram media uploads)
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) DEFAULT '';
