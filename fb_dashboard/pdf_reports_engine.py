from __future__ import annotations

"""PDF Reports Engine -- White-label client-ready PDF reports (weasyprint).
Arabic RTL, inline CSS, CSS bar charts, branded header/footer.

Contract (v26-F4 — the stale DEPRECATED banner is gone; this engine serves
the five live /api/reports/* routes in routers/reports_routes.py):
- PRIMARY engine: weasyprint (full CSS + Pango Arabic shaping), embedding
  the bundled IBM Plex Sans Arabic TTFs (fb_dashboard/fonts/) via @font-face
  — true cross-surface font parity with web/mobile.
- FALLBACK engine: fpdf2 — plain-text digest (tags stripped, bundled Plex
  face, best-effort shaping when uharfbuzz is present). No raw-HTML dump.
- Both font files are resolved __file__-RELATIVELY (never system paths);
  a missing/unreadable font raises PdfRenderUnavailable which the router
  maps to an honest 503 — never a 500 and never a garbage render.
"""
import asyncio
import base64
import html
import logging
import re
from datetime import UTC, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, unquote_to_bytes, urlsplit

from _utils import utcnow
from ai_service import _assert_safe_image_url
from sqlalchemy import Date, cast, desc, func, select

log = logging.getLogger("fb-pdf-reports")

# r133-A12 S5: Arabic month names for user-facing PDF dates — an Arabic
# report must not ship "September 2026" (English %B) or a raw ISO/UTC
# stamp. Twin of the frontend ARABIC_MONTHS map (format.ts:41).
_AR_MONTHS = ("يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
              "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر")


def _tripoli_now() -> datetime:
    """utcnow() rendered in Africa/Tripoli (fleet rulings R8/R11).

    Libya is UTC+2 year-round (no DST since 2013 — madarek dates.ts model);
    the fixed-offset fallback keeps the stamp honest on serverless images
    whose zoneinfo carries no tzdata bundle."""
    now = utcnow().replace(tzinfo=UTC)
    try:
        from zoneinfo import ZoneInfo
        return now.astimezone(ZoneInfo("Africa/Tripoli"))
    except Exception:
        return now.astimezone(timezone(timedelta(hours=2)))


def _ar_month_year(dt: datetime) -> str:
    """«سبتمبر 2026» — the frontend formatMonth twin (Western digits)."""
    return f"{_AR_MONTHS[dt.month - 1]} {dt.year}"


def _ar_date_time(dt: datetime) -> str:
    """«8 أكتوبر 2026 16:30» — the frontend formatDate twin (24h)."""
    return f"{dt.day} {_AR_MONTHS[dt.month - 1]} {dt.year} {dt:%H:%M}"


# ── v26-F4 (P4-A4 §2 P2): bundled IBM Plex Sans Arabic ────────────────────
# The README always claimed Plex on every surface; the engine rendered
# DejaVu/Noto system faces (hardcoded /usr/share path in the fpdf branch —
# crash-prone on serverless images). Both weights now ship IN the repo and
# are resolved relative to this module — no host-filesystem assumptions.
_FONTS_DIR = Path(__file__).resolve().parent / "fonts"
_PLEX_REGULAR = _FONTS_DIR / "IBMPlexSansArabic-Regular.ttf"
_PLEX_BOLD = _FONTS_DIR / "IBMPlexSansArabic-Bold.ttf"


class PdfRenderUnavailable(RuntimeError):
    """v26-F4: a render prerequisite (engine libs, bundled font files) is
    missing on this runtime — the router maps this to an honest 503, never
    a 500 and never a raw-HTML/garbage render."""


def _fonts_available() -> bool:
    """Both bundled TTFs present and non-trivial (a 0-byte or truncated
    checkout artifact must not pass as a usable font)."""
    for p in (_PLEX_REGULAR, _PLEX_BOLD):
        try:
            if not p.is_file() or p.stat().st_size < 100_000:
                return False
        except OSError:
            return False
    return True


_WEASYPRINT = False
_WEASYPRINT_ERR = ""
_FPDF = False
try:
    import weasyprint  # noqa: F401 — availability probe
    _WEASYPRINT = True
except Exception as exc:  # v22-F1 (W1-D9): the probe must survive ANY import failure
    # Vercel serverless installs the weasyprint wheel but `import weasyprint`
    # raises **OSError** ("cannot load library 'libpango-1.0-0'") because the
    # runtime image lacks the pango/cairo system libraries. The old probe
    # caught only ImportError, so the OSError escaped, the lazy proxy
    # (`_services.pdf_engine`) re-raised it on EVERY access and all five
    # /api/reports/* routes answered 500 before any report logic ran
    # (status included — 4×500 in production, Vercel log evidence in
    # W1-D9 F1). ANY failure here means "engine unavailable on this
    # runtime" — the routes degrade honestly instead of 500-ing.
    _WEASYPRINT_ERR = f"{type(exc).__name__}: {exc}"[:300]
    log.warning("weasyprint availability probe FAILED (%s) — PDF routes "
                "will degrade to engine-unavailable", _WEASYPRINT_ERR)
    try:
        from fpdf import FPDF  # noqa: F401 — fallback availability probe
        _FPDF = True
    except Exception:
        pass  # r133-A6 (a): absence degrades honestly — the weasyprint twin at :78 already logged


# v16-E1 (D2-LEAD C — SSRF lockdown): WeasyPrint used to resolve <img src=…>
# URLs itself — it follows redirects and never re-runs our SSRF guard, so a
# crafted logo_url bypassed even the literal-IP check (readback channel: the
# rendered PDF returns to the requester). The router now pre-fetches the logo
# with the full guarded stack (assert_safe_outbound_url → _fetch_image_bytes:
# timeout + 5MB cap + per-hop redirect re-check) and embeds the bytes as a
# data: URI. This fetcher makes the lockdown STRUCTURAL: data: URIs are the
# only thing the renderer may resolve here — any http/https/file/ftp URL
# raises and WeasyPrint skips the image (logged), never fetching it. Remote
# fetches and redirects are impossible by construction, not by convention.
def _data_only_url_fetcher(url: str):
    """WeasyPrint ``url_fetcher`` — يقبل مخطط data: فقط ويرفض كل ما عداه.

    Parsing mirrors the stdlib ``urllib.request.DataHandler`` semantics
    (RFC 2397: ``unquote_to_bytes`` for both forms, ``;base64`` suffix,
    default ``text/plain``, no control chars in the mediatype). The lazy
    weasyprint import keeps the fpdf fallback importable without it.

    v26-F4: the ONE non-data exception is the bundled Plex @font-face srcs
    (``file://…/fb_dashboard/fonts/*.ttf``) — allowed only when the resolved
    path's parent IS ``_FONTS_DIR`` (structural whitelist, same spirit as
    the data:-only rule: the renderer can reach exactly two font files on
    disk and nothing else — no traversal, no arbitrary host paths).
    """
    low = url.lower()
    if low.startswith("file:"):
        from weasyprint.urls import URLFetcherResponse
        try:
            resolved = Path(unquote(urlsplit(url).path)).resolve()
            if resolved.parent == _FONTS_DIR.resolve() and resolved.is_file():
                with open(resolved, "rb") as fh:
                    return URLFetcherResponse(url, fh.read(), {"Content-Type": "font/ttf"})
        except (OSError, ValueError):
            pass  # r133-A6 (a): falls through to the explicit raise ValueError below
        raise ValueError(f"PDF renderer refuses non-bundled file URL: {url[:80]!r}")
    if not low.startswith("data:"):
        raise ValueError(f"PDF renderer refuses non-data URL: {url[:80]!r}")
    from weasyprint.urls import URLFetcherResponse
    header, sep, payload = url.partition(",")
    if not sep:
        raise ValueError("malformed data: URL (no comma)")
    mediatype = header.partition(":")[2]
    if re.search(r"[\x00-\x1f\x7f]", mediatype):
        raise ValueError("control characters in data: mediatype")
    is_base64 = mediatype.lower().endswith(";base64")
    if is_base64:
        mediatype = mediatype[:-7]
    if not mediatype:
        mediatype = "text/plain"
    data = unquote_to_bytes(payload)
    if is_base64:
        data = base64.b64decode(data, validate=False)
    return URLFetcherResponse(url, data, {"Content-Type": mediatype})


class BrandingConfig:
    """White-label branding for a report request.

    v12 E1.4 (D2 P1): BOTH user-controlled fields are validated at the
    engine boundary (defense close to use — the router may truncate but
    must not be the only validator):
    - logo_url: v16-E1 — the router pre-fetches it with the full guarded
      stack (DNS-resolving guard + timeout + size cap + redirect re-check)
      and swaps in a data: URI BEFORE the engine renders; WeasyPrint itself
      is locked to data: URLs only (``_data_only_url_fetcher``). This fast
      sync check (https-only, no private/loopback/link-local hosts) remains
      the first layer at the engine boundary.
    - primary_color: interpolated raw into _css(); anything outside
      a plain #RGB/#RRGGBB… hex token injected arbitrary CSS into the
      document. Now re.fullmatch(r"#[0-9a-fA-F]{3,8}") or ValueError.
    """

    def __init__(self, logo_url: str = "", company_name: str = "SmartBot", primary_color: str = "#B57438"):
        # Madarek completion (Task 8-e): the white-label default is the
        # Madarek light accent — copper #B57438 (was slate-red #dc2626).
        if logo_url:
            # يرفع UnsafeImageUrlError (فرع ValueError) عند رابط غير آمن
            _assert_safe_image_url(logo_url)
        if not re.fullmatch(r"#[0-9a-fA-F]{3,8}", primary_color or ""):
            raise ValueError("لون العلامة التجارية غير صالح — يجب أن يكون كود لون hex مثل #B57438")
        self.logo_url = logo_url
        self.company_name = company_name
        self.primary_color = primary_color


class _TextExtractor(HTMLParser):
    """v26-F4: stdlib-only tag-stripper for the fpdf digest path — the old
    fallback dumped the raw HTML SOURCE (tags and all) into the PDF."""

    _BLOCK_TAGS = {"p", "div", "tr", "h1", "h2", "h3", "table", "br", "section"}
    _SKIP_TAGS = {"style", "script", "head", "title"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._chunks: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in self._SKIP_TAGS:
            self._skip += 1
        elif tag in self._BLOCK_TAGS:
            self._chunks.append("\n")

    def handle_endtag(self, tag):
        if tag in self._SKIP_TAGS and self._skip:
            self._skip -= 1
        elif tag in self._BLOCK_TAGS:
            self._chunks.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self._chunks.append(data)


def _html_to_text(html_str: str) -> str:
    """HTML → readable plain-text digest (block tags → line breaks)."""
    parser = _TextExtractor()
    parser.feed(html_str)
    parser.close()
    lines = [ln.strip() for ln in "".join(parser._chunks).splitlines()]
    out: list[str] = []
    for ln in lines:  # collapse the blank-line runs the tag boundaries produce
        if ln or (out and out[-1]):
            out.append(ln)
    return "\n".join(out).strip()


class PdfReportsEngine:
    """Generate white-label PDF reports.  Accepts db_session_factory or raw session."""

    def __init__(self, db_session_factory=None):
        self._factory = db_session_factory

    def _day_expr(self, col, session):
        """Portable DATE truncation (v9-A1).

        cast(col, Date) is correct on PostgreSQL, but SQLite's
        CAST(... AS DATE) applies NUMERIC affinity and mangles the stored
        ISO string into a bare integer (e.g. 2026) — SQLAlchemy's Date result
        processor then raises TypeError on row fetch. func.date() is the
        correct SQLite spelling and yields a 'YYYY-MM-DD' string.
        """
        bind = getattr(session, "bind", None)
        if bind is not None and bind.dialect.name == "sqlite":
            return func.date(col)
        return cast(col, Date)

    @property
    def engine_name(self) -> str:
        if _WEASYPRINT:
            return "weasyprint"
        if _FPDF:
            return "fpdf"
        return "none"

    def is_available(self) -> bool:
        return _WEASYPRINT or _FPDF

    def probe_error(self) -> str:
        """v22-F1: why the primary engine is unavailable (empty when healthy).

        Diagnostics only — ``/api/reports/status`` surfaces it so an operator
        can see the pango/cairo OSError without reading Vercel logs."""
        return "" if _WEASYPRINT else _WEASYPRINT_ERR

    def fonts_state(self) -> str:
        """v26-F4: "bundled" | "missing" — surface the Plex bundle health on
        /api/reports/status (informational; the hard 503 gate is _render)."""
        return "bundled" if _fonts_available() else "missing"

    def _engine_check(self):
        if not self.is_available():
            raise RuntimeError("No PDF library available (install weasyprint or fpdf2)")

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _css(self, c: str) -> str:
        """Return CSS block with the given primary color injected.

        Madarek palette (Task 8-e): the page stays light (paper) so every
        fixed value is the Madarek LIGHT system — ink #191918, text-muted
        #6E6C65, hairline #E9E7E2, surface tints #F1EFEC/#F7F6F3, status
        soft/deep pairs (mint/yellow/rose §2.6). The injected brand color {c}
        fills the Madarek accent role (default copper #B57438, AA-large on
        headings, 4.95:1 with the #1A0F06 on-accent ink in table headers).

        v26-F4: fonts are the bundled IBM Plex Sans Arabic TTFs (fb_dashboard/
        fonts/, registered via @font-face with module-relative file:// URLs —
        the fetcher whitelists exactly these two paths). True cross-surface
        parity with web/mobile; DejaVu/Noto stay ONLY as Pango fontconfig
        fallbacks if the bundle ever goes missing (degraded typography, not
        a failed render — the fpdf digest path is the one that hard-503s).
        """
        plex_reg = _PLEX_REGULAR.as_uri()
        plex_bold = _PLEX_BOLD.as_uri()
        return f"""
        @font-face {{
            font-family: 'IBM Plex Sans Arabic';
            font-weight: 400;
            src: url("{plex_reg}") format("truetype");
        }}
        @font-face {{
            font-family: 'IBM Plex Sans Arabic';
            font-weight: 700;
            src: url("{plex_bold}") format("truetype");
        }}
        @page {{ margin: 1.8cm 1.5cm; size: A4; }}
        @page :first {{ margin-top: 1.2cm; }}
        body {{
            font-family: 'IBM Plex Sans Arabic', 'DejaVu Sans', 'Noto Sans Arabic', sans-serif;
            direction: rtl;
            color: #191918;
            font-size: 10pt;
            line-height: 1.6;
        }}
        .header {{
            text-align: center;
            padding: 28px 0 18px;
            border-bottom: 3px solid {c};
            margin-bottom: 18px;
        }}
        .header h1 {{ font-size: 18pt; margin: 8px 0 4px; color: {c}; }}
        .header .sub {{ color: #6E6C65; font-size: 8pt; }}
        .section {{ margin: 22px 0; page-break-inside: avoid; }}
        .section h2 {{
            /* 14pt bold = WCAG large text: copper default reads 3.8:1 (AA
               large); darker brand colors only improve it. */
            font-size: 14pt;
            color: {c};
            border-right: 3px solid {c};
            padding-right: 8px;
            margin: 0 0 10px 0;
            page-break-after: avoid;
        }}
        .kpi-row {{ text-align: center; margin: 10px 0; }}
        .kpi {{
            display: inline-block; width: 130px;
            background: #F1EFEC; border-radius: 6px;
            padding: 12px 6px; margin: 4px;
            border: 1px solid #E9E7E2;
            vertical-align: top;
        }}
        .kpi .val {{ font-size: 20pt; font-weight: bold; color: {c}; }}
        .kpi .lbl {{ font-size: 7pt; color: #6E6C65; margin-top: 2px; }}
        table {{
            width: 100%; border-collapse: collapse;
            margin: 8px 0; font-size: 9pt;
        }}
        th {{
            /* Madarek .btn.accent light pairing: accent fill + accent-fg
               #1A0F06 (4.95:1 on the copper default). */
            background: {c}; color: #1A0F06;
            padding: 6px 5px; text-align: center;
            font-weight: bold;
        }}
        td {{ padding: 5px; border-bottom: 1px solid #E9E7E2; text-align: center; }}
        tr:nth-child(even) td {{ background: #F7F6F3; }}
        .bar-cell {{ position: relative; text-align: left; direction: ltr; }}
        .bar {{
            display: inline-block; height: 10px;
            background: {c}; border-radius: 3px;
            vertical-align: middle;
        }}
        .bar-label {{ display: inline-block; min-width: 30px; text-align: right; font-size: 8pt; }}
        .cmp-box {{
            /* success soft (mint-bg) + mint-ink border at 45% */
            background: #DCF1E2; border: 1px solid rgba(79, 166, 109, 0.45);
            padding: 10px 14px; border-radius: 5px;
            margin: 8px 0; font-size: 9pt;
        }}
        .sentiment-row {{ text-align: center; margin: 10px 0; }}
        .sentiment {{ display: inline-block; padding: 6px 12px; margin: 2px; border-radius: 4px; font-size: 9pt; }}
        /* Madarek light status soft/deep pairs (§2.6): mint, rose, yellow. */
        .sent-pos {{ background: #DCF1E2; color: #1F4F30; }}
        .sent-neg {{ background: #FCE0E2; color: #6B2128; }}
        .sent-neu {{ background: #FCF1CD; color: #6B4C0B; }}
        .footer {{
            text-align: center; padding: 16px;
            color: #74706A; font-size: 6pt;
            border-top: 1px solid #E9E7E2;
            margin-top: 30px;
        }}
        .footer .pg::after {{ content: counter(page); }}
        .brand-color {{ color: {c}; }}
        """

    def _header_html(self, brand: BrandingConfig, title: str, subtitle: str = "") -> str:
        # v10-A7: html.escape everywhere a NON-CONTROLLED string enters the
        # document (branding comes from the requesting user's JSON body; the
        # title embeds campaign names). Otherwise an editor-controlled
        # company_name / logo_url or a commenter-named rule injects markup
        # into the weasyprint DOM (tracking pixels, layout breakage).
        # v16-E1: brand.logo_url arrives as a pre-fetched data: URI (router)
        # — html.escape leaves data URIs byte-identical (base64 alphabet has
        # no escapables) and the engine's url_fetcher accepts nothing else.
        logo = f'<img src="{html.escape(brand.logo_url, quote=True)}" height="42" style="margin-bottom:4px">' if brand.logo_url else ""
        return f"""
        <div class="header">
          {logo}
          <h1>{html.escape(str(brand.company_name))}</h1>
          <div class="sub">{html.escape(str(title))}<br>{html.escape(str(subtitle))}</div>
        </div>"""

    def _kpi_card(self, label: str, value) -> str:
        # v10-A7: values may carry DB strings (campaign status) — escape both.
        return f'<div class="kpi"><div class="val">{html.escape(str(value))}</div><div class="lbl">{html.escape(str(label))}</div></div>'

    def _footer_html(self, brand: BrandingConfig) -> str:
        return f'<div class="footer">{html.escape(str(brand.company_name))} | <span class="pg">صفحة </span> | تم الإنشاء بواسطة SmartBot في {_ar_date_time(_tripoli_now())} بتوقيت ليبيا</div>'

    def _build_html(self, body_parts: list[str], brand: BrandingConfig, title: str, subtitle: str = "") -> str:
        parts = [
            "<!DOCTYPE html>",
            '<html dir="rtl">',
            "<head><meta charset='utf-8'><title>",
            html.escape(str(brand.company_name)),
            " - ",
            html.escape(str(title)),
            "</title><style>",
            self._css(brand.primary_color),
            "</style></head><body>",
            self._header_html(brand, title, subtitle),
            *body_parts,
            self._footer_html(brand),
            "</body></html>",
        ]
        return "\n".join(parts)

    def _render(self, html: str) -> bytes:
        """Render HTML to PDF bytes (SYNCHRONOUS — CPU/IO heavy).

        v14-E2 (D6 #7): callers must invoke this via ``asyncio.to_thread`` —
        weasyprint's ``write_pdf()`` runs a full layout engine and used to
        freeze the event loop for the whole render (seconds per report;
        concurrent requests froze the server). See the ``_render_async``
        wrapper used by every public API below.

        v16-E1 (D2-LEAD C): every weasyprint render is pinned to
        ``_data_only_url_fetcher`` — the renderer can only resolve data:
        URIs, so remote URLs/redirects are structurally refused.
        """
        if _WEASYPRINT:
            import weasyprint
            return weasyprint.HTML(string=html, url_fetcher=_data_only_url_fetcher).write_pdf()
        # Fallback via fpdf (v26-F4 rewrite): PLAIN-TEXT digest (tags
        # stripped) in the bundled Plex face — never the raw HTML source, and
        # never a hardcoded /usr/share font path. Any failure in this branch
        # (missing bundle, unreadable font, output error) raises
        # PdfRenderUnavailable → the router answers an honest 503.
        try:
            from fpdf import FPDF
            from fpdf.enums import XPos, YPos
            if not _fonts_available():
                raise PdfRenderUnavailable(
                    f"bundled IBM Plex Sans Arabic fonts missing under {_FONTS_DIR} "
                    "— the deployment is incomplete; redeploy the full tree")
            pdf = FPDF()
            pdf.add_page()
            pdf.add_font("PlexArabic", "", str(_PLEX_REGULAR))
            pdf.set_font("PlexArabic", "", 10)
            try:
                pdf.set_text_shaping(True)  # connected Arabic when uharfbuzz is present
            except Exception:
                pass  # best-effort — digits/Latin stay fully legible in the digest
            for line in _html_to_text(html).splitlines():
                # new_x=LMARGIN: fpdf2's multi_cell default (RIGHT) leaves x
                # at the right margin — the SECOND digest line then computes
                # a zero width and raises "not enough horizontal space".
                if line.strip():
                    pdf.multi_cell(0, 8, line, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            # v22-F1: fpdf2 (>=2.2) returns a bytearray from output() — the old
            # ``.encode("latin-1")`` was fpdf1's str contract and raises
            # AttributeError on bytearray. Accept both shapes.
            data = pdf.output(dest="S")
            return data.encode("latin-1") if isinstance(data, str) else bytes(data)
        except PdfRenderUnavailable:
            raise
        except Exception as exc:  # v26-F4: font/output failure class → 503, never 500
            raise PdfRenderUnavailable(
                f"fpdf fallback render failed: {type(exc).__name__}: {exc}") from exc

    async def _render_async(self, html: str) -> bytes:
        """v14-E2 (D6 #7): ``_render`` off the event loop (asyncio.to_thread).

        Both the weasyprint and the fpdf fallback paths are blocking — this
        wrapper is the ONLY sanctioned way for async callers to render."""
        return await asyncio.to_thread(self._render, html)

    # ── Data helpers ─────────────────────────────────────────────────────
    # v9-A1 (cross-tenant P1 fix): EVERY query is tenant-scoped. Before this,
    # the engine counted/leaked rows from ALL tenants — including commenter
    # names (PII) and other tenants' campaigns — into any tenant's PDF.

    async def _get_overview(self, days: int, session, tenant_id: int) -> dict:
        from models import Reply, Rule, Subscriber
        cutoff = utcnow() - timedelta(days=days)
        total = await session.scalar(
            select(func.count(Reply.id)).where(Reply.tenant_id == tenant_id, Reply.created_at >= cutoff)) or 0
        today = await session.scalar(
            select(func.count(Reply.id)).where(
                Reply.tenant_id == tenant_id,
                self._day_expr(Reply.created_at, session) == utcnow().date())) or 0
        rules = await session.scalar(
            select(func.count(Rule.id)).where(Rule.tenant_id == tenant_id, Rule.enabled == True)) or 0
        subs = await session.scalar(
            select(func.count(Subscriber.id)).where(Subscriber.tenant_id == tenant_id)) or 0
        unique = await session.scalar(
            select(func.count(func.distinct(Reply.commenter_name)))
            .where(Reply.tenant_id == tenant_id, Reply.commenter_name != "", Reply.created_at >= cutoff)
        ) or 0
        return {"total_replies": total, "today_replies": today, "active_rules": rules,
                "total_subscribers": subs, "unique_commenters": unique}

    async def _get_daily_trend(self, days: int, session, tenant_id: int) -> list[dict]:
        from models import Reply
        cutoff = utcnow() - timedelta(days=days)
        day = self._day_expr(Reply.created_at, session)
        rows = await session.execute(
            select(day.label("d"), func.count(Reply.id).label("cnt"))
            .where(Reply.tenant_id == tenant_id, Reply.created_at >= cutoff)
            .group_by(day)
            .order_by(day)
        )
        return [{"date": str(r.d), "replies": r.cnt} for r in rows]

    async def _get_top_rules(self, days: int, limit: int, session, tenant_id: int) -> list[dict]:
        from models import Reply, Rule
        cutoff = utcnow() - timedelta(days=days)
        rows = await session.execute(
            select(Reply.rule_id, Rule.name, func.count(Reply.id).label("cnt"))
            .join(Rule, Reply.rule_id == Rule.id)
            .where(Reply.tenant_id == tenant_id, Rule.tenant_id == tenant_id,
                   Reply.created_at >= cutoff, Reply.rule_id.isnot(None))
            .group_by(Reply.rule_id, Rule.name)
            .order_by(desc("cnt")).limit(limit)
        )
        results = [{"rule_id": r.rule_id, "name": r.name, "count": r.cnt} for r in rows]
        total = sum(r["count"] for r in results) or 1
        for r in results:
            r["percentage"] = round(r["count"] / total * 100, 1)
        return results

    async def _get_sentiment_trend(self, days: int, session, tenant_id: int) -> list[dict]:
        from models import AISuggestion
        cutoff = utcnow() - timedelta(days=days)
        day = self._day_expr(AISuggestion.created_at, session)
        rows = await session.execute(
            select(day.label("d"),
                   AISuggestion.sentiment, func.count(AISuggestion.id).label("cnt"))
            .where(AISuggestion.tenant_id == tenant_id, AISuggestion.created_at >= cutoff)
            .group_by(day, AISuggestion.sentiment)
            .order_by(day)
        )
        trend: dict[str, dict] = {}
        for r in rows:
            d = str(r.d)
            if d not in trend:
                trend[d] = {"date": d, "positive": 0, "negative": 0, "neutral": 0}
            sent = (r.sentiment or "neutral").lower()
            bucket = trend[d]
            if sent in bucket:
                bucket[sent] += r.cnt
            else:
                bucket["neutral"] += r.cnt
        return list(trend.values())

    async def _get_top_commenters(self, days: int, limit: int, session, tenant_id: int) -> list[dict]:
        from models import Reply
        cutoff = utcnow() - timedelta(days=days)
        rows = await session.execute(
            select(Reply.commenter_name, func.count(Reply.id).label("cnt"))
            .where(Reply.tenant_id == tenant_id, Reply.created_at >= cutoff, Reply.commenter_name != "")
            .group_by(Reply.commenter_name)
            .order_by(desc("cnt")).limit(limit)
        )
        return [{"name": r.commenter_name, "count": r.cnt} for r in rows]

    async def _get_subscriber_growth(self, days: int, session, tenant_id: int) -> list[dict]:
        from models import Subscriber
        cutoff = utcnow() - timedelta(days=days)
        day = self._day_expr(Subscriber.created_at, session)
        rows = await session.execute(
            select(day.label("d"), func.count(Subscriber.id).label("cnt"))
            .where(Subscriber.tenant_id == tenant_id, Subscriber.created_at >= cutoff)
            .group_by(day)
            .order_by(day)
        )
        return [{"date": str(r.d), "subscribers": r.cnt} for r in rows]

    async def _get_campaign_data(self, campaign_type: str, campaign_id: str, session, tenant_id: int) -> dict:
        """Campaign lookup — the id MUST belong to the requesting tenant,
        otherwise the report renders an empty stub (no cross-tenant leak)."""
        result = {"name": "", "total_recipients": 0, "sent_count": 0, "failed_count": 0, "opened_count": 0,
                  "status": "", "created_at": "", "sent_at": ""}
        if campaign_type == "broadcast":
            from models import Broadcast
            row = (await session.execute(
                select(Broadcast).where(Broadcast.id == int(campaign_id),
                                        Broadcast.tenant_id == tenant_id))).scalar_one_or_none()
            if row:
                result.update(name=row.name, total_recipients=row.total_recipients, sent_count=row.sent_count,
                              failed_count=row.failed_count, opened_count=row.opened_count, status=row.status,
                              created_at=row.created_at.isoformat() if row.created_at else "",
                              sent_at=row.sent_at.isoformat() if row.sent_at else "")
        elif campaign_type == "flow":
            from models import Flow, FlowExecution
            row = (await session.execute(
                select(Flow).where(Flow.id == int(campaign_id),
                                   Flow.tenant_id == tenant_id))).scalar_one_or_none()
            if row:
                total = (await session.scalar(
                    select(func.count(FlowExecution.id)).where(
                        FlowExecution.flow_id == int(campaign_id),
                        FlowExecution.tenant_id == tenant_id))) or 0
                completed = (await session.scalar(
                    select(func.count(FlowExecution.id)).where(
                        FlowExecution.flow_id == int(campaign_id),
                        FlowExecution.tenant_id == tenant_id,
                        FlowExecution.status == "completed"))) or 0
                result.update(name=row.name, total_recipients=total, sent_count=completed, status=row.status,
                              created_at=row.created_at.isoformat() if row.created_at else "")
        return result

    # ── Report builders ──────────────────────────────────────────────────

    def _build_monthly_html(self, overview: dict, daily_trend: list, top_rules: list,
                            sentiment_trend: list, top_commenters: list, subscriber_growth: list,
                            brand: BrandingConfig, days: int, subtitle: str) -> str:
        bodies = []

        # KPI cards
        kpi_html = '<div class="section"><h2>نظرة عامة</h2><div class="kpi-row">'
        for lbl, val in [
            ("إجمالي الردود", overview["total_replies"]),
            ("ردود اليوم", overview["today_replies"]),
            ("القواعد النشطة", overview["active_rules"]),
            ("المشتركين", overview["total_subscribers"]),
            ("معلقين فريدين", overview["unique_commenters"]),
        ]:
            kpi_html += self._kpi_card(lbl, val)
        kpi_html += "</div></div>"
        bodies.append(kpi_html)

        # Daily trend as CSS bar chart (last 14 days)
        if daily_trend:
            trend_html = '<div class="section"><h2>النشاط اليومي</h2><table><tr><th>التاريخ</th><th>الردود</th></tr>'
            max_val = max(d["replies"] for d in daily_trend[-14:]) or 1
            for d in daily_trend[-14:]:
                pct = d["replies"] / max_val * 100
                trend_html += f'<tr><td>{d["date"]}</td><td class="bar-cell"><span class="bar" style="width:{pct:.0f}%"></span><span class="bar-label">{d["replies"]}</span></td></tr>'
            trend_html += "</table></div>"
            bodies.append(trend_html)

        # Subscriber growth as CSS bar chart
        if subscriber_growth:
            growth_html = '<div class="section"><h2>نمو المشتركين</h2><table><tr><th>التاريخ</th><th>مشتركين جدد</th></tr>'
            max_val = max(d["subscribers"] for d in subscriber_growth) or 1
            for d in subscriber_growth:
                pct = d["subscribers"] / max_val * 100
                growth_html += f'<tr><td>{d["date"]}</td><td class="bar-cell"><span class="bar" style="width:{pct:.0f}%"></span><span class="bar-label">{d["subscribers"]}</span></td></tr>'
            growth_html += "</table></div>"
            bodies.append(growth_html)

        # Top rules
        if top_rules:
            rules_html = '<div class="section"><h2>أفضل القواعد</h2><table><tr><th>#</th><th>القاعدة</th><th>الردود</th><th>%</th></tr>'
            for i, r in enumerate(top_rules, 1):
                # v10-A7: rule names are user-controlled strings
                rules_html += f"<tr><td>{i}</td><td>{html.escape(str(r['name']))}</td><td>{r['count']}</td><td>{r['percentage']}%</td></tr>"
            rules_html += "</table></div>"
            bodies.append(rules_html)

        # Sentiment trend
        if sentiment_trend:
            sent_html = '<div class="section"><h2>اتجاه المشاعر</h2>'
            for s in sentiment_trend:
                sent_html += f'<div class="cmp-box">{s["date"]}: <span class="sentiment sent-pos">إيجابي {s["positive"]}</span> <span class="sentiment sent-neg">سلبي {s["negative"]}</span> <span class="sentiment sent-neu">محايد {s["neutral"]}</span></div>'
            sent_html += "</div>"
            bodies.append(sent_html)

        # Top commenters
        if top_commenters:
            cmt_html = '<div class="section"><h2>أكثر المعلقين نشاطا</h2><table><tr><th>#</th><th>الاسم</th><th>التعليقات</th></tr>'
            for i, c in enumerate(top_commenters, 1):
                # v10-A7 (G1#8): commenter display names are ATTACKER-CONTROLLED
                # (any Facebook user names themselves arbitrary HTML). Escape
                # before interpolation — an unescaped `<img src=https://evil…>`
                # here made every report render fire a tracking request
                # from the server and mangled the client's PDF.
                cmt_html += f"<tr><td>{i}</td><td>{html.escape(str(c['name']))}</td><td>{c['count']}</td></tr>"
            cmt_html += "</table></div>"
            bodies.append(cmt_html)

        title = f"التقرير الشهري - آخر {days} يوم"
        return self._build_html(bodies, brand, title, subtitle)

    def _build_campaign_html(self, data: dict, brand: BrandingConfig) -> str:
        bodies = []
        kpi_html = '<div class="section"><h2>أداء الحملة</h2><div class="kpi-row">'
        for lbl, val in [
            ("الحالة", data.get("status", "—")),
            ("المستلمين", data.get("total_recipients", 0)),
            ("تم الإرسال", data.get("sent_count", 0)),
            ("فشل", data.get("failed_count", 0)),
            ("تم الفتح", data.get("opened_count", 0)),
        ]:
            kpi_html += self._kpi_card(lbl, val)
        kpi_html += "</div></div>"
        bodies.append(kpi_html)

        # Success rate bar
        total = data.get("total_recipients", 0) or 1
        sent = data.get("sent_count", 0)
        opened = data.get("opened_count", 0)
        fail = data.get("failed_count", 0)
        success_pct = round(sent / total * 100, 1)
        open_pct = round(opened / total * 100, 1)
        fail_pct = round(fail / total * 100, 1)
        bodies.append(f"""
        <div class="section">
          <h2>معدلات الأداء</h2>
          <table>
            <tr><th>المؤشر</th><th>النسبة</th><th>العدد</th></tr>
            <tr><td>معدل الإرسال</td><td class="bar-cell"><span class="bar" style="width:{success_pct}%"></span><span class="bar-label">{success_pct}%</span></td><td>{sent}</td></tr>
            <tr><td>معدل الفتح</td><td class="bar-cell"><span class="bar" style="width:{open_pct}%"></span><span class="bar-label">{open_pct}%</span></td><td>{opened}</td></tr>
            <tr><td>معدل الفشل</td><td class="bar-cell"><span class="bar" style="width:{fail_pct}%"></span><span class="bar-label">{fail_pct}%</span></td><td>{fail}</td></tr>
          </table>
        </div>""")

        title = f'تقرير الحملة: {data.get("name", "—")}'
        # Campaign names are user-controlled — the header helper escapes them.
        return self._build_html(bodies, brand, title)

    def _build_subscriber_html(self, growth: list, overview: dict, brand: BrandingConfig, days: int) -> str:
        bodies = []

        kpi_html = '<div class="section"><h2>نظرة عامة</h2><div class="kpi-row">'
        for lbl, val in [
            ("إجمالي المشتركين", overview.get("total_subscribers", 0)),
            ("مشتركين جدد", sum(g["subscribers"] for g in growth)),
        ]:
            kpi_html += self._kpi_card(lbl, val)
        kpi_html += "</div></div>"
        bodies.append(kpi_html)

        if growth:
            g_html = '<div class="section"><h2>نمو المشتركين اليومي</h2><table><tr><th>التاريخ</th><th>مشتركين جدد</th></tr>'
            max_val = max(d["subscribers"] for d in growth) or 1
            for d in growth:
                pct = d["subscribers"] / max_val * 100
                g_html += f'<tr><td>{d["date"]}</td><td class="bar-cell"><span class="bar" style="width:{pct:.0f}%"></span><span class="bar-label">{d["subscribers"]}</span></td></tr>'
            g_html += "</table></div>"
            bodies.append(g_html)

        title = f"تقرير المشتركين - آخر {days} يوم"
        return self._build_html(bodies, brand, title)

    # ── Public API ───────────────────────────────────────────────────────

    async def monthly_report(self, days: int = 30, branding: BrandingConfig | None = None,
                             tenant_id: int = 0) -> bytes:
        """Generate monthly performance PDF. Returns PDF bytes.

        v9-A1: tenant_id is REQUIRED in practice — callers must pass the
        requesting user's tenant; 0 keeps legacy single-tenant behavior."""
        self._engine_check()
        brand = branding or BrandingConfig()
        from database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            overview = await self._get_overview(days, session, tenant_id)
            daily_trend = await self._get_daily_trend(days, session, tenant_id)
            top_rules = await self._get_top_rules(days, 10, session, tenant_id)
            sentiment_trend = await self._get_sentiment_trend(days, session, tenant_id)
            top_commenters = await self._get_top_commenters(days, 10, session, tenant_id)
            subscriber_growth = await self._get_subscriber_growth(days, session, tenant_id)
            period = f"{_ar_month_year(_tripoli_now())} | آخر {days} يوم"
            html = self._build_monthly_html(overview, daily_trend, top_rules, sentiment_trend,
                                            top_commenters, subscriber_growth, brand, days, period)
        return await self._render_async(html)

    async def campaign_report(self, campaign_type: str, campaign_id: str,
                              branding: BrandingConfig | None = None, tenant_id: int = 0) -> bytes:
        """Generate campaign-specific PDF.  campaign_type in ('broadcast', 'flow').

        v9-A1: campaigns are looked up tenant-scoped — a foreign tenant's
        campaign_id resolves to nothing and renders an empty report."""
        self._engine_check()
        brand = branding or BrandingConfig()
        from database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            data = await self._get_campaign_data(campaign_type, campaign_id, session, tenant_id)
            html = self._build_campaign_html(data, brand)
        return await self._render_async(html)

    async def subscriber_report(self, days: int = 30, branding: BrandingConfig | None = None,
                                tenant_id: int = 0) -> bytes:
        """Generate subscriber growth PDF (tenant-scoped, v9-A1)."""
        self._engine_check()
        brand = branding or BrandingConfig()
        from database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            growth = await self._get_subscriber_growth(days, session, tenant_id)
            overview = await self._get_overview(days, session, tenant_id)
            html = self._build_subscriber_html(growth, overview, brand, days)
        return await self._render_async(html)
