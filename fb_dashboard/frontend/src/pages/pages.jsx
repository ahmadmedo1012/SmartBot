import { useQuery } from "@tanstack/react-query"
import { fetchFacebookSettings, fetchEnv } from "@/lib/api"
import { useAdaptiveInterval } from "@/hooks/use-refresh-engine"

function LoadingSkeleton() {
  return (
    <section className="page active" dir="rtl">
      <div className="page-header reveal-blur">
        <div className="skeleton skeleton-text" style={{ width: "100px", height: "28px" }} />
        <div className="skeleton skeleton-text" style={{ width: "160px", height: "14px", marginTop: "6px" }} />
      </div>
      <div className="stats-grid">
        {[1, 2].map((i) => (
          <div key={i} className="card glass" style={{ padding: "18px" }}>
            <div className="skeleton skeleton-text" style={{ width: "60px", height: "12px" }} />
            <div className="skeleton skeleton-text" style={{ width: "80px", height: "28px", marginTop: "8px" }} />
          </div>
        ))}
      </div>
      <div className="content-card glass card-premium">
        {[1, 2, 3].map((i) => (
          <div key={i} className="post-card">
            <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
            <div className="post-info" style={{ flex: 1 }}>
              <div className="skeleton skeleton-text" style={{ width: "120px", height: "14px" }} />
              <div className="skeleton skeleton-text" style={{ width: "180px", height: "12px", marginTop: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <section className="page active" dir="rtl" style={{animation:"pageIn 0.35s var(--ease)"}}>
      <div className="page-header reveal-blur">
        <h1 className="gradient-text">الصفحات</h1>
        <p>إدارة صفحات فيسبوك المتصلة</p>
      </div>
      <div className="empty-state">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4">
          <circle cx="24" cy="24" r="20"/><path d="M24 16v8"/><path d="M24 28v.01"/>
        </svg>
        <h2>حدث خطأ في التحميل</h2>
        <p>{message || "تعذر تحميل بيانات الصفحات"}</p>
        <button className="btn btn-primary" onClick={onRetry} style={{boxShadow:"var(--shadow-glow)"}}>إعادة المحاولة</button>
      </div>
    </section>
  )
}

export function Pages() {
  const interval = useAdaptiveInterval("normal")

  const { data: fbSettings, isLoading: fbLoading, error: fbError, refetch: refetchFb } = useQuery({
    queryKey: ["facebook-settings"],
    queryFn: fetchFacebookSettings,
    staleTime: 30000,
    refetchInterval: interval,
  })

  const { data: env } = useQuery({
    queryKey: ["env"],
    queryFn: fetchEnv,
    staleTime: 60000,
  })

  const isLoading = fbLoading
  const error = fbError

  if (error && !isLoading) {
    return <ErrorState message={error?.message} onRetry={() => refetchFb()} />
  }

  if (isLoading) return <LoadingSkeleton />

  const connected = fbSettings?.connected && fbSettings?.page_id
  const pageName = fbSettings?.page_name || fbSettings?.page_id || ""
  const hasToken = env?.has_fb_token ?? fbSettings?.has_token

  return (
    <section className="page active" dir="rtl" style={{ position: "relative", animation: "pageIn 0.35s var(--ease)" }}>
      <div className="mesh-bg"></div>
      <div className="page-header reveal-blur">
        <h1 className="gradient-text">الصفحات</h1>
        <p>إدارة صفحات فيسبوك المتصلة</p>
      </div>

      <div className="stats-grid stagger-children" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        <div className="stat-card glass glass-card card-premium card-hover-lift">
          <div className="stat-label">حالة الاتصال</div>
          <div className="stat-value" style={{ color: connected ? "var(--success)" : "var(--danger)" }}>
            {connected ? "متصل" : "غير متصل"}
          </div>
        </div>
        {connected && (
          <div className="stat-card glass glass-card card-premium card-hover-lift">
            <div className="stat-label">معرف الصفحة</div>
            <div className="stat-value" style={{ fontSize: 16 }}>{fbSettings.page_id}</div>
          </div>
        )}
        <div className="stat-card glass glass-card card-premium card-hover-lift">
          <div className="stat-label">رمز الوصول</div>
          <div className="stat-value" style={{ color: hasToken ? "var(--success)" : "var(--muted)", fontSize: 16 }}>
            {hasToken ? "موجود" : "غير موجود"}
          </div>
        </div>
      </div>

      {connected ? (
        <div className="content-card glass card-premium">
          <div className="post-card">
            <div className="post-img" style={{ background: "var(--accent)" }} />
            <div className="post-info">
              <h3>{pageName || "الصفحة المتصلة"}</h3>
              <p>{fbSettings.page_id && <>المعرف: {fbSettings.page_id} · </>}الحالة: <span style={{ color: "var(--success)" }}>نشطة</span></p>
            </div>
            <span className="badge badge-s" style={{ background: "var(--success)", color: "#fff" }}>نشطة</span>
          </div>
        </div>
      ) : (
        <div className="content-card glass card-premium">
          <div className="empty-state" style={{ padding: "32px 0" }}>
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" style={{ marginBlockEnd: "var(--space-md)" }}>
              <rect x="4" y="8" width="48" height="40" rx="4" />
              <circle cx="28" cy="26" r="6" />
              <path d="M16 44c0-6.627 5.373-12 12-12s12 5.373 12 12" />
            </svg>
            <h2>لم يتم ربط أي صفحة فيسبوك</h2>
            <p style={{ maxWidth: 420, margin: "0 auto", lineHeight: 1.7 }}>
              لربط صفحة فيسبوك، تأكد من تعيين متغيري البيئة التاليين في لوحة تحكم Render:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBlock: "var(--space-md)", alignItems: "center" }}>
              <code style={{ background: "var(--surface)", padding: "6px 14px", borderRadius: 8, fontSize: 13, direction: "ltr" }}>FACEBOOK_ACCESS_TOKEN</code>
              <code style={{ background: "var(--surface)", padding: "6px 14px", borderRadius: 8, fontSize: 13, direction: "ltr" }}>FACEBOOK_PAGE_ID</code>
            </div>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              بعد التعديل، أعد تشغيل التطبيق من لوحة تحكم Render.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
