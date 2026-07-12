from cryptography.fernet import Fernet
import base64, hashlib
from config import settings

def _get_cipher():
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)

def encrypt_token(plaintext: str) -> str:
    if not plaintext:
        return ""
    cipher = _get_cipher()
    return cipher.encrypt(plaintext.encode()).decode()

def decrypt_token(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    cipher = _get_cipher()
    return cipher.decrypt(ciphertext.encode()).decode()
