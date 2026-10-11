import { Zap, UserRound, Network } from "lucide-react";
import { RevealCssClass } from "@/hooks/useReveal";

/* v16-r142 «رفيق» — «لغة العقل»: the capabilities chapter, rebuilt as
 * language the product actually speaks — chat threads. No card grid, no
 * constellation abstraction: every capability IS a miniature conversation
 * (customer ink bubble → SmartBot lime bubble), tagged with the intent
 * label the real engine produces (fb_dashboard/enhanced_intent.py —
 * complaint/problem/order/price_inquiry/greeting… 14 intents) and the
 * same «رد آلي ⚡» / «فريق بشري» badge grammar the simulator uses.
 *
 * Honesty: every thread traces to shipped code — auto replies
 * (rules/replies routers), intent classification (enhanced_intent.py),
 * broadcast with audience estimation/filters (broadcasts.py), and the
 * human escalation through the unified inbox (inbox.py + team roles).
 * Plan figures mirror the published offers (0/19/29 د.ل — the product
 * schema). Nothing invented.
 *
 * The strip below the head is derived from the SAME registry (all four
 * capabilities accessible) — real anchor chips that jump to their thread
 * (keyboard-reachable, no JS). Server component. */

type ThreadMsg = {
  from: "user" | "bot" | "sys";
  text: string;
  badge?: "auto" | "human";
};

type Thread = {
  id: string;
  cap: string;
  intent: string;
  note: string;
  msgs: ThreadMsg[];
};

const THREADS: Thread[] = [
  {
    id: "reply",
    cap: "ردود تلقائية ذكية",
    intent: "النية: استفسار عن السعر",
    note: "يردّ على التعليقات والرسائل لحظة وصولها، بلهجة صفحتك وعلى مدار الساعة — بلا تدخل منك.",
    msgs: [
      { from: "user", text: "كم سعر الاشتراك عندكم؟" },
      {
        from: "bot",
        badge: "auto",
        text: "الخطة المجانية 100 رد شهرياً — والمدفوعة تبدأ من 19 د.ل. أرشدك للاشتراك؟",
      },
    ],
  },
  {
    id: "intent",
    cap: "فهم نية العميل",
    intent: "النية: طلب / حجز",
    note: "كل رسالة تُصنَّف قبل الرد: استفسار، طلب، سؤال، شكر… حتى 14 نية — فكل رد يأتي في سياقه الصحيح.",
    msgs: [
      { from: "user", text: "أريد حجز طاولة لأربعة أشخاص الليلة" },
      { from: "bot", badge: "auto", text: "تم تسجيل طلبك! طاولة لأربعة الليلة — أكّد لك الموعد خلال دقائق." },
    ],
  },
  {
    id: "broadcast",
    cap: "البث الجماعي",
    intent: "بث جماعي · جمهور مستهدف",
    note: "رسالة واحدة تصل جمهور صفحتك كله — مصفّى بالمستهدفين، مع تقدير عدد المستلمين قبل الإرسال.",
    msgs: [
      { from: "bot", badge: "auto", text: "عرض نهاية الأسبوع: خصم 20% على كل الأصناف — اليومين فقط." },
      { from: "sys", text: "أُرسلت إلى الجمهور المستهدف — استلام فوري في ماسنجر" },
    ],
  },
  {
    id: "escalate",
    cap: "تصعيد للفريق البشري",
    intent: "النية: شكوى — أولوية عالية",
    note: "الشكاوى والأولويات العالية تُحوَّل لفريقك في صندوق الوارد الموحد — جاهزة بسياقها كامل.",
    msgs: [
      { from: "user", text: "الطلب وصل متأخر ساعتين! هذا مو مقبول" },
      { from: "bot", badge: "auto", text: "أشكرك على التنبيه وأسف على التأخير — رفعت شكواك للأولوية العالية وحوّلتها فوراً." },
      { from: "sys", text: "تم تحويل المحادثة إلى الفريق البشري — صندوق الوارد الموحد" },
      { from: "bot", badge: "human", text: "معك أحمد من فريق الدعم. راجعت الطلب — وصّلناه اليوم مع خصم على طلبتك القادمة." },
    ],
  },
];

/** The full registry for the chips strip (all 4, accessible anchors). */
const CHIPS = THREADS.map((t, i) => ({
  id: t.id,
  label: t.cap,
  count: String(i + 1).padStart(2, "0"),
}));

export function MindSection() {
  return (
    <section id="mind" className="ln-chapter ln-mind" aria-label="لغة العقل — قدرات SmartBot">
      <div className="ln-chapter-head">
        <span className="ln-label">{"01 — لغة العقل · MIND"}</span>
        <RevealCssClass as="h2" className="ln-chapter-title" delay={1}>
          قدرات رفيقك <em>بلغة محادثة</em>
        </RevealCssClass>
        <RevealCssClass as="p" className="ln-chapter-lede" delay={2}>
          ما يعرفه SmartBot لا يُشرح ببطاقات — يُسمَع في محادثاته. كل خيط
          أدناه قدرة تعمل اليوم على صفحتك: الرد الآلي، فهم النية، البث
          الجماعي، والتصعيد البشري.
        </RevealCssClass>
      </div>

      {/* the capability strip — derived from the SAME registry as the
          threads (all 4 names accessible); anchors, not buttons: native
          keyboard navigation, zero JS */}
      <RevealCssClass as="nav" className="ln-mind-strip" delay={2} aria-label="قدرات رفيقك — انتقل للمحادثة">
        {CHIPS.map((c) => (
          <a
            key={c.id}
            className="ln-mind-chip"
            href={`#thread-${c.id}`}
            aria-label={`${c.label} — انتقل إلى المحادثة ${c.count}`}
          >
            <span className="ln-mind-chip-dot" style={{ ["--dot" as string]: "var(--ln-lime)" }} aria-hidden="true" />
            <span className="ln-mind-chip-label">{c.label}</span>
            <span className="ln-mono">{c.count}</span>
          </a>
        ))}
      </RevealCssClass>

      <div className="ln-mind-threads">
        {THREADS.map((t, i) => (
          <RevealCssClass as="article" key={t.id} className="ln-mind-thread" delay={((i % 3) + 1) as 1 | 2 | 3}>
            <div className="ln-mind-side">
              <span className="ln-mind-n ln-mono">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="ln-mind-cap">{t.cap}</h3>
              <span className="ln-mind-intent ln-mono">{t.intent}</span>
            </div>
            <div className="ln-mind-main">
              <div className="ln-mind-log" id={`thread-${t.id}`}>
                {t.msgs.map((m, j) => {
                  if (m.from === "sys") {
                    return (
                      <p key={j} className="ln-botchat-msg sys">
                        {m.text}
                      </p>
                    );
                  }
                  const isUser = m.from === "user";
                  return (
                    <div key={j} className={`ln-botchat-msg ${m.from}`}>
                      {m.text}
                      {m.badge && !isUser && (
                        <span className={`ln-botchat-badge ${m.badge}`}>
                          {m.badge === "auto" ? (
                            <>
                              <Zap size={10} strokeWidth={2.4} aria-hidden="true" /> رد آلي
                            </>
                          ) : (
                            <>
                              <UserRound size={10} strokeWidth={2.4} aria-hidden="true" /> فريق بشري
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="ln-mind-note">{t.note}</p>
            </div>
          </RevealCssClass>
        ))}
      </div>

      <RevealCssClass as="p" className="ln-mind-foot" delay={3}>
        <Network size={14} aria-hidden="true" />
        محرّك نوايا واحد يخدم الصندوق الموحد كله: 14 نية مصنّفة، ردود
        تلقائية فورية، بث مستهدف، وتحويل بشري متى احتاج الأمر فريقك.
      </RevealCssClass>
    </section>
  );
}
