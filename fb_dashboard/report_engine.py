"""Report Engine -- White-label PDF report generator.
Generates client-ready analytics reports matching Metricool/Hootsuite quality.
"""
import logging
from datetime import datetime, timedelta, date
from _utils import utcnow
from pathlib import Path

from analytics_engine import AnalyticsEngine

log = logging.getLogger("fb-report")

REPORT_DIR = Path("/tmp/smartbot-reports")


class ReportEngine:
    def __init__(self, analytics_engine: AnalyticsEngine):
        self.ae = analytics_engine
        REPORT_DIR.mkdir(parents=True, exist_ok=True)

    async def generate_monthly_report(
        self,
        days: int,
        session,
        brand_name: str = "",
        logo_url: str = "",
        primary_color: str = "#FF5D3A",
    ) -> str:
        """Generate a monthly PDF report.  Returns absolute file path."""
        overview = await self.ae.get_dashboard_overview(days, session)
        daily_trend = await self.ae.get_daily_trend(days, session)
        top_rules = await self.ae.get_top_rules(days, 10, session)
        sentiment = await self.ae.get_sentiment_trend(days, session)
        top_commenters = await self.ae.get_top_commenters(days, 10, session)
        comparison = await self.ae.get_period_comparison(days, session)
        peak_hour = await self.ae.get_peak_hour(days, session)

        html = self._build_html(
            overview, daily_trend, top_rules, sentiment,
            top_commenters, comparison, peak_hour,
            brand_name, logo_url, primary_color, days,
        )

        import weasyprint

        filename = f"report-{utcnow().strftime('%Y-%m-%d')}.pdf"
        filepath = str(REPORT_DIR / filename)
        weasyprint.HTML(string=html).write_pdf(filepath)
        log.info("Report written to %s", filepath)
        return filepath

    def _build_html(self, overview, daily_trend, top_rules, sentiment,
                    top_commenters, comparison, peak_hour,
                    brand_name, logo_url, primary_color, days) -> str:
        month_name = utcnow().strftime("%B %Y")
        brand = brand_name or "SmartBot"

        html = f"""<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="utf-8"><title>{brand} -- Report {month_name}</title>
<style>
  @page {{ margin: 2cm; size: A4; }}
  body {{ font-family: 'DejaVu Sans', sans-serif; color: #1a1a2e; font-size: 11pt; line-height: 1.5; }}
  .header {{ text-align: center; padding: 30px 0; border-bottom: 3px solid {primary_color}; }}
  .header h1 {{ font-size: 22pt; margin: 10px 0 5px; }}
  .header p {{ color: #888; font-size: 9pt; }}
  .section {{ margin: 24px 0; }}
  .section h2 {{ font-size: 14pt; color: {primary_color}; border-right: 4px solid {primary_color}; padding-right: 10px; page-break-after: avoid; }}
  .kpi-grid {{ display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0; }}
  .kpi {{ flex: 1 0 140px; background: #f4f5f7; padding: 16px 12px; border-radius: 8px; text-align: center; }}
  .kpi .val {{ font-size: 24pt; font-weight: bold; color: {primary_color}; }}
  .kpi .lbl {{ font-size: 8pt; color: #777; margin-top: 4px; }}
  table {{ width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }}
  th {{ background: {primary_color}; color: #fff; padding: 8px 6px; text-align: center; }}
  td {{ padding: 6px; border-bottom: 1px solid #e0e0e0; text-align: center; }}
  tr:nth-child(even) td {{ background: #fafafa; }}
  .cmp {{ background: #eaf7ed; padding: 14px 18px; border-radius: 8px; margin: 12px 0; font-size: 10pt; }}
  .footer {{ text-align: center; padding: 24px; color: #aaa; font-size: 7pt; border-top: 1px solid #e0e0e0; margin-top: 36px; }}
</style>
</head><body>
<div class="header">
  {f'<img src="{logo_url}" height="50" style="margin-bottom:8px">' if logo_url else ''}
  <h1>{brand} — التقرير الشهري</h1>
  <p>{month_name} | {utcnow().strftime('%Y-%m-%d %H:%M')}</p>
</div>"""

        # KPI cards
        html += '<div class="section"><h2>نظرة عامة</h2><div class="kpi-grid">'
        for lbl, val in [
            ("إجمالي الردود", overview.get("total_replies", 0)),
            ("ردود اليوم", overview.get("today_replies", 0)),
            ("القواعد النشطة", overview.get("active_rules", 0)),
            ("المشتركين", overview.get("total_subscribers", 0)),
            ("معلقين فريدين", overview.get("unique_commenters", 0)),
        ]:
            html += f'<div class="kpi"><div class="val">{val}</div><div class="lbl">{lbl}</div></div>'
        html += "</div></div>"

        # Period comparison
        if comparison:
            chg = comparison.get("change_pct", 0)
            direction = chr(0x1F4C8) if chg > 0 else chr(0x1F4C9)
            html += (
                f'<div class="cmp">{direction} مقارنة بالفترة السابقة: '
                f'{"ارتفاع" if chg > 0 else "انخفاض"} بنسبة {abs(chg):.1f}%'
                f' ({comparison.get("replies_now", 0)} مقابل {comparison.get("replies_before", 0)})</div>'
            )

        # Peak hour
        if peak_hour is not None:
            html += f'<div class="cmp">{chr(0x1F552)} ساعة الذروة: {peak_hour}:00 — أعلى نسبة ردود</div>'

        # Top rules
        if top_rules:
            html += '<div class="section"><h2>أفضل القواعد</h2><table><tr><th>#</th><th>القاعدة</th><th>الردود</th><th>%</th></tr>'
            for i, r in enumerate(top_rules[:10], 1):
                html += f"<tr><td>{i}</td><td>{r.get('name', '—')}</td><td>{r.get('count', 0)}</td><td>{r.get('percentage', 0)}%</td></tr>"
            html += "</table></div>"

        # Top commenters
        if top_commenters:
            html += '<div class="section"><h2>أكثر المعلقين نشاطا</h2><table><tr><th>#</th><th>الاسم</th><th>التعليقات</th></tr>'
            for i, c in enumerate(top_commenters[:10], 1):
                html += f"<tr><td>{i}</td><td>{c.get('name', '—')}</td><td>{c.get('count', 0)}</td></tr>"
            html += "</table></div>"

        # Daily trend (last 14 days)
        if daily_trend:
            html += '<div class="section"><h2>النشاط اليومي (آخر 14 يوم)</h2><table><tr><th>التاريخ</th><th>الردود</th></tr>'
            for d in daily_trend[-14:]:
                html += f"<tr><td>{d.get('date', '')}</td><td>{d.get('replies', 0)}</td></tr>"
            html += "</table></div>"

        html += f'<div class="footer"><p>{brand} — تم الإنشاء بواسطة SmartBot</p></div>'
        html += "</body></html>"
        return html
