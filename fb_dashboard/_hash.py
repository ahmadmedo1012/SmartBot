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


# P18-W5 (the event-loop freeze fix): argon2id (64 MB, parallelism=4) was
# called SYNCHRONOUSLY inside async auth handlers — every register/login/
# change-password froze the ENTIRE event loop for the hashing duration.
# Under CPU contention (CI runners, loaded production nodes) that freeze
# stretched to tens of seconds and surfaced as the intermittent
# BaseHTTPMiddleware CancelledError flakes in test_page_backend_alive +
# the "event loop froze during render" class. The off-loop twins move the
# work to the default thread executor: the loop never blocks, concurrent
# requests keep flowing (a real production bug, not just a test flake).
import asyncio


async def hash_password_async(password: str) -> str:
    return await asyncio.to_thread(hash_password, password)


async def verify_password_async(password: str, stored: str) -> bool:
    return await asyncio.to_thread(verify_password, password, stored)


# ── S-06 (P21-W7-F): سياسة عرض كلمة المرور ─────────────────────────────────
# قبل W7-F كانت البوابة الوحيدة عند الضبط/التغيير/الإعادة هي الطول
# (`len < 8` في auth.py وusers.py) — «password» و«12345678» وكلمات
# المعاجم الشائعة كلها كانت تعبر. السياسة هنا عملية صريحة لا تُنكّر الواقع:
# 8 محارف على الأقل **و**حرف واحد على الأقل **و**رقم واحد على الأقل،
# عند إنشاء كلمة المرور/تغييرها/إعادتها **فقط** (auth.py: register /
# change-password / admin reset-password، وusers.py: create_user /
# update_user — المواقع الخمسة كلها). تسجيل الدخول لا يُقيَّم أبدًا:
# كلمة مرور قائمة ضعيفة يجب أن تُغيَّر بقرار مالكها، لا أن يُحبس
# صاحبها خارج حسابه (أثر البطارية: كل عيّنات الجنات الحية
# «Str0ngPass!ly»/«pass123456»/«secret123»/«Test12345!»… تعبر؛ لم يُغيَّر
# أي عيّنة — السياسة اختيرت لتغلق الثغرة دون تمثيل كاذب).
# لا فحص قوائم الاختراق ولا تشديد قمعي: مطلب البند هو «اتساع» صادق
# يغلق حالة «الطول فقط»، وحرف+رقم هو الحد الأدنى الذي يرفع الكلفة
# الحقيقية للتخمين دون إزعاج الاستخدام العربي (الحروف العربية محسوبة
# حروفًا — isalpha — والأرقام الهندية أرقامًا — isdigit).
PASSWORD_MIN_LEN = 8
PASSWORD_POLICY_MSG = (
    "كلمة المرور يجب أن تكون 8 أحرف على الأقل وأن تحتوي على حرف ورقم على الأقل"
)


def password_policy_error(password) -> str | None:
    """رسالة السياسة العربية إن خالفت كلمة المرور الجديدة، أو None إذا مقبولة.

    Total على الأنواع: قيمة غير نصية (JSON قد يرسل رقمًا مثلًا) كانت
    ترمي TypeError داخل len() ← 500 خام في register قبل W7-F — الآن
    تُعامل كرافضة للسياسة مع 400 عربي صريح (نفس تحصين reset-password
    الموجود `isinstance` من قبل).
    """
    pw = password if isinstance(password, str) else ""
    ok = (
        len(pw) >= PASSWORD_MIN_LEN
        and any(ch.isalpha() for ch in pw)
        and any(ch.isdigit() for ch in pw)
    )
    return None if ok else PASSWORD_POLICY_MSG
