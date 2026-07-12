import { useState, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchAnalyticsOverview, fetchHourlyStats, fetchRules, fetchReplies } from "@/lib/api"
import { format } from "date-fns"

function exportCSV(data, filename) {
  if (!data.length) return
  const header = Object.keys(data[0]).join(",")
  const rows = data.map(r => Object.values(r).map(v => `"${v}"`).join(","))
  const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" })
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function MiniBar({ data, dataKey, color = "var(--accent)" }) {
  const max = Math.max(...data.map(d => d[dataKey]), 1)
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:2,height:180,padding:"8px 0",overflowX:"auto"}}>
      {data.map((d, i) => {
        const pct = (d[dataKey] / max) * 100
        return (
          <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,minWidth:24,position:"relative"}}>
            <span style={{fontSize:9,color:"var(--muted)",opacity:pct>30?1:0}}>{d[dataKey]}</span>
            <div style={{width:"100%",height:`${Math.max(pct,2)}%`,background:color,borderRadius:"4px 4px 0 0",minHeight:2,transition:"height 0.3s"}} />
            <span style={{fontSize:8,color:"var(--muted)",opacity:0.6,whiteSpace:"nowrap"}}>{d.date || d.hour}</span>
          </div>
        )
      })}
    </div>
  )
}

export function Reports() {
  useEffect(() => { document.title = "التقارير | SmartBot" }, [])
  const [days, setDays] = useState("7")

  const { data: analytics, isLoading: aLoading } = useQuery({
    queryKey: ["analytics-overview", days], queryFn: () => fetchAnalyticsOverview(parseInt(days)),
  })
  const { data: hourly, isLoading: hLoading } = useQuery({
    queryKey: ["hourly-stats"], queryFn: fetchHourlyStats,
  })
  const { data: rules = [] } = useQuery({ queryKey: ["rules"], queryFn: fetchRules })
  const { data: repliesRes } = useQuery({
    queryKey: ["replies-all"], queryFn: () => fetchReplies(1, 100),
  })

  const chartData = useMemo(() => analytics?.daily_breakdown
    ? Object.entries(analytics.daily_breakdown).map(([d, c]) => ({
        date: (() => { try { return new Date(d).toLocaleDateString("ar-SA", { month: "short", day: "numeric" }) } catch { return d } })(),
        replies: c
      }))
    : [], [analytics])

  const topRules = useMemo(() => analytics?.top_rules?.map(t => ({
    name: rules.find(r => r.id === t.rule_id)?.name || `#${t.rule_id}`,
    count: t.count,
  })) || [], [analytics, rules])

  const pieData = useMemo(() => {
    const sd = analytics?.sentiment_distribution || {}
    return [
      { name: "إيجابي", value: sd.إيجابي || 0, color: "hsl(152, 72%, 26%)" },
      { name: "سلبي", value: sd.سلبي || 0, color: "hsl(0, 88%, 50%)" },
      { name: "محايد", value: sd.محايد || 0, color: "hsl(211, 92%, 42%)" },
    ].filter(d => d.value > 0)
  }, [analytics])

  const allReplies = repliesRes?.items || []

  return (
    <section className="page active" dir="rtl" data-od-id="page-reports" style={{position:"relative"}}>
      <div className="mesh-bg"></div>
      <div className="page-header">
        <h1>التقارير</h1>
        <p>تحليلات متقدمة لأداء البوت والتفاعلات</p>
      </div>

      <div className="qactions">
        <select className="fld" value={days} onChange={e => setDays(e.target.value)} style={{width:120}}>
          <option value="7">7 أيام</option>
          <option value="30">30 يوم</option>
          <option value="90">90 يوم</option>
        </select>
        <button className="btn btn-outline" style={{fontSize:12}} onClick={() => exportCSV(allReplies, `reports-${format(new Date(), "yyyy-MM-dd")}.csv`)} disabled={!allReplies.length}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          تصدير
        </button>
      </div>

      <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
        {[
          { label: "إجمالي الردود", value: analytics?.total_replies || 0 },
          { label: "ردود اليوم", value: analytics?.today_replies || 0 },
          { label: "المتابعون", value: analytics?.fan_count || "—" },
          { label: "ذروة النشاط", value: analytics?.peak_hour != null ? `${analytics.peak_hour}:00` : "—" },
        ].map(s => (
          <div key={s.label} className="stat-card glass" style={{textAlign:"center"}}>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="stats-grid" style={{gridTemplateColumns:"repeat(2,1fr)"}}>
        <div className="card glass" style={{padding:16}}>
          <div className="cc-header" style={{padding:0,marginBlockEnd:8}}>
            <div className="cc-title" style={{fontSize:13}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              الاتجاه اليومي
            </div>
          </div>
          {aLoading ? <div className="stat-card glass skel-card-200" /> :
           chartData.length > 1 ? <MiniBar data={chartData} dataKey="replies" /> :
           <p className="empty-state" style={{padding:40}}>بيانات غير كافية</p>}
        </div>

        <div className="card glass" style={{padding:16}}>
          <div className="cc-header" style={{padding:0,marginBlockEnd:8}}>
            <div className="cc-title" style={{fontSize:13}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              التوزيع الساعي
            </div>
          </div>
          {hLoading ? <div className="stat-card glass skel-card-200" /> :
           hourly?.length > 0 ? <MiniBar data={hourly.map(h => ({...h, hour: `${h.hour}`}))} dataKey="count" color="var(--info)" /> :
           <p className="empty-state" style={{padding:40}}>لا توجد بيانات</p>}
        </div>

        <div className="card glass" style={{padding:16}}>
          <div className="cc-header" style={{padding:0,marginBlockEnd:8}}>
            <div className="cc-title" style={{fontSize:13}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
              توزيع المشاعر
            </div>
          </div>
          {pieData.length > 0 ? (
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:24,padding:"20px 0"}}>
              <div style={{width:160,height:160,borderRadius:"50%",background:`conic-gradient(${pieData.map((e,i,a) => {
                const pct = (e.value / a.reduce((s,x) => s + x.value, 0)) * 100
                const start = a.slice(0,i).reduce((s,x) => s + (x.value / a.reduce((t,y) => t + y.value, 0)) * 360, 0)
                return `${e.color} ${start}deg ${start + pct * 3.6}deg`
              }).join(", ")})`}} />
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {pieData.map(e => (
                  <div key={e.name} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                    <span style={{width:12,height:12,borderRadius:"50%",background:e.color}} />
                    <span>{e.name}</span>
                    <span style={{color:"var(--muted)",fontFamily:"monospace"}}>{e.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="empty-state" style={{padding:40}}>لا توجد بيانات مشاعر</p>}
        </div>

        <div className="card glass" style={{padding:16}}>
          <div className="cc-header" style={{padding:0,marginBlockEnd:8}}>
            <div className="cc-title" style={{fontSize:13}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              أفضل القواعد
            </div>
          </div>
          {topRules.length > 0 ? (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {topRules.slice(0, 8).map((r, i) => {
                const maxC = Math.max(...topRules.map(x => x.count), 1)
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}>
                    <span style={{color:"var(--muted)",width:16,textAlign:"left",fontFamily:"monospace",fontSize:11}}>{i + 1}.</span>
                    <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</span>
                    <span style={{color:"var(--muted)",fontFamily:"monospace",fontSize:11}}>{r.count}</span>
                    <div style={{width:80,height:8,borderRadius:4,background:"var(--skeleton)",overflow:"hidden"}}>
                      <div style={{height:"100%",background:"var(--accent)",borderRadius:4,width:`${(r.count / maxC) * 100}%`}} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : <p className="empty-state" style={{padding:40}}>لا توجد بيانات</p>}
        </div>
      </div>

      <div className="mobile-nav-spacer" />
    </section>
  )
}
