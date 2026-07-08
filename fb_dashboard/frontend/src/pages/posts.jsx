import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchPosts, publishPost, deletePost } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Plus, Send, Clock, FileText, Search, Trash2, MessageCircle, Heart, Share2, ChevronLeft, ChevronRight, AlertCircle, RefreshCw } from "lucide-react"
import { useEffect } from "react"
import { format } from "date-fns"

function EngagementBadge({ icon: Icon, count, label }) {
  if (count == null) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={label}>
      <Icon className={`h-3.5 w-3.5 ${count > 0 ? "text-muted-foreground/70" : "text-muted-foreground/40"}`} />
      {count}
    </span>
  )
}

export function Posts({ role }) {
  useEffect(() => { document.title = "المنشورات | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const [showPublish, setShowPublish] = useState(false)
  const [message, setMessage] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const perPage = 10

  const { data: postsRes, isLoading, error, refetch } = useQuery({
    queryKey: ["posts", page, perPage], queryFn: () => fetchPosts(page, perPage), refetchInterval: 30000,
  })

  const items = useMemo(() => {
    const raw = postsRes
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    return raw.items || []
  }, [postsRes])

  const total = postsRes?.total ?? items.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))

  const filteredPosts = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter((p) => p.message?.toLowerCase().includes(q))
  }, [items, search])

  const publishMut = useMutation({
    mutationFn: () => publishPost(message),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["posts"] }); setShowPublish(false); setMessage(""); setImageUrl(""); toast.success("تم النشر") },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="content-container space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold tracking-tight">المنشورات</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة منشورات الصفحة</p>
        </div>
        {canEdit && (
          <Dialog open={showPublish} onOpenChange={setShowPublish}>
            <DialogTrigger asChild>
              <Button><Plus className="ml-2 h-4 w-4" />نشر منشور</Button>
            </DialogTrigger>
            <DialogContent className="glass-heavy max-w-lg">
              <DialogHeader><DialogTitle>نشر منشور جديد</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); publishMut.mutate() }} className="space-y-4">
                <Textarea placeholder="اكتب محتوى المنشور..." value={message} onChange={(e) => setMessage(e.target.value)} required rows={4} />
                <Input placeholder="رابط الصورة (اختياري)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
                {imageUrl && (
                  <div className="rounded-xl overflow-hidden border bg-muted/20 shadow-premium">
                    <img src={imageUrl} alt="معاينة" className="w-full max-h-48 object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" type="button" onClick={() => setShowPublish(false)}>إلغاء</Button>
                  <Button type="submit" disabled={publishMut.isPending}><Send className="ml-2 h-4 w-4" />{publishMut.isPending ? "جاري..." : "نشر"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="بحث في المنشورات..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 min-h-[44px] sm:min-h-0" />
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
      ) : error ? (
        <Card><CardContent className="flex flex-col items-center py-16 text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mb-2" />
          <p className="text-sm text-muted-foreground">{error?.message || "فشل تحميل المنشورات"}</p>
          <Button variant="outline" onClick={() => refetch()} className="gap-2"><RefreshCw className="h-4 w-4" />إعادة المحاولة</Button>
        </CardContent></Card>
      ) : filteredPosts.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-16 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-foreground font-medium">{search ? "لا توجد نتائج" : "لا توجد منشورات"}</p>
          <p className="text-xs text-muted-foreground mt-1">{search ? "حاول تعديل البحث" : "انشر أول منشور لك"}</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredPosts.map((p) => (
            <Card key={p.id} className="overflow-hidden group">
              <CardContent className="p-0">
                <div className="p-4">
                  <p className="text-sm line-clamp-3 leading-relaxed">{p.message || <span className="italic text-muted-foreground/50">(بدون نص)</span>}</p>
                  <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="size-3" />{p.created_time ? format(new Date(p.created_time), "yyyy/MM/dd") : ""}</span>
                    <EngagementBadge icon={Heart} count={p.likes} label="إعجابات" />
                    <EngagementBadge icon={MessageCircle} count={p.comments} label="تعليقات" />
                    <EngagementBadge icon={Share2} count={p.shares} label="مشاركات" />
                  </div>
                </div>
                {canEdit && (
                  <div className="flex border-t opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className="flex-1 rounded-none h-9 text-xs text-destructive"
                      onClick={() => { if (confirm("حذف المنشور؟")) deletePost(p.id).then(() => queryClient.invalidateQueries({ queryKey: ["posts"] })).catch(() => {}) }}>
                      <Trash2 className="size-3.5 ml-1" />حذف
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronRight className="size-4" />السابق
          </Button>
          <span className="text-sm text-muted-foreground px-2">صفحة {page} من {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            التالي<ChevronLeft className="size-4" />
          </Button>
        </div>
      )}
      <div className="mobile-nav-spacer" />
    </div>
  )
}
