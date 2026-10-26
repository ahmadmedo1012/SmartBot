import Link from "next/link";
import { CurrentYear } from "@/components/current-year";

/* v16-r142 «رفيق» — the landing's own footer (canonical
 * LandingPage ground-plate footer anatomy). ln-styled, real routes
 * only: every Link targets an existing SmartBot surface
 * (/pricing /demo /subscribe /login /register /privacy /terms) or a
 * companion-narrative anchor. The product Footer keeps serving the app
 * surfaces.
 * 15-SB acceptance wave: the sibling row — the ecosystem was the one
 * asymmetry left (order.smart-link.ly and menu.smart-link.ly both link
 * out; the رفيق footer linked nowhere). Plain external anchors with
 * rel="noopener noreferrer", same column anatomy — zero new CSS
 * (reference pattern: Smart-Order 86fb698 footer column). */

/* صف الأشقاء — الأهداف هي نطاقات المنظومة الثلاثة كما هي. r148
 * (19-AUDIT-CROSS R8): الأسماء العارية صارت «اسم — وصف» بصياغة الأسطول
 * الموحدة (تذييل SL 15-SL وتذييل SM — الكانون الحرفي:
 * «سمارت بوت — منصة إدارة فيسبوك الذكية» من تذييل SL نفسه)، والأوصاف من
 * هوية كل منتج المنشورة نفسها لا من الخيال، وهذه الصفحة لا تُذكر
 * (عقيدة «المائدة نفسها»). */
const ECOSYSTEM = [
  { href: "https://smart-link.ly", label: "الربط الذكي — منصة الأعمال المتكاملة" },
  { href: "https://menu.smart-link.ly", label: "سمارت منيو — قوائم QR التفاعلية" },
  { href: "https://order.smart-link.ly", label: "سمارت أوردر — منصة الطلبات الرقمية" },
];

export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="landing-footer">
      <div className="marketing-container">
        <div className="landing-footer-grid">
          <div className="landing-footer-col">
            {/* P26-A: same Label-in-Name fix as the header brand. */}
            <Link href="/" className="landing-brand" aria-label="SmartBot — إدارة صفحات فيسبوك — الرئيسية">
              <span className="landing-brand-mark" aria-hidden="true">S</span>
              <span className="landing-brand-text">
                <span className="landing-brand-name">SmartBot</span>
                <span className="landing-brand-sub">إدارة صفحات فيسبوك</span>
              </span>
            </Link>
            <p className="landing-footer-about">
              منصة إدارة فيسبوك الذكية — أتمتة الردود والتحليلات
              لصفحات فيسبوك في ليبيا.
            </p>
          </div>

          <div className="landing-footer-col">
            <div className="landing-footer-heading">رحلة الرفيق</div>
            <a href="#mind" className="landing-footer-link">لغة العقل</a>
            <a href="#day" className="landing-footer-link">يوم في الحياة</a>
            <a href="#platform" className="landing-footer-link">المنصّة الحقيقية</a>
            <a href="#trust" className="landing-footer-link">الأرقام</a>
          </div>

          <div className="landing-footer-col">
            <div className="landing-footer-heading">المنصّة</div>
            <Link href="/pricing" prefetch={false} className="landing-footer-link">الخطط والأسعار</Link>
            <Link href="/demo" prefetch={false} className="landing-footer-link">لوحة التجربة</Link>
            <Link href="/subscribe" prefetch={false} className="landing-footer-link">الاشتراك</Link>
            <Link href="/login" prefetch={false} className="landing-footer-link">تسجيل الدخول</Link>
            <Link href="/register" prefetch={false} className="landing-footer-link">إنشاء حساب</Link>
          </div>

          <div className="landing-footer-col">
            <div className="landing-footer-heading">المؤسسة</div>
            <Link href="/privacy" prefetch={false} className="landing-footer-link">سياسة الخصوصية</Link>
            <Link href="/terms" prefetch={false} className="landing-footer-link">شروط الاستخدام</Link>
          </div>

          <div className="landing-footer-col">
            <div className="landing-footer-heading">منظومة الربط الذكي</div>
            {ECOSYSTEM.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="landing-footer-link"
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>

        <div className="landing-footer-bottom">
          {/* r148 (19-AUDIT-CROSS R8): جزيرة السنة الحية — توأم SL
              (r140/LandingFooter.tsx:90)؛ كانت new Date().getFullYear()
              سيرفرية تتجمد زمن البناء. */}
          <span className="ln-mono">
            © <CurrentYear buildYear={year} /> SmartBot — جميع الحقوق محفوظة
          </span>
          <span className="ln-footer-cluster">صُنع في ليبيا</span>
        </div>
      </div>
    </footer>
  );
}
