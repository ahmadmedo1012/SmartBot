import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { motion, AnimatePresence } from "framer-motion"
import {
  Activity, AlertTriangle, Info, Bug, X, Download, PauseCircle, PlayCircle,
  Trash2, ChevronDown, ChevronLeft, AlertCircle, Terminal, Clock,
} from "lucide-react"

const LEVEL_CONFIG = {
  ERROR: { color: "bg-red-500/15 text-red-500 border-red-500/20", icon: AlertTriangle, dot: "bg-red-500" },
  WARN: { color: "bg-yellow-500/15 text-yellow-500 border-yellow-500/20", icon: AlertCircle, dot: "bg-yellow-500" },
  INFO: { color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20", icon: Info, dot: "bg-emerald-500" },
  DEBUG: { color: "bg-blue-500/10 text-blue-400 border-blue-500/15", icon: Bug, dot: "bg-blue-400" },
  TRACE: { color: "bg-gray-500/10 text-gray-400 border-gray-500/15", icon: Terminal, dot: "bg-gray-400" },
  FATAL: { color: "bg-red-600/20 text-red-600 border-red-600/25", icon: AlertTriangle, dot: "bg-red-600" },
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 1000) return "الآن"
  if (diff < 60000) return `${Math.floor(diff / 1000)}ث`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}د`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}س`
  return `${Math.floor(diff / 86400000)}ي`
}

function LogEntry({ event, expanded, onToggle }) {
  const cfg = LEVEL_CONFIG[event.level] || LEVEL_CONFIG.INFO
  const Icon = cfg.icon
  const hasDetails = event.latency_ms || event.comment_id || event.rule_id != null || event.intent || (event.extra && Object.keys(event.extra).length > 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      layout
      className={`group border-b border-border/30 last:border-0 transition-colors hover:bg-muted/30 ${
        event.level === "ERROR" || event.level === "FATAL" ? "bg-red-500/[0.02]" : ""
      }`}
    >
      <button
        onClick={onToggle}
        className="flex items-start gap-2.5 w-full px-3 py-2.5 text-right cursor-pointer"
      >
        <span className={`mt-0.5 size-2 shrink-0 rounded-full ${cfg.dot}`} />
        <Badge variant="outline" className={`shrink-0 text-[10px] font-mono font-semibold px-1.5 py-0 h-5 border ${cfg.color}`}>
          <Icon className="size-2.5 ml-1" />
          {event.level}
        </Badge>
        {event.module && (
          <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40">
            {event.module}
          </span>
        )}
        <span className="flex-1 text-xs text-foreground/85 text-right leading-relaxed min-w-0 break-words">
          {event.message}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground/50 font-mono whitespace-nowrap mt-0.5" data-tooltip={new Date(event.timestamp).toLocaleString("ar-SA")}>
          {timeAgo(event.timestamp)}
        </span>
        {hasDetails && (
          expanded ? <ChevronDown className="size-3 shrink-0 text-muted-foreground/40 mt-0.5" />
                  : <ChevronLeft className="size-3 shrink-0 text-muted-foreground/40 mt-0.5" />
        )}
      </button>
      {expanded && hasDetails && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="px-3 pb-2.5 pt-0 space-y-1"
        >
          <div className="flex flex-wrap gap-1.5 text-[10px] font-mono text-muted-foreground bg-muted/40 rounded-lg p-2">
            {event.latency_ms ? <span className="px-1.5 py-0.5 rounded bg-muted">⏱ {event.latency_ms}ms</span> : null}
            {event.comment_id ? <span className="px-1.5 py-0.5 rounded bg-muted">💬 {event.comment_id}</span> : null}
            {event.rule_id != null ? <span className="px-1.5 py-0.5 rounded bg-muted">📋 #{event.rule_id}</span> : null}
            {event.intent ? <span className="px-1.5 py-0.5 rounded bg-muted">🎯 {event.intent}</span> : null}
            {event.extra && Object.entries(event.extra).map(([k, v]) => (
              <span key={k} className="px-1.5 py-0.5 rounded bg-muted">{k}: {typeof v === "string" ? v : JSON.stringify(v)}</span>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground/60 font-mono">
            {new Date(event.timestamp).toLocaleString("ar-SA")}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

export function LiveLogs({ role }) {
  useEffect(() => { document.title = "السجل المباشر | SmartBot" }, [])
  const containerRef = useRef(null)
  const [events, setEvents] = useState([])
  const [paused, setPaused] = useState(false)
  const [filterLevel, setFilterLevel] = useState("")
  const [filterModule, setFilterModule] = useState("")
  const [filterText, setFilterText] = useState("")
  const [expanded, setExpanded] = useState(new Set())
  const [stats, setStats] = useState({ total_events: 0, error_rate: 0, by_level: {} })
  const [error, setError] = useState(false)
  const MAX_EVENTS = 500

  // Fetch initial batch and stats
  useEffect(() => {
    fetch("/api/logs/stream?limit=200")
      .then(r => r.json())
      .then(d => { setEvents(d.events || []); setError(false) })
      .catch(() => setError(true))
    fetch("/api/logs/stats")
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(() => {})
  }, [])

  // SSE connection for real-time log events
  useEffect(() => {
    const evtSource = new EventSource("/api/logs/realtime")
    evtSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        if (event.event === "heartbeat") return
        setStats(prev => ({
          total_events: prev.total_events + 1,
          error_rate: event.level === "ERROR" ? ((prev.error_rate * prev.total_events + 1) / (prev.total_events + 1)) : prev.error_rate,
          by_level: { ...prev.by_level, [event.level]: (prev.by_level[event.level] || 0) + 1 },
        }))
        setEvents(prev => {
          const next = [event, ...prev]
          return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next
        })
        setError(false)
      } catch {}
    }
    evtSource.onerror = () => { evtSource.close(); setError(true) }
    return () => evtSource.close()
  }, [])

  // Scroll to top (newest) unless user scrolled up
  useEffect(() => {
    if (!paused && containerRef.current) {
      containerRef.current.scrollTop = 0
    }
  }, [events, paused])

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (filterLevel && e.level !== filterLevel) return false
      if (filterModule && e.module !== filterModule) return false
      if (filterText) {
        const q = filterText.toLowerCase()
        if (!e.message.toLowerCase().includes(q) && !(e.module || "").toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [events, filterLevel, filterModule, filterText])

  const toggleExpand = useCallback((idx) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }, [])

  // Aggregate current error count for badge
  const recentErrorCount = useMemo(() =>
    events.filter(e => (e.level === "ERROR" || e.level === "FATAL")).length,
    [events]
  )

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `logs-${new Date().toISOString().slice(0, 19)}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  const clearLogs = () => { setEvents([]); setStats({ total_events: 0, error_rate: 0, by_level: {} }) }

  const errorRate = events.length > 0 ? (events.filter(e => e.level === "ERROR" || e.level === "FATAL").length / events.length * 100).toFixed(1) : "0.0"
  const eventsPerMin = events.length > 0 ? (events.length / Math.max(1, (Date.now() - (new Date(events[events.length - 1]?.timestamp || Date.now())).getTime()) / 60000)).toFixed(1) : "0"

  return (
    <div className="content-container space-y-4 animate-fade-in">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold flex items-center gap-2">
            <Activity className="size-6 text-primary" />
            السجل المباشر
          </h1>
          <p className="text-xs text-muted-foreground">مراقبة الأحداث في الوقت الحقيقي — تصفية، بحث، تصدير</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setPaused(p => !p)} className="min-h-[36px] text-xs">
            {paused ? <PlayCircle className="size-3.5 ml-1" /> : <PauseCircle className="size-3.5 ml-1" />}
            {paused ? "استئناف" : "إيقاف"}
          </Button>
          <Button variant="outline" size="sm" onClick={clearLogs} className="min-h-[36px] text-xs">
            <Trash2 className="size-3.5 ml-1" />مسح
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson} className="min-h-[36px] text-xs">
            <Download className="size-3.5 ml-1" />تصدير
          </Button>
        </div>
      </div>

      {/* stats bar */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-2.5 flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Activity className="size-3.5" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground">الإجمالي</p>
              <p className="text-sm font-bold font-mono tabular-nums">{events.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-2.5 flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><AlertTriangle className="size-3.5" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground">الأخطاء</p>
              <p className="text-sm font-bold font-mono tabular-nums tabular-nums">{recentErrorCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-2.5 flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-warning/10 text-warning"><Activity className="size-3.5" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground">نسبة الخطأ</p>
              <p className="text-sm font-bold font-mono tabular-nums">{errorRate}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm hidden sm:flex">
          <CardContent className="p-2.5 flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-info/10 text-info"><Clock className="size-3.5" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground">حدث/دقيقة</p>
              <p className="text-sm font-bold font-mono tabular-nums">{eventsPerMin}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm hidden sm:flex">
          <CardContent className="p-2.5 flex items-center gap-2">
            <div className={`flex size-7 items-center justify-center rounded-lg ${paused ? "bg-warning/10" : "bg-success/10"} ${paused ? "text-warning" : "text-success"}`}>
              {paused ? <PauseCircle className="size-3.5" /> : <PlayCircle className="size-3.5" />}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">الحالة</p>
              <p className="text-sm font-bold">{paused ? "متوقف" : "مباشر"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* filter bar */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filterLevel}
          onChange={e => setFilterLevel(e.target.value)}
          className="h-9 text-xs rounded-lg border border-input bg-background px-2.5 text-foreground focus-ring"
        >
          <option value="">جميع المستويات</option>
          <option value="ERROR">ERROR</option>
          <option value="WARN">WARN</option>
          <option value="INFO">INFO</option>
          <option value="DEBUG">DEBUG</option>
          <option value="TRACE">TRACE</option>
        </select>
        <select
          value={filterModule}
          onChange={e => setFilterModule(e.target.value)}
          className="h-9 text-xs rounded-lg border border-input bg-background px-2.5 text-foreground focus-ring"
        >
          <option value="">جميع الوحدات</option>
          <option value="engine">engine</option>
          <option value="pipeline">pipeline</option>
          <option value="webhook">webhook</option>
          <option value="fb-api">fb-api</option>
        </select>
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Input
            placeholder="بحث..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="h-9 pr-8 text-xs"
          />
          {filterText && (
            <button onClick={() => setFilterText("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
              <X className="size-3" />
            </button>
          )}
        </div>
        {paused && (
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-[10px]">
            <PauseCircle className="size-3 ml-1" />متوقف — {filtered.length} حدث معروض
          </Badge>
        )}
      </div>

      {/* loading state */}
      {events.length === 0 && !error && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Terminal className="size-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">لا توجد أحداث بعد</p>
            <p className="text-xs text-muted-foreground/50 mt-1">سيتم عرض الأحداث هنا عند تشغيل البوت</p>
            <div className="flex justify-center gap-1 mt-4">
              {[0,1,2].map(i => (
                <div key={i} className="size-1.5 rounded-full bg-muted-foreground/20" style={{ animation: `pulse-dot 1.5s ease-in-out ${i * 0.3}s infinite` }} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* error state */}
      {error && (
        <Card className="border-destructive/30 bg-destructive/[0.02]">
          <CardContent className="p-6 text-center space-y-3">
            <AlertTriangle className="size-10 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">تم قطع الاتصال — فشل البث المباشر</p>
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              <Activity className="size-3.5 ml-1" />إعادة الاتصال
            </Button>
          </CardContent>
        </Card>
      )}

      {/* log stream */}
      <AnimatePresence>
        {events.length > 0 && (
          <Card className="border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/20">
              <span className="text-[10px] text-muted-foreground font-medium">
                {filtered.length} من {events.length} حدث{paused ? " (متوقف)" : ""}
              </span>
              <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                <span className={`size-1.5 rounded-full ${error ? "bg-destructive" : paused ? "bg-warning" : "bg-success"} ${!paused && !error ? "animate-pulse" : ""}`} />
                {error ? "خطأ" : paused ? "متوقف" : "مباشر"}
              </span>
            </div>
            <div ref={containerRef} className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 340px)" }}>
              {filtered.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-xs text-muted-foreground">لا توجد نتائج للتصفية الحالية</p>
                </div>
              ) : (
                filtered.map((event, idx) => (
                  <LogEntry
                    key={`${event.timestamp}-${idx}`}
                    event={event}
                    expanded={expanded.has(idx)}
                    onToggle={() => toggleExpand(idx)}
                  />
                ))
              )}
            </div>
          </Card>
        )}
      </AnimatePresence>

      <div className="mobile-nav-spacer" />
    </div>
  )
}
