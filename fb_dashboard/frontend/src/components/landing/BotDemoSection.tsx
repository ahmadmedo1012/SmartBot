import Image from "next/image";
import { RevealCssClass } from "@/hooks/useReveal";
import { BotChatSimulator } from "@/components/landing/BotChatSimulator";

/* Task 2-b — «روبوتك يشتغل»: the LIVE interlude between chapter 01
 * (features) and chapter 02 (the journey). Server chapter head + the
 * client simulator island + the robot-chat companion portrait. The copy
 * is honest product anatomy: intent classification, instant auto
 * replies, human escalation through the unified inbox (the same
 * capabilities RolesSection/JourneySection document). The label reads
 * «عرض حي» rather than a chapter number — the numbered ladder
 * (01–06) stays untouched. */

export function BotDemoSection() {
  return (
    <section id="bot-demo" className="ln-chapter ln-botdemo" aria-label="عرض حي — روبوتك يشتغل">
      <div className="ln-chapter-head">
        <span className="ln-label">{"عرض حي · LIVE"}</span>
        <RevealCssClass as="h2" className="ln-chapter-title" delay={1}>
          روبوتك <em>يشتغل</em> — شاهد المحادثة
        </RevealCssClass>
        <RevealCssClass as="p" className="ln-chapter-lede" delay={2}>
          نية العميل تُصنَّف لحظة وصولها، الرد الآلي ينطلق فوراً، والشكاوى
          تُحوَّل لفريقك البشري. اختر سيناريو وشاهد.
        </RevealCssClass>
      </div>

      <div className="ln-botdemo-grid">
        <RevealCssClass delay={2}>
          <BotChatSimulator />
        </RevealCssClass>

        <RevealCssClass as="div" className="ln-botdemo-side" delay={3}>
          <div className="ln-botdemo-frame">
            <Image
              src="/images/robot/robot-chat.webp"
              alt="روبوت SmartBot يحمل فقاعة محادثة متوهجة"
              width={1024}
              height={1024}
              sizes="(min-width: 981px) 38vw, 92vw"
              style={{ inlineSize: "100%", blockSize: "100%", objectFit: "cover" }}
            />
            <span className="ln-botdemo-frame-glow" aria-hidden="true" />
          </div>
          <p className="ln-botdemo-note">
            <strong>يرافق صندوقك الوارد على مدار الساعة.</strong>{" "}
            كل رسالة تُصنَّف وتُردّ بلغة العميل — واللي يحتاج قراراً بشرياً
            يوصل لفريقك جاهزاً بسياقه كامل.
          </p>
        </RevealCssClass>
      </div>
    </section>
  );
}
