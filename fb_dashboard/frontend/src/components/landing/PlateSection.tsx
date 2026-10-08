import { MessagesSquare, Send, Megaphone, CalendarClock } from "lucide-react";
import { RevealCssClass } from "@/hooks/useReveal";

/* r128 Stage B (F3b) — Chapter 04 «القنوات»: the ground plate
 * (campus→channels plate per PORT-KIT §6 Bot column). SmartBot's ground
 * is not a campus photo (no new image binaries; the flat grammar needs
 * none) — it is the channels world the bot works on: the surfaces of a
 * Facebook page where the customers already are. Flat ink-2 band,
 * hairline cells, tone-coded wells. Every cell traces to shipped copy
 * (product schema featureList + landing BENEFITS): comments automation,
 * DM auto-replies, bulk broadcast, scheduled posts. */

const CHANNELS = [
  {
    icon: MessagesSquare, tone: "gold", name: "تعليقات فيسبوك",
    desc: "ردود تلقائية ذكية على تعليقات صفحتك لحظة نشرها.",
    tag: "AUTO",
  },
  {
    icon: Send, tone: "azure", name: "الرسائل الخاصة",
    desc: "ردود DM تلقائية تصل عميلك في نفس محادثته، بلغته.",
    tag: "DM",
  },
  {
    icon: Megaphone, tone: "mist", name: "البث الجماعي",
    desc: "رسائل جماعية لجمهور صفحتك، مصفّاة ومستهدفة لمن تناسبه.",
    tag: "BULK",
  },
  {
    icon: CalendarClock, tone: "gold", name: "المنشورات المجدولة",
    desc: "خطّط محتوى الصفحة مسبقاً وانشره في موعده تلقائياً.",
    tag: "SCHEDULE",
  },
];

export function PlateSection() {
  return (
    <section id="plate" className="ln-chapter ln-plate">
      <div className="ln-chapter-head">
        <span className="ln-label">{"04 — القنوات"}</span>
        <RevealCssClass as="h2" className="ln-chapter-title" delay={1}>
          أينما تفاعل <em>جمهورك</em>
        </RevealCssClass>
        <RevealCssClass as="p" className="ln-chapter-lede" delay={2}>
          الردود الذكية تعمل على قنوات صفحتك التي يعرفها عملاؤك بالفعل —
          بدون تطبيقات، بدون تسجيل، بدون تعقيد.
        </RevealCssClass>
      </div>

      <RevealCssClass as="div" delay={2}>
        <div className="ln-plate-grid">
          {CHANNELS.map((c) => (
            <article key={c.name} className="ln-plate-cell">
              <span className={`ln-plate-ico ${c.tone}`} aria-hidden="true">
                <c.icon size={26} strokeWidth={1.7} />
              </span>
              <h3 className="ln-plate-name">{c.name}</h3>
              <p className="ln-plate-desc">{c.desc}</p>
              <span className="ln-plate-tag ln-mono">{c.tag}</span>
            </article>
          ))}
        </div>
      </RevealCssClass>
    </section>
  );
}
