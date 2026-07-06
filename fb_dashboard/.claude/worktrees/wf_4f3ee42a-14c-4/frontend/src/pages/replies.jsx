import { useState, useMemo, useCallback, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { arSA } from "date-fns/locale"
import { Search, Download, AlertCircle, Inbox, Filter, RotateCcw, Reply, BarChart3 } from "lucide-react"
import { toast } from "sonner"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

import { fetchReplies, fetchRules, fetchHourlyStats, replyToComment } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const PER_PAGE = 20

function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-1">خطأ في تحميل الردود</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">
        {error?.message || "حدث خطأ غير متوقع"}
      </p>
      <Button variant="outline" onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </div>
  )
}

function EmptyState({ search }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Inbox className="h-12 w-12 text-muted-foreground/40 mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-1">
        {search ? "لا توجد نتائج" : "لا توجد ردود"}
      </h3>
      <p className="text-sm text-muted-foreground">
        {search ? "حاول تعديل البحث" : "الردود ستظهر هنا بعد إرسال البوت للردود التلقائية"}
      </p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 p-6">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

function ExportCSV({ replies }) {
  const handleExport = useCallback(() => {
    if (!replies.length) return
    const header = "commenter,comment,reply,date\n"
    const rows = replies
      .map(
        (r) =>
          `"${r.commenter_name}","${(r.comment_text || "").replace(/"/g, '""')}","${(r.reply_text || "").replace(/"/g, '""')}","${r.created_at}"`
      )
      .join("\n")
    const blob = new Blob([header + rows], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `replies_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("تم تصدير الملف")
  }, [replies])

  return (
    <Button
      onClick={handleExport}
      disabled={!replies.length}
      variant="outline"
    >
      <Download className="ml-2 h-4 w-4" />
      تصدير CSV
    </Button>
  )
}

function Pagination({ page, totalPages, setPage }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        السابق
      </Button>
      <span className="text-sm text-muted-foreground px-2">
        صفحة {page} من {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => setPage(page + 1)}
      >
        التالي
      </Button>
    </div>
  )
}

function ReplyDialog({ reply, open, onOpenChange }) {
  const [message, setMessage] = useState("")
  const queryClient = useQueryClient()

  const replyMut = useMutation({
    mutationFn: (msg) => replyToComment(reply.fb_comment_id, msg),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["replies"] }); onOpenChange(false); setMessage(""); toast.success("تم إرسال الرد") },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>رد على تعليق</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/30 text-sm">
            <span className="font-medium text-foreground">{reply.commenter_name}: </span>
            <span className="text-muted-foreground">{reply.comment_text}</span>
          </div>
          <Textarea
            placeholder="اكتب ردك..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button onClick={() => replyMut.mutate(message)} disabled={!message.trim() || replyMut.isPending}>
              {replyMut.isPending ? "جاري..." : "إرسال"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function HourlyChart() {
  const { data = [] } = useQuery({
    queryKey: ["hourly-stats"], queryFn: fetchHourlyStats,
    refetchInterval: 60000,
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="size-4 text-muted-foreground" />
          التوزيع الساعي (آخر 7 أيام)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dy={6}
                tickFormatter={(h) => `${h}:00`} />
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
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            لا توجد بيانات
          </div>
        )}
      </CardContent>
    </Card>
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

  const { data: rules = [] } = useQuery({
    queryKey: ["rules"], queryFn: fetchRules,
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["replies", page, search, selectedRuleId],
    queryFn: () => fetchReplies(page, PER_PAGE, search, selectedRuleId === "all" ? "" : selectedRuleId),
    placeholderData: (prev) => prev,
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
      if (appliedTo) {
        const end = new Date(appliedTo)
        end.setHours(23, 59, 59, 999)
        if (d > end) return false
      }
      return true
    })
  }, [replies, appliedFrom, appliedTo])

  const handleFilter = () => {
    setAppliedFrom(fromDate)
    setAppliedTo(toDate)
  }

  const handleReset = () => {
    setFromDate("")
    setToDate("")
    setAppliedFrom("")
    setAppliedTo("")
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">سجل الردود</h1>
          <p className="text-sm text-muted-foreground mt-1">جميع الردود التلقائية التي أرسلها البوت</p>
        </div>
        <ExportCSV replies={filteredReplies} />
      </div>

      {/* Hourly chart */}
      <HourlyChart />

      {/* Search + filters */}
      <div className="flex gap-4 flex-wrap items-center">
        <div className="relative max-w-xs w-full">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pr-9"
          />
        </div>
        <Select value={selectedRuleId} onValueChange={(v) => { setSelectedRuleId(v); setPage(1) }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="جميع القواعد" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع القواعد</SelectItem>
            {rules.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground self-center">
          الإجمالي: {total}
        </p>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">من:</label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">إلى:</label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-auto"
          />
        </div>
        <Button onClick={handleFilter} size="sm">
          <Filter className="ml-1 h-4 w-4" />
          تصفية
        </Button>
        <Button onClick={handleReset} variant="outline" size="sm">
          <RotateCcw className="ml-1 h-4 w-4" />
          إعادة تعيين
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-xs font-medium text-muted-foreground px-4 py-3 text-right" scope="col">صاحب التعليق</th>
              <th className="text-xs font-medium text-muted-foreground px-4 py-3 text-right" scope="col">النص</th>
              <th className="text-xs font-medium text-muted-foreground px-4 py-3 text-right" scope="col">الرد</th>
              <th className="text-xs font-medium text-muted-foreground px-4 py-3 text-right" scope="col">التاريخ</th>
              <th className="text-xs font-medium text-muted-foreground px-4 py-3 text-right w-16" scope="col">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="p-0">
                  <LoadingSkeleton />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="p-0">
                  <ErrorState error={error} onRetry={refetch} />
                </td>
              </tr>
            ) : !filteredReplies.length ? (
              <tr>
                <td colSpan={5} className="p-0">
                  <EmptyState search={search} />
                </td>
              </tr>
            ) : (
              filteredReplies.map((r) => (
                <tr
                  key={r.id}
                  className="border-b hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-4 align-middle font-medium text-foreground">
                    {r.commenter_name}
                  </td>
                  <td className="px-4 py-4 align-middle text-sm text-muted-foreground max-w-xs truncate">
                    {r.comment_text}
                  </td>
                  <td className="px-4 py-4 align-middle text-muted-foreground max-w-xs truncate font-mono text-xs">
                    {r.reply_text}
                  </td>
                  <td className="px-4 py-4 align-middle text-sm text-muted-foreground whitespace-nowrap font-mono text-xs">
                    {r.created_at
                      ? format(new Date(r.created_at), "yyyy/MM/dd HH:mm", { locale: arSA })
                      : "-"}
                  </td>
                  <td className="px-4 py-4 align-middle">
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

      {/* Pagination */}
      <Pagination page={page} totalPages={totalPages} setPage={setPage} />

      {replyTarget && (
        <ReplyDialog
          reply={replyTarget}
          open={!!replyTarget}
          onOpenChange={(o) => { if (!o) setReplyTarget(null) }}
        />
      )}
    </div>
  )
}
