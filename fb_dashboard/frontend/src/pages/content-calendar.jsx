import { useState, useMemo, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAdaptiveInterval } from "@/hooks/use-refresh-engine"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, isToday,
  addMonths, subMonths,
} from "date-fns"
import { arSA } from "date-fns/locale"
import {
  ChevronLeft, ChevronRight, Plus, Send, Trash2,
  AlertCircle, RefreshCw, Loader2,
  Globe, Camera, MessageCircle, FileText,
  Clock, Target, Edit3, Calendar, Save,
} from "lucide-react"

// ── API ──
const BASE = ""
async function callApi(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: opts.body instanceof FormData ? {} : { "Content-Type": "application/json", ...opts.headers },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text.slice(0, 200))
  }
  return res.json()
}

function fetchCalendarPosts(year, month) {
  return callApi(`/api/calendar?year=${year}&month=${month}`)
}
function fetchDayPosts(year, month, day) {
  return callApi(`/api/calendar/day?year=${year}&month=${month}&day=${day}`)
}
function createCalendarPost(data) {
  return callApi("/api/calendar", { method: "POST", body: JSON.stringify(data) })
}
function updateCalendarPost(id, data) {
  return callApi(`/api/calendar/${id}`, { method: "PUT", body: JSON.stringify(data) })
}
function deleteCalendarPost(id) {
  return callApi(`/api/calendar/${id}`, { method: "DELETE" })
}
function publishCalendarPost(id) {
  return callApi(`/api/calendar/${id}/publish`, { method: "POST" })
}
function fetchMonthSummary(year, month) {
  return callApi(`/api/calendar/month-summary?year=${year}&month=${month}`)
}

// ── Constants ──
const DAY_NAMES = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]

const PLATFORM_CONFIG = {
  facebook: { label: "فيسبوك", color: "bg-primary/15 text-primary", icon: Globe },
  instagram: { label: "انستغرام", color: "bg-destructive/15 text-destructive", icon: Camera },
  whatsapp: { label: "واتساب", color: "bg-success/15 text-success", icon: MessageCircle },
}

const STATUS_CONFIG = {
  draft: { label: "مسودة", color: "text-muted-foreground bg-muted" },
  scheduled: { label: "مجدول", color: "text-amber-600 bg-amber-500/15" },
  published: { label: "منشور", color: "text-emerald-600 bg-emerald-500/15" },
  failed: { label: "فشل", color: "text-destructive bg-destructive/15" },
}

const PLATFORM_OPTIONS = [
  { value: "facebook", label: "فيسبوك" },
  { value: "instagram", label: "انستغرام" },
  { value: "whatsapp", label: "واتساب" },
]

// ── Calendar Cell ──
function CalendarCell({ day, currentMonth, count, isSelected, onSelect, loading }) {
  const inMonth = isSameMonth(day, currentMonth)
  const today = isToday(day)
  const selected = isSelected && isSameDay(day, isSelected)
  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      className={`
        relative flex flex-col items-center justify-start p-1.5 min-h-[60px] sm:min-h-[72px] rounded-lg
        text-xs transition-all
        ${inMonth ? "text-foreground" : "text-muted-foreground/40"}
        ${selected ? "ring-2 ring-primary bg-primary/10" : "hover:bg-muted/60"}
        ${today && !selected ? "ring-1 ring-primary/40" : ""}
      `}
    >
      <span className={`
        flex items-center justify-center size-6 rounded-full text-xs font-medium
        ${today && !selected ? "bg-primary text-primary-foreground" : ""}
      `}>
        {format(day, "d")}
      </span>
      {loading ? (
        <div className="mt-1 size-3 rounded-full bg-muted-foreground/20 animate-pulse" />
      ) : count > 0 ? (
        <span className="mt-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold bg-primary/15 text-primary leading-none">
          {count}
        </span>
      ) : null}
    </button>
  )
}

// ── Main Component ──
export function ContentCalendar({ role }) {
  useEffect(() => { document.title = "التقويم | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()

  const today = useMemo(() => new Date(), [])

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(today))
  const [selectedDay, setSelectedDay] = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPost, setEditingPost] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const year = currentMonth.getFullYear()
  const monthNum = currentMonth.getMonth() + 1

  // ── Calendar days ──
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calStart = startOfWeek(monthStart)
    const calEnd = endOfWeek(monthEnd)
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentMonth])

  const weeks = useMemo(() => {
    const w = []
    for (let i = 0; i < days.length; i += 7) w.push(days.slice(i, i + 7))
    return w
  }, [days])

  // ── Queries ──
  const calInterval = useAdaptiveInterval("normal")
  const {
    data: monthPosts = [],
    isLoading: monthLoading,
    error: monthError,
    refetch: refetchMonth,
  } = useQuery({
    queryKey: ["calendar-posts", year, monthNum],
    queryFn: () => fetchCalendarPosts(year, monthNum),
    staleTime: 15000, refetchOnWindowFocus: true,
    refetchInterval: calInterval, retry: 2,
    placeholderData: (prev) => prev,
  })

  const {
    data: monthSummary = {},
    isLoading: summaryLoading,
  } = useQuery({
    queryKey: ["calendar-summary", year, monthNum],
    queryFn: () => fetchMonthSummary(year, monthNum),
  })

  const {
    data: dayPosts = [],
    isLoading: dayLoading,
    error: dayError,
  } = useQuery({
    queryKey: ["calendar-day-posts", year, monthNum, selectedDay?.getDate()],
    queryFn: () => fetchDayPosts(year, monthNum, selectedDay.getDate()),
    enabled: !!selectedDay,
  })

  // ── Count map from month posts ──
  const dayCountMap = useMemo(() => {
    const map = {}
    const list = Array.isArray(monthPosts) ? monthPosts : monthPosts?.items || []
    list.forEach((post) => {
      const d = post.scheduled_at || post.date
      if (d) {
        const key = format(new Date(d), "yyyy-MM-dd")
        map[key] = (map[key] || 0) + 1
      }
    })
    return map
  }, [monthPosts])

  // ── Form state ──
  const [formData, setFormData] = useState({
    message: "",
    image_url: "",
    scheduled_at: "",
    platform: "facebook",
  })

  function resetForm() {
    setFormData({ message: "", image_url: "", scheduled_at: "", platform: "facebook" })
  }

  useEffect(() => {
    if (editingPost) {
      setFormData({
        message: editingPost.message || "",
        image_url: editingPost.image_url || "",
        scheduled_at: editingPost.scheduled_at
          ? format(new Date(editingPost.scheduled_at), "yyyy-MM-dd'T'HH:mm")
          : "",
        platform: editingPost.platform || "facebook",
      })
    }
  }, [editingPost])

  // ── Mutations ──
  const createMut = useMutation({
    mutationFn: (data) => createCalendarPost(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-posts"] })
      queryClient.invalidateQueries({ queryKey: ["calendar-summary"] })
      setDialogOpen(false)
      resetForm()
      toast.success("تم إنشاء المنشور")
    },
    onError: (e) => toast.error(e.message),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateCalendarPost(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-posts"] })
      queryClient.invalidateQueries({ queryKey: ["calendar-day-posts"] })
      queryClient.invalidateQueries({ queryKey: ["calendar-summary"] })
      setEditingPost(null)
      setDialogOpen(false)
      resetForm()
      toast.success("تم تحديث المنشور")
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => deleteCalendarPost(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-posts"] })
      queryClient.invalidateQueries({ queryKey: ["calendar-day-posts"] })
      queryClient.invalidateQueries({ queryKey: ["calendar-summary"] })
      setDeleteTarget(null)
      toast.success("تم حذف المنشور")
    },
    onError: (e) => toast.error(e.message),
  })

  const publishMut = useMutation({
    mutationFn: (id) => publishCalendarPost(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-posts"] })
      queryClient.invalidateQueries({ queryKey: ["calendar-day-posts"] })
      queryClient.invalidateQueries({ queryKey: ["calendar-summary"] })
      toast.success("تم النشر")
    },
    onError: (e) => toast.error(e.message),
  })

  // ── Handlers ──
  function goToToday() {
    const now = new Date()
    setCurrentMonth(startOfMonth(now))
    setSelectedDay(now)
  }

  function prevMonth() {
    setCurrentMonth((prev) => subMonths(prev, 1))
    setSelectedDay(null)
  }

  function nextMonth() {
    setCurrentMonth((prev) => addMonths(prev, 1))
    setSelectedDay(null)
  }

  function handleDaySelect(day) {
    setSelectedDay((prev) => (prev && isSameDay(prev, day) ? null : day))
  }

  function handleOpenCreate() {
    setEditingPost(null)
    resetForm()
    setDialogOpen(true)
  }

  function handleOpenEdit(post) {
    setEditingPost(post)
    setDialogOpen(true)
  }

  function handleDialogClose(open) {
    if (!open) {
      setDialogOpen(false)
      setEditingPost(null)
      resetForm()
    }
  }

  function handleFormSubmit(e) {
    e.preventDefault()
    if (!formData.message.trim()) return
    const payload = {
      message: formData.message.trim(),
      image_url: formData.image_url.trim() || null,
      scheduled_at: formData.scheduled_at || null,
      platform: formData.platform,
    }
    if (editingPost) {
      updateMut.mutate({ id: editingPost.id, data: payload })
    } else {
      createMut.mutate(payload)
    }
  }

  function handlePublish(id) {
    publishMut.mutate(id)
  }

  async function handleDelete(id) {
    deleteMut.mutate(id)
  }

  // ── Computed ──
  const monthText = format(currentMonth, "MMMM yyyy", { locale: arSA })
  const summary = {
    total: monthSummary?.total ?? 0,
    published: monthSummary?.published ?? 0,
    scheduled: monthSummary?.scheduled ?? 0,
    draft: monthSummary?.draft ?? 0,
  }

  // ── Render ──
  const isLoadingInitial = monthLoading && monthPosts.length === 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="content-container space-y-6 animate-fade-in"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold">التقويم</h1>
          <p className="text-sm text-muted-foreground mt-1">عرض وإدارة المنشورات المجدولة</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>
            <Target className="ml-1.5 size-3.5" />اليوم
          </Button>
          {canEdit && (
            <Button size="sm" onClick={handleOpenCreate}>
              <Plus className="ml-1.5 size-4" />منشور جديد
            </Button>
          )}
        </div>
      </div>

      {/* Month Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summaryLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </>
        ) : (
          [
            { label: "الإجمالي", value: summary.total, color: "text-foreground" },
            { label: "منشور", value: summary.published, color: "text-emerald-600" },
            { label: "مجدول", value: summary.scheduled, color: "text-amber-600" },
            { label: "مسودة", value: summary.draft, color: "text-muted-foreground" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="flex flex-col items-center justify-center py-4">
                <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
                <span className="text-xs text-muted-foreground mt-1">{s.label}</span>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={prevMonth} className="size-8">
          <ChevronRight className="size-4" />
        </Button>
        <h2 className="text-base font-semibold">{monthText}</h2>
        <Button variant="outline" size="icon" onClick={nextMonth} className="size-8">
          <ChevronLeft className="size-4" />
        </Button>
      </div>

      {/* Calendar Grid */}
      {monthError ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center space-y-4">
            <AlertCircle className="size-10 text-destructive" />
            <p className="text-sm text-muted-foreground">فشل تحميل التقويم</p>
            <Button variant="outline" size="sm" onClick={() => refetchMonth()} className="gap-1.5">
              <RefreshCw className="size-3.5" />إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border bg-card">
          {/* Day headers */}
          <div className="grid grid-cols-7 divide-x divide-y-0 rtl:divide-x-reverse border-b">
            {DAY_NAMES.map((name) => (
              <div key={name} className="py-2 text-center text-xs font-medium text-muted-foreground">
                {name}
              </div>
            ))}
          </div>
          {/* Grid rows */}
          {isLoadingInitial ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((row) => (
                <div key={row} className="grid grid-cols-7 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((col) => (
                    <Skeleton key={col} className="h-[60px] sm:h-[72px] rounded-lg" />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-1.5 sm:p-2 space-y-0.5">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-0.5">
                  {week.map((day) => {
                    const key = format(day, "yyyy-MM-dd")
                    return (
                      <CalendarCell
                        key={key}
                        day={day}
                        currentMonth={currentMonth}
                        count={dayCountMap[key] || 0}
                        isSelected={selectedDay}
                        onSelect={handleDaySelect}
                        loading={monthLoading}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Day Detail Panel */}
      {selectedDay && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Calendar className="size-4 text-muted-foreground" />
                {format(selectedDay, "EEEE d MMMM yyyy", { locale: arSA })}
              </h3>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={handleOpenCreate}>
                  <Plus className="ml-1 size-3.5" />إضافة
                </Button>
              )}
            </div>
            {dayLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : dayError ? (
              <div className="flex flex-col items-center py-8 text-center space-y-3">
                <AlertCircle className="size-8 text-destructive" />
                <p className="text-sm text-muted-foreground">فشل تحميل المنشورات</p>
              </div>
            ) : (
              <PostsList
                posts={dayPosts}
                canEdit={canEdit}
                onPublish={handlePublish}
                onEdit={handleOpenEdit}
                onDelete={handleDelete}
                publishPending={publishMut.isPending}
                deletePending={deleteMut.isPending}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* ponytail: day panel shown below calendar; slide/fade animation skipped — add when UX requests it */}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="glass-heavy max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPost ? "تعديل المنشور" : "منشور جديد"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleFormSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">نص المنشور</label>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData((f) => ({ ...f, message: e.target.value }))}
                rows={4}
                required
                placeholder="اكتب محتوى المنشور..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">رابط الصورة (اختياري)</label>
              <Input
                value={formData.image_url}
                onChange={(e) => setFormData((f) => ({ ...f, image_url: e.target.value }))}
                placeholder="https://example.com/image.jpg"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">تاريخ ووقت النشر (اختياري)</label>
              <Input
                type="datetime-local"
                value={formData.scheduled_at}
                onChange={(e) => setFormData((f) => ({ ...f, scheduled_at: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">المنصة</label>
              <Select
                value={formData.platform}
                onValueChange={(v) => setFormData((f) => ({ ...f, platform: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORM_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={!formData.message.trim() || createMut.isPending || updateMut.isPending}
            >
              {(createMut.isPending || updateMut.isPending) ? (
                <><Loader2 className="ml-2 size-4 animate-spin" />جاري...</>
              ) : editingPost ? (
                <><Save className="ml-2 size-4" />تحديث</>
              ) : formData.scheduled_at ? (
                <><Clock className="ml-2 size-4" />جدولة</>
              ) : (
                <><FileText className="ml-2 size-4" />حفظ كمسودة</>
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <DialogContent className="glass-heavy max-w-sm">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف هذا المنشور؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => handleDelete(deleteTarget)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "جاري..." : "حذف"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="mobile-nav-spacer" />
    </motion.div>
  )
}

// ── Posts List (day detail) ──
function PostsList({ posts, canEdit, onPublish, onEdit, onDelete, publishPending, deletePending }) {
  const list = Array.isArray(posts) ? posts : posts?.items || []

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <FileText className="size-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">لا توجد منشورات في هذا اليوم</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {list.map((post) => {
        const pc = PLATFORM_CONFIG[post.platform] || PLATFORM_CONFIG.facebook
        const sc = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft
        const PlatformIcon = pc.icon

        return (
          <Card key={post.id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground line-clamp-2 leading-relaxed">
                    {post.message || <span className="text-muted-foreground italic">(بدون نص)</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge className={`text-[10px] px-1.5 py-0 rounded ${sc.color}`}>
                      {sc.label}
                    </Badge>
                    <Badge className={`text-[10px] px-1.5 py-0 rounded ${pc.color}`}>
                      <PlatformIcon className="size-2.5 ml-0.5 inline" />
                      {pc.label}
                    </Badge>
                    {post.scheduled_at && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="size-3" />
                        {format(new Date(post.scheduled_at), "HH:mm")}
                      </span>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    {post.status === "scheduled" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-emerald-600 hover:text-emerald-700"
                        onClick={() => onPublish(post.id)}
                        disabled={publishPending}
                        title="نشر الآن"
                      >
                        <Send className="size-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-foreground"
                      onClick={() => onEdit(post)}
                      title="تعديل"
                    >
                      <Edit3 className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={() => onDelete(post.id)}
                      disabled={deletePending}
                      title="حذف"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ponytail: week/day view toggle skipped — add when users request it
// ponytail: drag-and-drop reschedule skipped — add when UX requests it
// ponytail: calendar export/import skipped — add when needed
