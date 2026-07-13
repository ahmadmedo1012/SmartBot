import { useQuery } from "@tanstack/react-query"
import { useMemo, useState, useEffect, useRef } from "react"
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion"
import { useAdaptiveInterval } from "@/hooks/use-refresh-engine"
import { fetchDashboardBundle } from "@/lib/api"
import { Clock, Calendar, Users, Grid, TrendingUp, Activity, AlertCircle, RefreshCw } from "lucide-react"
import { format } from "date-fns"
import { arSA } from "date-fns/locale"

const statCardVariant = {
  hidden: { opacity: 0, y: 12 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { type: "spring", stiffness: 240, damping: 22, mass: 0.6, delay: i * 0.05 } }),
}

function AnimatedStat({ value, suffix = "" }) {
  const ref = useRef(null)
  const prefersReducedMotion = useReducedMotion()
  const [display, setDisplay] = useState(0)
  const count = useMotionValue(0)
  const spring = useSpring(count, { stiffness: prefersReducedMotion ? 0 : 80, damping: 18, mass: 0.8 })
  const rounded = useTransform(spring, v => Math.floor(v))

  useEffect(() => {
    const unsub = rounded.on("change", setDisplay)
    return () => unsub()
  }, [rounded])

  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      count.set(value)
      obs.unobserve(el)
    }, { threshold: 0.5 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [value, count])

  const n = display >= 1000000 ? (display / 1000000).toFixed(1) + "M" + suffix
     : display >= 1000 ? (display / 1000).toFixed(1) + "k" + suffix
     : display.toLocaleString() + suffix

  return <span ref={ref}>{n}</span>
}

function LoadingSkeleton() {
  return (
    <section className="page active" dir="rtl">
      <div className="page-header">
        <div className="skeleton skeleton-text" style={{ width: "140px", height: "28px" }} />
        <div className="skeleton skeleton-text" style={{ width: "180px", height: "14px", marginTop: "6px" }} />
      </div>
      <div className="stats-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card glass card-premium card-hover-lift" style={{ padding: "18px" }}>
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
        <AlertCircle size={48} strokeWidth={1.5} opacity="0.4" style={{color: "var(--muted)"}} />
        <h2>حدث خطأ في التحميل</h2>
        <p>{message || "تعذر تحميل بيانات لوحة التحكم"}</p>
        <button className="btn btn-primary" onClick={onRetry}>إعادة المحاولة</button>
      </div>
    </section>
  )
}

const statIcons = {
  total: <Clock size={22} strokeWidth={1.8} />,
  today: <Calendar size={22} strokeWidth={1.8} />,
  fans: <Users size={22} strokeWidth={1.8} />,
  rules: <Grid size={22} strokeWidth={1.8} />,
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
    <section className="page active" dir="rtl">
      <div className="page-header">
        <h1>لوحة البيانات</h1>
        <p style={{color:"var(--muted)",fontSize:"14px"}}>نظرة عامة على أداء صفحتك</p>
      </div>

      {/* stats grid — framer stagger entry */}
      <div className="stats-grid">
        {[
          { icon: statIcons.total, color: "", label: "آخر 7 أيام", val: stats?.total_replies || 0, trend: stats?.trend?.week, cls: "stat-up", arrow: (stats?.trend?.week ?? 0) >= 0 ? "↑" : "↓" },
          { icon: statIcons.today, color: "success", label: "ردود اليوم", val: stats?.today_replies || 0, trend: stats?.trend?.today, cls: "stat-up", arrow: (stats?.trend?.today ?? 0) >= 0 ? "↑" : "↓" },
          { icon: statIcons.fans, color: "danger", label: "المتابعون", val: stats?.fan_count || 0 },
          { icon: statIcons.rules, color: "warn", label: "القواعد النشطة", val: activeRules, running: botStatus?.running },
        ].map((s, i) => (
          <motion.div key={s.label} className="stat-card glass-card card-premium card-hover-lift" custom={i} variants={statCardVariant} initial="hidden" animate="visible">
            <div className="stat-icon" data-color={s.color}>{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value"><AnimatedStat value={s.val} /></div>
            {s.trend !== undefined && (
              <div className={`stat-change ${s.trend >= 0 ? "stat-up" : "stat-down"}`}>
                <span className="status-dot" style={{background: s.trend >= 0 ? "var(--success)" : "var(--danger)"}} />
                {s.arrow} {Math.abs(s.trend)}%
              </div>
            )}
            {s.running !== undefined && (
              <div className={`stat-change ${s.running ? "stat-up" : "stat-down"}`}>
                {s.running ? "● نشط" : "● متوقف"}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* metrics row */}
      <div className="stats-grid" style={{ gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", marginBlockEnd: "var(--space-lg)" }}>
        <div className="stat-card glass-card card-premium card-hover-lift" style={{ textAlign: "center", padding: "14px" }}>
          <div className="stat-value" style={{ fontSize: "22px", color: "var(--accent)" }}>
            {stats?.fan_count ? (stats.fan_count >= 1000 ? (stats.fan_count / 1000).toFixed(1) + "k" : stats.fan_count) : 0}
          </div>
          <div className="stat-label">إجمالي المتابعين</div>
        </div>
        <div className="stat-card glass-card card-premium card-hover-lift" style={{ textAlign: "center", padding: "14px" }}>
          <div className="stat-value" style={{ fontSize: "22px", color: "var(--info)" }}>{rules.length || 0}</div>
          <div className="stat-label">قاعدة نشطة</div>
        </div>
        <div className="stat-card glass-card card-premium card-hover-lift" style={{ textAlign: "center", padding: "14px" }}>
          <div className="stat-value" style={{ fontSize: "22px", color: "var(--success)" }}>{stats?.total_replies ? Math.round(stats.today_replies / stats.total_replies * 100) : 0}%</div>
          <div className="stat-label">معدل التفاعل</div>
        </div>
        <div className="stat-card glass-card card-premium card-hover-lift" style={{ textAlign: "center", padding: "14px" }}>
          <div className="stat-value" style={{ fontSize: "22px", color: "var(--warn)" }}>
            {recentReplies.length}
          </div>
          <div className="stat-label">بانتظار الرد</div>
        </div>
      </div>

      {/* chart */}
      <div className="card glass card-premium card-hover-lift" style={{ marginBlockEnd: "var(--space-lg)" }}>
        <div className="cc-header">
          <h2 className="card-title">
            <TrendingUp size={18} strokeWidth={1.8} />
            النشاط اليومي</h2>
          <span className="cc-count">{stats?.total_replies || 0} رد</span>
        </div>
        {chartData.length >= 2 ? (<>
          <div className="chart-line" style={{ marginTop: "var(--space-md)" }}>
            {chartData.map((d, i) => (
              <div key={i} className="cl-bar chart-bar-grow" style={{ height: `${Math.max((d.count / maxCount) * 100, 4)}%`, animationDelay: `${i * 40}ms` }}>
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
        <div className="card glass card-premium card-hover-lift">
          <h2 className="card-title">
            <Activity size={18} strokeWidth={1.8} />
            آخر النشاطات</h2>
          {activities?.length > 0 ? (
            <div className="activity-list" style={{ marginTop: "4px" }}>
              {activities.slice(0, 5).map((a, i) => (
                <div key={i} className="activity-item activity-enter">
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
        <div className="card glass card-premium card-hover-lift">
          <div className="cc-header" style={{ marginBlockEnd: "var(--space-md)" }}>
            <h2 className="cc-title">
              <Clock size={18} strokeWidth={1.8} />
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
          <RefreshCw size={16} strokeWidth={1.8} />
          تحديث البيانات
        </button>
      </div>
    </section>
  )
}
