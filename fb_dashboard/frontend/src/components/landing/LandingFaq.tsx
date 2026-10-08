import { ChevronDown } from "lucide-react";
import { RevealCssClass } from "@/hooks/useReveal";
import { FAQS } from "@/components/landing/landing-data";

/* r128 Stage B (F3b) — the compact FAQ, ln-styled (native <details>,
 * zero JS). Content = the landing's real FAQS registry (landing-data.ts,
 * the same six questions the FAQPage schema publishes) — nothing
 * invented. */

export function LandingFaq() {
  return (
    <section className="ln-faq" aria-label="الأسئلة الشائعة">
      <div className="ln-faq-head">
        <span className="ln-label">{"07 — الأسئلة الشائعة"}</span>
        <RevealCssClass as="h2" className="ln-chapter-title" delay={1}>
          أسئلة <em>متكرّرة</em>
        </RevealCssClass>
        <RevealCssClass as="p" className="ln-chapter-lede" delay={2}>
          ما يسأله مدراء الصفحات قبل الربط.
        </RevealCssClass>
      </div>

      <div className="ln-faq-list">
        {FAQS.map((f, i) => (
          <RevealCssClass as="details" className="ln-faq-item" key={f.q} delay={((i % 5) + 1) as 1 | 2 | 3 | 4 | 5}>
            <summary className="ln-faq-q">
              {f.q}
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <p className="ln-faq-a">{f.a}</p>
          </RevealCssClass>
        ))}
      </div>
    </section>
  );
}
