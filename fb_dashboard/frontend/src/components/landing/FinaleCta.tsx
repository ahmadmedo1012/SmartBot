import Link from "next/link";
import { RobotMark } from "@/components/shared/RobotMark";
import { Bot } from "lucide-react";
import { RevealCssClass } from "@/hooks/useReveal";
import { MagneticGoldLink } from "@/components/landing/MagneticGoldLink";

/* v16-r142 «رفيق» — Chapter 04 «الوصول»: the starting point. The page
 * ends where it began — with the companion: converging orbit rings,
 * magnetic gold CTA (useMagnetic(7)) + ghost, and the waving robot
 * beat. Copy folds the shipped hero CTAs (ابدأ الآن مجاناً → /subscribe،
 * جرب البوت الآن → /demo), the real free-plan terms (100 رد/شهر، صفحة
 * واحدة) and the published 19 د.ل entry price (the product schema).
 * The wave is pure CSS (§16d) with its RM off-switch. */

export function FinaleCta() {
  const year = new Date().getFullYear();

  return (
    <section className="ln-cta" aria-label="ابدأ رحلتك">
      {/* converging orbits */}
      <div className="ln-cta-orbits" aria-hidden="true">
        <span className="ln-cta-orbit o0" />
        <span className="ln-cta-orbit o1" />
        <span className="ln-cta-orbit o2" />
      </div>
      <div className="ln-cta-inner">
        <span className="ln-label">{"04 — الوصول · ACCESS"}</span>
        <RevealCssClass as="h2" className="ln-cta-title" delay={1}>
          وظّف <em>رفيقك الرقمي</em> اليوم
        </RevealCssClass>
        <RevealCssClass as="p" className="ln-cta-lede" delay={2}>
          خطة مجانية بـ100 رد شهرياً وصفحة واحدة — وخطط تبدأ من 19 د.ل.
          اربط صفحتك، ودع رفيقك يبدأ العمل قبل أن تغلق اللابتوب.
        </RevealCssClass>
        <RevealCssClass as="div" className="ln-cta-actions" delay={3}>
          <span className="ln-cta-bot" aria-hidden="true">
            <span className="ln-cta-bot-say">رفيقك جاهز!</span>
            <RobotMark state="greeting" className="ln-cta-bot-img" />
          </span>
          <MagneticGoldLink href="/subscribe" xl withArrow ariaLabel="ابدأ الآن مجاناً — الاشتراك في SmartBot">
            ابدأ الآن مجاناً
          </MagneticGoldLink>
          <Link href="/demo" className="ln-btn-ghost xl">جرب لوحة التجربة</Link>
        </RevealCssClass>
        <RevealCssClass as="p" className="ln-cta-meta" delay={4}>
          <Bot size={13} aria-hidden="true" />
          SmartBot · {year}
        </RevealCssClass>
      </div>
    </section>
  );
}
