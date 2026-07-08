import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchAllComments, replyToComment, hideComment, deleteComment } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { format } from "date-fns"
import { arSA } from "date-fns/locale"
import {
  MessageSquare, Send, EyeOff, Trash2, Search, Reply, Sparkles, Clock,
  AlertCircle, Inbox,
} from "lucide-react"

export function Comments({ role }) {
  useEffect(() => { document.title = "التعليقات | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [replyTarget, setReplyTarget] = useState(null)
  const [replyText, setReplyText] = useState("")
  const [aiSuggestions, setAiSuggestions] = useState([])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["comments"],
    queryFn: () => fetchAllComments(30),
    refetchInterval: 30000,
  })

  const comments = data?.items || []
  const filtered = search
    ? comments.filter(c => c.message?.toLowerCase().includes(search.toLowerCase()) || c.from_name?.toLowerCase().includes(search.toLowerCase()))
    : comments


  const replyMut = useMutation({
    mutationFn: () => replyToComment(replyTarget.id, replyText),
    onSuccess: () => { toast.success("تم إرسال الرد"); setReplyTarget(null); setReplyText(""); queryClient.invalidateQueries({ queryKey: ["comments"] }) },
    onError: (e) => toast.error(e.message),
  })
  const hideMut = useMutation({
    mutationFn: (id) => hideComment(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["comments"] }); toast.success("تم الإخفاء") },
    onError: (e) => toast.error(e.message),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => deleteComment(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["comments"] }); toast.success("تم الحذف") },
    onError: (e) => toast.error(e.message),
  })

  const generateAiReply = async () => {
    if (!replyTarget) return
    try {
      const fd = new FormData()
      fd.append("comment_text", replyTarget.message)
      fd.append("commenter_name", replyTarget.from_name)
      const r = await fetch("/api/ai/suggest", { method: "POST", body: fd })
      const data = await r.json()
      if (data?.suggestions) setAiSuggestions(data.suggestions)
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MessageSquare className="size-6 text-primary" />
            مركز التعليقات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            جميع التعليقات من جميع المنشورات — تحكم كامل مثل فيسبوك وأكثر
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input placeholder="بحث في التعليقات..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : error ? (
        <div className="flex flex-col items-center py-16"><AlertCircle className="size-12 text-destructive mb-4" /><Button variant="outline" onClick={refetch}>إعادة</Button></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16"><Inbox className="size-16 text-muted-foreground/20 mb-4" /><p className="text-sm text-muted-foreground">{search ? "لا توجد نتائج" : "لا توجد تعليقات"}</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <Card key={c.id} className="border-r-4 border-r-primary/40">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{c.from_name || "مستخدم فيسبوك"}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{c.from_id ? c.from_id.substring(0, 8) + "..." : ""}</span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="size-3" />
                        {c.created_time ? format(new Date(c.created_time), "yyyy/MM/dd HH:mm", { locale: arSA }) : ""}
                      </span>
                    </div>
                    <p className="text-sm text-foreground mb-1">{c.message}</p>
                    {c.post_message && (
                      <p className="text-xs text-muted-foreground/60 truncate max-w-md">
                        على منشور: {c.post_message}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="size-8 text-info" onClick={() => { setReplyTarget(c); setAiSuggestions([]); generateAiReply() }}><Reply className="size-4" /></Button>
                      <Button variant="ghost" size="icon" className="size-8 text-warning" onClick={() => hideMut.mutate(c.id)}><EyeOff className="size-4" /></Button>
                      {role === "admin" && (
                        <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => { if (confirm("حذف؟")) deleteMut.mutate(c.id) }}><Trash2 className="size-4" /></Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reply Dialog */}
      <Dialog open={!!replyTarget} onOpenChange={o => { if (!o) { setReplyTarget(null); setReplyText(""); setAiSuggestions([]) } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>رد على تعليق — {replyTarget?.from_name || ""}</DialogTitle></DialogHeader>
          <div className="p-3 rounded-lg bg-muted/30 text-sm border mb-3">
            <p className="text-xs text-muted-foreground mb-1">التعليق الأصلي:</p>
            <p className="text-foreground">{replyTarget?.message}</p>
          </div>
          {aiSuggestions.length > 0 && (
            <div className="space-y-1.5 mb-3">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Sparkles className="size-3.5 text-warning" />
                ردود ذكية مقترحة:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {aiSuggestions.map((s, i) => (
                  <button key={i} onClick={() => setReplyText(s)}
                    className="px-2.5 py-1.5 rounded-lg text-xs bg-info/10 border border-info/20 text-info hover:bg-info/20 transition-colors text-right max-w-[260px]">
                    {s.substring(0, 80)}{s.length > 80 ? "..." : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={3} placeholder="اكتب ردك..." />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setReplyTarget(null); setReplyText("") }}>إلغاء</Button>
            <Button onClick={() => replyMut.mutate()} disabled={!replyText.trim() || replyMut.isPending}>
              <Send className="size-4 ml-1" />إرسال
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mobile-nav-spacer" />
    </div>
  )
}
