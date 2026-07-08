import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchTemplates, createTemplate, updateTemplate, deleteTemplate } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import {
  Plus, Pencil, Trash2, Bookmark, Inbox, AlertCircle,
} from "lucide-react"

const CATEGORIES = [
  { value: "general", label: "عام" },
  { value: "greeting", label: "تحية" },
  { value: "complaint", label: "شكوى" },
  { value: "pricing", label: "سعر" },
  { value: "contact", label: "تواصل" },
]

export function QuickReplies({ role }) {
  useEffect(() => { document.title = "الردود السريعة | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const [filterCat, setFilterCat] = useState("")
  const [editTarget, setEditTarget] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState("")
  const [text, setText] = useState("")
  const [category, setCategory] = useState("general")
  const [shortcut, setShortcut] = useState("")

  const { data: templates = [], isLoading, error, refetch } = useQuery({
    queryKey: ["templates", filterCat],
    queryFn: () => fetchTemplates(filterCat),
  })

  const createMut = useMutation({
    mutationFn: () => createTemplate(name, text, category, shortcut),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["templates"] }); setShowAdd(false); resetForm(); toast.success("تمت الإضافة") },
    onError: (e) => toast.error(e.message),
  })
  const updateMut = useMutation({
    mutationFn: () => updateTemplate(editTarget.id, name, text, category, shortcut),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["templates"] }); setEditTarget(null); resetForm(); toast.success("تم التحديث") },
    onError: (e) => toast.error(e.message),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => deleteTemplate(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["templates"] }); toast.success("تم الحذف") },
    onError: (e) => toast.error(e.message),
  })

  function resetForm() { setName(""); setText(""); setCategory("general"); setShortcut("") }
  function openEdit(t) { setEditTarget(t); setName(t.name); setText(t.text); setCategory(t.category); setShortcut(t.shortcut || "") }

  return (
    <div className="content-container space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold">الردود السريعة</h1>
          <p className="text-sm text-muted-foreground mt-1">قوالب ردود جاهزة للاستخدام السريع في المحادثات</p>
        </div>
        {canEdit && (
          <Button onClick={() => { resetForm(); setShowAdd(true) }}><Plus className="ml-2 h-4 w-4" />إضافة قالب</Button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilterCat("")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium ${!filterCat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          الكل
        </button>
        {CATEGORIES.map(c => (
          <button key={c.value} onClick={() => setFilterCat(c.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${filterCat === c.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {c.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>
      ) : error ? (
        <div className="flex flex-col items-center py-16"><AlertCircle className="h-12 w-12 text-destructive mb-4" /><Button variant="outline" onClick={refetch}>إعادة المحاولة</Button></div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center py-16"><Inbox className="h-12 w-12 text-muted-foreground/30 mb-4" /><p className="text-sm text-muted-foreground">لا توجد قوالب</p></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(t => (
            <Card key={t.id} className="group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Bookmark className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-semibold">{t.name}</CardTitle>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(t)}><Pencil className="size-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => deleteMut.mutate(t.id)}><Trash2 className="size-3.5" /></Button>
                    </div>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-full">
                  {CATEGORIES.find(c => c.value === t.category)?.label || t.category}
                </Badge>
                {t.shortcut && <Badge className="text-[10px] px-1.5 py-0 rounded-full bg-info/10 text-info border-info/20 mr-1">{t.shortcut}</Badge>}
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">{t.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd || !!editTarget} onOpenChange={o => { if (!o) { setShowAdd(false); setEditTarget(null) } }}>
        <DialogContent className="glass-heavy">
          <DialogHeader><DialogTitle>{editTarget ? "تعديل القالب" : "إضافة قالب جديد"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">الاسم</label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">التصنيف</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">اختصار لوحة المفاتيح (اختياري)</label>
              <Input value={shortcut} onChange={e => setShortcut(e.target.value)} placeholder="/price" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">النص</label>
              <Textarea value={text} onChange={e => setText(e.target.value)} rows={3} />
            </div>
            <Button onClick={() => editTarget ? updateMut.mutate() : createMut.mutate()} disabled={!name.trim() || !text.trim()} className="w-full">
              {editTarget ? "تحديث" : "إضافة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
