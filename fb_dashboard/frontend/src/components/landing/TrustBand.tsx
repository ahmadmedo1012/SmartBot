"use client";

import { Fragment } from "react";
import { CountUp } from "@/components/ui/CountUp";
import { usePublicStats } from "@/lib/usePublicStats";

/* r128 Stage B (F3b) — the trust band (canonical LandingPage.tsx:424
 * anatomy). REAL figures only (PORT-KIT §7 honesty): the numeric cells
 * come from the platform's public stats surface (/api/public/stats —
 * the same source the retired StatsSection and the hero trust badge
 * used, one shared in-flight fetch per page load); CountUp animates
 * them on view. Until the numbers arrive — and whenever the API has
 * nothing honest to say — the band falls back to qualitative cells;
 * a fake hardcoded figure is never an option.
 * Client island: the fetch + CountUp need the browser; the section
 * markup itself is light and paints instantly with the fallback. */

type Cell = { value?: string; label: string };

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
    if (uptime > 0) cells.push({ value: `${Math.round(uptime)}%`, label: "جهوزية" });
  }
  const shown = cells.length > 0 ? cells : FALLBACK;

  return (
    <section id="trust" className="ln-trust" aria-label="أرقام المنصّة">
      <div className="ln-trust-inner">
        {shown.map((c, i) => (
          <Fragment key={c.label}>
            {i > 0 && <span className="ln-trust-sep" aria-hidden="true" />}
            <span className="ln-mono">
              {c.value ? (
                <>
                  <CountUp value={c.value} /> {c.label}
                </>
              ) : (
                c.label
              )}
            </span>
          </Fragment>
        ))}
      </div>
    </section>
  );
}
