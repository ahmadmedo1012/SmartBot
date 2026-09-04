"""Two-factor authentication helpers (TOTP + backup codes + Fernet encryption)."""
from __future__ import annotations
import base64
import hashlib
import hmac
import json
import os
import secrets
import struct
import time
from typing import Optional


# ── AES-encrypted TOTP secret storage ────────────────────────────────────────
# Use Fernet via cryptography. Falls back to base64+HMAC if FERNET_KEY not set
# (development only — production MUST set FERNET_KEY).

_FERNET_KEY = os.getenv("FERNET_KEY", "")
_DEBUG_MODE = os.getenv("DEBUG", "").lower() in ("1", "true", "yes")
_log = __import__("logging").getLogger("fb-2fa")


def _get_fernet():
    if not _FERNET_KEY:
        if not _DEBUG_MODE:
            _log.error(
                "2FA encryption disabled — FERNET_KEY not set. "
                "Set FERNET_KEY env var in production to encrypt TOTP secrets."
            )
        return None
    try:
        from cryptography.fernet import Fernet
        return Fernet(_FERNET_KEY.encode() if isinstance(_FERNET_KEY, str) else _FERNET_KEY)
    except Exception:
        if not _DEBUG_MODE:
            _log.error("FERNET_KEY is invalid — 2FA encryption disabled. Check FERNET_KEY format.")
        return None


def encrypt_secret(secret: str) -> str:
    """Encrypt a TOTP secret for DB storage. Falls back to base64 if no Fernet key."""
    f = _get_fernet()
    if f is None:
        if not _DEBUG_MODE:
            _log.warning("FERNET_KEY not set — storing 2FA secret with base64 only (INSECURE for production)")
        return base64.b64encode(secret.encode()).decode()
    return f.encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> Optional[str]:
    """Decrypt a TOTP secret from DB storage."""
    if not token:
        return None
    f = _get_fernet()
    if f is None:
        # Development fallback
        try:
            return base64.b64decode(token.encode()).decode()
        except Exception:
            return None
    try:
        return f.decrypt(token.encode()).decode()
    except Exception:
        return None


# ── TOTP (RFC 6238) ──────────────────────────────────────────────────────────

def _hotp(secret: bytes, counter: int, digits: int = 6) -> str:
    counter_bytes = struct.pack(">Q", counter)
    hmac_digest = hmac.new(secret, counter_bytes, hashlib.sha1).digest()
    offset = hmac_digest[-1] & 0x0F
    code = (
        (hmac_digest[offset] & 0x7F) << 24
        | (hmac_digest[offset + 1] & 0xFF) << 16
        | (hmac_digest[offset + 2] & 0xFF) << 8
        | (hmac_digest[offset + 3] & 0xFF)
    )
    return str(code % (10 ** digits)).zfill(digits)


def generate_totp_secret() -> str:
    """Generate a base32-encoded TOTP secret (160 bits)."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def totp(secret_b32: str, timestamp: Optional[int] = None) -> str:
    """Compute TOTP code for the 30-second window containing `timestamp` (defaults to now)."""
    if timestamp is None:
        timestamp = int(time.time())
    padding = "=" * ((8 - len(secret_b32) % 8) % 8)
    secret = base64.b32decode(secret_b32 + padding)
    counter = timestamp // 30
    return _hotp(secret, counter)


def verify_totp(secret_b32: str, code: str, window: int = 1) -> bool:
    """Verify a 6-digit TOTP code with clock-skew tolerance of ±1 window (30s each)."""
    if not code or not secret_b32:
        return False
    code = code.strip().replace(" ", "")
    if not code.isdigit() or len(code) != 6:
        return False
    try:
        padding = "=" * ((8 - len(secret_b32) % 8) % 8)
        secret = base64.b32decode(secret_b32 + padding)
    except Exception:
        return False
    counter = int(time.time()) // 30
    for w in range(-window, window + 1):
        if hmac.compare_digest(_hotp(secret, counter + w), code):
            return True
    return False


# ── Backup codes ─────────────────────────────────────────────────────────────

def generate_backup_codes(n: int = 10) -> list[str]:
    """Generate n one-time backup codes (8 chars each, easy to type)."""
    return [secrets.token_hex(4).upper() for _ in range(n)]


def hash_backup_codes(codes: list[str]) -> str:
    """Hash backup codes with SHA-256 + per-code salt. Stored as JSON list."""
    out = []
    for c in codes:
        salt = secrets.token_hex(8)
        h = hashlib.sha256((salt + c).encode()).hexdigest()
        out.append(f"{salt}${h}")
    return json.dumps(out)


def verify_backup_code(stored_hash_json: str, code: str) -> bool:
    """Verify a backup code and return True if valid (code is one-time — caller should mark as used)."""
    if not stored_hash_json or not code:
        return False
    code = code.strip().replace(" ", "").upper()
    try:
        entries = json.loads(stored_hash_json)
    except Exception:
        return False
    for entry in entries:
        try:
            salt, h = entry.split("$", 1)
            if hmac.compare_digest(hashlib.sha256((salt + code).encode()).hexdigest(), h):
                return True
        except Exception:
            continue
    return False


def consume_backup_code(stored_hash_json: str, code: str) -> str:
    """Return updated stored_hash_json with the used code removed."""
    if not stored_hash_json:
        return stored_hash_json
    code = code.strip().replace(" ", "").upper()
    try:
        entries = json.loads(stored_hash_json)
    except Exception:
        return stored_hash_json
    remaining = []
    for entry in entries:
        try:
            salt, h = entry.split("$", 1)
            if hmac.compare_digest(hashlib.sha256((salt + code).encode()).hexdigest(), h):
                continue  # used — drop
            remaining.append(entry)
        except Exception:
            continue
    return json.dumps(remaining)


# ── QR provisioning URI (for authenticator apps) ────────────────────────────

def provisioning_uri(secret_b32: str, account_name: str, issuer: str = "SmartBot") -> str:
    """Generate otpauth:// URI for QR code generation (Google Authenticator, Authy, etc.)."""
    from urllib.parse import quote
    label = quote(f"{issuer}:{account_name}", safe="")
    return (
        f"otpauth://totp/{label}?secret={secret_b32}&issuer={quote(issuer)}&algorithm=SHA1&digits=6&period=30"
    )
