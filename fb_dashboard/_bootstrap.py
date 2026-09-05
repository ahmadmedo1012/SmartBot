"""Bootstrap & maintenance helpers shared by runner lifespan and admin routes.

Extracted here (2026-09-05 security round) so seed_admin exists in exactly ONE
place — runner.py and admin_routes.py previously carried verbatim copies that
could drift (and did: both defaulted the bootstrap admin password to "admin").

Security properties of seed_admin:
  - runs ONLY on an empty users table (never resets existing passwords)
  - in production, an unset INITIAL_ADMIN_PASSWORD generates a strong random
    password logged ONCE server-side — the literal default "admin" is never
    allowed outside DEBUG (live incident: prod booted with admin/admin)
"""
from __future__ import annotations

import logging
import os
import secrets
import string

from sqlalchemy import select, func, delete

log = logging.getLogger("fb-api")


def _generate_password(length: int = 20) -> str:
    alphabet = string.ascii_letters + string.digits
    return "SB-" + "".join(secrets.choice(alphabet) for _ in range(length)) + "!ly"


async def seed_admin(db) -> None:
    """Seed the initial bootstrap (platform) admin if no users exist.

    Username/password come from INITIAL_ADMIN_USERNAME/INITIAL_ADMIN_PASSWORD.
    In production with no password configured, a random one is generated and
    logged once — the operator copies it from the server logs on first boot.
    """
    from models import User  # local import: models imports nothing back
    count = await db.scalar(select(func.count(User.id))) or 0
    if count > 0:
        return  # users already exist — never reset existing passwords
    username = os.environ.get("INITIAL_ADMIN_USERNAME", "admin")
    password = os.environ.get("INITIAL_ADMIN_PASSWORD", "")
    is_debug = os.getenv("DEBUG", "").lower() in ("1", "true", "yes")
    if not password:
        if is_debug:
            password = "admin"  # local dev convenience only
        else:
            password = _generate_password()
            # One-time log: the operator MUST fetch this from server logs.
            log.warning(
                "INITIAL_ADMIN_PASSWORD not set — bootstrap admin '%s' created with a "
                "RANDOM password (retrieve it from this log line NOW, it is not stored): %s",
                username, password,
            )
    from _hash import hash_password
    db.add(User(username=username, password_hash=hash_password(password), role="admin"))
    await db.commit()
    log.info("Initial admin user seeded")


async def purge_expired_blacklist(db) -> int:
    """Delete BlacklistedToken rows whose JWT has already expired.

    Without this the table grows unboundedly (one row per logout, forever).
    Called from the daily cleanup cron and from lifespan startup.
    """
    from datetime import timedelta
    from _utils import utcnow
    from models import BlacklistedToken
    result = await db.execute(
        delete(BlacklistedToken).where(BlacklistedToken.expires_at < utcnow() - timedelta(hours=1))
    )
    await db.commit()
    return result.rowcount or 0
