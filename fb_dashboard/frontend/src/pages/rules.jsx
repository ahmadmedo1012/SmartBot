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
  Bot, Plus, Pencil, Trash2, Power, Search, Tag, MessageSquare, Mail,
  AlertCircle, FileText,
} from "lucide-react"

// ── Categories ──
const CATEGORIES = ["عام", "شكوى", "استفسار", "طلب", "تواصل", "سؤال", "إشادة", "تحية", "عاجل"]

const CATEGORY_KEYWORDS = {
  عاجل: ["عاجل", "ضروري", "مهم", "طارئ", "بسرعة", "فوراً", "حالاً"],
  شكوى: ["شكوى", "مشكلة", "خطأ", "سيء", "تأخير", "مزعج", "فشل", "عطل"],
  استفسار: ["استفسار", "هل", "كيف", "ما هو", "متى", "أين"],
  طلب: ["طلب", "أريد", "احتاج", "ابغى", "عايز", "شراء"],
  تواصل: ["تواصل", "اتصال", "رقم", "واتس", "جوال", "هاتف"],
  سؤال: ["سؤال", "عندي"],
  إشادة: ["شكر", "ممتاز", "رائع", "جميل", "أحسنت", "إشادة"],
  تحية: ["السلام", "تحية", "مرحبا", "اهلا", "صباح", "مساء"],
}

const catColors = {
  عام: "bg-muted/50 text-muted-foreground border-border/50",
  شكوى: "bg-destructive/10 text-destructive border-destructive/25",
  استفسار: "bg-info/10 text-info border-info/25",
  طلب: "bg-primary/10 text-primary border-primary/25",
  تواصل: "bg-info/10 text-info border-info/25",
  سؤال: "bg-primary/10 text-primary border-primary/25",
  إشادة: "bg-success/10 text-success border-success/25",
  تحية: "bg-success/10 text-success border-success/25",
  عاجل: "bg-warning/10 text-warning border-warning/25",
}

function inferCategory(keywords = []) {
  if (!Array.isArray(keywords) || keywords.length === 0) return "عام"
  const text = keywords.join(" ").toLowerCase()
  for (const [cat, patterns] of Object.entries(CATEGORY_KEYWORDS)) {
    if (patterns.some((p) => text.includes(p))) return cat
  }
  return "عام"
}

// ── Rule Card ──
function RuleCard({ rule, onEdit, onToggle, onDelete, index }) {
  const cat = rule.category || inferCategory(rule.keywords)
  const preview =
    rule.reply_template?.length > 100
      ? rule.reply_template.slice(0, 100) + "…"
      : rule.reply_template
  const priority = rule.priority || ""
  const isHigh = priority === "high" || priority === "urgent"

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
    >
      <Card
        className={cn(
          "group overflow-hidden transition-all duration-300 h-full",
          "hover:shadow-lg hover:-translate-y-0.5",
          !rule.enabled && "opacity-60",
        )}
      >
        <CardContent className="p-4 flex flex-col gap-3 h-full">
          {/* Header: name + status */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="size-4 shrink-0 text-primary/40" />
              <span className="font-semibold text-sm truncate">{rule.name}</span>
            </div>
            <Badge
              variant={rule.enabled ? "default" : "outline"}
              className="shrink-0 text-[10px] px-2 py-0"
            >
              {rule.enabled ? "نشط" : "معطل"}
            </Badge>
          </div>

          {/* Category + Priority */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                catColors[cat] || catColors.عام,
              )}
            >
              {cat}
            </span>
            {isHigh && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                عالية
              </Badge>
            )}
          </div>

          {/* Keywords */}
          {rule.keywords?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {rule.keywords.slice(0, 6).map((kw, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/30"
                >
                  <Tag className="size-2.5" />
                  {kw.length > 12 ? kw.slice(0, 12) + "…" : kw}
                </span>
              ))}
              {rule.keywords.length > 6 && (
                <span className="text-[10px] text-muted-foreground/60">
                  +{rule.keywords.length - 6}
                </span>
              )}
            </div>
          )}

          {/* Reply preview (first 100 chars) */}
          {rule.reply_template && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-2.5 border border-border/20">
              <MessageSquare className="size-3.5 mt-0.5 shrink-0 text-primary/40" />
              <span className="leading-relaxed line-clamp-2">{preview}</span>
            </div>
          )}

          {/* DM indicator */}
          {rule.dm_template && (
            <div className="flex items-center gap-1.5 text-[10px] text-info/80">
              <Mail className="size-3" />
              <span>رسالة خاصة متوفرة</span>
            </div>
          )}

          {/* Reply count */}
          <div className="flex items-center gap-3 mt-auto text-xs text-muted-foreground">
            {rule.replies_count > 0 ? (
              <span className="flex items-center gap-1">
                <MessageSquare className="size-3" />
                {rule.replies_count} رد
              </span>
            ) : (
              <span className="text-xs text-muted-foreground/50">لا توجد ردود بعد</span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 pt-2 border-t border-border/20">
            <button
              className={cn(
                "flex items-center justify-center size-8 rounded-lg transition-colors cursor-pointer",
                rule.enabled
                  ? "text-success hover:bg-success/10"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
              onClick={() => onToggle(rule.id)}
              aria-label={rule.enabled ? "تعطيل" : "تفعيل"}
            >
              <Power className="size-3.5" />
            </button>
            <button
              className="flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => onEdit(rule)}
              aria-label="تعديل"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              className="flex items-center justify-center size-8 rounded-lg text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
              onClick={() => onDelete(rule)}
              aria-label="حذف"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ── Loading Skeleton ──
function RuleSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-5 w-10 rounded-full" />
      </div>
      <Skeleton className="h-4 w-14 rounded-full" />
      <div className="flex gap-1">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-5 w-12 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-14 w-full rounded-lg" />
      <div className="flex gap-1 pt-2 border-t border-border/20">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="size-8 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// ── Rule Form Dialog ──
function RuleFormDialog({ open, onOpenChange, initial, onSubmit }) {
  const [name, setName] = useState("")
  const [keywords, setKeywords] = useState("")
  const [reply, setReply] = useState("")
  const [dmTemplate, setDmTemplate] = useState("")
  const [desc, setDesc] = useState("")
  const [category, setCategory] = useState("عام")
  const isEdit = !!initial

  useEffect(() => {
    if (open) {
      setName(initial?.name || "")
      setKeywords(initial?.keywords?.join(", ") || "")
      setReply(initial?.reply_template || "")
      setDmTemplate(initial?.dm_template || "")
      setDesc(initial?.description || "")
      setCategory(initial?.category || inferCategory(initial?.keywords) || "عام")
    }
  }, [open, initial])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      ...initial,
      name,
      keywords: keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
        .join(", "),
      reply_template: reply,
      dm_template: dmTemplate,
      description: desc,
      category,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل القاعدة" : "إضافة قاعدة جديدة"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">الاسم</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="اسم القاعدة"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">التصنيف</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Tag className="size-3.5 text-muted-foreground" />
              الكلمات المفتاحية
            </label>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="كلمة1, كلمة2, كلمة3 (مفصولة بفاصلة)"
            />
            <p className="text-xs text-muted-foreground">مفصولة بفاصلة. يبحث البوت عنها في التعليقات.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <MessageSquare className="size-3.5 text-muted-foreground" />
              نص الرد
            </label>
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              required
              rows={3}
              placeholder="نص الرد التلقائي"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Mail className="size-3.5 text-muted-foreground" />
              رسالة خاصة
              <Badge variant="outline" className="text-[10px] font-normal">
                اختياري
              </Badge>
            </label>
            <Textarea
              value={dmTemplate}
              onChange={(e) => setDmTemplate(e.target.value)}
              rows={2}
              placeholder="نص الرسالة الخاصة (اختياري)"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">الوصف</label>
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              placeholder="وصف القاعدة (اختياري)"
            />
          </div>
          <div className="flex gap-2 justify-end pt-3 border-t border-border/40">
            <Button
              variant="outline"
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl cursor-pointer"
            >
              إلغاء
            </Button>
            <Button type="submit" className="rounded-xl cursor-pointer">
              {isEdit ? "تحديث" : "إضافة"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ──
export function Rules({ role }) {
  useEffect(() => {
    document.title = "قواعد الرد التلقائي | SmartBot"
  }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [editRule, setEditRule] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const {
    data: rules = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["rules"],
    queryFn: fetchRules,
  })

  const filtered = rules.filter((r) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      r.name.toLowerCase().includes(s) ||
      (r.description || "").toLowerCase().includes(s) ||
      r.keywords?.some((k) => k.includes(s))
    )
  })

  const toggleMut = useMutation({
    mutationFn: (id) => toggleRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] })
      toast.success("تم تحديث الحالة")
    },
    onError: (e) => toast.error(e.message),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] })
      setDeleteTarget(null)
      toast.success("تم الحذف")
    },
    onError: (e) => toast.error(e.message),
  })
  const createMut = useMutation({
    mutationFn: (d) =>
      createRule(d.name, d.keywords, d.reply_template, d.description, d.bot_type || "reply", d.dm_template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] })
      setAddOpen(false)
      toast.success("تمت الإضافة")
    },
    onError: (e) => toast.error(e.message),
  })
  const updateMut = useMutation({
    mutationFn: (d) =>
      updateRule(d.id, d.name, d.keywords, d.reply_template, d.description, d.bot_type || "reply", d.dm_template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] })
      setEditRule(null)
      toast.success("تم التحديث")
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="content-container space-y-6 pb-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">قواعد الرد التلقائي</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            إدارة قواعد الرد التلقائي على تعليقات فيسبوك
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setEditRule(null)
              setAddOpen(true)
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 rounded-xl shadow-premium cursor-pointer"
          >
            <Plus className="size-4" />
            إضافة قاعدة
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60" />
        <Input
          placeholder="بحث في القواعد والكلمات المفتاحية..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-9 text-sm rounded-xl"
        />
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <RuleSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl p-12 flex flex-col items-center text-center border border-border/50"
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
            <AlertCircle className="size-7 text-destructive" />
          </div>
          <p className="text-sm font-medium mb-1">فشل تحميل القواعد</p>
          <p className="text-xs text-muted-foreground mb-5 max-w-xs">
            {error?.message || "حدث خطأ أثناء الاتصال"}
          </p>
          <Button variant="outline" onClick={refetch} className="rounded-xl cursor-pointer">
            إعادة المحاولة
          </Button>
        </motion.div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-12 flex flex-col items-center text-center border border-border/50"
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/40 mb-4">
            <FileText className="size-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium">
            {search ? "لا توجد نتائج" : "لا توجد قواعد بعد"}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">
            {search
              ? "حاول تغيير كلمة البحث"
              : canEdit
                ? "أضف قاعدة جديدة للبدء"
                : "القواعد ستظهر هنا"}
          </p>
          {canEdit && !search && (
            <Button
              onClick={() => setAddOpen(true)}
              className="mt-4 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl cursor-pointer"
            >
              <Plus className="size-4" />
              إضافة قاعدة
            </Button>
          )}
        </motion.div>
      ) : (
        /* Rule Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((rule, i) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                index={i}
                onToggle={(id) => toggleMut.mutate(id)}
                onEdit={setEditRule}
                onDelete={setDeleteTarget}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <RuleFormDialog
        open={addOpen || !!editRule}
        onOpenChange={(o) => {
          if (!o) {
            setAddOpen(false)
            setEditRule(null)
          }
        }}
        initial={editRule}
        onSubmit={(d) => (editRule ? updateMut.mutate(d) : createMut.mutate(d))}
      />

      {/* Delete Confirm Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <Trash2 className="size-4" />
              </div>
              تأكيد حذف القاعدة
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            هل أنت متأكد من حذف قاعدة{" "}
            <strong className="text-foreground">{deleteTarget?.name}</strong>؟
            لا يمكن التراجع عن هذا الإجراء.
            {deleteTarget?.replies_count > 0 &&
              ` هذه القاعدة استخدمت ${deleteTarget.replies_count} مرة.`}
          </p>
          <div className="flex gap-2 justify-end pt-3 border-t border-border/40">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="rounded-xl cursor-pointer"
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
              className="rounded-xl cursor-pointer"
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
