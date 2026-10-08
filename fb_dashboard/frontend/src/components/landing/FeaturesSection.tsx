import { Network } from "lucide-react";
import { RevealCssClass } from "@/hooks/useReveal";

/* r128 Stage B (F3b) — Chapter 01 «الاكتشاف»: the feature constellation
 * (colleges→features per PORT-KIT §6 Bot column). Server component: the
 * sky chart is a static SVG (dashed hairline rings) + DOM overlay dots
 * with CSS-only tooltips; the real names live in the tooltips, the
 * mobile chips strip and the note. Content = the landing's real
 * feature registry (landing-data.ts BENEFITS — the same eight
 * capabilities the product schema publishes), nothing invented. */

const LIME_DOT = "var(--ln-lime)";

/* The eight live capabilities — all lime nodes on the rings (they all
 * ship today; nothing here is "coming soon"). Positions are polar math
 * on the r=130/200/270 rings of the 1000×640 stage, center (500,320):
 *   r=130  @ 30°/150°/270°   r=200 @ 90°/210°/330°   r=270 @ 45°/135° */
const FEATURES = [
  { name: "ردود تلقائية ذكية", sub: "ردود آنية على التعليقات والرسائل", left: "61.3%", top: "39.8%" },
  { name: "صندوق وارد موحد", sub: "كل المحادثات في مكان واحد", left: "38.7%", top: "39.8%" },
  { name: "تحليلات وأداء", sub: "تقارير التفاعل والنمو", left: "50%", top: "18.75%" },
  { name: "جدولة المنشورات", sub: "تقويم محتوى مرئي", left: "32.7%", top: "65.6%" },
  { name: "استهداف الجمهور", sub: "فئات مناسبة لكل حملة", left: "67.3%", top: "65.6%" },
  { name: "أمان وتشفير", sub: "حماية بمعايير عالية", left: "69.1%", top: "20.2%" },
  { name: "دعم متعدد اللغات", sub: "عربي وإنجليزي بلغة العميل", left: "30.9%", top: "20.2%" },
  { name: "إدارة فريق كامل", sub: "صلاحيات مختلفة لكل عضو", left: "50%", top: "60.2%" },
];

/** The full registry for the chips strip (all 8, accessible). */
const CHIPS = FEATURES.map((f, i) => ({
  name: f.name,
  count: String(i + 1).padStart(2, "0"),
  dot: LIME_DOT,
}));

export function FeaturesSection() {
  return (
    <section id="features" className="ln-chapter ln-features">
      <div className="ln-chapter-head">
        <span className="ln-label">{"01 — الاكتشاف"}</span>
        <RevealCssClass as="h2" className="ln-chapter-title" delay={1}>
          ثماني قدرات في <em>مدارٍ واحد</em>
        </RevealCssClass>
        <RevealCssClass as="p" className="ln-chapter-lede" delay={2}>
          كل ما تحتاجه إدارة صفحة فيسبوك — من الردود الذكية إلى التقارير —
          في لوحة تحكم عربية واحدة.
        </RevealCssClass>
      </div>

      <RevealCssClass as="div" delay={2}>
        <div className="ln-constellation">
          {/* the sky chart — dashed hairline rings, flat violet heart */}
          <div className="ln-constellation-stage">
            <svg className="ln-constellation-svg" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
              <circle className="ln-constellation-ring" style={{ ["--ln-ri" as string]: 0 }} cx={500} cy={320} r={130} />
              <circle className="ln-constellation-ring" style={{ ["--ln-ri" as string]: 1 }} cx={500} cy={320} r={200} />
              <circle className="ln-constellation-ring" style={{ ["--ln-ri" as string]: 2 }} cx={500} cy={320} r={270} />
            </svg>

            {/* the capabilities — decorative pins; the accessible copy
                lives in the chips strip below (span = not focusable) */}
            {FEATURES.map((f, i) => (
              <span
                key={f.name}
                className="ln-constellation-dot"
                aria-hidden="true"
                style={{ left: f.left, top: f.top, ["--dot" as string]: LIME_DOT, ["--ln-ci" as string]: i }}
              >
                <span className="ln-constellation-tip">
                  <b>{f.name}</b>
                  <i>{f.sub} — متاح الآن</i>
                </span>
              </span>
            ))}
          </div>

          {/* the domain strip — carries the full registry accessibly
              (desktop keeps the sky chart; phones get these chips) */}
          <ul className="ln-constellation-strip">
            {CHIPS.map((c) => (
              <li key={c.name} className="ln-constellation-chip">
                <span className="ln-constellation-chip-dot" style={{ background: c.dot }} aria-hidden="true" />
                <span className="ln-constellation-chip-label">{c.name}</span>
                <span className="ln-constellation-chip-count">{c.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </RevealCssClass>

      <RevealCssClass as="p" className="ln-features-note" delay={3}>
        <Network size={14} aria-hidden="true" />
        منظومة موحَّدة: خطة مجانية للبداية وخمس خطط حتى المؤسسية، واجهة
        عربية كاملة، ودعم على مدار الساعة.
      </RevealCssClass>
    </section>
  );
}
