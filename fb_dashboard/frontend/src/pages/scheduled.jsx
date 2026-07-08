import { useState, useEffect } from "react"
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
import { format } from "date-fns"
import { arSA } from "date-fns/locale"
import {
  Plus, Clock, Send, Trash2, Inbox, AlertCircle,
  CalendarClock,
} from "lucide-react"

const STATUS_MAP = {
  draft: { label: "مسودة", color: "bg-muted text-muted-foreground" },
  scheduled: { label: "مجدول", color: "bg-info/15 text-info border-info/30" },
  published: { label: "منشور", color: "bg-success/15 text-success border-success/30" },
  failed: { label: "فشل", color: "bg-destructive/15 text-destructive border-destructive/30" },
}

export function ScheduledPosts({ role }) {
  useEffect(() => { document.title = "المنشورات المجدولة | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [message, setMessage] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [scheduledAt, setScheduledAt] = useState("")

  const { data: posts = [], isLoading, error, refetch } = useQuery({
    queryKey: ["scheduled-posts", filter],
    queryFn: () => fetchScheduledPosts(filter),
    refetchInterval: 30000,
  })

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

  return (
    <div className="content-container space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold">المنشورات المجدولة</h1>
          <p className="text-sm text-muted-foreground mt-1">إنشاء وجدولة ونشر منشورات فيسبوك</p>
        </div>
        {canEdit && (
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button><Plus className="ml-2 h-4 w-4" />منشور جديد</Button>
            </DialogTrigger>
            <DialogContent className="glass-heavy max-w-lg">
              <DialogHeader><DialogTitle>منشور جديد</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">نص المنشور</label>
                  <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">رابط الصورة (اختياري)</label>
                  <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">تاريخ النشر (اختياري)</label>
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

      {/* Filter */}
      <div className="flex items-center gap-2">
        {[{ value: "", label: "الكل" }, { value: "draft", label: "مسودة" }, { value: "scheduled", label: "مجدول" }, { value: "published", label: "منشور" }].map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filter === f.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-16">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <Button variant="outline" onClick={refetch}>إعادة المحاولة</Button>
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center py-16">
          <Inbox className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-sm text-muted-foreground">لا توجد منشورات</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map(p => {
            const st = STATUS_MAP[p.status] || STATUS_MAP.draft
            return (
              <Card key={p.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
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
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <p className="text-sm text-foreground flex-1 line-clamp-3">{p.message}</p>
                  <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                    {p.scheduled_at && (
                      <span className="flex items-center gap-1">
                        <CalendarClock className="size-3" />
                        {format(new Date(p.scheduled_at), "yyyy/MM/dd HH:mm", { locale: arSA })}
                      </span>
                    )}
                    {p.published_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {format(new Date(p.published_at), "yyyy/MM/dd HH:mm", { locale: arSA })}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
