from __future__ import annotations

import os
import re
from datetime import UTC, date, datetime, timedelta, timezone
from pathlib import Path


def private_upload_dir(category: str = "") -> Path:
    """v24-R3 (B2 H-1): directory for NON-public uploads — OUTSIDE ``/static``.

    Receipts (bank payment evidence) and agent images used to land under
    ``STATIC_DIR/uploads/…``, which runner.py mounts at ``/static`` with NO
    authentication: on single-server deployments anyone holding the URL could
    read payment receipts (PII — bank transfer evidence). The private root is
    deliberately outside that mount; the bytes are served only through
    authenticated routes (payments/approvals.py ``GET /api/payments/receipt/
    {id}`` resolves via routers/payments/bank.resolve_receipt_path).

    Location rules (evaluated lazily — env/VERCEL may be set after import):
      * ``SMARTBOT_PRIVATE_UPLOAD_DIR`` env override (ops knob);
      * Vercel: the function FS is read-only except /tmp → /tmp/smartbot-uploads
        (uploaders there embed ``data:`` URIs and never write anyway);
      * otherwise (single-server / local dev): a SIBLING of ``static/`` —
        ``fb_dashboard/data/uploads`` — writable next to the static export.
    """
    override = os.getenv("SMARTBOT_PRIVATE_UPLOAD_DIR", "").strip()
    if override:
        root = Path(override)
    elif os.getenv("VERCEL"):
        root = Path("/tmp/smartbot-uploads")
    else:
        root = Path(__file__).resolve().parent / "data" / "uploads"
    return root / category if category else root


def fmt_lyd(amount) -> str:
    """Format a LYD money value with the fleet smart-trim contract (r120/R14).

    ``29 → "29"``, ``29.5 → "29.5"``, ``29.25 → "29.25"`` — never a bare
    ``.0``/``.000`` tail (r133-A12 M3: Telegram payment notifications and
    wallet/plan instructions were rendering ``29.0 د.ل`` / ``50.000 د.ل``).
    Mirrors the JS ``formatPrice`` twin (Smart-Menu ``format.ts``); explicit
    2-decimals stays the DOCUMENTS/receipts convention — this is the
    display/messages seam. Accepts int/float/Decimal (DB Numeric columns).
    """
    try:
        f = float(amount)
    except (TypeError, ValueError, OverflowError):
        return str(amount)
    if f != f or f in (float("inf"), float("-inf")):  # NaN/∞ — never real money
        return str(amount)
    if f.is_integer():
        return str(int(f))
    return f"{f:.2f}".rstrip("0").rstrip(".")


def utcnow() -> datetime:
    """Return UTC-naive datetime (compatible with SQLAlchemy/Postgres timestamp)."""
    return datetime.now(UTC).replace(tzinfo=None)


# r137 (ليبي أولاً): ليبيا = UTC+2 ثابت بلا توقيت صيفي منذ 2013 (نفس
# حكم Smart-Order src/lib/arabic.ts). الخادم يعمل بتوقيت UTC (Vercel/CI)
# فكان «اليوم» يتبدل 02:00 طرابلس: رد الساعة 01:30 يُحسب على الأمس،
# و«ردود اليوم» تُصفّر متأخرة ساعتين. كل حدود اليوم في المسار الخادمي
# (عرضًا وتجميعًا) تمرّ من هنا الآن.
TRIPOLI_UTC_OFFSET = timedelta(hours=2)


def tripoli_now() -> datetime:
    """utcnow() rendered in Africa/Tripoli (fleet rulings R8/R11).

    Libya is UTC+2 year-round (no DST since 2013 — madarek dates.ts model);
    the fixed-offset fallback keeps the stamp honest on serverless images
    whose zoneinfo carries no tzdata bundle. (Moved verbatim from
    pdf_reports_engine._tripoli_now — r137: ONE Tripoli seam, not two.)
    """
    now = utcnow().replace(tzinfo=UTC)
    try:
        from zoneinfo import ZoneInfo

        return now.astimezone(ZoneInfo("Africa/Tripoli"))
    except Exception:
        return now.astimezone(timezone(TRIPOLI_UTC_OFFSET))


def _naive_utc(dt: datetime | None) -> datetime:
    """Normalize any datetime to the repo's naive-UTC storage convention."""
    if dt is None:
        return utcnow()
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt


def tripoli_day_start(now: datetime | None = None) -> datetime:
    """Start of the current Tripoli day, as a NAIVE-UTC datetime.

    Python twin of Smart-Order ``tripoliDayStart``: shift +2h, drop the
    clock, shift back. Comparable with the naive-UTC ``created_at`` columns
    via ``>=`` (the SQLite-portable replacement for ``cast(col, Date) ==
    utcnow().date()``, which bucketed by the UTC day).
    """
    shifted = _naive_utc(now) + TRIPOLI_UTC_OFFSET
    return shifted.replace(hour=0, minute=0, second=0, microsecond=0) - TRIPOLI_UTC_OFFSET


def tripoli_date(dt: datetime) -> date:
    """Calendar date of a naive-UTC timestamp AS SEEN IN TRIPOLI (UTC+2).

    Python twin of Smart-Order ``tripoliDateParts`` (as a ``date``): UTC
    2026-10-09 23:30 is Tripoli 2026-10-10 01:30 → belongs to Oct 10.
    """
    return (_naive_utc(dt) + TRIPOLI_UTC_OFFSET).date()


# r137 (ليبي أولاً): التوأم البايثوني لـ frontend/src/lib/phone.ts (منقول
# r133 A12 S10 عن Smart-Order lib/phone.ts) — الخادم يطبّق نفس العقد الذي
# يطبّقه العميل قبل الإرسال، فلا يمرّ رقم غير ليبي إلى سجلات الدفع.
# r138 (توحيد الأسطولة — قرار r138-SO الموثق في Smart-Order src/lib/phone.ts):
# «10 خانات بالضبط + 0[125-9]» كان صرامةً بلا مبرر موثق — «091234567»
# (محمول 9 خانات) يُقبل في Smart-Link ويُرفض هنا. العقد الموحّد الأوسع:
# محمول 09 بطول 9-10 خانات (النموذج القصير للناقلين) + أرضي 0[1-9] بعشر
# خانات. مقايضة مقبولة عمدًا (توثيقًا للعائلة): إسقاط الخانة الأخيرة من
# محمول 10 خانات يُنتج قصيرًا صالحًا — أولوية القبول على الرفض.
_EASTERN_DIGITS = "٠١٢٣٤٥٦٧٨٩"
_FOLD_EASTERN = str.maketrans(_EASTERN_DIGITS, "0123456789")
_LIBYAN_NATIONAL_PREFIX_RE = re.compile(r"^0[1-9]")  # 09X mobiles + ALL landline prefixes (r138)


def normalize_libyan_phone(raw) -> str | None:
    """Normalize a Libyan phone number to its local form (0XXXXXXXXX or the
    r138 short mobile 0XXXXXXXX) or None when it cannot be a valid Libyan
    number.

    Accepts (same contract as the frontend twin): 0912345678, 218912345678,
    +218 91 234 5678, ٩١٢٣٤٥٦٧٨, 912345678 — Eastern digits folded,
    separators stripped, 00218/218 country prefixes removed, missing trunk
    zero restored (r138: for BOTH the 9- and 8-digit short mobile forms),
    then validated against the widened national prefixes (^0[1-9]) with the
    10-digit length for landlines and 9-10 for 09X mobiles.
    """
    if not isinstance(raw, str):
        return None
    digits = re.sub(r"\D", "", raw.translate(_FOLD_EASTERN))
    if not digits:
        return None
    if digits.startswith("00218"):
        digits = digits[5:]
    elif digits.startswith("218"):
        digits = digits[3:]
    # جذع 0 المفقود للمحمول: 9xxxxxxxx (10 خانات بعد الجذع) و9xxxxxxx
    # (9 خانات — النموذج القصير؛ الجذع يُسبق قبل التحقق — فكرة Smart-Link)
    if digits.startswith("9") and len(digits) in (8, 9):
        digits = "0" + digits
    # (r138) المحمول القصير 9 خانات: 09 + 7 أرقام — نموذج المشغلين القصار
    if len(digits) == 9 and digits.startswith("09"):
        return digits
    if len(digits) != 10 or not digits.startswith("0"):
        return None
    if not _LIBYAN_NATIONAL_PREFIX_RE.match(digits):
        return None
    return digits


def iso_z(dt: datetime | None) -> str | None:
    """Serialize a naive-UTC datetime with an explicit Z suffix.

    The API convention is naive-UTC columns; plain .isoformat() emits no zone
    and JS `new Date(...)` then parses it as LOCAL time — every displayed
    timestamp was off by the viewer's UTC offset (Libya: 2h). Appending Z
    makes the string an unambiguous UTC instant.
    """
    if dt is None:
        return None
    s = dt.isoformat()
    return s if (s.endswith("Z") or "+" in s[10:]) else s + "Z"


def app_version() -> str:
    """v6+ — single canonical version source: fb_dashboard/VERSION.

    Before this, the API reported THREE different strings (/api/health said
    "2.0.1-v5canary" while /healthz and /api/health/ready said "2.0.0" —
    a monitor could not tell what was actually deployed). Every endpoint
    now reads the same file at import time with a safe fallback.
    """
    from pathlib import Path

    try:
        vf = Path(__file__).resolve().parent / "VERSION"
        return vf.read_text(encoding="utf-8").strip() or "2.1.0"
    except Exception:
        return "2.1.0"
