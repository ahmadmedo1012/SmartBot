"use client";

import { Fragment } from "react";
import { CountUp } from "@/components/ui/CountUp";
import { getArabicPlural } from "@/lib/arabic-plural";
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
 * 15-SB acceptance wave: the captions agree with their numeral through the
 * shared Arabic plural engine (below) — «4 صفحات نشطة» reads correctly now;
 * the middle stat stays «رد آلي» on purpose: /api/public/stats carries no
 * stronger verifiable field (activeUsers30d is 0 live — swapping would
 * drop the cell by the >0 honesty gate, not strengthen the band).
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
 * («N | صفحات نشطة» → «14 | محرك أتمتة»). */
const ENGINE_COUNT = 14;

/* Caption agreement for a counted phrase whose numeral is displayed
 * separately (cockpit cell = value + caption on one baseline): 3–10 →
 * the plural («4 صفحات نشطة» — the r144 live defect), every other state
 * keeps the singular — 1/2 read naturally with the digit («2 رد آلي»;
 * the dual is reserved for a noun standing alone, never numeral+noun)
 * and 11+ takes the singular by rule («14 محرك أتمتة»). Broken plurals
 * and the adjective are explicit forms — mechanical derivation cannot
 * produce «صفحات نشطة». getArabicPlural throws on malformed counts; a
 * bad stats payload must never crash the band, hence the singular
 * fallback. */
function countedLabel(count: number, singular: string, plural: string): string {
  try {
    return getArabicPlural(count, singular, { two: singular }, plural);
  } catch {
    return singular;
  }
}

export function TrustBand() {
  const { stats, ready } = usePublicStats();

  const cells: Cell[] = [];
  if (ready && stats) {
    const tenants = stats.activeTenants ?? 0;
    const replies = stats.totalReplies ?? 0;
    if (tenants > 0) cells.push({ value: String(tenants), label: countedLabel(tenants, "صفحة نشطة", "صفحات نشطة") });
    if (replies > 0) cells.push({ value: String(replies), label: countedLabel(replies, "رد آلي", "ردود آلية") });
    cells.push({ value: String(ENGINE_COUNT), label: countedLabel(ENGINE_COUNT, "محرك أتمتة", "محركات أتمتة") });
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
