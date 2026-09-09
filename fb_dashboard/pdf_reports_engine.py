from __future__ import annotations

"""PDF Reports Engine -- White-label client-ready PDF reports (weasyprint).
Arabic RTL, inline CSS, CSS bar charts, branded header/footer.

[DEPRECATED — plan §6.1: activated but not invoked in the production flow.
Kept for future use; do not build new features on top of it.]
"""
import asyncio
import base64
import html
import logging
import re
from datetime import timedelta
from urllib.parse import unquote_to_bytes

from _utils import utcnow
from ai_service import _assert_safe_image_url
from sqlalchemy import Date, cast, desc, func, select

log = logging.getLogger("fb-pdf-reports")

_WEASYPRINT = False
_FPDF = False
try:
    import weasyprint  # noqa: F401 — availability probe
    _WEASYPRINT = True
except ImportError:
    try:
        from fpdf import FPDF  # noqa: F401 — fallback availability probe
        _FPDF = True
    except ImportError:
        pass


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
    """
    if not url.lower().startswith("data:"):
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

    def __init__(self, logo_url: str = "", company_name: str = "SmartBot", primary_color: str = "#dc2626"):
        if logo_url:
            # يرفع UnsafeImageUrlError (فرع ValueError) عند رابط غير آمن
            _assert_safe_image_url(logo_url)
        if not re.fullmatch(r"#[0-9a-fA-F]{3,8}", primary_color or ""):
            raise ValueError("لون العلامة التجارية غير صالح — يجب أن يكون كود لون hex مثل #dc2626")
        self.logo_url = logo_url
        self.company_name = company_name
        self.primary_color = primary_color


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

    def _engine_check(self):
        if not self.is_available():
            raise RuntimeError("No PDF library available (install weasyprint or fpdf2)")

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _css(self, c: str) -> str:
        """Return CSS block with the given primary color injected."""
        return f"""
        @page {{ margin: 1.8cm 1.5cm; size: A4; }}
        @page :first {{ margin-top: 1.2cm; }}
        body {{
            font-family: 'DejaVu Sans', 'Noto Sans Arabic', 'Arial', sans-serif;
            direction: rtl;
            color: #1e293b;
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
        .header .sub {{ color: #64748b; font-size: 8pt; }}
        .section {{ margin: 22px 0; page-break-inside: avoid; }}
        .section h2 {{
            font-size: 12pt;
            color: {c};
            border-right: 3px solid {c};
            padding-right: 8px;
            margin: 0 0 10px 0;
            page-break-after: avoid;
        }}
        .kpi-row {{ text-align: center; margin: 10px 0; }}
        .kpi {{
            display: inline-block; width: 130px;
            background: #f8fafc; border-radius: 6px;
            padding: 12px 6px; margin: 4px;
            border: 1px solid #e2e8f0;
            vertical-align: top;
        }}
        .kpi .val {{ font-size: 20pt; font-weight: bold; color: {c}; }}
        .kpi .lbl {{ font-size: 7pt; color: #64748b; margin-top: 2px; }}
        table {{
            width: 100%; border-collapse: collapse;
            margin: 8px 0; font-size: 9pt;
        }}
        th {{
            background: {c}; color: #fff;
            padding: 6px 5px; text-align: center;
            font-weight: bold;
        }}
        td {{ padding: 5px; border-bottom: 1px solid #e2e8f0; text-align: center; }}
        tr:nth-child(even) td {{ background: #fafafa; }}
        .bar-cell {{ position: relative; text-align: left; direction: ltr; }}
        .bar {{
            display: inline-block; height: 10px;
            background: {c}; border-radius: 3px;
            vertical-align: middle;
        }}
        .bar-label {{ display: inline-block; min-width: 30px; text-align: right; font-size: 8pt; }}
        .cmp-box {{
            background: #f0fdf4; border: 1px solid #bbf7d0;
            padding: 10px 14px; border-radius: 5px;
            margin: 8px 0; font-size: 9pt;
        }}
        .sentiment-row {{ text-align: center; margin: 10px 0; }}
        .sentiment {{ display: inline-block; padding: 6px 12px; margin: 2px; border-radius: 4px; font-size: 9pt; }}
        .sent-pos {{ background: #dcfce7; color: #166534; }}
        .sent-neg {{ background: #fce4ec; color: #9b1c1c; }}
        .sent-neu {{ background: #fef9c3; color: #854d0e; }}
        .footer {{
            text-align: center; padding: 16px;
            color: #94a3b8; font-size: 6pt;
            border-top: 1px solid #e2e8f0;
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
        return f'<div class="footer">{html.escape(str(brand.company_name))} | <span class="pg">صفحة </span> | تم الإنشاء بواسطة SmartBot في {utcnow().strftime("%Y-%m-%d %H:%M")} UTC</div>'

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
        # Fallback via fpdf (basic, no CSS support)
        from fpdf import FPDF
        pdf = FPDF()
        pdf.add_page()
        pdf.add_font("DejaVu", "", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", uni=True)
        pdf.set_font("DejaVu", "", 10)
        pdf.multi_cell(0, 8, html)
        return pdf.output(dest="S").encode("latin-1")  # ponytail: fpdf fallback is degraded; upgrade to weasyprint

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
            period = f"{utcnow().strftime('%B %Y')} | آخر {days} يوم"
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
