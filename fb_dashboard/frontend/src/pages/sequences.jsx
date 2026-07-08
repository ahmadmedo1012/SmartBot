import { useState, useEffect, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  fetchSequences, createSequence, updateSequence, deleteSequence,
  fetchSequence, addSequenceStep, updateSequenceStep, deleteSequenceStep,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  Plus, Save, Trash2, ArrowLeft, ChevronUp, ChevronDown,
  MessageSquare, Image, Columns,
  AlertCircle, ListOrdered, Users, Send, BarChart3,
  Search,
} from "lucide-react"

// ── Helpers ──
function formatDelay(days, hours) {
  if (days === 0 && hours === 0) return "فوراً"
  const parts = []
  if (days > 0) parts.push(`${days} ${days === 1 ? "يوم" : "أيام"}`)
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "ساعة" : "ساعات"}`)
  return "بعد " + parts.join(" و ")
}

const STATUS_STYLES = {
  draft: { label: "مسودة", variant: "secondary" },
  active: { label: "نشط", variant: "default" },
  paused: { label: "متوقف", variant: "outline" },
}

const MESSAGE_TYPE_STYLES = {
  text: { label: "نص", icon: MessageSquare },
  image: { label: "صورة", icon: Image },
  carousel: { label: "كاروسيل", icon: Columns },
}

// ── Step Card ──
function StepCard({ step, index, canEdit, onEdit, onDelete, onMoveUp, onMoveDown, isFirst, isLast, isExpanded, onToggleExpand }) {
  const TypeIcon = MESSAGE_TYPE_STYLES[step.message_type]?.icon || MessageSquare
  const typeLabel = MESSAGE_TYPE_STYLES[step.message_type]?.label || "نص"
  const preview = step.message_template
    ? (step.message_template.length > 80 ? step.message_template.slice(0, 80) + "…" : step.message_template)
    : ""

  return (
    <Card className={cn("border-r-4 transition-all", isExpanded ? "border-r-primary shadow-md" : "border-r-muted-foreground/20 hover:shadow-sm")}>
      <CardContent className="p-0">
        {/* ── Collapsed header ── */}
        <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => onToggleExpand(step.id)}>
          <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">{index + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-xs font-semibold">{formatDelay(step.delay_days || 0, step.delay_hours || 0)}</span>
              <Badge variant="outline" className="text-[9px] px-1 py-0 flex items-center gap-0.5">
                <TypeIcon className="size-2.5" /> {typeLabel}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{preview || "بدون محتوى"}</p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" disabled={isFirst}
                onClick={() => onMoveUp(index)}><ChevronUp className="size-3.5" /></Button>
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" disabled={isLast}
                onClick={() => onMoveDown(index)}><ChevronDown className="size-3.5" /></Button>
              <Button variant="ghost" size="icon" className="size-7 text-destructive/70 hover:text-destructive"
                onClick={() => onDelete(step)}><Trash2 className="size-3.5" /></Button>
            </div>
          )}
        </div>

        {/* ── Expanded inline editor ── */}
        {isExpanded && canEdit && (
          <StepFormInline step={step} onSave={onEdit} onCancel={() => onToggleExpand(null)} />
        )}
      </CardContent>
    </Card>
  )
}

// ── Inline Step Editor Form ──
function StepFormInline({ step: initial, onSave, onCancel }) {
  const [delayDays, setDelayDays] = useState(initial?.delay_days || 0)
  const [delayHours, setDelayHours] = useState(initial?.delay_hours || 0)
  const [messageTemplate, setMessageTemplate] = useState(initial?.message_template || "")
  const [messageType, setMessageType] = useState(initial?.message_type || "text")
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({ ...initial, delay_days: delayDays, delay_hours: delayHours, message_template: messageTemplate, message_type: messageType })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t p-3 space-y-3 bg-muted/20">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground">أيام التأخير</label>
          <Input type="number" min={0} className="h-8 text-xs" value={delayDays}
            onChange={(e) => setDelayDays(Math.max(0, parseInt(e.target.value) || 0))} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground">ساعات التأخير</label>
          <Input type="number" min={0} max={23} className="h-8 text-xs" value={delayHours}
            onChange={(e) => setDelayHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))} />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground">نوع الرسالة</label>
        <Select value={messageType} onValueChange={setMessageType}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="text">نص</SelectItem>
            <SelectItem value="image">صورة</SelectItem>
            <SelectItem value="carousel">كاروسيل</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground">نموذج الرسالة</label>
        <Textarea className="min-h-[80px] text-xs leading-relaxed" value={messageTemplate}
          onChange={(e) => setMessageTemplate(e.target.value)}
          placeholder={'مرحباً {name}! شكراً لتواصلك'} />
        <p className="text-[9px] text-muted-foreground leading-relaxed">
          المتغيرات المدعومة: <code className="bg-muted px-1 rounded text-[9px]">{'{name}'}</code>,
          <code className="bg-muted px-1 rounded text-[9px]">{'{full_name}'}</code>,
          <code className="bg-muted px-1 rounded text-[9px]">{'{mention}'}</code>
        </p>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>إلغاء</Button>
        <Button type="submit" size="sm" className="h-7 text-xs" disabled={saving}>
          {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
        </Button>
      </div>
    </form>
  )
}

// ── Sequence Editor ──
function SequenceEditor({ seqId, onBack, canEdit, queryClient }) {
  const { data: sequence, isLoading, error } = useQuery({
    queryKey: ["sequence", seqId],
    queryFn: () => fetchSequence(seqId),
    enabled: !!seqId,
  })

  const [expandedStep, setExpandedStep] = useState(null)
  const [localName, setLocalName] = useState("")
  const [localDesc, setLocalDesc] = useState("")
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (sequence) {
      setLocalName(sequence.name || "")
      setLocalDesc(sequence.description || "")
    }
  }, [sequence])

  const updateMut = useMutation({
    mutationFn: (data) => updateSequence(seqId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequences"] })
      queryClient.invalidateQueries({ queryKey: ["sequence", seqId] })
      setDirty(false)
      toast.success("تم حفظ التسلسل")
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteSequence(seqId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequences"] })
      toast.success("تم حذف التسلسل")
      onBack()
    },
    onError: (e) => toast.error(e.message),
  })

  const addStepMut = useMutation({
    mutationFn: (data) => addSequenceStep(seqId, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["sequence", seqId] })
      const newId = res?.id || res?.step_id
      if (newId) setExpandedStep(newId)
      toast.success("تمت إضافة الخطوة")
    },
    onError: (e) => toast.error(e.message),
  })

  const updateStepMut = useMutation({
    mutationFn: ({ stepId, data }) => updateSequenceStep(stepId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequence", seqId] })
      toast.success("تم تحديث الخطوة")
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteStepMut = useMutation({
    mutationFn: (stepId) => deleteSequenceStep(stepId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequence", seqId] })
      toast.success("تم حذف الخطوة")
    },
    onError: (e) => toast.error(e.message),
  })

  const handleSaveDetails = () => updateMut.mutate({ name: localName, description: localDesc })

  const handleDelete = () => {
    if (window.confirm("هل أنت متأكد من حذف هذا التسلسل؟")) deleteMut.mutate()
  }

  const handleAddStep = () => addStepMut.mutate({ delay_days: 1, delay_hours: 0, message_template: "", message_type: "text" })

  const handleSaveStep = async (step) => {
    if (step.id) {
      await updateStepMut.mutateAsync({ stepId: step.id, data: step })
    } else {
      await addStepMut.mutateAsync(step)
    }
    setExpandedStep(null)
  }

  const handleDeleteStep = (step) => {
    if (window.confirm("حذف هذه الخطوة؟")) deleteStepMut.mutate(step.id)
  }

  const handleMoveStep = (index, direction) => {
    const steps = sequence?.steps || []
    const sorted = [...steps].sort((a, b) => (a.step_number || 0) - (b.step_number || 0))
    const target = index + direction
    if (target < 0 || target >= sorted.length) return
    const a = sorted[index]
    const b = sorted[target]
    updateStepMut.mutate({ stepId: a.id, data: { step_number: b.step_number } })
    updateStepMut.mutate({ stepId: b.id, data: { step_number: a.step_number } })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-full max-w-md" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center py-16">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-sm text-muted-foreground mb-4">{error?.message || "فشل تحميل التسلسل"}</p>
        <Button variant="outline" onClick={onBack}>العودة</Button>
      </div>
    )
  }

  const rawSteps = sequence?.steps || []
  const sortedSteps = [...rawSteps].sort((a, b) => (a.step_number || 0) - (b.step_number || 0))
  const status = sequence?.status || "draft"
  const statusInfo = STATUS_STYLES[status] || STATUS_STYLES.draft
  const completed = sequence?.completed_count || 0
  const unsubscribed = sequence?.unsubscribed_count || 0
  const totalSubs = sequence?.total_subscribers || 0
  const completionRate = totalSubs > 0 ? Math.round((completed / totalSubs) * 100) : 0
  const totalSent = sequence?.total_sent || 0

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onBack}>
            <ArrowLeft className="size-4" />
          </Button>
          {canEdit ? (
            <Input value={localName}
              onChange={(e) => { setLocalName(e.target.value); setDirty(true) }}
              className="h-8 text-lg font-bold max-w-[280px] border-0 bg-transparent focus-visible:bg-muted px-2" />
          ) : (
            <h2 className="text-lg font-bold">{localName}</h2>
          )}
          <Badge variant={statusInfo.variant} className="text-[10px] px-1.5">
            {statusInfo.label}
          </Badge>
          {dirty && <span className="text-[10px] text-muted-foreground">(غير محفوظ)</span>}
        </div>
        <div className="flex items-center gap-1">
          {canEdit && (
            <>
              <Button size="sm" className="h-7 text-xs" onClick={handleSaveDetails}
                disabled={updateMut.isPending || !dirty}>
                <Save className="ml-1 size-3.5" /> حفظ
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => updateMut.mutate({ status: status === "active" ? "paused" : "active" })}>
                {status === "active" ? "إيقاف" : "تفعيل"}
              </Button>
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleDelete}
                disabled={deleteMut.isPending}>
                <Trash2 className="ml-1 size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Description ── */}
      {canEdit ? (
        <Textarea value={localDesc}
          onChange={(e) => { setLocalDesc(e.target.value); setDirty(true) }}
          className="text-xs min-h-[40px]" placeholder="وصف التسلسل..." />
      ) : localDesc ? (
        <p className="text-xs text-muted-foreground">{localDesc}</p>
      ) : null}

      {/* ── Main content: Steps + Stats sidebar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Steps timeline */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ListOrdered className="size-4" /> الخطوات
            </h3>
            <span className="text-[10px] text-muted-foreground">{rawSteps.length} خطوة</span>
          </div>

          {sortedSteps.length === 0 ? (
            <div className="flex flex-col items-center py-12 border-2 border-dashed border-border/40 rounded-xl bg-muted/10">
              <ListOrdered className="h-10 w-10 text-muted-foreground/20 mb-2" />
              <p className="text-xs text-muted-foreground mb-4">لا توجد خطوات بعد</p>
              {canEdit && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleAddStep}
                  disabled={addStepMut.isPending}>
                  <Plus className="ml-1 size-3" /> إضافة خطوة
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="relative space-y-2 pr-6">
                {/* Vertical timeline line */}
                <div className="absolute right-[7px] top-3 bottom-3 w-0.5 bg-border" />
                {sortedSteps.map((step, i) => (
                  <div key={step.id} className="relative">
                    {/* Timeline dot */}
                    <div className="absolute right-[-18px] top-[18px] size-3 rounded-full border-2 border-primary bg-background z-10" />
                    <StepCard
                      step={step} index={i} canEdit={canEdit}
                      onEdit={handleSaveStep} onDelete={handleDeleteStep}
                      onMoveUp={(idx) => handleMoveStep(idx, -1)}
                      onMoveDown={(idx) => handleMoveStep(idx, 1)}
                      isFirst={i === 0} isLast={i === sortedSteps.length - 1}
                      isExpanded={expandedStep === step.id}
                      onToggleExpand={(id) => setExpandedStep((prev) => (prev === id ? null : id))}
                    />
                  </div>
                ))}
              </div>

              {canEdit && (
                <Button variant="outline" size="sm" className="h-8 text-xs w-full"
                  onClick={handleAddStep} disabled={addStepMut.isPending}>
                  <Plus className="ml-1 size-3.5" />
                  {addStepMut.isPending ? "جاري..." : "إضافة خطوة"}
                </Button>
              )}
            </>
          )}
        </div>

        {/* ── Stats Panel ── */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <BarChart3 className="size-4" /> الإحصائيات
          </h3>
          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Users className="size-3" /> المشتركون
                </span>
                <span className="text-sm font-bold">{totalSubs}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Send className="size-3" /> تم الإرسال
                </span>
                <span className="text-sm font-bold">{totalSent}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <BarChart3 className="size-3" /> الإكمال
                </span>
                <span className="text-sm font-bold">{completionRate}%</span>
              </div>
              <div className="pt-2 space-y-1">
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>{completed} مكتمل · {unsubscribed} إلغاء</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${completionRate}%` }} />
                </div>
              </div>
              {sequence?.created_at && (
                <p className="text-[9px] text-muted-foreground/60 pt-1 border-t border-border/50">
                  تم الإنشاء: {new Date(sequence.created_at).toLocaleDateString("ar-SA")}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ── Main Sequences Page ──
export function Sequences({ role }) {
  useEffect(() => { document.title = "التسلسلات | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const [view, setView] = useState("list")
  const [editingSeqId, setEditingSeqId] = useState(null)
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data: sequences = [], isLoading, error, refetch } = useQuery({
    queryKey: ["sequences"], queryFn: fetchSequences,
  })

  const filtered = useMemo(() => {
    if (!search) return sequences
    const s = search.toLowerCase()
    return sequences.filter((sq) => (sq.name || "").toLowerCase().includes(s))
  }, [sequences, search])

  const createMut = useMutation({
    mutationFn: () => createSequence({ name: newName.trim(), description: newDesc.trim() }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["sequences"] })
      setCreateOpen(false)
      toast.success("تم إنشاء التسلسل")
      const newId = res?.id || res?.sequence_id
      if (newId) {
        setEditingSeqId(newId)
        setView("editor")
      }
      setNewName("")
      setNewDesc("")
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => deleteSequence(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequences"] })
      setDeleteTarget(null)
      toast.success("تم الحذف")
    },
    onError: (e) => toast.error(e.message),
  })

  // ── Editor View ──
  if (view === "editor" && editingSeqId) {
    return (
      <SequenceEditor
        seqId={editingSeqId}
        onBack={() => { setView("list"); setEditingSeqId(null) }}
        canEdit={canEdit}
        queryClient={queryClient}
      />
    )
  }

  // ── List View ──
  return (
    <div className="content-container space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold">التسلسلات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sequences.length} تسلسل · {sequences.filter((s) => s.status === "active").length} نشط
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => { setNewName(""); setNewDesc(""); setCreateOpen(true) }}>
            <Plus className="ml-2 h-4 w-4" /> إنشاء تسلسل جديد
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="بحث في التسلسلات..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="pr-9 min-h-[44px] sm:min-h-0 text-sm" />
      </div>

      {/* ── Loading ── */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : /* ── Error ── */
      error ? (
        <div className="flex flex-col items-center py-16">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <p className="text-sm text-muted-foreground mb-4">{error?.message || "فشل تحميل التسلسلات"}</p>
          <Button variant="outline" onClick={refetch}>إعادة المحاولة</Button>
        </div>
      ) : /* ── Empty ── */
      filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16">
          <ListOrdered className="h-16 w-16 text-muted-foreground/20 mb-4" />
          <p className="text-sm text-foreground font-medium">
            {search ? "لا توجد نتائج" : "لا توجد تسلسلات بعد"}
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-6">
            {canEdit ? "أنشئ تسلسلاً لبدء حملات الرسائل المجدولة" : "التسلسلات ستظهر هنا"}
          </p>
          {canEdit && !search && (
            <Button variant="outline" onClick={() => { setNewName(""); setNewDesc(""); setCreateOpen(true) }}>
              <Plus className="ml-2 h-4 w-4" /> إنشاء تسلسل جديد
            </Button>
          )}
        </div>
      ) : (
        /* ── Sequence Cards Grid ── */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((sq) => {
            const si = STATUS_STYLES[sq.status] || STATUS_STYLES.draft
            return (
              <Card key={sq.id} className="cursor-pointer hover:border-primary/50 transition-all group"
                onClick={() => { setEditingSeqId(sq.id); setView("editor") }}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <ListOrdered className="size-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{sq.name}</p>
                        {sq.description && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {sq.description.length > 40 ? sq.description.slice(0, 40) + "…" : sq.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant={si.variant} className="text-[9px] px-1.5 py-0 shrink-0">{si.label}</Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="size-3" /> {sq.total_subscribers || 0}</span>
                    <span className="flex items-center gap-1"><Send className="size-3" /> {sq.total_sent || 0}</span>
                    <span className="flex items-center gap-1"><ListOrdered className="size-3" /> {sq.steps_count || 0} خطوات</span>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 mt-2 pt-2 border-t border-border/50 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="size-6 text-destructive/70 hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(sq) }}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="glass-heavy">
          <DialogHeader><DialogTitle>إنشاء تسلسل جديد</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (newName.trim()) createMut.mutate() }} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">اسم التسلسل</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} required
                placeholder="مثال: تسلسل ترحيبي" autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">وصف (اختياري)</label>
              <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                rows={2} placeholder="شرح التسلسل..." />
            </div>
            <div className="flex gap-2 justify-end pt-3 border-t">
              <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createMut.isPending || !newName.trim()}>
                {createMut.isPending ? "جاري..." : "إنشاء"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <DialogContent className="glass-heavy">
          <DialogHeader><DialogTitle>تأكيد حذف التسلسل</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف <strong className="text-foreground">{deleteTarget?.name}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "جاري..." : "حذف"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
