import Link from "next/link";
import { Bot } from "lucide-react";
import { RevealCssClass } from "@/hooks/useReveal";
import { MagneticGoldLink } from "@/components/landing/MagneticGoldLink";

/* r128 Stage B (F3b) — Chapter 06 «الوصول»: the starting point
 * (canonical LandingPage.tsx:698-727 anatomy). Converging orbit rings,
 * magnetic gold CTA (useMagnetic(7)) + ghost. Copy folds the shipped
 * hero CTAs (ابدأ الآن مجاناً → /subscribe، جرب البوت الآن → /demo)
 * and the real free-plan terms (100 رد/شهر، صفحة واحدة — the product
 * schema's published offer). */

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
        <span className="ln-label">{"06 — الوصول · ACCESS"}</span>
        <RevealCssClass as="h2" className="ln-cta-title" delay={1}>
          صفحتك الأولى <em>تبدأ من هنا</em>
        </RevealCssClass>
        <RevealCssClass as="p" className="ln-cta-lede" delay={2}>
          خطة مجانية بـ100 رد شهري وصفحة واحدة — اربط صفحتك وجرّب الردود
          الذكية قبل أي التزام.
        </RevealCssClass>
        <RevealCssClass as="div" className="ln-cta-actions" delay={3}>
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
