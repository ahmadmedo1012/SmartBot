import Link from "next/link";

/* r128 Stage B (F3b) — the landing's own footer (canonical
 * LandingPage ground-plate footer anatomy). ln-styled, real routes
 * only: every Link targets an existing SmartBot surface
 * (/pricing /demo /subscribe /login /register /privacy /terms) or a
 * landing anchor. The product Footer keeps serving the app surfaces. */

export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="landing-footer">
      <div className="marketing-container">
        <div className="landing-footer-grid">
          <div className="landing-footer-col">
            <Link href="/" className="landing-brand" aria-label="SmartBot — الرئيسية">
              <span className="landing-brand-mark" aria-hidden="true">S</span>
              <span className="landing-brand-text">
                <span className="landing-brand-name">SmartBot</span>
                <span className="landing-brand-sub">إدارة صفحات فيسبوك</span>
              </span>
            </Link>
            <p className="landing-footer-about">
              منصة إدارة صفحات فيسبوك الذكية — أتمتة الردود والتحليلات
              لصفحات فيسبوك في ليبيا.
            </p>
          </div>

          <div className="landing-footer-col">
            <div className="landing-footer-heading">الرحلة</div>
            <a href="#features" className="landing-footer-link">الميزات</a>
            <a href="#journey" className="landing-footer-link">رحلة التشغيل</a>
            <a href="#progress" className="landing-footer-link">قصة التقدّم</a>
            <a href="#plate" className="landing-footer-link">القنوات</a>
            <a href="#roles" className="landing-footer-link">الأدوار</a>
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
        </div>

        <div className="landing-footer-bottom">
          <span className="ln-mono">
            © {year} SmartBot — جميع الحقوق محفوظة
          </span>
          <span className="ln-footer-cluster">صُنع في ليبيا</span>
        </div>
      </div>
    </footer>
  );
}
