import { useState, useMemo, useCallback, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { format } from "date-fns"
import { arSA } from "date-fns/locale"
import {
  Search, Download, AlertCircle, Inbox, Filter, RotateCcw,
  Reply, BarChart3, Sparkles, Brain, MessageSquare, Clock,
  CheckCircle2, ChevronDown
} from "lucide-react"
import { toast } from "sonner"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

import { fetchReplies, fetchRules, fetchHourlyStats, replyToComment, fetchAiStatus, suggestAiReplies } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const PER_PAGE = 20

function StatCards({ total, items = [] }) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const todayC = items.filter(r => r.created_at && new Date(r.created_at) >= todayStart).length
  const weekC = items.filter(r => r.created_at && new Date(r.created_at) >= weekStart).length
  const cards = [
    { label: "إجمالي الردود", value: total, icon: MessageSquare, color: "text-primary" },
    { label: "ردود اليوم", value: todayC, icon: Clock, color: "text-info" },
    { label: "ردود هذا الأسبوع", value: weekC, icon: BarChart3, color: "text-warning" },
    { label: "متوسط وقت الرد", value: "—", icon: CheckCircle2, color: "text-success" },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c, i) => {
        const Icon = c.icon
        return (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Icon className={`size-8 ${c.color}`} strokeWidth={1.5} />
                <span className="text-2xl font-bold font-mono tabular-nums">{c.value}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function CollapsibleHourlyChart() {
  const [open, setOpen] = useState(true)
  const { data = [] } = useQuery({
    queryKey: ["hourly-stats"], queryFn: fetchHourlyStats,
    staleTime: 30000, refetchOnWindowFocus: true, refetchInterval: 60000,
  })
  return (
    <Card>
      <CardHeader className="pb-0">
        <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-right">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="size-4 text-muted-foreground" />
            التوزيع الساعي (آخر 7 أيام)
          </CardTitle>
          <ChevronDown className={`size-4 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
      </CardHeader>
      {open && (
        <CardContent className="pt-4">
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dy={6} tickFormatter={(h) => `${h}:00`} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dx={-4} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))" }}
                  content={({ active, payload, label }) => active && payload?.length ? (
                    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-lg">
                      <p className="text-xs text-muted-foreground">{label}:00</p>
                      <p className="font-semibold font-mono tabular-nums">{payload[0].value} ردود</p>
                    </div>
                  ) : null} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">لا توجد بيانات</div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function LoadingSkeleton() {
  const widths = ["w-28", "w-48", "w-48", "w-24", "w-20", "w-28", "w-10"]
  return Array.from({ length: 5 }, (_, i) => (
    <tr key={i} className="border-b last:border-0">
      {widths.map((w, j) => <td key={j} className="p-3"><Skeleton className={`h-5 ${w}`} /></td>)}
    </tr>
  ))
}

function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-1">خطأ في تحميل الردود</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">{error?.message || "حدث خطأ غير متوقع"}</p>
      <Button variant="outline" onClick={onRetry}>إعادة المحاولة</Button>
    </div>
  )
}

function EmptyState({ search }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Inbox className="h-12 w-12 text-muted-foreground/40 mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-1">{search ? "لا توجد نتائج" : "لا توجد ردود"}</h3>
      <p className="text-sm text-muted-foreground">
        {search ? "حاول تعديل البحث أو المرشحات" : "الردود ستظهر هنا بعد إرسال البوت للردود التلقائية"}
      </p>
    </div>
  )
}

function ExportCSV({ replies }) {
  const handleExport = useCallback(() => {
    if (!replies.length) return
    const header = "commenter,comment,reply,rule,status,date\n"
    const rows = replies.map(r =>
      `"${r.commenter_name}","${(r.comment_text || "").replace(/"/g, '""')}","${(r.reply_text || "").replace(/"/g, '""')}","${r.rule_id || ""}","${r.rule_id ? "auto" : "manual"}","${r.created_at}"`
    ).join("\n")
    const blob = new Blob([header + rows], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = `replies_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success("تم تصدير الملف")
  }, [replies])
  return (
    <Button onClick={handleExport} disabled={!replies.length} variant="outline">
      <Download className="ml-2 h-4 w-4" />تصدير CSV
    </Button>
  )
}

function Pagination({ page, totalPages, setPage }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-2">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</Button>
      <span className="text-sm text-muted-foreground px-2">صفحة {page} من {totalPages}</span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>التالي</Button>
    </div>
  )
}

function ReplyDialog({ reply, open, onOpenChange }) {
  const [message, setMessage] = useState("")
  const [aiSuggestions, setAiSuggestions] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const queryClient = useQueryClient()
  const { data: aiStatus } = useQuery({ queryKey: ["ai-status"], queryFn: fetchAiStatus })

  const genAi = useCallback(async () => {
    if (!reply?.comment_text || !aiStatus?.available) return
    setAiLoading(true)
    try {
      const d = await suggestAiReplies(reply.comment_text, reply.commenter_name)
      if (d?.suggestions) setAiSuggestions(d.suggestions)
    } catch {} finally { setAiLoading(false) }
  }, [reply, aiStatus])

  useEffect(() => { if (open) { setMessage(""); setAiSuggestions([]); genAi() } }, [open, genAi])

  const replyMut = useMutation({
    mutationFn: (msg) => replyToComment(reply.fb_comment_id, msg),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["replies"] }); onOpenChange(false); toast.success("تم إرسال الرد") },
    onError: (e) => toast.error(e.message),
  })

  const insertName = () => {
    const name = reply.commenter_name?.split(" ")[0] || reply.commenter_name || "صديقنا"
    setMessage((p) => p + ` ${name} `)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-heavy max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageSquare className="size-4" /> رد على {reply.commenter_name || "صاحب التعليق"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/30 text-sm border">
            <p className="text-xs text-muted-foreground mb-1 font-medium">التعليق الأصلي:</p>
            <p><span className="font-semibold">{reply.commenter_name}: </span><span className="text-muted-foreground">{reply.comment_text}</span></p>
          </div>
          {aiLoading && (
            <div className="flex items-center gap-2 text-sm text-info"><Brain className="size-4 animate-pulse" />جاري توليد ردود ذكية...</div>
          )}
          {aiSuggestions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Sparkles className="size-3.5 text-warning" />ردود مقترحة:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {aiSuggestions.map((s, i) => (
                  <button key={i} onClick={() => setMessage(s)}
                    className="px-2.5 py-1.5 rounded-lg text-xs bg-info/10 border border-info/20 text-info hover:bg-info/20 transition-colors text-right max-w-[250px]">
                    {s.substring(0, 80)}{s.length > 80 ? "..." : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={insertName} className="text-xs h-9">
            @{reply.commenter_name?.split(" ")[0] || "الاسم"}
          </Button>
          <Textarea placeholder="اكتب ردك..." value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button onClick={() => replyMut.mutate(message)} disabled={!message.trim() || replyMut.isPending}>
              {replyMut.isPending ? "جاري..." : "إرسال رد"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function Replies() {
  useEffect(() => { document.title = "الردود | SmartBot" }, [])
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [selectedRuleId, setSelectedRuleId] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [appliedFrom, setAppliedFrom] = useState("")
  const [appliedTo, setAppliedTo] = useState("")
  const [replyTarget, setReplyTarget] = useState(null)

  const { data: rules = [] } = useQuery({ queryKey: ["rules"], queryFn: fetchRules })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["replies", page, search, selectedRuleId],
    queryFn: () => fetchReplies(page, PER_PAGE, search, selectedRuleId === "all" ? "" : selectedRuleId),
    staleTime: 10000, refetchOnWindowFocus: true, retry: 2, placeholderData: (prev) => prev,
  })

  const replies = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / PER_PAGE)

  const filteredReplies = useMemo(() => {
    if (!appliedFrom && !appliedTo) return replies
    return replies.filter((r) => {
      if (!r.created_at) return false
      const d = new Date(r.created_at)
      if (appliedFrom && d < new Date(appliedFrom)) return false
      if (appliedTo) { const end = new Date(appliedTo); end.setHours(23, 59, 59, 999); if (d > end) return false }
      return true
    })
  }, [replies, appliedFrom, appliedTo])

  const ruleMap = useMemo(() => { const m = {}; rules.forEach((r) => m[r.id] = r.name); return m }, [rules])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="content-container space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold tracking-tight">سجل الردود</h1>
          <p className="text-sm text-muted-foreground mt-1">جميع الردود التلقائية واليدوية</p>
        </div>
        <ExportCSV replies={filteredReplies} />
      </div>

      <StatCards total={total} items={replies} />
      <CollapsibleHourlyChart />

      <div className="flex gap-3 flex-col sm:flex-row sm:items-center flex-wrap">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="pr-9 min-h-[44px] sm:min-h-0" />
        </div>
        <Select value={selectedRuleId} onValueChange={(v) => { setSelectedRuleId(v); setPage(1) }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="جميع القواعد" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع القواعد</SelectItem>
            {rules.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">الإجمالي: {total}</span>
      </div>

      <div className="flex gap-3 flex-col sm:flex-row items-center">
        <div className="flex items-center gap-2"><label className="text-sm text-muted-foreground shrink-0">من:</label><Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full sm:w-auto" /></div>
        <div className="flex items-center gap-2"><label className="text-sm text-muted-foreground shrink-0">إلى:</label><Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full sm:w-auto" /></div>
        <div className="flex gap-2">
          <Button onClick={() => { setAppliedFrom(fromDate); setAppliedTo(toDate) }} size="sm"><Filter className="ml-1 h-4 w-4" />تصفية</Button>
          <Button onClick={() => { setFromDate(""); setToDate(""); setAppliedFrom(""); setAppliedTo("") }} variant="outline" size="sm"><RotateCcw className="ml-1 h-4 w-4" />إعادة تعيين</Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto data-table-wrapper data-table-card-view">
          <table className="data-table">
            <thead>
              <tr>
                <th>صاحب التعليق</th><th>النص</th><th>الرد</th><th>القاعدة</th><th>الحالة</th><th>التاريخ</th><th className="w-16">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingSkeleton />
              ) : error ? (
                <tr><td colSpan={7} className="p-0"><ErrorState error={error} onRetry={refetch} /></td></tr>
              ) : !filteredReplies.length ? (
                <tr><td colSpan={7} className="p-0"><EmptyState search={search} /></td></tr>
              ) : (
                filteredReplies.map((r) => (
                  <tr key={r.id}>
                    <td data-label="صاحب التعليق" className="font-medium">{r.commenter_name}</td>
                    <td data-label="النص" className="text-sm text-muted-foreground truncate" style={{ maxWidth: 120 }}>{r.comment_text}</td>
                    <td data-label="الرد" className="text-muted-foreground truncate font-mono text-xs" style={{ maxWidth: 120 }}>{r.reply_text}</td>
                    <td data-label="القاعدة" className="text-sm">{ruleMap[r.rule_id] || "—"}</td>
                    <td data-label="الحالة">
                      <Badge className={r.rule_id ? "bg-primary/10 text-primary border-primary/20" : "bg-warning/10 text-warning border-warning/20"}>
                        {r.rule_id ? "تلقائي" : "يدوي"}
                      </Badge>
                    </td>
                    <td data-label="التاريخ" className="text-sm text-muted-foreground whitespace-nowrap font-mono text-xs">
                      {r.created_at ? format(new Date(r.created_at), "yyyy/MM/dd HH:mm", { locale: arSA }) : "—"}
                    </td>
                    <td>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary"
                        onClick={() => setReplyTarget(r)}>
                        <Reply className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} setPage={setPage} />
      {replyTarget && <ReplyDialog reply={replyTarget} open={!!replyTarget} onOpenChange={(o) => { if (!o) setReplyTarget(null) }} />}
      <div className="mobile-nav-spacer" />
    </motion.div>
  )
}
