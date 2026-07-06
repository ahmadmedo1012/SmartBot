from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # DATABASE_URL is optional - defaults to SQLite if not set
    DATABASE_URL: str = ""
    FACEBOOK_ACCESS_TOKEN: str = ""
    FACEBOOK_PAGE_ID: str = ""
    SECRET_KEY: str = "smartbot-fallback-dev-key-change-in-production"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    BOT_INTERVAL_SECONDS: int = 10
    START_BOT: bool = False

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


settings = Settings()
