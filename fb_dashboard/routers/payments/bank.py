"""Receipt upload route: POST /api/upload (payment receipt evidence).

v13-L4: split out of the former 594-line ``routers/payments.py`` monolith —
endpoint body moved VERBATIM; the upload constants live here.

v24-R3 (B2 H-1): uploads land OUTSIDE the public /static mount. The old
``_UPLOAD_DIR`` (``fb_dashboard/static/uploads/receipts``) sat inside the
unauthenticated StaticFiles mount (runner.py) — on single-server
deployments anyone holding the URL read payment receipts (PII). Files now
go to a PRIVATE root (``_utils.private_upload_dir``); the
``"/static/uploads/receipts/<name>"`` string returned to the uploader and
stored in ``extra_data.receipt_url`` remains the DB MARKER (prefix-validated
by plans.py ``_validated_receipt_url`` and resolved by the authenticated
``GET /api/payments/receipt/{id}`` in approvals.py via
``resolve_receipt_path`` below) — it is an OPAQUE marker now, not a
publicly-served URL: ``GET /static/uploads/receipts/<name>`` 404s because
the file is no longer inside the mount.
"""
import asyncio
import logging
import os
import secrets
from pathlib import Path

from _responses import ok
from _utils import private_upload_dir
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from models import User

from routers.auth import get_current_user
from routers.payments.wallet import _payment_rate_limit

log = logging.getLogger("fb-api")
router = APIRouter(tags=["payments"])

# Receipt uploads — plan §2.1 (receipt upload)
# v24-R3 (B2 H-1): PRIVATE dir (see module docstring). Sibling of static/ on
# writable deployments; /tmp on Vercel (whose upload path returns a data: URI
# and never writes); env override for ops.
_UPLOAD_DIR = private_upload_dir("receipts")
# Pre-v24 location — files uploaded BEFORE this fix still live here;
# resolve_receipt_path() falls back to it so old rows keep rendering through
# the authenticated route (rows migrated by ops simply disappear from here).
_UPLOAD_DIR_LEGACY = Path(__file__).resolve().parent.parent.parent / "static" / "uploads" / "receipts"
_MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5MB
_ALLOWED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
_IS_VERCEL = bool(os.getenv("VERCEL"))


def resolve_receipt_path(name: str) -> Path | None:
    """v24-R3 (B2 H-1): receipt file lookup for the authenticated route.

    Private dir first, then the legacy static location for rows uploaded
    before the move. ``name`` MUST already be a bare basename (the caller
    in approvals.py runs it through ``os.path.basename``).
    """
    if name in ("", ".", "..") or "/" in name or "\\" in name or ".." in name:
        return None
    for base in (_UPLOAD_DIR, _UPLOAD_DIR_LEGACY):
        candidate = base / name
        if candidate.is_file():
            return candidate
    return None


@router.post("/api/upload")
async def upload_receipt(request: Request, file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    """Upload a payment receipt image (plan §2.1).

    - Authenticated users only.
    - Rate-limited (10/min per IP — plan §7.1).
    - Content-type + magic-byte validation, 5MB cap, Pillow re-encode to
      cap dimensions (1600px) so storage/Telegram payloads stay sane.
    - v24-R3 (H-1): local disk → PRIVATE dir outside /static; the returned
      URL is the opaque DB marker (see module docstring) — the bytes are
      served only through GET /api/payments/receipt/{id}.
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

    # Re-encode with Pillow: validates real image content AND caps dimensions.
    # v24-R3 (B1 §5.5): the decode + re-encode of a 5MB upload is real CPU
    # (100-300ms+) — moved off the event loop via asyncio.to_thread, same
    # convention as pdf_reports_engine/startup uploads.
    def _reencode(data: bytes) -> bytes:
        import io

        from PIL import Image
        img = Image.open(io.BytesIO(data))
        img.load()
        img = img.convert("RGB")
        if max(img.size) > 1600:
            img.thumbnail((1600, 1600))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return buf.getvalue()

    try:
        payload = await asyncio.to_thread(_reencode, raw)
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
        # v24-R3 (H-1): the MARKER — same string the flow always stored
        # (plans.py prefix validation + approvals.py resolution), now an
        # opaque reference, NOT a publicly-served /static URL.
        url = f"/static/uploads/receipts/{name}"
        return ok({"url": url})
    except Exception as e:
        log.error(f"receipt upload failed: {e}", exc_info=True)
        raise HTTPException(500, "تعذر حفظ الصورة — حاول مرة أخرى") from e
