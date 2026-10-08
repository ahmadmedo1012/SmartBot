"use client";

import { Link2, SlidersHorizontal, Inbox, Calendar, BarChart3 } from "lucide-react";
import { RevealCssClass } from "@/hooks/useReveal";
import { useSectionProgress } from "@/hooks/useSectionProgress";
import { JourneyLightPath } from "@/components/landing/JourneyLightPath";

/* r128 Stage B (F3b) — Chapter 02 «التشغيل»: the 5-station journey
 * (canonical LandingPage.tsx:456-494 anatomy). The landing's real
 * 3-step how-it-works (landing-data.ts STEPS) is EXPANDED to Madarek's
 * 5-station rhythm — every added station traces to a shipped capability
 * (unified inbox BENEFITS[1], scheduling BENEFITS[3]); nothing
 * invented. Client component: useSectionProgress writes --sp on
 * the section, JourneyLightPath's lit thread scrubs with it
 * (stroke-dashoffset: calc(1 - var(--sp))) — pure CSS scrub, native
 * scrolling, no hijacking. */

const STATIONS: Array<{
  n: string;
  icon: typeof Link2;
  title: string;
  desc: string;
  tag: string;
}> = [
  {
    n: "01", icon: Link2, title: "اربط صفحتك",
    desc: "اربط صفحة فيسبوك بخطوات بسيطة وآمنة، مع دليل تفاعلي يرافقك حتى آخر خطوة.",
    tag: "الربط",
  },
  {
    n: "02", icon: SlidersHorizontal, title: "اضبط قواعد الرد",
    desc: "حدّد الكلمات المفتاحية والردود التلقائية التي تناسب نشاطك التجاري.",
    tag: "الإعداد",
  },
  {
    n: "03", icon: Inbox, title: "وحّد محادثاتك",
    desc: "جميع رسائل وتعليقات صفحاتك في صندوق وارد واحد، بواجهة عربية بسيطة وسهلة.",
    tag: "التشغيل",
  },
  {
    n: "04", icon: Calendar, title: "جدّول منشوراتك",
    desc: "أنشئ المحتوى مسبقاً وحدّد مواعيده على تقويم محتوى مرئي — ينشر في موعده تلقائياً.",
    tag: "المحتوى",
  },
  {
    n: "05", icon: BarChart3, title: "راقب الأداء",
    desc: "تقارير مفصلة عن أداء الصفحات والمنشورات ونسب التفاعل والنمو، من لوحة تحكم متكاملة.",
    tag: "النتائج",
  },
];

export function JourneySection() {
  /* --sp on this section scrubs the light path (and the chapter wash). */
  const ref = useSectionProgress<HTMLElement>();

  return (
    <section id="journey" ref={ref} className="ln-chapter ln-journey">
      <div className="ln-chapter-head">
        <span className="ln-label">{"02 — التشغيل"}</span>
        <RevealCssClass as="h2" className="ln-chapter-title" delay={1}>
          من الربط إلى <em>الأتمتة</em> — خمس محطات
        </RevealCssClass>
        <RevealCssClass as="p" className="ln-chapter-lede" delay={2}>
          خطّ ضوءٍ واحد يربط محطات التشغيل؛ كل محطة تُقلّل عبئك اليومي.
        </RevealCssClass>
      </div>

      <div className="ln-journey-stage">
        {/* the light path — computed from the real station-node layout */}
        <JourneyLightPath />

        <ol className="ln-journey-stations">
          {STATIONS.map((s, i) => (
            <RevealCssClass
              as="li"
              key={s.n}
              className={`ln-station${i % 2 === 0 ? " from-start" : " from-end"}`}
              delay={(i + 1) as 1 | 2 | 3 | 4 | 5}
            >
              <article className="ln-station-card">
                <span className="ln-station-node" aria-hidden="true">
                  <span className="ln-station-node-core" />
                </span>
                <header className="ln-station-head">
                  <span className="ln-mono ln-station-n">{s.n}</span>
                  <span className="ln-station-ico" aria-hidden="true"><s.icon size={20} /></span>
                  <span className="ln-station-tag">{s.tag}</span>
                </header>
                <h3 className="ln-station-title">{s.title}</h3>
                <p className="ln-station-desc">{s.desc}</p>
              </article>
            </RevealCssClass>
          ))}
        </ol>
      </div>
    </section>
  );
}
