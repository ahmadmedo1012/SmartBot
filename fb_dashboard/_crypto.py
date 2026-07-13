from cryptography.fernet import Fernet, InvalidToken
import base64, hashlib
from config import settings


def _get_legacy_key():
    return base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())


def _get_cipher(key_bytes: bytes | None = None):
    if key_bytes:
        return Fernet(key_bytes)
    if settings.FERNET_KEY:
        return Fernet(settings.FERNET_KEY.encode())
    return Fernet(_get_legacy_key())


def encrypt_token(plaintext: str) -> str:
    if not plaintext:
        return ""
    cipher = _get_cipher()
    return cipher.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    try:
        return _get_cipher().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        if not settings.FERNET_KEY:
            raise
        # ponytail: dual-read fallback — try legacy key. Remove after all tokens re-encrypted.
        return _get_cipher(_get_legacy_key()).decrypt(ciphertext.encode()).decode()
