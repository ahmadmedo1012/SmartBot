"use client";

import { RevealCssClass } from "@/hooks/useReveal";
import { useSectionProgress } from "@/hooks/useSectionProgress";
import { CountUp } from "@/components/ui/CountUp";
import { usePublicStats } from "@/lib/usePublicStats";

/* r128 Stage B (F3b) — Chapter 03 «التقدّم»: the progress story
 * (canonical LandingPage.tsx:498-555 anatomy). A SECOND useSectionProgress
 * instance scrubs the expanding ring system (scale / ring opacity / violet
 * core growth / milestone ignition, all pure CSS on --sp), while CountUp
 * carries the platform's REAL figures — the public stats surface
 * (/api/public/stats: active pages, replies sent, uptime), the same
 * source every other surface of this product already uses, plus the
 * published subscription-plan count. NEVER a hardcoded marketing number:
 * while the stats are in flight the cells simply wait (honesty rule). */

export function ProgressSection() {
  /* the second --sp — written on #progress, consumed by the ring system. */
  const ref = useSectionProgress<HTMLElement>();
  const { stats, ready } = usePublicStats();

  const cells: Array<{ value: string; label: string; note: string }> = [
    { value: "5", label: "خطط اشتراك", note: "من المجانية إلى المؤسسية" },
  ];
  if (ready && stats) {
    const tenants = stats.activeTenants ?? 0;
    const replies = stats.totalReplies ?? 0;
    const uptime = stats.uptimePercent ?? 0;
    if (tenants > 0) {
      cells.push({ value: String(tenants), label: "صفحة نشطة", note: "تُدار عبر SmartBot" });
    }
    if (replies > 0) {
      cells.push({ value: String(replies), label: "رد آلي", note: "أرسلها البوت نيابةً عنهم" });
    }
    if (uptime > 0) {
      cells.push({ value: `${Math.round(uptime)}%`, label: "جهوزية المنصّة", note: "التزام تشغيلي معلن" });
    }
  }

  return (
    <section id="progress" ref={ref} className="ln-chapter ln-progress">
      <div className="ln-progress-grid">
        <div className="ln-progress-visual" aria-hidden="true">
          <div className="ln-progress-orbits">
            {/* expanding orbit system — scale / ring opacity / core growth /
                milestone ignition are all scrubbed by the section's --sp */}
            <span className="ln-progress-ring r0" />
            <span className="ln-progress-ring r1" />
            <span className="ln-progress-ring r2" />
            <span className="ln-progress-ring r3" />
            <span className="ln-progress-core" />
            <span className="ln-progress-milestone m0" />
            <span className="ln-progress-milestone m1" />
            <span className="ln-progress-milestone m2" />
            <span className="ln-progress-milestone m3" />
            <span className="ln-progress-label"><span className="ln-mono">GROW · صفحتك تكبر</span></span>
          </div>
        </div>

        <div className="ln-progress-copy">
          <span className="ln-label">{"03 — التقدّم"}</span>
          <RevealCssClass as="h2" className="ln-chapter-title" delay={1}>
            صفحتك تكبر مع <em>كلّ ردّ</em>
          </RevealCssClass>
          <RevealCssClass as="p" className="ln-chapter-lede" delay={2}>
            تقارير وإحصائيات دقيقة: الردود المُرسلة، تفاعل المنشورات، ونمو
            جمهورك — أرقام حقيقية من لوحة تحكم عربية، بصياغة تخدم قرارك.
          </RevealCssClass>

          <div className="ln-progress-stats">
            {cells.map((s, i) => (
              <RevealCssClass as="div" className="ln-stat" key={s.label} delay={(i + 1) as 1 | 2 | 3 | 4}>
                <div className="ln-stat-value"><CountUp value={s.value} /></div>
                <div className="ln-stat-label">{s.label}</div>
                <div className="ln-stat-note">{s.note}</div>
              </RevealCssClass>
            ))}
          </div>

          <RevealCssClass as="p" className="ln-progress-source" delay={4}>
            أرقام حقيقية من إحصائيات المنصّة العمومية — القيم نفسها المعروضة
            في لوحة التحكم.
          </RevealCssClass>
        </div>
      </div>
    </section>
  );
}
