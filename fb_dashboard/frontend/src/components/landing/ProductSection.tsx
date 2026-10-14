import Link from "next/link";
import { Bot, LineChart, MessageSquare } from "lucide-react";
import { RevealCssClass } from "@/hooks/useReveal";
import { CircuitTrace } from "@/components/shared/CircuitTrace";

/* v16-r142 «رفيق» — «المنصة الحقيقية»: the product shown HONESTLY.
 *
 * phase5 r152: the two gold-era raster captures (demo-inbox.webp /
 * demo-analytics.webp — real screenshots of the RETIRED design) are
 * replaced by LIVE mini-boards: the same surface shapes (unified inbox
 * conversation rows · analytics bars) rendered in the product's own
 * petrol tokens, on the declared MOCK dataset — the caption says exactly
 * that («نسخة التجربة ببيانات وهمية»), and the CTA hands the visitor the
 * REAL /demo surface to try. No stale captures, no invented numbers: the
 * analytics panel carries no fabricated values — only the same KPI
 * grammar (labels + trend glyphs) the real board renders with live data.
 *
 * The rail chips enumerate shipped dashboard routes only: inbox,
 * broadcasts, scheduling, PDF reports, team roles, sequences, targeting
 * (fb_dashboard/routers/*). */

const INBOX_ROWS = [
  { name: "سارة م.", msg: "كم سعر الباقة الاحترافية؟", ai: true, time: "21:41" },
  { name: "أحمد ع.", msg: "أبغى أحجز موعد بكرة الصبح", ai: true, time: "21:12" },
  { name: "ليلى ك.", msg: "الطلب رقم 1047 لم يصل بعد", ai: false, time: "19:58" },
  { name: "محمد ص.", msg: "شكراً على الرد السريع 🙏", ai: false, time: "18:20" },
] as const;

const ANALYTICS_BARS = [34, 52, 41, 66, 58, 78, 62, 88, 74, 96] as const;

export function ProductSection() {
  return (
    <section id="platform" className="ln-chapter ln-product" aria-label="المنصة الحقيقية">
      <div className="ln-chapter-head">
        <span className="ln-label">{"03 — المنصة الحقيقية · THE REAL THING"}</span>
        <RevealCssClass as="h2" className="ln-chapter-title" delay={1}>
          هذه ليست واجهة تسويقية — <em>هي المنصّة نفسها</em>
        </RevealCssClass>
        <RevealCssClass as="p" className="ln-chapter-lede" delay={2}>
          لوحات من شكل المنصة الفعلي (نسخة التجربة ببيانات وهمية): صندوق
          الوارد الموحد والتحليلات. ما تراه هنا هو ما تحصل عليه بعد الربط.
        </RevealCssClass>
      </div>

      <div className="ln-product-grid">
        <RevealCssClass className="ln-product-window w1" delay={2}>
          <div className="ln-product-bar" aria-hidden="true">
            <i />
            <i />
            <i />
            <span className="ln-mono">bot.smart-link.ly/demo</span>
          </div>
          {/* the circuit-trace accent — the machine-room signature rail
              under the window chrome (live node = the automation signal) */}
          <CircuitTrace variant="live" className="ln-pp-trace" />
          {/* the inbox mini-board — the real surface grammar, mock rows */}
          <div className="ln-product-panel" role="img" aria-label="لوحة تحكم SmartBot الحقيقية — صندوق الوارد الموحد بمحادثات العملاء والردود (نسخة تجربة ببيانات وهمية)">
            <div className="ln-pp-head">
              <MessageSquare size={14} aria-hidden="true" />
              <span>صندوق الوارد الموحّد</span>
              <span className="ln-pp-badge">3 محادثات جديدة</span>
            </div>
            <ul className="ln-pp-rows">
              {INBOX_ROWS.map((r) => (
                <li key={r.name} className="ln-pp-row">
                  <span className="ln-pp-avatar" aria-hidden="true">{r.name.slice(0, 1)}</span>
                  <span className="ln-pp-msg">
                    <b>{r.name}</b>
                    {r.msg}
                  </span>
                  {r.ai ? <span className="ln-pp-ai" title="رد آلي">AI</span> : <span className="ln-pp-team" title="بحاجة لفريقك">فريقك</span>}
                  <span className="ln-pp-time ln-mono">{r.time}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="ln-product-cap">
            <b>صندوق الوارد الموحّد</b>
            كل رسائل وتعليقات صفحاتك في مكان واحد — مع الردود الآلية بجانبها.
          </p>
        </RevealCssClass>

        <RevealCssClass className="ln-product-window w2" delay={3}>
          <div className="ln-product-bar" aria-hidden="true">
            <i />
            <i />
            <i />
            <span className="ln-mono">bot.smart-link.ly/demo</span>
          </div>
          {/* the circuit-trace accent — twin of the inbox window above */}
          <CircuitTrace variant="live" className="ln-pp-trace" />
          {/* the analytics mini-board — the KPI grammar with NO fabricated
              values: bars are the trend shape, labels are the real metrics */}
          <div className="ln-product-panel" role="img" aria-label="لوحة تحكم SmartBot الحقيقية — التحليلات واتجاهات النشاط (نسخة تجربة ببيانات وهمية)">
            <div className="ln-pp-head">
              <LineChart size={14} aria-hidden="true" />
              <span>التحليلات والأداء</span>
              <span className="ln-pp-badge">7 أيام</span>
            </div>
            <div className="ln-pp-bars" aria-hidden="true">
              {ANALYTICS_BARS.map((h, i) => (
                <i key={i} style={{ blockSize: `${h}%` }} />
              ))}
            </div>
            <div className="ln-pp-kpis">
              <span className="ln-pp-kpi"><b>الردود الآلية</b><Bot size={12} aria-hidden="true" /></span>
              <span className="ln-pp-kpi"><b>التفاعل</b></span>
              <span className="ln-pp-kpi"><b>نمو الجمهور</b></span>
            </div>
          </div>
          <p className="ln-product-cap">
            <b>التحليلات والأداء</b>
            اتجاهات النشاط، أفضل القواعد، ونمو الجمهور — أرقام تقرأ ولا تُخمَّن.
          </p>
        </RevealCssClass>
      </div>

      <RevealCssClass as="ul" className="ln-product-rails" delay={4} aria-label="قدرات المنصة المشحونة في الإنتاج">
        <li className="ln-product-rail ln-mono">صندوق موحّد</li>
        <li className="ln-product-rail ln-mono">بث جماعي</li>
        <li className="ln-product-rail ln-mono">جدولة منشورات</li>
        <li className="ln-product-rail ln-mono">تقارير PDF</li>
        <li className="ln-product-rail ln-mono">أدوار وصلاحيات</li>
        <li className="ln-product-rail ln-mono">تسلسلات ردود</li>
        <li className="ln-product-rail ln-mono">استهداف جمهور</li>
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
