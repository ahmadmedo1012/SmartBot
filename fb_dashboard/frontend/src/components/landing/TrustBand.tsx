"use client";

import { Fragment } from "react";
import { CountUp } from "@/components/ui/CountUp";
import { usePublicStats } from "@/lib/usePublicStats";

/* v16-r142 «رفيق» — the trust band rebuilt as a mono COCKPIT readout:
 * one dark strip, a breathing LIVE marker, and the platform's real
 * figures set as instrument cells (big tabular mono value + dimmed unit
 * + label). REAL figures only (PORT-KIT §7 honesty): the numeric cells
 * come from the platform's public stats surface (/api/public/stats —
 * the same source ProgressSection used before it folded into this
 * band); CountUp animates them on view. Until the numbers arrive — and
 * whenever the API has nothing honest to say — the band falls back to
 * qualitative cells; a fake hardcoded figure is never an option.
 * Client island: the fetch + CountUp need the browser; the section
 * markup is light and paints instantly with the fallback. */

type Cell = { value?: string; unit?: string; label: string };

/* Qualitative fallback — every claim traces to shipped copy (schema
 * contactPoint 24/7, FAQ "واجهة كاملة بالعربية", hero sub). */
const FALLBACK: Cell[] = [
  { label: "أتمتة ذكية لصفحات فيسبوك" },
  { label: "دعم على مدار الساعة" },
  { label: "واجهة عربية بالكامل" },
];

export function TrustBand() {
  const { stats, ready } = usePublicStats();

  const cells: Cell[] = [];
  if (ready && stats) {
    const tenants = stats.activeTenants ?? 0;
    const replies = stats.totalReplies ?? 0;
    const uptime = stats.uptimePercent ?? 0;
    if (tenants > 0) cells.push({ value: String(tenants), label: "صفحة نشطة" });
    if (replies > 0) cells.push({ value: String(replies), label: "رد آلي" });
    if (uptime > 0) {
      /* the % is a dimmed .ln-stat-unit span (canonical stat grammar),
         never baked into the mono CountUp value */
      cells.push({ value: String(Math.round(uptime)), unit: "%", label: "جهوزية" });
    }
  }
  const shown = cells.length > 0 ? cells : FALLBACK;

  return (
    <section id="trust" className="ln-trust" aria-label="أرقام المنصّة">
      <div className="ln-trust-inner">
        <span className="ln-trust-live ln-mono" aria-hidden="true">
          <i />
          LIVE
        </span>
        {shown.map((c) => (
          <Fragment key={c.label}>
            <span className="ln-trust-sep" aria-hidden="true" />
            <span className="ln-trust-cell">
              {c.value ? (
                <span className="ln-trust-value">
                  <CountUp value={c.value} />
                  {c.unit && <span className="ln-stat-unit">{c.unit}</span>}
                </span>
              ) : null}
              <span className="ln-trust-label">{c.label}</span>
            </span>
          </Fragment>
        ))}
      </div>
    </section>
  );
}
