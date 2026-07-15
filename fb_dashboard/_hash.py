from __future__ import annotations
"""Password hashing with argon2id primary, bcrypt fallback for legacy."""
import bcrypt

try:
    from argon2 import PasswordHasher, Type
    _ph = PasswordHasher(type=Type.ID, time_cost=3, memory_cost=65536, parallelism=4)
    _HAS_ARGON2 = True
except ImportError:
    _HAS_ARGON2 = False


def hash_password(password: str) -> str:
    if _HAS_ARGON2:
        return _ph.hash(password)
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, stored: str) -> bool:
    # ponytail: argon2id primary, bcrypt fallback for pre-migration hashes
    if stored.startswith("$argon2id$"):
        if not _HAS_ARGON2:
            return False
        try:
            return _ph.verify(stored, password)
        except Exception:
            return False
    # legacy bcrypt
    try:
        return bcrypt.checkpw(password.encode(), stored.encode())
    except Exception:
        return False
