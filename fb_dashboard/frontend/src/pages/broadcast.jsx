import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  fetchBroadcasts, createBroadcast, sendBroadcast, cancelBroadcast, deleteBroadcast,
  estimateAudience, fetchTags,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  Plus, Send, X, Trash2, ArrowLeft, Users, MessageSquare,
  Calendar, Clock, AlertCircle, Eye, BarChart3,
  XCircle, Loader2, Image as ImageIcon,
} from "lucide-react"

// ── Status helpers ──
const STATUS_MAP = {
  draft: { label: "مسودة", color: "bg-muted text-muted-foreground border-muted" },
  sending: { label: "جارٍ الإرسال", color: "bg-info/10 text-info border-info/30" },
  sent: { label: "تم الإرسال", color: "bg-success/10 text-success border-success/30" },
  cancelled: { label: "ملغي", color: "bg-destructive/10 text-destructive border-destructive/30" },
  partial: { label: "جزئي", color: "bg-warning/10 text-warning border-warning/30" },
}

const PLATFORMS = [
  { value: "all", label: "الكل" },
  { value: "messenger", label: "Messenger" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
]

const LAST_INTERACTION = [
  { value: "any", label: "في أي وقت" },
  { value: "7d", label: "آخر 7 أيام" },
  { value: "30d", label: "آخر 30 يوم" },
  { value: "90d", label: "آخر 90 يوم" },
]

// ── Estimate Button ──
function EstimateButton({ filters, onCount }) {
  const [loading, setLoading] = useState(false)
  const handleEstimate = async () => {
    setLoading(true)
    try {
      const res = await estimateAudience(filters)
      onCount(res?.count ?? res?.estimated ?? 0)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={handleEstimate} disabled={loading}>
      <Users className="ml-1 size-3.5" />
      {loading ? "جاري التقدير..." : "تقدير الجمهور"}
    </Button>
  )
}

// ── Status Badge ──
function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.draft
  return <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0.5", s.color)}>{s.label}</Badge>
}

// ── Progress Bar ──
// ponytail: used inline in details view

// ── Broadcast Composer ──
function Composer({ onBack, queryClient }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState("")
  const [platform, setPlatform] = useState("all")
  const [hasTags, setHasTags] = useState([])
  const [notTags, setNotTags] = useState([])
  const [lastInteraction, setLastInteraction] = useState("any")
  const [minReplies, setMinReplies] = useState("")
  const [estimatedCount, setEstimatedCount] = useState(null)
  const [message, setMessage] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [schedule, setSchedule] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: fetchTags })

  const createMut = useMutation({
    mutationFn: (data) => createBroadcast(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] })
      toast.success("تم إنشاء البث")
      onBack()
    },
    onError: (e) => toast.error(e.message),
  })

  const filters = {
    platform: platform !== "all" ? platform : undefined,
    has_tags: hasTags.length > 0 ? hasTags : undefined,
    not_tags: notTags.length > 0 ? notTags : undefined,
    last_interaction: lastInteraction !== "any" ? lastInteraction : undefined,
    min_replies: minReplies ? parseInt(minReplies) : undefined,
  }

  const handleSend = () => {
    createMut.mutate({
      name,
      platform,
      filters,
      message,
      image_url: imageUrl || undefined,
      scheduled_at: schedule || undefined,
    })
  }

  const canProceed = () => {
    if (step === 0) return !!name.trim()
    if (step === 2) return !!message.trim()
    return true
  }

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">اسم البث</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: عروض الأسبوع" autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">المنصة</label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )
      case 1: return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">يحتوي على الوسوم</label>
            <Select value={hasTags.length === 1 ? hasTags[0] : ""} onValueChange={v => setHasTags(hasTags.includes(v) ? hasTags.filter(t => t !== v) : [...hasTags, v])}>
              <SelectTrigger><SelectValue placeholder="اختر الوسوم" /></SelectTrigger>
              <SelectContent>
                {tags.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {hasTags.map(tid => {
                  const t = tags.find(tt => tt.id === tid)
                  return t ? <span key={tid} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary"><span>{t.name}</span><button onClick={() => setHasTags(hasTags.filter(x => x !== tid))}><X className="size-2.5" /></button></span> : null
                })}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">لا يحتوي على الوسوم</label>
            <Select value={notTags.length === 1 ? notTags[0] : ""} onValueChange={v => setNotTags(notTags.includes(v) ? notTags.filter(t => t !== v) : [...notTags, v])}>
              <SelectTrigger><SelectValue placeholder="اختر الوسوم" /></SelectTrigger>
              <SelectContent>
                {tags.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {notTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {notTags.map(tid => {
                  const t = tags.find(tt => tt.id === tid)
                  return t ? <span key={tid} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive"><span>{t.name}</span><button onClick={() => setNotTags(notTags.filter(x => x !== tid))}><X className="size-2.5" /></button></span> : null
                })}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">آخر تفاعل</label>
            <Select value={lastInteraction} onValueChange={setLastInteraction}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LAST_INTERACTION.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">الحد الأدنى للردود</label>
            <Input type="number" min={0} value={minReplies} onChange={e => setMinReplies(e.target.value)} placeholder="0" className="w-32" />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <EstimateButton filters={filters} onCount={setEstimatedCount} />
            {estimatedCount !== null && (
              <span className="text-sm font-semibold text-primary flex items-center gap-1">
                <Users className="size-4" /> ~{estimatedCount.toLocaleString()} مشترك
              </span>
            )}
          </div>
        </div>
      )
      case 2: return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">نص الرسالة</label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={6}
              placeholder="أدخل نص الرسالة...&#10;&#10;المتغيرات: {name} - اسم المشترك&#10;{full_name} - الاسم الكامل&#10;{platform} - اسم المنصة" />
            <p className="text-[11px] text-muted-foreground">
              المتغيرات المتاحة: <code className="bg-muted px-1 rounded text-[10px]">{'{name}'}</code>{' '}
              <code className="bg-muted px-1 rounded text-[10px]">{'{full_name}'}</code>{' '}
              <code className="bg-muted px-1 rounded text-[10px]">{'{platform}'}</code>
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><ImageIcon className="size-3.5 text-muted-foreground" /> رابط الصورة <Badge variant="outline" className="text-[10px] px-1 py-0">اختياري</Badge></label>
            <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" dir="ltr" />
          </div>
          <Card className="bg-muted/30">
            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-muted-foreground">معاينة الرسالة</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <p className="text-sm whitespace-pre-wrap break-words">{message || <span className="text-muted-foreground/40">سيظهر نص الرسالة هنا</span>}</p>
                {imageUrl && <img src={imageUrl} alt="" className="max-h-40 rounded object-cover" onError={e => e.target.style.display = "none"} />}
              </div>
            </CardContent>
          </Card>
        </div>
      )
      case 3: return (
        <div className="space-y-4">
          <p className="text-sm font-semibold">مراجعة البث</p>
          <div className="rounded-lg border divide-y text-sm">
            <div className="p-3 flex justify-between"><span className="text-muted-foreground">الاسم</span><span className="font-medium">{name}</span></div>
            <div className="p-3 flex justify-between"><span className="text-muted-foreground">المنصة</span><span className="font-medium">{PLATFORMS.find(p => p.value === platform)?.label}</span></div>
            {hasTags.length > 0 && <div className="p-3 flex justify-between"><span className="text-muted-foreground">الوسوم (يحتوي)</span><span className="font-medium">{hasTags.map(tid => tags.find(t => t.id === tid)?.name).join("، ")}</span></div>}
            {notTags.length > 0 && <div className="p-3 flex justify-between"><span className="text-muted-foreground">الوسوم (لا يحتوي)</span><span className="font-medium">{notTags.map(tid => tags.find(t => t.id === tid)?.name).join("، ")}</span></div>}
            {estimatedCount !== null && <div className="p-3 flex justify-between"><span className="text-muted-foreground">الجمهور المقدر</span><span className="font-medium">{estimatedCount.toLocaleString()} مشترك</span></div>}
            <div className="p-3"><span className="text-muted-foreground block mb-1">الرسالة</span><p className="text-sm whitespace-pre-wrap break-words rounded bg-muted/40 p-2">{message}</p></div>
          </div>
          <div className="space-y-1.5 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <Calendar className="size-4 text-muted-foreground" />
              <span>جدولة لوقت لاحق</span>
            </label>
            <Input type="datetime-local" value={schedule} onChange={e => setSchedule(e.target.value)} className="w-64" />
          </div>
        </div>
      )
    }
  }

  const steps = [
    { label: "معلومات أساسية", icon: MessageSquare },
    { label: "تصفية الجمهور", icon: Users },
    { label: "الرسالة", icon: MessageSquare },
    { label: "مراجعة", icon: Eye },
  ]

  return (
    <div className="content-container space-y-6 animate-fade-in">
      {/* Steps indicator */}
      <div className="flex items-center gap-1 rtl:flex-row-reverse">
        {steps.map((s, i) => {
          const Icon = s.icon
          const active = i === step
          const done = i < step
          return (
            <div key={i} className="flex items-center gap-1 flex-1">
              <button
                type="button"
                onClick={() => done ? setStep(i) : null}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                  active ? "bg-primary text-primary-foreground" : done ? "text-primary cursor-pointer" : "text-muted-foreground/40 cursor-default",
                )}
              >
                <Icon className="size-3" />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < steps.length - 1 && <div className={cn("flex-1 h-px", done ? "bg-primary" : "bg-muted")} />}
            </div>
          )
        })}
      </div>

      {/* Step Content */}
      <Card>
        <CardContent className="p-6">{renderStep()}</CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => step > 0 ? setStep(s => s - 1) : onBack()}>
          <ArrowLeft className="ml-1 size-3.5" /> {step > 0 ? "السابق" : "إلغاء"}
        </Button>
        {step < 3 ? (
          <Button size="sm" onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
            التالي <ArrowLeft className="mr-1 size-3.5 rotate-180" />
          </Button>
        ) : (
          <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={createMut.isPending}>
            <Send className="ml-1 size-3.5" />
            {createMut.isPending ? "جاري..." : schedule ? "جدولة" : "إرسال"}
          </Button>
        )}
      </div>

      {/* Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="glass-heavy">
          <DialogHeader><DialogTitle>تأكيد الإرسال</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            سيتم إرسال الرسالة إلى <strong className="text-foreground">{estimatedCount?.toLocaleString() || "..."} مشترك</strong>.
            {schedule ? ` مجدولة في ${new Date(schedule).toLocaleString("ar-SA")}.` : " هل أنت متأكد؟"}
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>إلغاء</Button>
            <Button onClick={handleSend} disabled={createMut.isPending}>
              {createMut.isPending ? "جاري..." : schedule ? "تأكيد الجدولة" : "إرسال"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Broadcast Detail ──
function BroadcastDetail({ broadcastId, onBack }) {
  const [collapsedFailed, setCollapsedFailed] = useState(true)

  const { data: broadcasts = [] } = useQuery({ queryKey: ["broadcasts"], queryFn: fetchBroadcasts })
  const b = broadcasts.find(x => x.id === broadcastId)
  const queryClient = useQueryClient()

  const cancelMut = useMutation({
    mutationFn: () => cancelBroadcast(broadcastId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["broadcasts"] }); toast.success("تم إلغاء البث") },
    onError: (e) => toast.error(e.message),
  })

  if (!b) return <div className="flex items-center justify-center py-16"><Skeleton className="h-48 w-full max-w-md rounded-xl" /></div>

  const total = (b.sent_count || 0) + (b.failed_count || 0) + (b.pending_count || 0)
  const sentPct = total ? Math.round(((b.sent_count || 0) / total) * 100) : 0
  const failedPct = total ? Math.round(((b.failed_count || 0) / total) * 100) : 0
  const pendPct = total ? Math.round(((b.pending_count || 0) / total) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-8" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h2 className="text-lg font-bold">{b.name}</h2>
          <StatusBadge status={b.status} />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 text-center space-y-1">
          <BarChart3 className="size-5 mx-auto text-success" />
          <p className="text-xl font-bold">{b.sent_count || 0}</p>
          <p className="text-[10px] text-muted-foreground">تم الإرسال</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center space-y-1">
          <XCircle className="size-5 mx-auto text-destructive" />
          <p className="text-xl font-bold">{b.failed_count || 0}</p>
          <p className="text-[10px] text-muted-foreground">فشل</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center space-y-1">
          <Loader2 className="size-5 mx-auto text-warning" />
          <p className="text-xl font-bold">{b.pending_count || 0}</p>
          <p className="text-[10px] text-muted-foreground">قيد الانتظار</p>
        </CardContent></Card>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{sentPct}% تم · {failedPct}% فشل · {pendPct}% معلق</span>
          {b.scheduled_at && <span className="flex items-center gap-1"><Clock className="size-3" />{new Date(b.scheduled_at).toLocaleString("ar-SA")}</span>}
        </div>
        <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex">
          <div className="h-full bg-success transition-all" style={{ width: `${sentPct}%` }} title={`تم: ${sentPct}%`} />
          {failedPct > 0 && <div className="h-full bg-destructive transition-all" style={{ width: `${failedPct}%` }} title={`فشل: ${failedPct}%`} />}
          {pendPct > 0 && <div className="h-full bg-warning transition-all" style={{ width: `${pendPct}%` }} title={`معلق: ${pendPct}%`} />}
        </div>
      </div>

      {/* Settings read-only */}
      <Card>
        <CardHeader><CardTitle className="text-sm">تفاصيل البث</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex justify-between"><span className="text-muted-foreground">المنصة</span><span>{b.platform ? PLATFORMS.find(p => p.value === b.platform)?.label || b.platform : "الكل"}</span></div>
          {b.scheduled_at && <div className="flex justify-between"><span className="text-muted-foreground">مجدول في</span><span>{new Date(b.scheduled_at).toLocaleString("ar-SA")}</span></div>}
          {b.sent_at && <div className="flex justify-between"><span className="text-muted-foreground">تاريخ الإرسال</span><span>{new Date(b.sent_at).toLocaleString("ar-SA")}</span></div>}
          <div className="pt-2 border-t">
            <p className="text-muted-foreground mb-1">الرسالة</p>
            <div className="rounded bg-muted/40 p-3 whitespace-pre-wrap text-sm">{b.message}</div>
          </div>
        </CardContent>
      </Card>

      {/* Failed recipients */}
      {b.failed_recipients?.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setCollapsedFailed(!collapsedFailed)}>
            <CardTitle className="text-sm flex items-center justify-between">
              <span>المستلمون الفاشلون ({b.failed_recipients.length})</span>
              <Badge variant="outline" className="text-[10px]">{collapsedFailed ? "عرض" : "إخفاء"}</Badge>
            </CardTitle>
          </CardHeader>
          {!collapsedFailed && (
            <CardContent className="space-y-1">
              {b.failed_recipients.map((r, i) => (
                <div key={i} className="text-xs text-muted-foreground flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
                  <XCircle className="size-3 text-destructive shrink-0" />
                  <span>{r.name || r.user_id || `#${r.id || i}`}</span>
                  {r.error && <span className="text-destructive/70">— {r.error}</span>}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Cancel button */}
      {(b.status === "sending" || b.status === "draft") && (
        <Button variant="destructive" onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}>
          {cancelMut.isPending ? "جاري..." : "إلغاء البث"}
        </Button>
      )}
    </div>
  )
}

// ── Main Broadcast Component ──
export function Broadcast({ role }) {
  useEffect(() => { document.title = "البث الجماعي | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const canSend = role === "admin"
  const queryClient = useQueryClient()
  const [view, setView] = useState("list")
  const [selectedId, setSelectedId] = useState(null)

  const { data: broadcasts = [], isLoading, error, refetch } = useQuery({
    queryKey: ["broadcasts"], queryFn: fetchBroadcasts,
    staleTime: 15000, refetchOnWindowFocus: true, retry: 2,
    placeholderData: (prev) => prev,
  })

  const sendMut = useMutation({
    mutationFn: (id) => sendBroadcast(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["broadcasts"] }); toast.success("بدأ الإرسال") },
    onError: (e) => toast.error(e.message),
  })

  const cancelMut = useMutation({
    mutationFn: (id) => cancelBroadcast(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["broadcasts"] }); toast.success("تم إلغاء البث") },
    onError: (e) => toast.error(e.message),
  })

  const [deleteTarget, setDeleteTarget] = useState(null)
  const deleteMut = useMutation({
    mutationFn: (id) => deleteBroadcast(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["broadcasts"] }); setDeleteTarget(null); toast.success("تم الحذف") },
    onError: (e) => toast.error(e.message),
  })

  // Composer / Detail views
  if (view === "composer") return <Composer onBack={() => setView("list")} queryClient={queryClient} />
  if (view === "detail" && selectedId) return <BroadcastDetail broadcastId={selectedId} onBack={() => { setView("list"); setSelectedId(null) }} />

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="content-container space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold">البث الجماعي</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {broadcasts.length} بث{broadcasts.length > 0 && ` · ${broadcasts.filter(b => b.status === "sent").length} تم`}
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setView("composer")}>
            <Plus className="ml-2 h-4 w-4" /> إنشاء بث جديد
          </Button>
        )}
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
      ) : error ? (
        /* Error */
        <div className="flex flex-col items-center py-16">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <p className="text-sm text-muted-foreground mb-4">{error?.message || "فشل تحميل البثات"}</p>
          <Button variant="outline" onClick={refetch}>إعادة المحاولة</Button>
        </div>
      ) : broadcasts.length === 0 ? (
        /* Empty */
        <div className="flex flex-col items-center py-16">
          <Send className="h-16 w-16 text-muted-foreground/20 mb-4" />
          <p className="text-sm text-foreground font-medium">لا توجد بثات بعد</p>
          <p className="text-xs text-muted-foreground mt-1 mb-6">
            {canEdit ? "أنشئ بثاً جماعياً للبدء" : "البثات ستظهر هنا"}
          </p>
          {canEdit && (
            <Button variant="outline" onClick={() => setView("composer")}>
              <Plus className="ml-2 h-4 w-4" /> إنشاء بث جديد
            </Button>
          )}
        </div>
      ) : (
        /* Table */
        <div className="rounded-lg border overflow-hidden">
          <div className="data-table-wrapper data-table-card-view"><Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">الاسم</TableHead>
                <TableHead className="text-xs">الحالة</TableHead>
                <TableHead className="text-xs">الجمهور</TableHead>
                <TableHead className="text-xs">التاريخ</TableHead>
                <TableHead className="text-xs w-28">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map(b => {
                const total = (b.sent_count || 0) + (b.failed_count || 0)
                return (
                  <TableRow
                    key={b.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => { setSelectedId(b.id); setView("detail") }}
                  >
                    <TableCell className="text-sm font-medium" data-label="الاسم">{b.name}</TableCell>
                    <TableCell data-label="الحالة"><StatusBadge status={b.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground" data-label="الجمهور">
                      {b.sent_count || 0}/{b.failed_count || 0}/{total || "-"}{total ? " تم/فشل/كل" : ""}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground" data-label="التاريخ">
                      {b.sent_at ? new Date(b.sent_at).toLocaleDateString("ar-SA") : b.created_at ? new Date(b.created_at).toLocaleDateString("ar-SA") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        {b.status === "draft" && canSend && (
                          <Button variant="ghost" size="icon" className="size-7 text-success hover:text-success/80"
                            onClick={() => sendMut.mutate(b.id)} disabled={sendMut.isPending}>
                            <Send className="size-3.5" />
                          </Button>
                        )}
                        {b.status === "sending" && canSend && (
                          <Button variant="ghost" size="icon" className="size-7 text-destructive/70 hover:text-destructive"
                            onClick={() => cancelMut.mutate(b.id)} disabled={cancelMut.isPending}>
                            <X className="size-3.5" />
                          </Button>
                        )}
                        {(b.status === "draft" || b.status === "cancelled") && canEdit && (
                          <Button variant="ghost" size="icon" className="size-7 text-destructive/70 hover:text-destructive"
                            onClick={() => setDeleteTarget(b)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table></div>
        </div>
      )}

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null) }}>
        <DialogContent className="glass-heavy">
          <DialogHeader><DialogTitle>تأكيد حذف البث</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف <strong className="text-foreground">{deleteTarget?.name}</strong>؟ لا يمكن التراجع.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "جاري..." : "حذف"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="mobile-nav-spacer" />
    </motion.div>
  )
}
