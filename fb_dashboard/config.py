from __future__ import annotations

import logging
import os

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger("fb-config")

class Settings(BaseSettings):
    # DATABASE_URL is optional - defaults to SQLite if not set
    DATABASE_URL: str = ""
    # Pooled DATABASE_URL for Neon (with pgbouncer) — avoids connection limit exhaustion
    DATABASE_POOLED_URL: str = ""
    # When True, asyncpg connects with ssl=require (production / Neon).
    # When False (local dev), asyncpg uses default (no SSL).
    # Accept empty string from Vercel as False — pydantic strict bools break on "".
    DATABASE_REQUIRE_SSL: bool = False
    FACEBOOK_ACCESS_TOKEN: str = ""
    FACEBOOK_PAGE_ID: str = ""
    SECRET_KEY: str = ""
    FERNET_KEY: str = ""
    DEBUG: bool = False
    # v12: LOG_LEVEL and REDIS_URL Settings fields removed — zero readers.
    # Log level is fixed at INFO via logging.basicConfig in runner/startup/_services;
    # REDIS_URL is read directly from the environment by fb_dashboard/redis_cache.py.
    BOT_INTERVAL_SECONDS: int = 10
    START_BOT: bool = True
    # ── Payment providers (Libyan mobile wallets / bank transfer) — plan §2 ──
    # Env values act as FALLBACKS for /api/config when SystemConfig rows are
    # empty; admins override them via POST /api/admin/config (DB wins).
    LIBYANA_WALLET_PHONE: str = ""
    MADAR_WALLET_PHONE: str = ""
    MOBILE_WALLET_CAP: int = 99  # LYD — above this, bank transfer is mandatory
    BANK_TRANSFER_BANK_NAME: str = ""
    BANK_TRANSFER_ACCOUNT_NUMBER: str = ""
    BANK_TRANSFER_IBAN: str = ""

    @field_validator("DATABASE_REQUIRE_SSL", "DEBUG", "START_BOT", mode="before")
    @classmethod
    def _coerce_bool(cls, v):
        if v is None or v == "":
            return False
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.strip().lower() in ("1", "true", "yes", "on", "y", "t")
        return bool(v)

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

# ponytail: fail-fast — refuse empty SECRET_KEY on production deployments.
# On Vercel previews (VERCEL_ENV=preview) we relax this so PR-branch URLs
# stay bootable without copying every production env var over. DEBUG=1
# remains the local-dev escape hatch.
_VERCEL_ENV = os.environ.get("VERCEL_ENV", "")
_IS_PROD = not settings.DEBUG and _VERCEL_ENV in ("", "production")

if not settings.SECRET_KEY and _IS_PROD:
    raise RuntimeError("CRITICAL: SECRET_KEY is empty — set SECRET_KEY env var for production")

if _IS_PROD and not os.environ.get("CRON_SECRET"):
    raise RuntimeError("CRITICAL: CRON_SECRET env var is required in production")

if _IS_PROD and not settings.FERNET_KEY:
    raise RuntimeError("CRITICAL: FERNET_KEY env var is required in production — set a separate key from SECRET_KEY")

# v15-E7 (D6-M1): fail-fast on the Telegram-webhook DEV escape hatch in
# production. TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED=true makes the Telegram
# webhook trust from_id taken from the request BODY with NO secret check
# (runner.py reads it into _ALLOW_UNVERIFIED → app/telegram.py skips
# verification) — anyone who discovers the webhook URL can then impersonate
# the admin panel. The comparison matches runner.py EXACTLY (== "true",
# case-sensitive, no strip): a value the runner would ignore must not block
# boot either. Dev/tests run with DEBUG=true → _IS_PROD is False → the hatch
# stays usable locally (installation.md documents it as test-only).
if _IS_PROD and os.environ.get("TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED", "") == "true":
    raise RuntimeError(
        "CRITICAL: TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED=true is a dev-only escape hatch that "
        "disables Telegram webhook authentication — remove it from the production environment "
        "and set TELEGRAM_WEBHOOK_SECRET instead"
    )

# v24-R3 (B2 M-1): DEBUG=true is the local-dev convenience switch, but it
# ALSO silently (a) mints session cookies WITHOUT the Secure flag
# (routers/auth.py login/logout), (b) adds localhost/127.0.0.1 to the CSRF
# origin allowlist (app/middleware.py), and (c) no-ops every fail-fast above
# (_IS_PROD). The behavior stays (dev needs it) — but a deployment that
# looks like production must SAY so at boot instead of quietly running
# insecure. One warning, once: config.py imports exactly once per process,
# before the lifespan starts. "Not localhost" detection = deployment
# markers (Vercel env of any kind / a bound Neon project); a plain
# single-server box has no marker to read — its DEBUG signal is the env var
# itself, which docs/deployment.md already documents as false.
if settings.DEBUG:
    _deploy_markers = [m for m, on in (
        ("VERCEL_ENV=production", _VERCEL_ENV == "production"),
        ("VERCEL", bool(os.getenv("VERCEL"))),
        ("NEON_PROJECT_ID", bool(os.getenv("NEON_PROJECT_ID"))),
    ) if on]
    if _deploy_markers:
        log.warning(
            "DEBUG=true is active in a non-local deployment (%s) — session cookies "
            "are set WITHOUT the Secure flag, localhost is trusted for CSRF origins, "
            "and the SECRET_KEY/CRON_SECRET/FERNET_KEY fail-fasts are skipped. "
            "Set DEBUG=false in this environment unless this is intentional.",
            ", ".join(_deploy_markers),
        )
