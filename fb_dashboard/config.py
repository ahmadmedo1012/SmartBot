from __future__ import annotations
import os, logging
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger("fb-config")

class Settings(BaseSettings):
    # DATABASE_URL is optional - defaults to SQLite if not set
    DATABASE_URL: str = ""
    # Pooled DATABASE_URL for Neon (with pgbouncer) — avoids connection limit exhaustion
    DATABASE_POOLED_URL: str = ""
    # When True, asyncpg connects with ssl=require (production / Neon).
    # When False (local dev), asyncpg uses default (no SSL).
    DATABASE_REQUIRE_SSL: bool = False
    FACEBOOK_ACCESS_TOKEN: str = ""
    FACEBOOK_PAGE_ID: str = ""
    SECRET_KEY: str = ""
    FERNET_KEY: str = ""
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    REDIS_URL: str = ""
    BOT_INTERVAL_SECONDS: int = 10
    START_BOT: bool = True

    @property
    def async_database_url(self) -> str:
        url = self.DATABASE_POOLED_URL or self.DATABASE_URL
        if not url:
            return "sqlite+aiosqlite:///data.db"
        if url.startswith("sqlite"):
            return url
        # asyncpg requires ssl=require explicitly when connecting to Neon
        # (Vercel env must set DATABASE_REQUIRE_SSL=true; defaults to False
        # for local SQLite-only dev). Query string is stripped because
        # asyncpg doesn't honor `?sslmode=...` — pass via connect_args.
        clean = url.split("?")[0]
        return clean.replace("postgresql://", "postgresql+asyncpg://", 1)

    @property
    def db_require_ssl(self) -> bool:
        if self.DATABASE_REQUIRE_SSL:
            return True
        # Auto-detect: any postgres URL on Vercel/Neon requires SSL.
        url = self.DATABASE_POOLED_URL or self.DATABASE_URL
        if url.startswith("postgresql") and (os.getenv("VERCEL") or os.getenv("NEON_PROJECT_ID")):
            return True
        return False

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
    # ponytail: extra="ignore" masks misspelled env vars — tighten once all vars are in Settings class


# ponytail: Telegram config loaded from env vars (no DB panel needed yet)
TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_ADMIN_IDS: list[int] = [int(x) for x in os.environ.get("TELEGRAM_ADMIN_IDS", "").split(",") if x.strip().isdigit()]


settings = Settings()

# ponytail: fail-fast — refuse empty SECRET_KEY in production
if not settings.SECRET_KEY and not settings.DEBUG:
    raise RuntimeError("CRITICAL: SECRET_KEY is empty — set SECRET_KEY env var for production")

# ponytail: CRON_SECRET required in production (non-DEBUG)
if not settings.DEBUG and not os.environ.get("CRON_SECRET"):
    raise RuntimeError("CRITICAL: CRON_SECRET env var is required in production")

# ponytail: FERNET_KEY required in production — prevents key reuse across JWT + encryption
if not settings.DEBUG and not settings.FERNET_KEY:
    raise RuntimeError("CRITICAL: FERNET_KEY env var is required in production — set a separate key from SECRET_KEY")
