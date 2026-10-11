import Link from "next/link";
import Image from "next/image";
import { RevealCssClass } from "@/hooks/useReveal";

/* v16-r142 «رفيق» — «المنصة الحقيقية»: the product shown HONESTLY.
 * The two windows embed real captures of the shipped dashboard (the
 * /demo route — the real AdminSidebar + real components, with its
 * declared mock dataset), taken from a local build: the unified inbox
 * (dashboard/messages) and the analytics board (dashboard/analytics).
 * The caption says exactly that — نسخة التجربة ببيانات وهمية — and the
 * CTA hands the visitor the same surface to try. No mockups, no
 * "concept" art, no invented numbers.
 *
 * The rail chips enumerate shipped dashboard routes only: inbox,
 * broadcasts, scheduling, PDF reports, team roles, sequences, targeting
 * (fb_dashboard/routers/*). */

const WINDOWS = [
  {
    key: "inbox",
    cls: "w1",
    src: "/images/ui/demo-inbox.webp",
    alt: "لوحة تحكم SmartBot الحقيقية — صندوق الوارد الموحد بمحادثات العملاء والردود",
    title: "صندوق الوارد الموحّد",
    cap: "كل رسائل وتعليقات صفحاتك في مكان واحد — مع الردود الآلية بجانبها.",
  },
  {
    key: "analytics",
    cls: "w2",
    src: "/images/ui/demo-analytics.webp",
    alt: "لوحة تحكم SmartBot الحقيقية — التحليلات واتجاهات النشاط وأفضل القواعد",
    title: "التحليلات والأداء",
    cap: "اتجاهات النشاط، أفضل القواعد، ونمو الجمهور — أرقام تقرأ ولا تُخمَّن.",
  },
] as const;

const RAILS = [
  "صندوق موحّد",
  "بث جماعي",
  "جدولة منشورات",
  "تقارير PDF",
  "أدوار وصلاحيات",
  "تسلسلات ردود",
  "استهداف جمهور",
];

export function ProductSection() {
  return (
    <section id="platform" className="ln-chapter ln-product" aria-label="المنصة الحقيقية">
      <div className="ln-chapter-head">
        <span className="ln-label">{"03 — المنصة الحقيقية · THE REAL THING"}</span>
        <RevealCssClass as="h2" className="ln-chapter-title" delay={1}>
          هذه ليست واجهة تسويقية — <em>هي المنصّة نفسها</em>
        </RevealCssClass>
        <RevealCssClass as="p" className="ln-chapter-lede" delay={2}>
          لقطات من لوحة التحكم الفعلية (نسخة التجربة ببيانات وهمية): صندوق
          الوارد الموحد والتحليلات. ما تراه هنا هو ما تحصل عليه بعد الربط.
        </RevealCssClass>
      </div>

      <div className="ln-product-grid">
        {WINDOWS.map((w, i) => (
          <RevealCssClass key={w.key} className={`ln-product-window ${w.cls}`} delay={((i % 2) + 2) as 2 | 3}>
            <div className="ln-product-bar" aria-hidden="true">
              <i />
              <i />
              <i />
              <span className="ln-mono">bot.smart-link.ly/demo</span>
            </div>
            <Image
              src={w.src}
              alt={w.alt}
              width={1440}
              height={900}
              sizes="(min-width: 921px) 58vw, 92vw"
              className="ln-product-shot"
            />
            <p className="ln-product-cap">
              <b>{w.title}</b>
              {w.cap}
            </p>
          </RevealCssClass>
        ))}
      </div>

      <RevealCssClass as="ul" className="ln-product-rails" delay={3} aria-label="قدرات المنصة المشحونة في الإنتاج">
        {RAILS.map((r) => (
          <li key={r} className="ln-product-rail ln-mono">
            {r}
          </li>
        ))}
      </RevealCssClass>

      <RevealCssClass as="div" className="ln-product-cta-row" delay={4}>
        <span>افتح اللوحة نفسها وجرّبها بنفسك — بلا تسجيل:</span>
        <Link href="/demo" className="ln-btn-ghost">
          لوحة التجربة
        </Link>
      </RevealCssClass>
    </section>
  );
}
