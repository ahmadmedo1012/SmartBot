import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
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
  GripVertical, Copy, Hash, FileText, Tag,
  ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react"

// ── Categories ──
const CATEGORIES = {
  complaint: { label: "شكوى", color: "text-destructive border-destructive/30 bg-destructive/10" },
  price: { label: "سعر", color: "text-warning border-warning/30 bg-warning/10" },
  contact: { label: "تواصل", color: "text-info border-info/30 bg-info/10" },
  general: { label: "عام", color: "text-muted-foreground border-muted/50 bg-muted/30" },
  positive: { label: "إيجابي", color: "text-success border-success/30 bg-success/10" },
  order: { label: "طلب", color: "text-primary border-primary/30 bg-primary/10" },
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

// ── Inline Rule Card ──
function RuleCard({ rule, onEdit, onToggle, onDelete, onDuplicate, index }) {
  const cat = guessCategory(rule.description)
  const style = CATEGORIES[cat] || CATEGORIES.general

  return (
    <Card className={cn("group border-r-4 transition-all hover:shadow-md", rule.enabled ? "border-r-primary" : "border-r-muted opacity-70")}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Drag hint */}
          <div className="hidden sm:flex mt-1 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors cursor-grab">
            <GripVertical className="size-4" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Header */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground">{rule.name}</span>
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", style.color)}>
                {CATEGORIES[cat]?.label || "عام"}
              </span>
              {!rule.enabled && <Badge variant="outline" className="text-[10px] px-1.5 py-0">معطل</Badge>}
              {rule.replies_count > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-full font-mono">
                  {rule.replies_count} رد
                </Badge>
              )}
            </div>

            {/* Description */}
            {rule.description && (
              <p className="text-xs text-muted-foreground">{rule.description}</p>
            )}

            {/* Keywords */}
            {rule.keywords?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {rule.keywords.slice(0, 8).map((kw, i) => (
                  <span key={i} className="inline-flex text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                    {kw.length > 14 ? kw.slice(0, 14) + "…" : kw}
                  </span>
                ))}
                {rule.keywords.length > 8 && (
                  <span className="text-[10px] text-muted-foreground">+{rule.keywords.length - 8}</span>
                )}
              </div>
            )}

            {/* Reply preview */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-2">
              <MessageSquare className="size-3 mt-0.5 shrink-0" />
              <span className="line-clamp-1">{rule.reply_template}</span>
            </div>

            {/* DM hint */}
            {rule.dm_template && (
              <p className="text-[10px] text-info flex items-center gap-1">
                <Tag className="size-2.5" />
                رسالة خاصة: {rule.dm_template.substring(0, 60)}
                {rule.dm_template.length > 60 ? "…" : ""}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1 shrink-0">
            <Button variant="ghost" size="icon" className={cn("size-7", rule.enabled ? "text-success hover:text-success/80" : "text-muted-foreground")}
              onClick={() => onToggle(rule.id)}>
              <Power className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(rule)}>
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-primary"
              onClick={() => onDuplicate(rule)}>
              <Copy className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7 text-destructive/70 hover:text-destructive"
              onClick={() => onDelete(rule)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
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
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "تعديل القاعدة" : "إضافة قاعدة جديدة"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">الاسم</label>
            <Input value={name} onChange={e => setName(e.target.value)} required placeholder="مثال: استفسار_سعر" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">نوع البوت</label>
              <Select value={botType} onValueChange={setBotType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reply">رد تلقائي</SelectItem>
                  <SelectItem value="welcome">رسالة ترحيب</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1">
              <Hash className="size-3.5 text-muted-foreground" />
              الكلمات المفتاحية
            </label>
            <Input value={keywords} onChange={e => setKeywords(e.target.value)}
              required={botType === "reply"} placeholder="سعر, كم السعر, بكم (مفصولة بفاصلة)" />
            <p className="text-xs text-muted-foreground">مفصولة بفاصلة. البوت يبحث عنها في التعليقات.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1">
              <MessageSquare className="size-3.5 text-muted-foreground" />
              نص الرد
            </label>
            <Textarea value={reply} onChange={e => setReply(e.target.value)} required rows={3}
              placeholder={'أهلاً {name} {mention} شكراً لتواصلك!'} />
            <p className="text-xs text-muted-foreground">
              المتغيرات: <code className="bg-muted px-1 rounded">{'{name}'}</code> اسم العميل —
              <code className="bg-muted px-1 rounded">{'{mention}'}</code> منشن —
              <code className="bg-muted px-1 rounded">{'{message}'}</code> نص التعليق
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1">
              <Tag className="size-3.5 text-muted-foreground" />
              رسالة خاصة <Badge variant="outline" className="text-[10px] px-1.5 py-0">اختياري</Badge>
            </label>
            <Textarea value={dmTemplate} onChange={e => setDmTemplate(e.target.value)} rows={2}
              placeholder={"أهلاً {name}! شكراً لتواصلك 💬"} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">وصف (اختياري)</label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="شرح القاعدة" />
          </div>
          <div className="flex gap-2 justify-end pt-3 border-t">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit">{isEdit ? "تحديث" : "إضافة"}</Button>
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">القواعد</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {rules.length} قاعدة · {activeCount} نشطة · {totalReplies} رد
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => { setEditRule(null); setAddOpen(true) }}>
            <Plus className="ml-2 h-4 w-4" />إضافة قاعدة
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث في القواعد والكلمات المفتاحية..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={filterEnabled} onValueChange={setFilterEnabled}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="enabled">نشط</SelectItem>
            <SelectItem value="disabled">معطل</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-32"><SelectValue placeholder="التصنيف" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل التصنيفات</SelectItem>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading / Error / Empty */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}</div>
      ) : error ? (
        <div className="flex flex-col items-center py-16">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <p className="text-sm text-muted-foreground mb-4">{error?.message || "فشل تحميل القواعد"}</p>
          <Button variant="outline" onClick={refetch}>إعادة المحاولة</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16">
          <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-sm text-foreground font-medium">{search ? "لا توجد نتائج" : "لا توجد قواعد"}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {canEdit ? "أضف قاعدة جديدة للبدء" : "القواعد ستظهر هنا"}
          </p>
        </div>
      ) : (
        /* Rule Cards */
        <div className="space-y-2">
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
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد حذف القاعدة</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف قاعدة <strong className="text-foreground">{deleteTarget?.name}</strong>؟
            لا يمكن التراجع. {deleteTarget?.replies_count > 0 && `هذه القاعدة استخدمت ${deleteTarget.replies_count} مرة.`}
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "جاري..." : "حذف"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
