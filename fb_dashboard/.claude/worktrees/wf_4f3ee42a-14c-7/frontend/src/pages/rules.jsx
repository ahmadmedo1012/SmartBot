import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchRules, createRule, updateRule, deleteRule, toggleRule } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  Plus, Pencil, Trash2, Power, AlertCircle, Inbox, Search, MessageSquare, Tag, FileText,
} from "lucide-react"

function RuleForm({ initial, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name || "")
  const [keywords, setKeywords] = useState(initial?.keywords?.join(", ") || "")
  const [reply, setReply] = useState(initial?.reply_template || "")
  const [desc, setDesc] = useState(initial?.description || "")
  const [botType, setBotType] = useState(initial?.bot_type || "reply")
  const [dmTemplate, setDmTemplate] = useState(initial?.dm_template || "")
  const isEdit = !!initial

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...initial, name, keywords, reply_template: reply, description: desc, bot_type: botType, dm_template: dmTemplate }) }}
      className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <Tag className="size-3.5 text-muted-foreground" />الاسم
        </label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="مثال: استفسار_سعر" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">نوع البوت</label>
          <Select value={botType} onValueChange={setBotType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reply">رد تلقائي</SelectItem>
              <SelectItem value="welcome">رسالة ترحيب</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">الأولوية</label>
          <Input value={initial?.priority || 999} disabled className="bg-muted/50" />
          <p className="text-[10px] text-muted-foreground">الأصغر = الأعلى أولوية</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <FileText className="size-3.5 text-muted-foreground" />الكلمات المفتاحية
        </label>
        <Input value={keywords} onChange={(e) => setKeywords(e.target.value)}
          required={botType === "reply"} placeholder="سعر, كم السعر, بكم" />
        <p className="text-[10px] text-muted-foreground">مفصولة بفاصلة. البوت يبحث عنها في التعليقات.</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <MessageSquare className="size-3.5 text-muted-foreground" />نص الرد
        </label>
        <Textarea value={reply} onChange={(e) => setReply(e.target.value)} required rows={3} />
        <p className="text-[10px] text-muted-foreground">المتغيرات: {`{name}`} {`{mention}`} {`{message}`}</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <MessageSquare className="size-3.5 text-muted-foreground" />رسالة خاصة <Badge className="text-[10px] px-1.5 py-0">اختياري</Badge>
        </label>
        <Textarea value={dmTemplate} onChange={(e) => setDmTemplate(e.target.value)} rows={2} placeholder={"أهلاً {name}! شكراً لتواصلك 💬"} />
        <p className="text-[10px] text-muted-foreground">تُرسل للمستخدمين النشطين عبر Messenger. المتغيرات: {`{name}`} {`{mention}`}</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">وصف (اختياري)</label>
        <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="شرح القاعدة" />
      </div>
      <div className="flex gap-2 justify-end pt-2 border-t">
        <Button variant="outline" type="button" onClick={onCancel}>إلغاء</Button>
        <Button type="submit">{isEdit ? "تحديث القاعدة" : "إضافة القاعدة"}</Button>
      </div>
    </form>
  )
}

export function Rules({ role }) {
  useEffect(() => { document.title = "القواعد | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [filterEnabled, setFilterEnabled] = useState("all")
  const [page, setPage] = useState(1)
  const perPage = 10
  const [editRule, setEditRule] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data: rules = [], isLoading, error, refetch } = useQuery({
    queryKey: ["rules"], queryFn: fetchRules,
  })

  const filtered = rules.filter((r) => {
    if (filterEnabled === "enabled" && !r.enabled) return false
    if (filterEnabled === "disabled" && r.enabled) return false
    if (search && !r.name.includes(search) && !r.description?.includes(search)) return false
    return true
  })
  const totalPages = Math.ceil(filtered.length / perPage)
  const paged = filtered.slice((page - 1) * perPage, page * perPage)

  const toggleMut = useMutation({
    mutationFn: (id) => toggleRule(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); toast.success("تم تحديث الحالة") },
    onError: (e) => toast.error(e.message),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => deleteRule(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); setDeleteTarget(null); toast.success("تم حذف القاعدة") },
    onError: (e) => toast.error(e.message),
  })
  const createMut = useMutation({
    mutationFn: (d) => createRule(d.name, d.keywords, d.reply_template, d.description, d.bot_type, d.dm_template),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); setShowAdd(false); toast.success("تمت إضافة القاعدة") },
    onError: (e) => toast.error(e.message),
  })
  const updateMut = useMutation({
    mutationFn: (d) => updateRule(d.id, d.name, d.keywords, d.reply_template, d.description, d.bot_type, d.dm_template),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); setEditRule(null); toast.success("تم تحديث القاعدة") },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">القواعد</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة قواعد الرد التلقائي والرسائل الخاصة</p>
        </div>
        {canEdit && (
          <Sheet open={showAdd} onOpenChange={setShowAdd}>
            <SheetTrigger asChild>
              <Button><Plus className="ml-2 h-4 w-4" />إضافة قاعدة</Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[420px] sm:w-[540px] overflow-y-auto">
              <SheetHeader className="mb-6">
                <SheetTitle>إضافة قاعدة جديدة</SheetTitle>
              </SheetHeader>
              <RuleForm onSubmit={(d) => createMut.mutate(d)} onCancel={() => setShowAdd(false)} />
            </SheetContent>
          </Sheet>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="pr-9" />
        </div>
        <Select value={filterEnabled} onValueChange={(v) => { setFilterEnabled(v); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="enabled">مفعل</SelectItem>
            <SelectItem value="disabled">معطل</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{filtered.length} قاعدة</p>
      </div>

      {/* Table */}
      <div className="rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">القاعدة</th>
                <th scope="col">النوع</th>
                <th scope="col">الكلمات المفتاحية</th>
                <th className="w-1/3" scope="col">الرد</th>
                <th scope="col">الحالة</th>
                <th className="w-28" scope="col">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr><td colSpan={6} className="p-6"><div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div></td></tr>
              ) : error ? (
                <tr><td colSpan={6}><div className="flex flex-col items-center py-16"><AlertCircle className="h-12 w-12 text-destructive mb-4" /><p className="text-sm text-muted-foreground mb-4">{error?.message || "فشل تحميل القواعد"}</p><Button variant="outline" onClick={refetch}>إعادة المحاولة</Button></div></td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={6}><div className="flex flex-col items-center py-16"><Inbox className="h-12 w-12 text-muted-foreground/30 mb-4" /><p className="text-sm font-medium text-foreground mb-1">{search || filterEnabled !== "all" ? "لا توجد نتائج" : "لا توجد قواعد"}</p><p className="text-xs text-muted-foreground">{search || filterEnabled !== "all" ? "حاول تعديل البحث" : "أضف قاعدة جديدة للبدء"}</p></div></td></tr>
              ) : (
                paged.map((r) => (
                  <tr key={r.id} className="hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-4 align-middle">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground text-sm">{r.name}</span>
                        <Badge className={cn(r.bot_type === "welcome" ? "bg-info/15 text-info border-info/20 text-[10px]" : "bg-primary/10 text-primary border-primary/20 text-[10px]", "rounded-full px-2 py-0")}>
                          {r.bot_type === "welcome" ? "ترحيب" : "رد"}
                        </Badge>
                      </div>
                      {r.description && <p className="text-[11px] text-muted-foreground mt-0.5">{r.description}</p>}
                    </td>
                    <td className="px-4 py-4 align-middle text-xs text-muted-foreground">
                      {r.bot_type === "welcome" ? "ترحيب" : "تلقائي"}
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {r.keywords?.slice(0, 5).map((kw, i) => (
                          <span key={i} className="inline-flex text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                            {kw.length > 12 ? kw.slice(0, 12) + "…" : kw}
                          </span>
                        ))}
                        {r.keywords?.length > 5 && <span className="text-[10px] text-muted-foreground">+{r.keywords.length - 5}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-middle text-xs text-muted-foreground max-w-[200px] truncate font-mono">
                      {r.reply_template?.substring(0, 60)}{r.reply_template?.length > 60 ? "…" : ""}
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <Badge className={cn(
                        r.enabled ? "bg-success/15 text-success border-success/20" : "bg-muted text-muted-foreground",
                        "rounded-full text-[11px] px-2.5 py-0.5"
                      )}>
                        {r.enabled ? "فعال" : "معطل"}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" onClick={() => toggleMut.mutate(r.id)} className={cn("size-8", r.enabled ? "text-success hover:text-success/80" : "text-muted-foreground")}>
                          <Power className="size-4" />
                        </Button>
                        {canEdit && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => setEditRule(r)} className="size-8 text-muted-foreground hover:text-foreground">
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)} className="size-8 text-destructive/70 hover:text-destructive">
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Sheet */}
      <Sheet open={editRule !== null} onOpenChange={(o) => { if (!o) setEditRule(null) }}>
        <SheetContent side="right" className="w-[420px] sm:w-[540px] overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>تعديل القاعدة</SheetTitle>
          </SheetHeader>
          {editRule && <RuleForm initial={editRule} onSubmit={(d) => updateMut.mutate(d)} onCancel={() => setEditRule(null)} />}
        </SheetContent>
      </Sheet>

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد حذف القاعدة</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف قاعدة <strong className="text-foreground">{deleteTarget?.name}</strong>؟ لا يمكن التراجع.</p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "جاري الحذف..." : "حذف القاعدة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</Button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => setPage(i + 1)}
                className={`size-8 rounded-lg text-xs font-medium transition-colors ${page === i + 1 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}>
                {i + 1}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>التالي</Button>
        </div>
      )}
    </div>
  )
}
