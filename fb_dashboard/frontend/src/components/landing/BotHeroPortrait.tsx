import Image from "next/image";
import { Zap } from "lucide-react";

/* Task 2-b — the hero's protagonist: the original SmartBot robot inside a
 * depth composition — lime/amber heart glow, one slow CSS orbital ring
 * with a lime on-duty traveller, a breathing amber face halo (overall
 * glow, not pinpoint eyes — the alignment ruling), and four floating
 * Messenger-tuned chat bubbles carrying the product's real voice
 * (customer = ink bubble at the reading start, SmartBot = lime bubble at
 * the far side; the same lime-is-the-bot's-voice mapping the gold pill
 * uses). SERVER component: zero JS — every verb (orbit, drift, pulse) is
 * pure CSS with its own §16f reduced-motion off-switch, and the h1/sub
 * next to it keep painting instantly (LCP doctrine untouched).
 * Decorative by role: aria-hidden + empty alt (the copy column carries
 * the meaning for assistive tech). */

export function BotHeroPortrait() {
  return (
    <div className="ln-bot-hero" aria-hidden="true">
      <div className="ln-bot-hero-glow" />
      <span className="ln-bot-orbit ln-bot-orbit--outer" />
      <span className="ln-bot-orbit" />
      <div className="ln-bot-hero-frame">
        <Image
          src="/images/robot/robot-hero.webp"
          alt=""
          width={1024}
          height={1024}
          priority
          sizes="(min-width: 1025px) 44vw, 86vw"
          className="ln-bot-hero-img"
        />
        <span className="ln-bot-hero-eye" />
      </div>

      {/* the product's live voice — short, honest, identity-tuned */}
      <div className="ln-bot-bubble ln-bot-bubble--in ln-bot-bubble--in1">
        <span className="ln-bot-bubble-who">عميل</span>
        كم سعر الاشتراك؟
      </div>
      <div className="ln-bot-bubble ln-bot-bubble--out ln-bot-bubble--out1">
        <span className="ln-bot-bubble-who">
          SmartBot <Zap size={8} strokeWidth={2.4} style={{ display: "inline", verticalAlign: "-1px" }} aria-label="رد آلي" />
        </span>
        الرد الأول مجاني — والخطط تبدأ من 19 د.ل شهرياً
      </div>
      <div className="ln-bot-bubble ln-bot-bubble--in ln-bot-bubble--in2">
        <span className="ln-bot-bubble-who">عميل</span>
        أريد حجز طاولة
      </div>
      <div className="ln-bot-bubble ln-bot-bubble--out ln-bot-bubble--out2">
        <span className="ln-bot-bubble-who">
          SmartBot <Zap size={8} strokeWidth={2.4} style={{ display: "inline", verticalAlign: "-1px" }} aria-label="رد آلي" />
        </span>
        تم تسجيل طلبك — بالتوفيق!
      </div>
    </div>
  );
}
