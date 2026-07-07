import { useState, useEffect, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  fetchScheduledPosts, createScheduledPost, publishScheduledPost, deleteScheduledPost,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, isSameDay, parseISO } from "date-fns"
import { arSA } from "date-fns/locale"
import {
  Plus, ChevronLeft, ChevronRight, Send, Trash2, Calendar as CalendarIcon, List, Grid3X3,
} from "lucide-react"

const DAY_NAMES = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]

const DOT_COLORS = {
  draft: "bg-amber-500",
  scheduled: "bg-blue-500",
  published: "bg-emerald-500",
  failed: "bg-destructive",
}

const STATUS_MAP = {
  draft: { label: "مسودة", color: "bg-amber-500/15 text-amber-600 border-amber-500/20" },
  scheduled: { label: "مجدول", color: "bg-blue-500/15 text-blue-500 border-blue-500/20" },
  published: { label: "منشور", color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20" },
  failed: { label: "فشل", color: "bg-destructive/15 text-destructive border-destructive/20" },
}

function groupPostsByDate(posts) {
  const map = {}
  for (const p of posts) {
    const key = p.scheduled_at ? format(parseISO(p.scheduled_at), "yyyy-MM-dd") : "unscheduled"
    if (!map[key]) map[key] = []
    map[key].push(p)
  }
  return map
}

export function ScheduledPosts({ role }) {
  useEffect(() => { document.title = "التقويم | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [viewMode, setViewMode] = useState("calendar") // calendar | list
  const [showAdd, setShowAdd] = useState(false)
  const [message, setMessage] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [scheduledAt, setScheduledAt] = useState("")

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["scheduled-posts"],
    queryFn: () => fetchScheduledPosts(),
    refetchInterval: 30000,
  })

  const grouped = useMemo(() => groupPostsByDate(posts), [posts])

  const daysInMonth = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth))
    const end = endOfWeek(endOfMonth(currentMonth))
    return eachDayOfInterval({ start, end })
  }, [currentMonth])

  const selectedDayPosts = useMemo(() => {
    if (!selectedDate) return []
    const key = format(selectedDate, "yyyy-MM-dd")
    return grouped[key] || []
  }, [selectedDate, grouped])

  const createMut = useMutation({
    mutationFn: () => createScheduledPost(message, imageUrl, scheduledAt),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] }); setShowAdd(false); resetForm(); toast.success("تم إنشاء المنشور") },
    onError: (e) => toast.error(e.message),
  })
  const publishMut = useMutation({
    mutationFn: (id) => publishScheduledPost(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] }); toast.success("تم النشر") },
    onError: (e) => toast.error(e.message),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => deleteScheduledPost(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] }); toast.success("تم الحذف") },
    onError: (e) => toast.error(e.message),
  })

  function resetForm() { setMessage(""); setImageUrl(""); setScheduledAt("") }

  function handleDayClick(day) {
    setSelectedDate(prev => isSameDay(prev, day) ? null : day)
  }

  function getDayPosts(day) {
    const key = format(day, "yyyy-MM-dd")
    return grouped[key] || []
  }

  function getDayCounts(day) {
    const dayPosts = getDayPosts(day)
    const counts = { draft: 0, scheduled: 0, published: 0, failed: 0 }
    for (const p of dayPosts) {
      if (counts[p.status] !== undefined) counts[p.status]++
    }
    return counts
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">تقويم المحتوى</h1>
          <p className="text-sm text-muted-foreground mt-1">جدولة وعرض المنشورات في تقويم شهري</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-muted rounded-lg p-0.5">
            <button onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "calendar" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
              <Grid3X3 className="size-3.5 inline ml-1" />
              تقويم
            </button>
            <button onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "list" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
              <List className="size-3.5 inline ml-1" />
              قائمة
            </button>
          </div>
          {canEdit && (
            <Dialog open={showAdd} onOpenChange={setShowAdd}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="ml-1.5 h-4 w-4" />منشور جديد</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>منشور جديد</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">نص المنشور</label>
                    <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">رابط الصورة (اختياري)</label>
                    <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">تاريخ النشر (اختياري)</label>
                    <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                  </div>
                  <Button onClick={() => createMut.mutate()} disabled={!message.trim() || createMut.isPending} className="w-full">
                    {createMut.isPending ? "جاري..." : scheduledAt ? "جدولة" : "حفظ كمسودة"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {Object.entries(DOT_COLORS).map(([key, cls]) => (
          STATUS_MAP[key] && (
            <span key={key} className="flex items-center gap-1.5">
              <span className={`size-2.5 rounded-full ${cls}`} />
              {STATUS_MAP[key].label}
            </span>
          )
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-96 rounded-lg" />
      ) : viewMode === "list" ? (
        /* ── List View (Mobile Default) ── */
        <div className="space-y-3">
          {posts.length === 0 ? (
            <div className="flex flex-col items-center py-16">
              <CalendarIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">لا توجد منشورات</p>
            </div>
          ) : (
            posts.map(p => {
              const st = STATUS_MAP[p.status] || STATUS_MAP.draft
              return (
                <Card key={p.id} className="flex flex-col">
                  <CardHeader className="pb-2 flex-row items-center justify-between">
                    <Badge className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</Badge>
                    {canEdit && p.status !== "published" && (
                      <div className="flex gap-1">
                        {p.status === "scheduled" && (
                          <Button variant="ghost" size="icon" className="size-7 text-success" onClick={() => publishMut.mutate(p.id)}>
                            <Send className="size-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => deleteMut.mutate(p.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground line-clamp-3">{p.message}</p>
                    {p.scheduled_at && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {format(parseISO(p.scheduled_at), "yyyy/MM/dd HH:mm")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      ) : (
        /* ── Calendar Grid View ── */
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div className="space-y-3">
            {/* Month Navigation */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}>
                <ChevronRight className="size-4 ml-1" />
                السابق
              </Button>
              <h2 className="text-base font-bold">
                {format(currentMonth, "MMMM yyyy", { locale: arSA })}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}>
                التالي
                <ChevronLeft className="size-4 mr-1" />
              </Button>
            </div>

            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-1">
              {DAY_NAMES.map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {daysInMonth.map(day => {
                const inMonth = isSameMonth(day, currentMonth)
                const today = isToday(day)
                const counts = getDayCounts(day)
                const hasPosts = Object.values(counts).some(c => c > 0)
                const isSelected = selectedDate && isSameDay(selectedDate, day)
                const total = Object.values(counts).reduce((a, b) => a + b, 0)

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => handleDayClick(day)}
                    className={`
                      relative flex flex-col items-center p-1.5 min-h-[65px] sm:min-h-[80px] rounded-lg text-xs transition-all
                      ${inMonth ? "text-foreground" : "text-muted-foreground/30"}
                      ${isSelected ? "ring-2 ring-primary bg-primary/10" : "hover:bg-muted/50"}
                    `}
                  >
                    <span className={`
                      flex items-center justify-center size-6 rounded-full text-[11px] font-medium mb-1
                      ${today ? "bg-primary text-primary-foreground" : ""}
                    `}>
                      {format(day, "d")}
                    </span>
                    {hasPosts && inMonth && (
                      <div className="flex flex-wrap justify-center gap-0.5 max-w-full px-0.5">
                        {Object.entries(counts).map(([status, count]) =>
                          count > 0 && (
                            <span key={status}
                              className={`size-2 rounded-full ${DOT_COLORS[status]} inline-block`}
                              title={`${STATUS_MAP[status]?.label}: ${count}`}
                            />
                          )
                        )}
                      </div>
                    )}
                    {hasPosts && inMonth && (
                      <span className="text-[10px] text-muted-foreground mt-0.5">{total}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Day Detail Panel ── */}
          <div className="lg:border-r lg:pr-4">
            {!selectedDate ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
                <CalendarIcon className="size-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">اختر يوماً لعرض المنشورات</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">
                    {format(selectedDate, "d MMMM yyyy", { locale: arSA })}
                  </h3>
                  <span className="text-xs text-muted-foreground">{selectedDayPosts.length} منشور</span>
                </div>

                {selectedDayPosts.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <p className="text-sm text-muted-foreground mb-3">لا توجد منشورات في هذا اليوم</p>
                    {canEdit && (
                      <Button size="sm" variant="outline" onClick={() => {
                        setScheduledAt(format(selectedDate, "yyyy-MM-dd'T'HH:mm"))
                        setShowAdd(true)
                      }}>
                        <Plus className="ml-1 h-4 w-4" />
                        إضافة منشور
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedDayPosts.map(p => {
                      const st = STATUS_MAP[p.status] || STATUS_MAP.draft
                      return (
                        <Card key={p.id} className="p-3">
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <Badge className={`text-[10px] px-1.5 py-0 rounded-full ${st.color}`}>
                              <span className={`size-1.5 rounded-full ${DOT_COLORS[p.status]} inline-block ml-1`} />
                              {st.label}
                            </Badge>
                            {canEdit && p.status !== "published" && (
                              <div className="flex gap-0.5">
                                {p.status === "scheduled" && (
                                  <Button variant="ghost" size="icon" className="size-6 text-success" onClick={() => publishMut.mutate(p.id)}>
                                    <Send className="size-3" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="size-6 text-destructive" onClick={() => deleteMut.mutate(p.id)}>
                                  <Trash2 className="size-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-foreground line-clamp-3">{p.message}</p>
                          {p.scheduled_at && (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {format(parseISO(p.scheduled_at), "HH:mm")}
                            </p>
                          )}
                        </Card>
                      )
                    })}
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setScheduledAt(format(selectedDate, "yyyy-MM-dd'T'HH:mm"))
                          setShowAdd(true)
                        }}
                      >
                        <Plus className="ml-1 h-4 w-4" />
                        إضافة منشور
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
