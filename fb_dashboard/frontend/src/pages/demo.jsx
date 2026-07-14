import { Bot, MessageCircle, BarChart3, Users, TrendingUp, Clock, Activity, Sparkles, ArrowLeft } from "lucide-react"

const mockStats = {
  replies_today: 327, replies_week: 1284, followers: 12500, rules: 3,
  active_hours: [45, 62, 38, 55, 70, 85, 92, 110, 88, 65, 42, 30, 48, 55, 72, 95, 130, 145, 120, 90, 65, 50, 35, 25],
  recent_replies: [
    { id: 1, commenter: "أحمد سالم", text: "كم سعر المنتج؟", reply: "سعر المنتج 120 د.ل", time: "منذ دقيقتين" },
    { id: 2, commenter: "مريم النفاتي", text: "هل يتوفر توصيل؟", reply: "نعم، التوصيل متوف", time: "منذ 5 دقائق" },
    { id: 3, commenter: "خالد المزوغي", text: "أريد تفاصيل أكثر", reply: "تفضل بزيارة موقعنا", time: "منذ 10 دقائق" },
    { id: 4, commenter: "فاطمة الصغير", text: "ممتاز!", reply: "شكراً لك! 😊", time: "منذ 15 دقيقة" },
  ],
  rules: [
    { name: "سعر", keyword: "سعر", count: 142, status: "active" },
    { name: "توصيل", keyword: "توصيل", count: 89, status: "active" },
    { name: "ترحيب", keyword: "مرحباً", count: 210, status: "active" },
  ],
}

export function DemoDashboard({ onGetStarted, onNavigate }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", direction: "rtl" }}>
      {/* Demo Top Bar */}
      <div className="page active" style={{ animation: "none" }}>
        <div className="grain-overlay" />
        <div className="app-shell">
          {/* Simplified Sidebar */}
          <aside className="sidebar">
            <div className="sidebar-header">
              <div className="sidebar-logo">S</div>
              <div className="sidebar-title">SmartBot<span>تجربة حية</span></div>
            </div>
            <nav className="sidebar-nav">
              {[
                { icon: BarChart3, label: "لوحة البيانات", active: true },
                { icon: MessageCircle, label: "الردود", active: false },
                { icon: Users, label: "الجمهور", active: false },
                { icon: Activity, label: "النشاطات", active: false },
                { icon: TrendingUp, label: "التحليلات", active: false },
                { icon: Clock, label: "جدولة", active: false },
              ].map((item, i) => (
                <div key={i} className={`nav-item ${item.active ? "active" : ""}`}>
                  <item.icon className="nav-icon" size={18} />
                  {item.label}
                </div>
              ))}
            </nav>
            <div style={{ padding: "12px 16px", borderTop: "1px solid color-mix(in oklch, var(--border) 20%, transparent)" }}>
              <button className="btn btn-primary" onClick={onGetStarted} style={{ width: "100%", justifyContent: "center", fontSize: 12 }}>
                <Sparkles size={14} /> ابدأ الاشتراك
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <div className="main">
            <header className="header">
              <div className="flex items-center gap-3">
                <button onClick={() => onNavigate && onNavigate("landing")} className="btn btn-sm btn-outline" style={{ padding: "4px 10px", fontSize: 11 }}>
                  <ArrowLeft size={14} /> العودة
                </button>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)", fontSize: 11 }}>
                  تجربة — بيانات وهمية
                </span>
              </div>
              <div className="header-left">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="status-dot status-dot-accent" />
                  <span style={{ fontSize: 12, color: "var(--success)" }}>البوت نشط</span>
                </div>
              </div>
            </header>

            <div className="content">
              {/* Stats Grid */}
              <div className="stats-grid stagger-children" style={{ marginBottom: 24 }}>
                <StatCard icon={MessageCircle} value={mockStats.replies_today} label="ردود اليوم" color="accent" />
                <StatCard icon={Activity} value={mockStats.replies_week} label="آخر 7 أيام" color="info" />
                <StatCard icon={Users} value={mockStats.followers.toLocaleString()} label="المتابعون" color="success" />
                <StatCard icon={Bot} value={mockStats.rules.length} label="قواعد نشطة" color="warn" />
              </div>

              <div className="row-2">
                {/* Activity Chart */}
                <div className="card glass glass-card card-premium" style={{ padding: 20 }}>
                  <div className="cc-header"><div className="cc-title"><BarChart3 size={16} /> النشاط اليومي (محاكاة)</div></div>
                  <div className="chart-line" style={{ height: 100, marginTop: 12 }}>
                    {mockStats.active_hours.map((v, i) => (
                      <div key={i} className="cl-bar" data-color="accent"
                        style={{ height: `${Math.max(4, (v / 150) * 100)}%` }}
                        title={`${i}:00 — ${v} رد`} />
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
                    <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="card glass glass-card card-premium" style={{ padding: 20 }}>
                  <div className="cc-header"><div className="cc-title"><Activity size={16} /> آخر الردود</div></div>
                  <div className="activity-list">
                    {mockStats.recent_replies.map((r) => (
                      <div key={r.id} className="activity-item" style={{ borderColor: "color-mix(in oklch, var(--border) 30%, transparent)" }}>
                        <div className="activity-dot" style={{ background: "var(--accent)" }} />
                        <div className="activity-text" style={{ flex: 1 }}>
                          <strong>{r.commenter}</strong>: {r.text}
                          <div className="text-xs" style={{ color: "var(--accent)", marginTop: 2 }}>→ {r.reply}</div>
                        </div>
                        <div className="activity-time">{r.time}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Rules */}
              <div className="card glass glass-card card-premium" style={{ padding: 20, marginBottom: 24 }}>
                <div className="cc-header"><div className="cc-title"><Bot size={16} /> قواعد الرد التلقائي</div></div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>القاعدة</th><th>الكلمة</th><th>عدد الردود</th><th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockStats.rules.map((r, i) => (
                        <tr key={i}>
                          <td><strong>{r.name}</strong></td>
                          <td><code className="code-inline">{r.keyword}</code></td>
                          <td>{r.count}</td>
                          <td><span className="badge badge-s">نشط</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* CTA */}
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>
                  هذه تجربة للوحة التحكم ببيانات وهمية. اشترك الآن لتفعيل البوت على صفحتك الحقيقية!
                </p>
                <button className="btn btn-primary magnetic-btn" onClick={onGetStarted}
                  style={{ borderRadius: "var(--radius-lg)", fontSize: 14, padding: "10px 28px", boxShadow: "var(--shadow-glow)" }}>
                  <Sparkles size={16} /> ابدأ الاشتراك المجاني
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, value, label, color }) {
  return (
    <div className="stat-card glass glass-card card-premium card-hover-lift">
      <div className="stat-icon" data-color={color}><Icon size={16} /></div>
      <div className="stat-value" style={{ color: "var(--fg)" }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
