import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { fetchRules, createRule, updateRule, deleteRule, toggleRule } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  Plus, Pencil, Trash2, Power, Search, MessageSquare,
  GripVertical, Copy, FileText, Tag,
  AlertCircle, Filter, SlidersHorizontal, LayoutList,
} from "lucide-react"

// ── Categories ──
const CATEGORIES = {
  complaint: { label: "شكوى", panelClass: "panel-top-accent-destructive" },
  price: { label: "سعر", panelClass: "panel-top-accent-warning" },
  contact: { label: "تواصل", panelClass: "panel-top-accent-info" },
  general: { label: "عام", panelClass: "" },
  positive: { label: "إيجابي", panelClass: "panel-top-accent-success" },
  order: { label: "طلب", panelClass: "panel-top-accent-primary" },
}

const CATEGORY_RULES = {
  "شكوى واستياء - أولوية قصوى": "complaint",
  "مشاكل وأخطاء تقنية": "complaint",
  "طلبات عاجلة": "complaint",
  "استفسارات الأسعار": "price",
  "استفسارات حالة الطلب": "order",
  "طلبات التواصل": "contact",
  "رغبة في الشراء": "order",
  "استفسارات التوفر": "price",
  "استفسارات الموقع": "general",
  "استفسارات أوقات العمل": "general",
  "أسئلة واستفسارات عامة": "general",
  "عروض التعاون والإعلان": "contact",
  "إطراء وتعليقات إيجابية": "positive",
  "الشكر والامتنان": "positive",
  "تحية وترحيب": "general",
  "تعليقات إيموجي فقط": "general",
  "ردود قصيرة": "general",
  "تعليقات عامة غير محددة": "general",
  "القاعدة النهائية - أي تعليق لم تطابقه القواعد السابقة": "general",
  "طلبات النصيحة والمقارنة": "general",
}

function guessCategory(desc) {
  return CATEGORY_RULES[desc] || "general"
}

const categoryBadgeColors = {
  complaint: "bg-destructive/10 text-destructive border-destructive/25",
  price: "bg-warning/10 text-warning border-warning/25",
  contact: "bg-info/10 text-info border-info/25",
  general: "bg-muted/50 text-muted-foreground border-border/50",
  positive: "bg-success/10 text-success border-success/25",
  order: "bg-primary/10 text-primary border-primary/25",
}

// ── Inline Rule Card ──
function RuleCard({ rule, onEdit, onToggle, onDelete, onDuplicate, index }) {
  const cat = guessCategory(rule.description)
  const info = CATEGORIES[cat] || CATEGORIES.general
  const badgeColor = categoryBadgeColors[cat] || categoryBadgeColors.general

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className={cn(
        "glass-card overflow-hidden transition-all duration-300 group",
        "hover:-translate-y-0.5 hover:shadow-xl",
        info.panelClass,
        !rule.enabled && "opacity-60"
      )}>
        <CardContent className="p-0">
          <div className="flex items-start gap-0">
            {/* Drag hint */}
            <div className="hidden sm:flex items-start pt-5 pr-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors cursor-grab shrink-0">
              <GripVertical className="size-4" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 p-4 pr-0 space-y-3">
              {/* Header row */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-semibold text-sm text-foreground leading-none">{rule.name}</span>
                <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full border", badgeColor)}>
                  {CATEGORIES[cat]?.label || "عام"}
                </span>
                {!rule.enabled && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-dashed text-muted-foreground">
                    معطل
                  </Badge>
                )}
                {rule.replies_count > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                    {rule.replies_count} رد
                  </span>
                )}
              </div>

              {/* Description */}
              {rule.description && (
                <p className="text-xs text-muted-foreground/80 leading-relaxed">{rule.description}</p>
              )}

              {/* Keywords */}
              {rule.keywords?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {rule.keywords.slice(0, 8).map((kw, i) => (
                    <span key={i} className="inline-flex text-[10px] px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/30">
                      {kw.length > 14 ? kw.slice(0, 14) + "…" : kw}
                    </span>
                  ))}
                  {rule.keywords.length > 8 && (
                    <span className="text-[10px] text-muted-foreground/60">+{rule.keywords.length - 8}</span>
                  )}
                </div>
              )}

              {/* Reply preview */}
              <div className="flex items-start gap-2.5 text-xs text-muted-foreground bg-muted/30 rounded-xl p-3 border border-border/20 shadow-inner-glow">
                <MessageSquare className="size-3.5 mt-0.5 shrink-0 text-primary/40" />
                <span className="line-clamp-1 leading-relaxed">{rule.reply_template}</span>
              </div>

              {/* DM hint */}
              {rule.dm_template && (
                <p className="text-[10px] text-info/80 flex items-center gap-1.5">
                  <Tag className="size-3" />
                  رسالة خاصة: {rule.dm_template.substring(0, 60)}
                  {rule.dm_template.length > 60 ? "…" : ""}
                </p>
              )}
            </div>

            {/* Actions column */}
            <div className="flex flex-col gap-1 p-2 shrink-0 border-r border-border/20">
              <button
                className={cn(
                  "flex items-center justify-center size-8 rounded-lg transition-all duration-200 cursor-pointer",
                  rule.enabled
                    ? "text-success hover:bg-success/10"
                    : "text-muted-foreground hover:bg-muted/50"
                )}
                onClick={() => onToggle(rule.id)}
                aria-label={rule.enabled ? "تعطيل القاعدة" : "تفعيل القاعدة"}
              >
                <Power className="size-3.5" />
              </button>
              <button
                className="flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 cursor-pointer"
                onClick={() => onEdit(rule)}
                aria-label="تعديل القاعدة"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                className="flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-200 cursor-pointer"
                onClick={() => onDuplicate(rule)}
                aria-label="نسخ القاعدة"
              >
                <Copy className="size-3.5" />
              </button>
              <button
                className="flex items-center justify-center size-8 rounded-lg text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-all duration-200 cursor-pointer"
                onClick={() => onDelete(rule)}
                aria-label="حذف القاعدة"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ── Loading skeleton ──
function RuleSkeleton() {
  return (
    <div className="glass-card rounded-xl p-4 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex gap-2">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>
          <Skeleton className="h-3 w-56 rounded-md" />
          <div className="flex gap-1">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-5 w-14 rounded-md" />)}
          </div>
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-1.5">
          {[1,2,3,4].map(i => <Skeleton key={i} className="size-7 rounded-lg" />)}
        </div>
      </div>
    </div>
  )
}

// ── Rule Form ──
function RuleFormDialog({ open, onOpenChange, initial, onSubmit }) {
  const [name, setName] = useState("")
  const [keywords, setKeywords] = useState("")
  const [reply, setReply] = useState("")
  const [desc, setDesc] = useState("")
  const [botType, setBotType] = useState("reply")
  const [dmTemplate, setDmTemplate] = useState("")
  const isEdit = !!initial

  useEffect(() => {
    if (open) {
      setName(initial?.name || "")
      setKeywords(initial?.keywords?.join(", ") || "")
      setReply(initial?.reply_template || "")
      setDesc(initial?.description || "")
      setBotType(initial?.bot_type || "reply")
      setDmTemplate(initial?.dm_template || "")
    }
  }, [open, initial])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({ ...initial, name, keywords, reply_template: reply, description: desc, bot_type: botType, dm_template: dmTemplate })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-heavy max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LayoutList className="size-4" />
            </div>
            {isEdit ? "تعديل القاعدة" : "إضافة قاعدة جديدة"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">الاسم</label>
            <Input value={name} onChange={e => setName(e.target.value)} required placeholder="مثال: استفسار_سعر" className="bg-muted/30" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">نوع البوت</label>
              <Select value={botType} onValueChange={setBotType}>
                <SelectTrigger className="bg-muted/30"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reply">رد تلقائي</SelectItem>
                  <SelectItem value="welcome">رسالة ترحيب</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <div className="flex size-5 items-center justify-center rounded bg-muted/60">
                <Tag className="size-3 text-muted-foreground" />
              </div>
              الكلمات المفتاحية
            </label>
            <Input value={keywords} onChange={e => setKeywords(e.target.value)}
              required={botType === "reply"} placeholder="سعر, كم السعر, بكم (مفصولة بفاصلة)" className="bg-muted/30" />
            <p className="text-xs text-muted-foreground">مفصولة بفاصلة. البوت يبحث عنها في التعليقات.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <div className="flex size-5 items-center justify-center rounded bg-muted/60">
                <MessageSquare className="size-3 text-muted-foreground" />
              </div>
              نص الرد
            </label>
            <Textarea value={reply} onChange={e => setReply(e.target.value)} required rows={3}
              placeholder={'أهلاً {name} {mention} شكراً لتواصلك!'} className="bg-muted/30" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              المتغيرات: <code className="bg-muted/60 px-1 rounded text-[11px] font-mono">{'{name}'}</code> اسم العميل —
              <code className="bg-muted/60 px-1 rounded text-[11px] font-mono">{'{mention}'}</code> منشن —
              <code className="bg-muted/60 px-1 rounded text-[11px] font-mono">{'{message}'}</code> نص التعليق
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <div className="flex size-5 items-center justify-center rounded bg-muted/60">
                <MessageSquare className="size-3 text-muted-foreground" />
              </div>
              رسالة خاصة
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">اختياري</Badge>
            </label>
            <Textarea value={dmTemplate} onChange={e => setDmTemplate(e.target.value)} rows={2}
              placeholder={"أهلاً {name}! شكراً لتواصلك 💬"} className="bg-muted/30" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">وصف (اختياري)</label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="شرح القاعدة" className="bg-muted/30" />
          </div>
          <div className="flex gap-2 justify-end pt-4 border-t border-border/40">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} className="rounded-xl cursor-pointer">إلغاء</Button>
            <Button type="submit" className="rounded-xl cursor-pointer">{isEdit ? "تحديث" : "إضافة"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ──
export function Rules({ role }) {
  useEffect(() => { document.title = "القواعد | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [filterEnabled, setFilterEnabled] = useState("all")
  const [filterCategory, setFilterCategory] = useState("all")
  const [addOpen, setAddOpen] = useState(false)
  const [editRule, setEditRule] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data: rules = [], isLoading, error, refetch } = useQuery({
    queryKey: ["rules"], queryFn: fetchRules,
  })

  const filtered = rules.filter(r => {
    if (filterEnabled === "enabled" && !r.enabled) return false
    if (filterEnabled === "disabled" && r.enabled) return false
    if (filterCategory !== "all" && guessCategory(r.description) !== filterCategory) return false
    if (search) {
      const s = search.toLowerCase()
      if (!r.name.toLowerCase().includes(s) && !(r.description || "").toLowerCase().includes(s) && !r.keywords?.some(k => k.includes(s))) return false
    }
    return true
  })

  const toggleMut = useMutation({
    mutationFn: id => toggleRule(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); toast.success("تم تحديث الحالة") },
    onError: e => toast.error(e.message),
  })
  const deleteMut = useMutation({
    mutationFn: id => deleteRule(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); setDeleteTarget(null); toast.success("تم الحذف") },
    onError: e => toast.error(e.message),
  })
  const createMut = useMutation({
    mutationFn: d => createRule(d.name, d.keywords, d.reply_template, d.description, d.bot_type, d.dm_template),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); setAddOpen(false); toast.success("تمت الإضافة") },
    onError: e => toast.error(e.message),
  })
  const updateMut = useMutation({
    mutationFn: d => updateRule(d.id, d.name, d.keywords, d.reply_template, d.description, d.bot_type, d.dm_template),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); setEditRule(null); toast.success("تم التحديث") },
    onError: e => toast.error(e.message),
  })

  const handleDuplicate = (rule) => {
    createMut.mutate(rule)
  }

  const activeCount = rules.filter(r => r.enabled).length
  const totalReplies = rules.reduce((s, r) => s + (r.replies_count || 0), 0)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="content-container space-y-6 pb-8"
    >
      {/* Header with stats strip */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold">
            <span>القواعد</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">إدارة قواعد الرد التلقائي على تعليقات فيسبوك</p>
        </div>
        {canEdit && (
          <Button onClick={() => { setEditRule(null); setAddOpen(true) }} className="gap-2 rounded-xl shadow-premium cursor-pointer">
            <Plus className="size-4" />إضافة قاعدة
          </Button>
        )}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
        <div className="glass-card rounded-xl p-3.5 text-center">
          <p className="text-xs font-medium text-muted-foreground mb-1">إجمالي القواعد</p>
          <p className="text-xl font-bold font-mono tabular-nums text-foreground">{rules.length}</p>
        </div>
        <div className="glass-card rounded-xl p-3.5 text-center">
          <p className="text-xs font-medium text-muted-foreground mb-1">نشطة</p>
          <p className="text-xl font-bold font-mono tabular-nums text-success">{activeCount}</p>
        </div>
        <div className="glass-card rounded-xl p-3.5 text-center">
          <p className="text-xs font-medium text-muted-foreground mb-1">إجمالي الردود</p>
          <p className="text-xl font-bold font-mono tabular-nums text-foreground">{totalReplies}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex items-center gap-2 text-muted-foreground shrink-0">
          <Filter className="size-4" />
          <span className="text-xs font-medium hidden sm:inline">تصفية:</span>
        </div>
        <div className="relative flex-1 min-w-0">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60" />
          <Input placeholder="بحث في القواعد والكلمات المفتاحية..." value={search} onChange={e => setSearch(e.target.value)}
            className="pr-9 min-h-[44px] sm:min-h-9 text-sm bg-background/50 rounded-lg" />
        </div>
        <Select value={filterEnabled} onValueChange={setFilterEnabled}>
          <SelectTrigger className="w-full sm:w-28 h-12 sm:h-9 text-sm rounded-lg bg-background/50"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="enabled">نشط</SelectItem>
            <SelectItem value="disabled">معطل</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full sm:w-32 h-12 sm:h-9 text-sm rounded-lg bg-background/50"><SelectValue placeholder="التصنيف" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل التصنيفات</SelectItem>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <RuleSkeleton key={i} />)}
        </div>
      ) : error ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-2xl p-12 flex flex-col items-center text-center"
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
            <AlertCircle className="size-7 text-destructive" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">فشل تحميل القواعد</p>
          <p className="text-xs text-muted-foreground mb-5 max-w-xs">{error?.message || "حدث خطأ أثناء الاتصال بالخادم"}</p>
          <Button variant="outline" onClick={refetch} className="rounded-xl">
            إعادة المحاولة
          </Button>
        </motion.div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-12 flex flex-col items-center text-center"
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/40 mb-4">
            <FileText className="size-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-foreground">{search ? "لا توجد نتائج" : "لا توجد قواعد"}</p>
          <p className="text-xs text-muted-foreground mt-1.5">
            {canEdit ? "أضف قاعدة جديدة للبدء" : "القواعد ستظهر هنا"}
          </p>
        </motion.div>
      ) : (
        /* Rule Cards */
        <AnimatePresence mode="popLayout">
          <div className="space-y-2.5">
            {filtered.map((rule, i) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                index={i}
                onToggle={id => toggleMut.mutate(id)}
                onEdit={setEditRule}
                onDelete={setDeleteTarget}
                onDuplicate={handleDuplicate}
              />
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Add / Edit Dialog */}
      <RuleFormDialog
        open={addOpen || !!editRule}
        onOpenChange={o => { if (!o) { setAddOpen(false); setEditRule(null) } }}
        initial={editRule}
        onSubmit={d => editRule ? updateMut.mutate(d) : createMut.mutate(d)}
      />

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null) }}>
        <DialogContent className="glass-heavy">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <Trash2 className="size-4" />
              </div>
              تأكيد حذف القاعدة
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            هل أنت متأكد من حذف قاعدة <strong className="text-foreground">{deleteTarget?.name}</strong>؟
            لا يمكن التراجع عن هذا الإجراء.
            {deleteTarget?.replies_count > 0 && ` هذه القاعدة استخدمت ${deleteTarget.replies_count} مرة.`}
          </p>
          <div className="flex gap-2 justify-end pt-3 border-t border-border/40">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="rounded-xl">إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending} className="rounded-xl">
              {deleteMut.isPending ? "جاري..." : "حذف"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
