"use client";

import { DayPanelArt } from "@/components/landing/DayPanelArt";
import { RevealCssClass } from "@/hooks/useReveal";
import { useSectionProgress } from "@/hooks/useSectionProgress";

/* v16-r142 «رفيق» — «يوم في الحياة»: the four faces of the companion,
 * staged as a STORYBOARD — sequential panels of one working day, each
 * anchored to a clock and revealed on scroll, threaded by one lit rail
 * that scrubs with the section's --sp (useSectionProgress — the same
 * native-scroll grammar the light path used; scaleY of a lit overlay,
 * transform-origin top: the day literally lights up as you read).
 *
 * Every panel maps to a shipped capability (welcome auto-replies, intent
 * understanding, 24/7 instant replies + human escalation, performance
 * reports) — the same honest registry the rest of the landing documents.
 * The four renders are ONE character family (DayPanelArt): the hero
 * robot's own design language — the levitating BUST (P22: head +
 * docking neck, no body/limbs/hands, the owner's directive) staged
 * four ways (wave/classify/reply/report), distinguished by the eye
 * register, the head tilt and the props' composition. Server-safe
 * layout; the only client work is the --sp scrub. */

/* v17-SB (17-PERF #1): sizes = the .ln-day-media rendered width, derived
 * from landing.css (not guessed). ≤760: single column — gutter 20×2 + node
 * col 34px + gap --sp-5 20px → calc(100vw − 94px). 641–760 single col keeps
 * the 44px node → calc(100vw − 104px). 761–920: two-col card
 * (media = 0.9fr/2 = 0.45), gutter 20 + col 44 + gap 20 → 0.45·(100vw−104).
 * ≥921: board caps at 1080px, gutter 48×2 → 0.45·(min(1080px,100vw−96)−64).
 * Below-fold panels stay lazy (no priority) — the optimizer now serves the
 * candidate the slot actually needs instead of the raw 1024px source. */
const PANELS = [
  {
    key: "p1",
    n: "01",
    clock: "06:00",
    pose: "يلوّح",
    art: "wave",
    title: "يفتح يومه بترحيب كل تعليق",
    desc: "أول تعليق على منشورك يحصل على ردّ ترحيبي فوري — بلهجة صفحتك، قبل أن تفتح أنت عينيك.",
  },
  {
    key: "p2",
    n: "02",
    clock: "13:20",
    pose: "يفهم",
    art: "classify",
    title: "يصنّف كل رسالة قبل أن يرد",
    desc: "استفسار، طلب، شكوى تحتاج فريقك — النية تُحدَّد لحظة الوصول فكل رد يأتي في سياقه الصحيح.",
  },
  {
    key: "p3",
    n: "03",
    clock: "21:45",
    pose: "يردّ",
    art: "reply",
    title: "يردّ فوراً — وينقل المهم لفريقك",
    desc: "بلغة العميل وفي أي ساعة، على الرسائل والتعليقات — واللي يحتاج قراراً بشرياً يوصل جاهزاً لصندوقك الموحد.",
  },
  {
    key: "p4",
    n: "04",
    clock: "00:00",
    pose: "يقف جاهزاً",
    art: "report",
    title: "يقرأ لك أرقام اليوم… ويستعد للغد",
    desc: "تحليلات الأداء والتفاعل تصل واضحة — تعرف بالأرقام أين تزيد خطوتك القادمة، ورفيقك يبقى على منصته.",
  },
] as const;

export function BotDayStoryboard() {
  /* --sp on this section scrubs the lit day rail (pure CSS consumer). */
  const ref = useSectionProgress<HTMLElement>();

  return (
    <section id="day" ref={ref} className="ln-chapter ln-day" aria-label="يوم في حياة رفيقك">
      <div className="ln-chapter-head">
        <span className="ln-label">{"02 — يوم في الحياة · A DAY"}</span>
        <RevealCssClass as="h2" className="ln-chapter-title" delay={1}>
          يومٌ كامل مع <em>رفيقك</em>
        </RevealCssClass>
        <RevealCssClass as="p" className="ln-chapter-lede" delay={2}>
          أربع لوحات من يومه الحقيقي: يرحّب، يفهم، يردّ، ثم يقرأ لك الأرقام
          — خطّ ضوءٍ واحد يضيء مع كل لوحة تكشفها بالتمرير.
        </RevealCssClass>
      </div>

      <div className="ln-day-board">
        {/* the lit rail — base hairline + the --sp-scrubbed light */}
        <span className="ln-day-path" aria-hidden="true">
          <span className="ln-day-path-base" />
          <span className="ln-day-path-light" />
        </span>

        <ol className="ln-day-panels">
          {PANELS.map((p, i) => (
            <RevealCssClass
              as="li"
              key={p.key}
              className={`ln-day-panel ${p.key}`}
              delay={((i % 2) + 1) as 1 | 2}
            >
              <div className="ln-day-node" aria-hidden="true">
                <span className="ln-day-clock ln-mono">{p.clock}</span>
              </div>
              <div className="ln-day-card">
                <div className="ln-day-media">
                  {/* W6 2-a: the panel art — ONE character family, aria-hidden
                      (the h3/p below carry the panel's meaning) */}
                  <DayPanelArt pose={p.art} className="ln-day-art" />
                  <span className="ln-day-media-glow" aria-hidden="true" />
                </div>
                <div className="ln-day-body">
                  <span className="ln-day-pose ln-mono">
                    {p.n} · {p.pose}
                  </span>
                  <h3 className="ln-day-title">{p.title}</h3>
                  <p className="ln-day-desc">{p.desc}</p>
                </div>
              </div>
            </RevealCssClass>
          ))}
        </ol>
      </div>
    </section>
  );
}
