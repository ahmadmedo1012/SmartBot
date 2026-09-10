from __future__ import annotations

"""DB-backed rate limiter — works across Vercel serverless instances."""
import ipaddress
import os
from datetime import datetime, timedelta

from models import RateLimitEntry
from sqlalchemy import delete, func, select


async def check_rate_limit(db, key: str, max_attempts: int = 10, window_seconds: int = 60) -> bool:
    """Returns True if within limit, False if exceeded."""
    now = datetime.utcnow()
    # cleanup stale entries for this key
    await db.execute(
        delete(RateLimitEntry).where(
            RateLimitEntry.key == key,
            RateLimitEntry.window_end <= now,
        )
    )

    # record attempt — MUST commit: callers may use a short-lived session
    # (e.g. payments' rl_db) whose close() would otherwise roll this back,
    # making the limiter a no-op across requests.
    db.add(RateLimitEntry(key=key, window_end=now + timedelta(seconds=window_seconds)))
    await db.flush()
    await db.commit()

    # count in current window
    count = await db.scalar(
        select(func.count(RateLimitEntry.id)).where(
            RateLimitEntry.key == key,
            RateLimitEntry.window_end > now,
        )
    ) or 0

    return count <= max_attempts


# ── v24-C4: honest client-IP for rate-limit buckets ─────────────────────────


def _normalize_ip_entry(hop: str) -> str | None:
    """One X-Forwarded-For entry → bare IP string, or None if unparsable.

    Strips the port forms proxies emit (``1.2.3.4:5678`` / ``[::1]:443``)
    and refuses anything that is not a literal IP address."""
    hop = hop.strip()
    if not hop:
        return None
    if hop.startswith("["):  # [ipv6]:port
        hop = hop[1:].split("]", 1)[0]
    elif hop.count(":") == 1:  # ipv4:port (a bare ipv6 has >1 colon)
        hop = hop.split(":", 1)[0]
    try:
        return str(ipaddress.ip_address(hop))
    except ValueError:
        return None


def _is_private_ip(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    return (addr.is_private or addr.is_loopback or addr.is_reserved
            or addr.is_unspecified or addr.is_link_local or addr.is_multicast)


def client_ip(request) -> str:
    """The IP to key rate-limit buckets on (v24-C4).

    Behind a reverse proxy (Vercel sets ``VERCEL``) ``request.client.host`` is
    the PROXY's address — every user shared ONE ``mutate:`` / ``login:`` bucket
    (cross-user 429 lockouts, useless brute-force caps: the v24-B1 V1 finding).
    When we KNOW a proxy is in front (``VERCEL``, or ``SMARTBOT_TRUST_XFF=1``
    for other trusted deployments), honor the proxy-appended
    ``X-Forwarded-For``: validate every entry's format, strip ports.

    SPOOF HARDENING (v24-R4 F1): the trusted proxy APPENDS the real client IP
    as the LAST hop; everything LEFT of it is client-supplied and freely
    forgeable. The v24-C4 left-most-public behavior let any client mint a
    fresh bucket per request (rate-limit bypass) or impersonate a victim's
    IP (targeted 429 lockout). The RIGHT-MOST valid entry is the hop the
    proxy actually observed, so that — and only that — keys the bucket.
    Without the proxy marker the header is ignored entirely and we fall
    back to ``request.client.host`` exactly as before — a self-declared IP
    is never trusted on a direct connection.

    NOTE: auth.py login/register limiters + payments limiter sites adopted
    this helper in v24-R3.
    """
    host = request.client.host if request.client else "unknown"
    if not (os.getenv("VERCEL") or os.getenv("SMARTBOT_TRUST_XFF") == "1"):
        return host
    # v24-R4 F1: right-most (proxy-appended) hop wins; left entries are spoofable
    for hop in reversed((request.headers.get("x-forwarded-for") or "").split(",")):
        ip = _normalize_ip_entry(hop)
        if ip is not None:
            return ip
    return host
