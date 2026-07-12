import os, logging
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger("fb-config")

class Settings(BaseSettings):
    # DATABASE_URL is optional - defaults to SQLite if not set
    DATABASE_URL: str = ""
    FACEBOOK_ACCESS_TOKEN: str = ""
    FACEBOOK_PAGE_ID: str = ""
    SECRET_KEY: str = "smartbot-fallback-dev-key-change-in-production"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    BOT_INTERVAL_SECONDS: int = 10
    START_BOT: bool = True

    @property
    def async_database_url(self) -> str:
        url = self.DATABASE_URL
        if not url:
            return "sqlite+aiosqlite:///data.db"
        if url.startswith("sqlite"):
            return url
        # strip query params (sslmode=require etc.) - asyncpg handles SSL automatically
        clean = url.split("?")[0]
        return clean.replace("postgresql://", "postgresql+asyncpg://", 1)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


# ponytail: Telegram config loaded from env vars (no DB panel needed yet)
TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_ADMIN_IDS: list[int] = [int(x) for x in os.environ.get("TELEGRAM_ADMIN_IDS", "").split(",") if x.strip().isdigit()]


settings = Settings()

# ponytail: fail-fast — refuse default SECRET_KEY in production
if settings.SECRET_KEY == "smartbot-fallback-dev-key-change-in-production" and not settings.DEBUG:
    raise RuntimeError("CRITICAL: SECRET_KEY is the default — set SECRET_KEY env var for production")

# ponytail: CRON_SECRET required in production (non-DEBUG)
if not settings.DEBUG and not os.environ.get("CRON_SECRET"):
    raise RuntimeError("CRITICAL: CRON_SECRET env var is required in production")
