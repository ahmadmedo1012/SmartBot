import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { useAdaptiveInterval } from "@/hooks/use-refresh-engine"
import { fetchDashboardBundle } from "@/lib/api"
import { format } from "date-fns"
import { arSA } from "date-fns/locale"

function LoadingSkeleton() {
  return (
    <section className="page active" dir="rtl">
      <div className="page-header">
        <div className="skeleton skeleton-text" style={{ width: "140px", height: "28px" }} />
        <div className="skeleton skeleton-text" style={{ width: "180px", height: "14px", marginTop: "6px" }} />
      </div>
      <div className="stats-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card glass" style={{ padding: "18px" }}>
            <div className="skeleton skeleton-text" style={{ width: "70px", height: "12px" }} />
            <div className="skeleton skeleton-text" style={{ width: "50px", height: "28px", marginTop: "8px" }} />
          </div>
        ))}
      </div>
    </section>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <section className="page active" dir="rtl">
      <div className="page-header">
        <h1>لوحة البيانات</h1>
        <p>نظرة عامة على أداء صفحتك</p>
      </div>
      <div className="empty-state">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4">
          <circle cx="24" cy="24" r="20"/><path d="M24 16v8"/><path d="M24 28v.01"/>
        </svg>
        <h2>حدث خطأ في التحميل</h2>
        <p>{message || "تعذر تحميل بيانات لوحة التحكم"}</p>
        <button className="btn btn-primary" onClick={onRetry}>إعادة المحاولة</button>
      </div>
    </section>
  )
}

const statIcons = {
  total: <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a9.5 9.5 0 1 1-19 0 9.5 9.5 0 0 1 19 0z"/><path d="M11 7v5l3 3"/></svg>,
  today: <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M4 1v4"/><path d="M18 1v4"/><path d="M2 9h20"/></svg>,
  fans: <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  rules: <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="4" height="4" rx="1"/><rect x="9" y="16" width="4" height="4" rx="1"/><rect x="2" y="9" width="4" height="4" rx="1"/><rect x="16" y="9" width="4" height="4" rx="1"/></svg>,
}

function formatNum(n) {
  if (n == null) return "0"
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M"
  if (n >= 1000) return (n / 1000).toFixed(1) + "k"
  return n.toLocaleString()
}

export function Dashboard(_p) {
  const dashInterval = useAdaptiveInterval("critical")

  const { data: bundle, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard-bundle"],
    queryFn: fetchDashboardBundle,
    staleTime: 5000,
    refetchInterval: dashInterval,
    retry: 2,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: true,
  })

  const stats = bundle?.stats
  const activities = bundle?.recent_activity
  const recentReplies = bundle?.recent_replies || []
  const rules = bundle?.rules || []
  const activeRules = bundle?.active_rules_count || 0
  const botStatus = bundle?.bot_status

  const chartData = useMemo(() => {
    if (!stats?.chart) return []
    return Object.entries(stats.chart).map(([d, c]) => ({
      label: (() => { try { return new Date(d).toLocaleDateString("ar-SA", { weekday: "short", day: "numeric" }) } catch { return d } })(),
      count: c,
    }))
  }, [stats])

  const maxCount = Math.max(...chartData.map(d => d.count), 1)

  // error state
  if (error && !isLoading) {
    return <ErrorState message={error?.message} onRetry={() => refetch()} />
  }

  // loading
  if (isLoading && !stats) return <LoadingSkeleton />

  return (
    <section className="page active" dir="rtl" style={{position:"relative"}}>
      <div className="mesh-bg"></div>
      {/* page header */}
      <div className="page-header">
        <h1>لوحة البيانات</h1>
        <p>نظرة عامة على أداء صفحتك</p>
      </div>

      {/* stats grid */}
      <div className="stats-grid stagger-children">
        <div className="stat-card glass">
          <div className="stat-icon" data-color="">{statIcons.total}</div>
          <div className="stat-label">آخر 7 أيام</div>
          <div className="stat-value">{formatNum(stats?.total_replies)}</div>
          {stats?.week_trend !== undefined && (
            <div className={`stat-change ${stats.week_trend >= 0 ? "stat-up" : "stat-down"}`}>
              {stats.week_trend >= 0 ? "↑" : "↓"} {Math.abs(stats.week_trend)}%
            </div>
          )}
        </div>
        <div className="stat-card glass">
          <div className="stat-icon" data-color="success">{statIcons.today}</div>
          <div className="stat-label">ردود اليوم</div>
          <div className="stat-value">{formatNum(stats?.today_replies)}</div>
          {stats?.today_trend !== undefined && (
            <div className={`stat-change ${stats.today_trend >= 0 ? "stat-up" : "stat-down"}`}>
              {stats.today_trend >= 0 ? "↑" : "↓"} {Math.abs(stats.today_trend)}%
            </div>
          )}
        </div>
        <div className="stat-card glass">
          <div className="stat-icon" data-color="danger">{statIcons.fans}</div>
          <div className="stat-label">المتابعون</div>
          <div className="stat-value">{formatNum(stats?.fan_count)}</div>
        </div>
        <div className="stat-card glass">
          <div className="stat-icon" data-color="warn">{statIcons.rules}</div>
          <div className="stat-label">القواعد النشطة</div>
          <div className="stat-value">{activeRules}</div>
          {botStatus?.running !== undefined && (
            <div className={`stat-change ${botStatus.running ? "stat-up" : "stat-down"}`}>
              {botStatus.running ? "↑ نشط" : "↓ متوقف"}
            </div>
          )}
        </div>
      </div>

      {/* metrics row */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBlockEnd: "var(--space-lg)" }}>
        <div className="stat-card glass" style={{ textAlign: "center", padding: "14px" }}>
          <div className="stat-value" style={{ fontSize: "22px", color: "var(--accent)" }}>{stats?.today_replies || 0}</div>
          <div className="stat-label">ردود اليوم</div>
        </div>
        <div className="stat-card glass" style={{ textAlign: "center", padding: "14px" }}>
          <div className="stat-value" style={{ fontSize: "22px", color: "var(--info)" }}>{rules.length || 0}</div>
          <div className="stat-label">قاعدة نشطة</div>
        </div>
        <div className="stat-card glass" style={{ textAlign: "center", padding: "14px" }}>
          <div className="stat-value" style={{ fontSize: "22px", color: "var(--success)" }}>{stats?.total_replies ? Math.round(stats.today_replies / stats.total_replies * 100) : 0}%</div>
          <div className="stat-label">معدل التفاعل</div>
        </div>
        <div className="stat-card glass" style={{ textAlign: "center", padding: "14px" }}>
          <div className="stat-value" style={{ fontSize: "22px", color: "var(--warn)" }}>
            {recentReplies.length}
          </div>
          <div className="stat-label">بانتظار الرد</div>
        </div>
      </div>

      {/* chart */}
      <div className="card glass" style={{ marginBlockEnd: "var(--space-lg)" }}>
        <div className="cc-header">
          <h2 className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            النشاط اليومي</h2>
          <span className="cc-count">{stats?.total_replies || 0} رد</span>
        </div>
        {chartData.length >= 2 ? (<>
          <div className="chart-line" style={{ marginTop: "var(--space-md)" }}>
            {chartData.map((d, i) => (
              <div key={i} className="cl-bar" style={{ height: `${Math.max((d.count / maxCount) * 100, 4)}%` }}>
                <span className="cl-label">{d.label}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted)", marginBlockStart: "var(--space-xs)", paddingInline: "var(--space-2xs)" }}>
            {chartData.map((d, i) => (
              <span key={i}>{d.label}</span>
            ))}
          </div>
        </>) : (
          <div className="empty-state" style={{ padding: "32px 0" }}>
            <p style={{ color: "var(--muted)", fontSize: "13px" }}>بيانات غير كافية بعد</p>
          </div>
        )}
      </div>

      {/* row-2: activity + table */}
      <div className="row-2">
        {/* activity */}
        <div className="card glass">
          <h2 className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            آخر النشاطات</h2>
          {activities?.length > 0 ? (
            <div className="activity-list" style={{ marginTop: "4px" }}>
              {activities.slice(0, 5).map((a, i) => (
                <div key={i} className="activity-item">
                  <span className="activity-dot"
                    style={{ background: a.type === "reply" ? "var(--accent)" : "var(--muted)" }} />
                  <div>
                    <div className="activity-text">{a.text}</div>
                    <div className="activity-time">{a.time ? format(new Date(a.time), "MMM d, HH:mm", { locale: arSA }) : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "32px 0" }}>
              <h2>لا يوجد نشاط حديث</h2>
              <p>سيظهر النشاط هنا عند حدوثه</p>
            </div>
          )}
        </div>

        {/* recent replies table */}
        <div className="card glass">
          <div className="cc-header" style={{ marginBlockEnd: "var(--space-md)" }}>
            <h2 className="cc-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              آخر الردود</h2>
          </div>
          {recentReplies.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>صاحب التعليق</th>
                    <th>التعليق</th>
                    <th>الرد</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {recentReplies.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.commenter_name}</td>
                      <td style={{ color: "var(--muted)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.comment_text}
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: "12px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.reply_text}
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: "12px", whiteSpace: "nowrap" }}>
                        {r.created_at ? format(new Date(r.created_at), "yyyy/MM/dd HH:mm", { locale: arSA }) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "32px 0" }}>
              <h2>لا توجد ردود بعد</h2>
              <p>عندما يرد البوت على التعليقات، ستظهر هنا</p>
            </div>
          )}
        </div>
      </div>

      {/* quick actions */}
      <div className="qactions">
        <button className="btn btn-primary" onClick={() => refetch()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 8a6 6 0 0 1 11.3-2.7M14 8a6 6 0 0 1-11.3 2.7"/><path d="M14 1.5V5.5H10"/><path d="M2 14.5V10.5H6"/></svg>
          تحديث البيانات
        </button>
      </div>
    </section>
  )
}
