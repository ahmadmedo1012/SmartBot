import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  fetchSubscribers, fetchSubscriber, tagSubscriber, untagSubscriber,
  fetchTags, createTag, deleteTag,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { format } from "date-fns"
import {
  Users, Search, Plus, X, Tag, MessageSquare,
  ChevronLeft, ChevronRight, AlertCircle,
  Clock, Send, Trash2, Smartphone,
} from "lucide-react"

// ── Constants ──
const PLATFORMS = [
  { value: "all", label: "الكل" },
  { value: "messenger", label: "ماسنجر" },
  { value: "instagram", label: "إنستغرام" },
  { value: "whatsapp", label: "واتساب" },
]

const PLATFORM_BADGES = {
  messenger: { label: "ماسنجر", color: "bg-primary/90" },
  instagram: { label: "إنستغرام", color: "bg-destructive/80" },
  whatsapp: { label: "واتساب", color: "bg-success" },
}

const TAG_COLORS = ["#6366f1", "#f59e0b", "#ef4444", "#22c55e", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6"]

// ── Helpers ──
function initials(name) {
  if (!name) return "?"
  return name.split(" ").slice(0, 2).map(s => s[0]?.toUpperCase() || "").join("")
}

function timeAgo(dateStr) {
  if (!dateStr) return ""
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "الآن"
  if (mins < 60) return `منذ ${mins} د`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `منذ ${hours} س`
  const days = Math.floor(hours / 24)
  if (days < 30) return `منذ ${days} ي`
  return format(new Date(dateStr), "yyyy/MM/dd")
}

// ── Subscribers Page ──
export function Subscribers({ role }) {
  useEffect(() => { document.title = "المشتركين | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()

  // Filters state
  const [search, setSearch] = useState("")
  const [platform, setPlatform] = useState("all")
  const [tagFilter, setTagFilter] = useState("all")
  const [page, setPage] = useState(1)

  // Dialogs state
  const [selectedId, setSelectedId] = useState(null)
  const [showTagManager, setShowTagManager] = useState(false)
  const [showAddTag, setShowAddTag] = useState(false)

  // Tag creation in tag manager
  const [newTagName, setNewTagName] = useState("")
  const [newTagColor, setNewTagColor] = useState("#6366f1")

  // ── Queries ──
  const {
    data: subsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["subscribers", search, platform, tagFilter, page],
    queryFn: () =>
      fetchSubscribers({
        search: search || undefined,
        platform: platform !== "all" ? platform : undefined,
        tag: tagFilter !== "all" ? tagFilter : undefined,
        page,
        per_page: 20,
      }),
    staleTime: 15000, refetchOnWindowFocus: true, retry: 2,
    placeholderData: (prev) => prev,
  })
  const subscribers = subsData?.items || []
  const total = subsData?.total || 0
  const totalPages = subsData?.total_pages || Math.ceil(total / 20) || 1

  const { data: tags = [] } = useQuery({
    queryKey: ["tags"],
    queryFn: fetchTags,
    staleTime: 30000, refetchOnWindowFocus: true,
  })

  const {
    data: detail,
    isLoading: detailLoading,
  } = useQuery({
    queryKey: ["subscriber", selectedId],
    queryFn: () => fetchSubscriber(selectedId),
    enabled: !!selectedId,
    staleTime: 10000,
  })

  // ── Mutations ──
  const tagMut = useMutation({
    mutationFn: ({ subId, tagId }) => tagSubscriber(subId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscribers"] })
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["subscriber", selectedId] })
      toast.success("تم إضافة الوسم")
    },
    onError: (e) => toast.error(e.message),
  })

  const untagMut = useMutation({
    mutationFn: ({ subId, tagId }) => untagSubscriber(subId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscribers"] })
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["subscriber", selectedId] })
    },
    onError: (e) => toast.error(e.message),
  })

  const createTagMut = useMutation({
    mutationFn: () => createTag(newTagName, newTagColor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] })
      setNewTagName("")
      toast.success("تم إنشاء الوسم")
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteTagMut = useMutation({
    mutationFn: (id) => deleteTag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] })
      if (tagFilter !== "all") setTagFilter("all")
      toast.success("تم حذف الوسم")
    },
    onError: (e) => toast.error(e.message),
  })

  const testMsgMut = useMutation({
    mutationFn: async (subId) => {
      const res = await fetch(`/api/subscribers/${subId}/test-message`, { method: "POST" })
      if (!res.ok) throw new Error((await res.text()).slice(0, 100))
      return res.json()
    },
    onSuccess: () => toast.success("تم إرسال رسالة اختبار"),
    onError: (e) => toast.error(e.message),
  })

  // ── Reset page on filter change ──
  const changeSearch = (val) => { setSearch(val); setPage(1) }
  const changePlatform = (val) => { setPlatform(val); setPage(1) }
  const changeTagFilter = (val) => { setTagFilter(val); setPage(1) }

  // ── Render ──
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="content-container space-y-6"
    >
      {/* ════ Header ════ */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold">المشتركين</h1>
          <p className="text-sm text-muted-foreground mt-1">
            إجمالي {total} مشترك
            {subsData?.unread_count > 0 && ` · ${subsData.unread_count} جديد`}
            {search && ` · نتائج البحث "${search}"`}
          </p>
        </div>
        {canEdit && (
          <Button variant="outline" onClick={() => setShowTagManager(true)}>
            <Tag className="ml-2 h-4 w-4" />إدارة الوسوم
          </Button>
        )}
      </div>

      {/* ════ Search & Filters ════ */}
      <div className="flex items-center gap-3 flex-col sm:flex-row sm:items-center">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث باسم المشترك..."
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
            className="pr-9 min-h-[44px] sm:min-h-0"
          />
          {search && (
            <button
              onClick={() => changeSearch("")}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Platform chips */}
        <div className="flex gap-1.5 overflow-x-auto">
          {PLATFORMS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => changePlatform(value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                platform === value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/70"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tag filter dropdown */}
        {tags.length > 0 && (
          <Select value={tagFilter} onValueChange={changeTagFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="الوسوم" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الوسوم</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ════ Content Area ════ */}
      {isLoading ? (
        /* ── Loading State ── */
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        /* ── Error State ── */
        <div className="flex flex-col items-center py-20">
          <AlertCircle className="h-14 w-14 text-destructive mb-4" />
          <p className="text-sm text-destructive font-medium mb-1">فشل تحميل المشتركين</p>
          <p className="text-xs text-muted-foreground mb-5 max-w-sm text-center">
            {error?.message || "حدث خطأ أثناء الاتصال بالخادم"}
          </p>
          <Button variant="outline" onClick={refetch}>
            إعادة المحاولة
          </Button>
        </div>
      ) : subscribers.length === 0 ? (
        /* ── Empty State ── */
        <div className="flex flex-col items-center py-20">
          <Users className="h-14 w-14 text-muted-foreground/20 mb-4" />
          <p className="text-sm text-foreground font-medium">
            {search || platform !== "all" || tagFilter !== "all"
              ? "لا توجد نتائج للبحث"
              : "لا يوجد مشتركين"}
          </p>
          <p className="text-xs text-muted-foreground mt-2 max-w-sm text-center">
            {search || platform !== "all" || tagFilter !== "all"
              ? "حاول تغيير معايير البحث أو إزالة الفلاتر"
              : "المشتركين سيظهرون هنا بعد أول تفاعل مع البوت"}
          </p>
          {(search || platform !== "all" || tagFilter !== "all") && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                changeSearch("")
                changePlatform("all")
                changeTagFilter("all")
              }}
            >
              إعادة تعيين الفلاتر
            </Button>
          )}
        </div>
      ) : (
        /* ── Data Table ── */
        <>
          <Card className="overflow-hidden">
            <div className="data-table-wrapper data-table-card-view"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[240px]">الاسم</TableHead>
                  <TableHead className="w-[100px]">المنصة</TableHead>
                  <TableHead className="w-[160px]">الوسوم</TableHead>
                  <TableHead className="w-16 text-center">الردود</TableHead>
                  <TableHead className="hidden md:table-cell w-[110px]">أول ظهور</TableHead>
                  <TableHead className="hidden md:table-cell w-[110px]">آخر تفاعل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscribers.map((sub) => (
                  <TableRow
                    key={sub.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      setSelectedId(sub.id)
                      setShowAddTag(false)
                    }}
                  >
                    {/* Name */}
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-9 shrink-0">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                            {initials(sub.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate max-w-[160px]">
                            {sub.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-mono truncate">
                            {sub.user_id?.slice(0, 16) || ""}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Platform */}
                    <TableCell data-label="المنصة">
                      {sub.platform ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white ${
                            PLATFORM_BADGES[sub.platform]?.color || "bg-muted-foreground"
                          }`}
                        >
                          <Smartphone className="size-2.5" />
                          {PLATFORM_BADGES[sub.platform]?.label || sub.platform}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Tags */}
                    <TableCell data-label="الوسوم">
                      <div className="flex items-center gap-1">
                        {(sub.tags || []).slice(0, 4).map((t) => (
                          <span
                            key={t.id}
                            className="size-2.5 rounded-full ring-1 ring-black/5"
                            style={{ backgroundColor: t.color }}
                            title={t.name}
                          />
                        ))}
                        {sub.tags?.length > 4 && (
                          <span className="text-[10px] text-muted-foreground font-medium">
                            +{sub.tags.length - 4}
                          </span>
                        )}
                        {(!sub.tags || sub.tags.length === 0) && (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Reply count */}
                    <TableCell data-label="الردود" className="text-center">
                      <span className="text-sm tabular-nums font-medium">
                        {sub.reply_count || 0}
                      </span>
                    </TableCell>

                    {/* First seen */}
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {sub.first_seen
                          ? format(new Date(sub.first_seen), "yyyy/MM/dd")
                          : "—"}
                      </span>
                    </TableCell>

                    {/* Last interaction */}
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {timeAgo(sub.last_interaction)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div>
          </Card>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                عرض {subscribers.length} من {total} مشترك
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronRight className="size-4" />
                  السابق
                </Button>

                {/* Page numbers (show max 5) */}
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const offset = Math.max(0, Math.min(page - 3, totalPages - 5))
                  const p = offset + i + 1
                  if (p > totalPages) return null
                  return (
                    <Button
                      key={p}
                      variant={page === p ? "default" : "outline"}
                      size="sm"
                      className="min-w-[2rem]"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  )
                })}

                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  التالي
                  <ChevronLeft className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════
           Subscriber Detail Dialog
           ════════════════════════════════════════════════ */}
      <Dialog
        open={!!selectedId}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedId(null)
            setShowAddTag(false)
          }
        }}
      >
        <DialogContent className="glass-heavy max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل المشترك</DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-4 p-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-7 w-full rounded-lg" />
              ))}
            </div>
          ) : detail ? (
            <div className="space-y-5 pt-1">
              {/* ── Info Section ── */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    الاسم
                  </label>
                  <p className="text-sm font-medium mt-0.5">{detail.name || "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    المنصة
                  </label>
                  <p className="text-sm mt-0.5">
                    {detail.platform ? (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white ${
                          PLATFORM_BADGES[detail.platform]?.color || "bg-muted-foreground"
                        }`}
                      >
                        <Smartphone className="size-2.5" />
                        {PLATFORM_BADGES[detail.platform]?.label || detail.platform}
                      </span>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    معرف المستخدم
                  </label>
                  <p className="text-xs font-mono mt-0.5 break-all text-muted-foreground">
                    {detail.user_id || detail.fb_user_id || "—"}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    عدد الردود
                  </label>
                  <p className="text-sm font-medium mt-0.5">{detail.reply_count || 0}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    أول ظهور
                  </label>
                  <p className="text-sm mt-0.5">
                    {detail.first_seen
                      ? format(new Date(detail.first_seen), "yyyy/MM/dd")
                      : "—"}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    آخر تفاعل
                  </label>
                  <p className="text-sm mt-0.5">
                    {detail.last_interaction
                      ? timeAgo(detail.last_interaction)
                      : "—"}
                  </p>
                </div>
              </div>

              {/* ── Tags Section ── */}
              <div className="space-y-2.5">
                <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <Tag className="size-3.5" />
                  الوسوم
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {(detail.tags || []).length === 0 ? (
                    <span className="text-xs font-medium text-muted-foreground">لا توجد وسوم</span>
                  ) : (
                    (detail.tags || []).map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: t.color + "18",
                          color: t.color,
                        }}
                      >
                        {t.name}
                        {canEdit && (
                          <X
                            className="size-3 cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                            onClick={() => untagMut.mutate({ subId: selectedId, tagId: t.id })}
                          />
                        )}
                      </span>
                    ))
                  )}
                </div>

                {/* Add tag popover */}
                {canEdit && (
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => setShowAddTag(!showAddTag)}
                    >
                      <Plus className="size-3" />
                      إضافة وسم
                    </Button>
                    {showAddTag && (
                      <div className="mt-1.5 p-2 rounded-lg border bg-card shadow-lg max-w-[260px]">
                        {tags.filter(
                          (t) => !(detail.tags || []).find((st) => st.id === t.id)
                        ).length === 0 ? (
                          <p className="text-xs text-muted-foreground px-2 py-2 text-center">
                            {tags.length === 0
                              ? "لا توجد وسوم متاحة. أنشئ وسماً جديداً من إدارة الوسوم"
                              : "كل الوسوم مضافة"}
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {tags
                              .filter(
                                (t) => !(detail.tags || []).find((st) => st.id === t.id)
                              )
                              .map((t) => (
                                <button
                                  key={t.id}
                                  onClick={() => {
                                    tagMut.mutate({ subId: selectedId, tagId: t.id })
                                    setShowAddTag(false)
                                  }}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs hover:bg-muted transition-colors"
                                >
                                  <span
                                    className="size-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: t.color }}
                                  />
                                  {t.name}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Recent Replies ── */}
              <div className="space-y-2.5">
                <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <MessageSquare className="size-3.5" />
                  آخر الردود
                </label>
                <div className="space-y-2 max-h-[240px] overflow-y-auto">
                  {(!detail.recent_replies || detail.recent_replies.length === 0) ? (
                    <div className="text-center py-6 bg-muted/20 rounded-lg">
                      <MessageSquare className="size-6 mx-auto text-muted-foreground/30 mb-1" />
                      <p className="text-xs text-muted-foreground">لا توجد ردود سابقة</p>
                    </div>
                  ) : (
                    (detail.recent_replies || []).slice(0, 10).map((r, i) => (
                      <div key={r.id || i} className="p-3 rounded-lg bg-muted/40 text-sm">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-medium text-foreground">
                            {r.rule_name || "رد تلقائي"}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {timeAgo(r.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {r.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* ── Active Sequences ── */}
              {detail.sequences && detail.sequences.length > 0 && (
                <div className="space-y-2.5">
                  <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    التسلسلات النشطة
                  </label>
                  <div className="space-y-1.5">
                    {detail.sequences.map((seq, i) => (
                      <div
                        key={seq.id || i}
                        className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30"
                      >
                        <span className="size-2 rounded-full bg-primary shrink-0" />
                        <span className="text-sm font-medium">{seq.name}</span>
                        {seq.current_step || seq.step ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 mr-auto">
                            الخطوة {seq.current_step || seq.step}
                          </Badge>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Quick Actions ── */}
              <div className="flex items-center gap-2 pt-3 border-t">
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testMsgMut.mutate(selectedId)}
                    disabled={testMsgMut.isPending}
                  >
                    <Send className="ml-1.5 h-3.5 w-3.5" />
                    {testMsgMut.isPending ? "جاري..." : "إرسال رسالة اختبار"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedId(null)}
                >
                  إغلاق
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════
           Tags Manager Dialog
           ════════════════════════════════════════════════ */}
      <Dialog
        open={showTagManager}
        onOpenChange={(o) => {
          if (!o) {
            setShowTagManager(false)
            setNewTagName("")
          }
        }}
      >
        <DialogContent className="glass-heavy max-w-md">
          <DialogHeader>
            <DialogTitle>إدارة الوسوم</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            {/* ── Create New Tag ── */}
            {canEdit && (
              <div className="space-y-3 pb-4 border-b">
                <h3 className="text-sm font-medium">وسم جديد</h3>
                <Input
                  placeholder="اسم الوسم"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      newTagName.trim() &&
                      !createTagMut.isPending
                    ) {
                      createTagMut.mutate()
                    }
                  }}
                />
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">
                    اختر لون الوسم
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {TAG_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewTagColor(c)}
                        className={`size-8 rounded-full border-2 transition-all ${
                          newTagColor === c
                            ? "border-foreground scale-110 shadow-md"
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="px-3 py-1.5 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: newTagColor + "20",
                      color: newTagColor,
                    }}
                  >
                    {newTagName || "اسم الوسم"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    معاينة الوسم
                  </div>
                </div>
                <Button
                  onClick={() => createTagMut.mutate()}
                  disabled={!newTagName.trim() || createTagMut.isPending}
                  className="w-full"
                >
                  {createTagMut.isPending ? "جاري الإنشاء..." : "إنشاء الوسم"}
                </Button>
              </div>
            )}

            {/* ── Existing Tags ── */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">
                الوسوم الموجودة ({tags.length})
              </h3>
              <div className="space-y-1 max-h-[280px] overflow-y-auto">
                {tags.length === 0 ? (
                  <div className="flex flex-col items-center py-10">
                    <Tag className="size-10 text-muted-foreground/20 mb-2" />
                    <p className="text-sm text-muted-foreground">لا توجد وسوم بعد</p>
                    {canEdit && (
                      <p className="text-xs text-muted-foreground mt-1">
                        أنشئ وسماً جديداً من الأعلى
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {tags.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="size-3 rounded-full shrink-0 ring-1 ring-black/5"
                            style={{ backgroundColor: t.color }}
                          />
                          <div className="min-w-0">
                            <span
                              className="text-sm truncate block"
                              style={{ color: t.color }}
                            >
                              {t.name}
                            </span>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-5 font-mono"
                          >
                            {t.subscriber_count || 0}
                          </Badge>
                        </div>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `هل أنت متأكد من حذف الوسم "${t.name}"؟\nسيتم إزالة الوسم من جميع المشتركين.`
                                )
                              ) {
                                deleteTagMut.mutate(t.id)
                              }
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className="mobile-nav-spacer" />
    </motion.div>
  )
}
