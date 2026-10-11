"use client";

import { Fragment } from "react";
import { CountUp } from "@/components/ui/CountUp";
import { usePublicStats } from "@/lib/usePublicStats";

/* v16-r142 «رفيق» — the trust band rebuilt as a mono COCKPIT readout:
 * one dark strip, a breathing LIVE marker, and the platform's real
 * figures set as instrument cells (big tabular mono value + dimmed unit
 * + label). REAL figures only (PORT-KIT §7 honesty): the numeric cells
 * come from the platform's public stats surface (/api/public/stats);
 * CountUp animates them on view. Until the numbers arrive — and
 * whenever the API has nothing honest to say — the band falls back to
 * qualitative cells; a fake hardcoded figure is never an option.
 * r144 honesty wave: the availability cell is GONE — the backend served a
 * hardcoded 99.9 ("replace with real probe later") and the strip rounded
 * it up to a «100%» claim, violating the same doctrine. In its place rides
 * a STATIC code-defined product fact (the shipped automation-engine count,
 * below) — verifiable in-repo, never presented as a live metric. This file
 * deliberately never spells the banned metric name: the parity honesty pin
 * greps for it (parity.mjs trust-band honesty).
 * aria-live="polite" on the inner readout: the fallback→figures swap is
 * announced to screen readers instead of updating silently (QA r144).
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

/* Static third cell — a verifiable PRODUCT fact, not a live metric:
 * the count of automation-engine modules shipped under fb_dashboard —
 * the 12 top-level *_engine.py modules (agent, analytics, broadcast,
 * commerce, context, flow, offer, pdf_reports, publisher, sequence,
 * subscriber, team) plus the bot_engine/ and facebook_engine/ packages.
 * Changes only with a deploy; the label grammar matches the live cells
 * («N | صفحة نشطة» → «14 | محرك أتمتة»). */
const ENGINE_COUNT = 14;

export function TrustBand() {
  const { stats, ready } = usePublicStats();

  const cells: Cell[] = [];
  if (ready && stats) {
    const tenants = stats.activeTenants ?? 0;
    const replies = stats.totalReplies ?? 0;
    if (tenants > 0) cells.push({ value: String(tenants), label: "صفحة نشطة" });
    if (replies > 0) cells.push({ value: String(replies), label: "رد آلي" });
    cells.push({ value: String(ENGINE_COUNT), label: "محرك أتمتة" });
  }
  const shown = cells.length > 0 ? cells : FALLBACK;

  return (
    <section id="trust" className="ln-trust" aria-label="أرقام المنصّة">
      <div className="ln-trust-inner" aria-live="polite">
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
