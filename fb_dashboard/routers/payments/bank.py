"""Receipt upload route: POST /api/upload (payment receipt evidence).

v13-L4: split out of the former 594-line ``routers/payments.py`` monolith —
endpoint body moved VERBATIM; the upload constants live here.
"""
import logging
import os
import secrets
from pathlib import Path

from _responses import ok
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from models import User

from routers.auth import get_current_user
from routers.payments.wallet import _payment_rate_limit

log = logging.getLogger("fb-api")
router = APIRouter(tags=["payments"])

# Receipt uploads — plan §2.1 (receipt upload)
# bank.py lives in fb_dashboard/routers/payments/ → static/ is two levels up
_UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "static" / "uploads" / "receipts"
_MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5MB
_ALLOWED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
_IS_VERCEL = bool(os.getenv("VERCEL"))


@router.post("/api/upload")
async def upload_receipt(request: Request, file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    """Upload a payment receipt image (plan §2.1).

    - Authenticated users only.
    - Rate-limited (10/min per IP — plan §7.1).
    - Content-type + magic-byte validation, 5MB cap, Pillow re-encode to
      cap dimensions (1600px) so storage/Telegram payloads stay sane.
    - Local disk: saved to static/uploads/receipts → returns /static/... URL.
    - Vercel (read-only FS): returns a data: URL so the receipt still
      reaches the admin review flow via extra_data.
    """
    await _payment_rate_limit(request, "upload")
    ctype = (file.content_type or "").lower()
    if ctype not in _ALLOWED_TYPES:
        raise HTTPException(400, "صيغة الصورة غير مدعومة — JPG أو PNG أو WEBP فقط")

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "الملف فارغ")
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(400, "حجم الصورة يتجاوز 5 ميغابايت")

    # Re-encode with Pillow: validates real image content AND caps dimensions
    try:
        import io

        from PIL import Image
        img = Image.open(io.BytesIO(raw))
        img.load()
        img = img.convert("RGB")
        if max(img.size) > 1600:
            img.thumbnail((1600, 1600))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        payload = buf.getvalue()
        ext = ".jpg"
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "الملف ليس صورة صالحة") from None

    if _IS_VERCEL:
        import base64
        url = f"data:image/jpeg;base64,{base64.b64encode(payload).decode()}"
        return ok({"url": url})

    try:
        _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        name = f"{secrets.token_hex(12)}{ext}"
        (_UPLOAD_DIR / name).write_bytes(payload)
        url = f"/static/uploads/receipts/{name}"
        return ok({"url": url})
    except Exception as e:
        log.error(f"receipt upload failed: {e}", exc_info=True)
        raise HTTPException(500, "تعذر حفظ الصورة — حاول مرة أخرى") from e
