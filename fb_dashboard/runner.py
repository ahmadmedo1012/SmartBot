	        async with engine.connect() as conn:
	            await conn.run_sync(Base.metadata.create_all)
	            # Migration: each ALTER TABLE in its own autocommit to survive failures
	            for col_sql in [
	                "ALTER TABLE rules ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 999",
	                "ALTER TABLE rules ADD COLUMN IF NOT EXISTS bot_type VARCHAR(20) DEFAULT 'reply'",
	                "ALTER TABLE rules ADD COLUMN IF NOT EXISTS dm_template TEXT DEFAULT ''",
	                "ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'facebook'",
	                "ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS fb_post_id VARCHAR(100) DEFAULT ''",
	                "ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER",
	                # Subscription plans — add every column that may be missing
	                "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''",
	                "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS price_monthly INTEGER DEFAULT 0",
	                "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS price_yearly INTEGER DEFAULT 0",
	                "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS stripe_price_id_monthly VARCHAR(100) DEFAULT ''",
	                "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS stripe_price_id_yearly VARCHAR(100) DEFAULT ''",
	                "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_replies INTEGER DEFAULT 0",
	                "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_rules INTEGER DEFAULT 10",
	                "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 1",
	                "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_sequences INTEGER DEFAULT 0",
	                "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS features JSON DEFAULT '[]'",
	                "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE",
	                "ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0",
	                # Tenants — ensure all columns exist
	                "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email VARCHAR(200) DEFAULT ''",
	                "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50) DEFAULT ''",
	                "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE",
	                "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings_json TEXT DEFAULT '{}'",
	            ]:
	                try:
	                    await conn.execute(text("COMMIT"))  # end any prior failed txn
	                except Exception:
	                    pass
	                try:
	                    await conn.execute(text(col_sql))
	                except Exception as e:
	                    log.warning(f"Migration skipped (non-fatal): {e}")
	            try:
	                await conn.execute(text("COMMIT"))
	            except Exception:
	                pass
	        log.info("DB tables ready")