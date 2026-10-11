import Image from "next/image";
import { RevealCssClass } from "@/hooks/useReveal";

/* Task 2-b — «أطوار الروبوت»: the four faces of the companion, staged as
 * a staggered zigzag path (12-track grid, alternating spans + vertical
 * offsets — asymmetric by construction, NOT a card grid) between chapter
 * 02 (journey) and chapter 03 (progress). Every state maps to a shipped
 * capability: auto-welcome replies to comments, intent understanding,
 * 24/7 instant replies, and the performance reports — the same honest
 * registry the rest of the landing documents. SERVER component; the
 * only motion is the shared hover hairline (§16c). */

const STATES = [
  {
    key: "s1",
    n: "01",
    img: "/images/robot/robot-wave.webp",
    alt: "روبوت SmartBot يلوّح بترحيب",
    pose: "يرحّب",
    title: "ترحيب تلقائي بكل تعليق",
    desc: "أول تعليق على منشورك يحصل على ردّ ترحيبي فوري — بلا تدخل منك وبلهجة صفحتك.",
    sizes: "(min-width: 921px) 40vw, 92vw",
  },
  {
    key: "s2",
    n: "02",
    img: "/images/robot/robot-think.webp",
    alt: "روبوت SmartBot يفكّر ويد على ذقنه",
    pose: "يفهم",
    title: "فهم نية العميل",
    desc: "يصنّف كل رسالة: استفسار، حجز، أو شكوى تحتاج فريقك — فكل رد يأتي في سياقه الصحيح.",
    sizes: "(min-width: 921px) 32vw, 92vw",
  },
  {
    key: "s3",
    n: "03",
    img: "/images/robot/robot-chat.webp",
    alt: "روبوت SmartBot يحمل فقاعة محادثة",
    pose: "يردّ",
    title: "رد فوري 24/7",
    desc: "بلغة العميل وفي أي ساعة — رسائل خاصة وتعليقات عامة، حتى وأنت نائم.",
    sizes: "(min-width: 921px) 32vw, 92vw",
  },
  {
    key: "s4",
    n: "04",
    img: "/images/robot/robot-wave.webp",
    alt: "روبوت SmartBot يحتفل برفع الذراعين",
    pose: "يحتفل",
    title: "تقارير النموّ تصلك جاهزة",
    desc: "تحليلات الأداء والتفاعل تصل واضحة — تعرف بالأرقام متى تزداد خطواتك القادمة.",
    sizes: "(min-width: 921px) 38vw, 92vw",
  },
] as const;

export function BotStatesStrip() {
  return (
    <section id="bot-states" className="ln-chapter ln-botstates" aria-label="أطوار الروبوت الأربعة">
      <div className="ln-chapter-head">
        <span className="ln-label">{"أطوار الروبوت · BOT STATES"}</span>
        <RevealCssClass as="h2" className="ln-chapter-title" delay={1}>
          روبوت واحد، <em>أربعة أطوار</em>
        </RevealCssClass>
        <RevealCssClass as="p" className="ln-chapter-lede" delay={2}>
          الشخصية نفسها ترافق صفحتك من أول ترحيب حتى احتفال الأرقام — مسار
          متعرج يقرأه كخط زمن لليوم مع SmartBot.
        </RevealCssClass>
      </div>

      <div className="ln-botstates-grid">
        {STATES.map((s, i) => (
          <RevealCssClass as="article" key={s.key} className={`ln-botstate ${s.key}`} delay={((i % 2) + 2) as 2 | 3}>
            <div className="ln-botstate-media">
              <Image
                src={s.img}
                alt={s.alt}
                width={1024}
                height={1024}
                sizes={s.sizes}
                style={{ inlineSize: "100%", blockSize: "100%", objectFit: "cover", objectPosition: "50% 30%" }}
              />
              <span className="ln-botstate-media-glow" aria-hidden="true" />
            </div>
            <div className="ln-botstate-head">
              <span className="ln-botstate-n">{s.n}</span>
              <h3 className="ln-botstate-title">{s.pose} — {s.title}</h3>
            </div>
            <p className="ln-botstate-desc">{s.desc}</p>
          </RevealCssClass>
        ))}
      </div>
    </section>
  );
}
