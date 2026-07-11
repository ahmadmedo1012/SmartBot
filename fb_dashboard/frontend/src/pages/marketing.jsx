export function Marketing() {
  return (
    <section className="page active" dir="rtl">
      <div className="page-header">
        <h1>التسويق</h1>
        <p>الحملات التسويقية والعروض</p>
      </div>
      <div className="content-card glass">
        <div className="cc-header">
          <div className="cc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            الحملات النشطة
          </div>
        </div>
        <div className="post-card">
          <div className="post-img" style={{ background: "var(--accent-soft)" }} />
          <div className="post-info">
            <h3>خصم الصيف – 20% على جميع الطلبات</h3>
            <p>ساري حتى 31 يوليو · 234 مستفيداً</p>
          </div>
          <span className="badge badge-s">نشطة</span>
        </div>
        <div className="post-card">
          <div className="post-img" style={{ background: "var(--info-soft)" }} />
          <div className="post-info">
            <h3>أطلب مرتين واحصل على الثالثة مجاناً</h3>
            <p>ساري حتى 15 أغسطس · 112 مستفيداً</p>
          </div>
          <span className="badge badge-s">نشطة</span>
        </div>
      </div>
    </section>
  )
}
