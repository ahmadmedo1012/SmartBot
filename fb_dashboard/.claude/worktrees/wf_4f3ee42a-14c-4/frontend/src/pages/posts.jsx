import { useState, useEffect, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchPosts, publishPost, fetchPostDetail, deletePost } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Plus, Send, Clock, FileText, ExternalLink, Search, Trash2, Eye, MessageCircle } from "lucide-react"
import { format } from "date-fns"

export function Posts({ role }) {
  useEffect(() => { document.title = "المنشورات | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const [showPublish, setShowPublish] = useState(false)
  const [message, setMessage] = useState("")
  const [search, setSearch] = useState("")

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["posts"], queryFn: fetchPosts, refetchInterval: 30000, refetchIntervalInBackground: false,
  })

  const filteredPosts = useMemo(() => {
    if (!search.trim()) return posts
    const q = search.toLowerCase()
    return posts.filter((p) => p.message?.toLowerCase().includes(q))
  }, [posts, search])

  const publishMut = useMutation({
    mutationFn: () => publishPost(message),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["posts"] }); setShowPublish(false); setMessage(""); toast.success("تم النشر") },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">المنشورات</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة منشورات الصفحة</p>
        </div>
        {canEdit && (
          <Dialog open={showPublish} onOpenChange={setShowPublish}>
            <DialogTrigger asChild>
              <Button><Plus className="ml-2 h-4 w-4" />نشر منشور</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>نشر منشور جديد</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); publishMut.mutate() }} className="space-y-4">
                <Textarea placeholder="اكتب محتوى المنشور..." value={message} onChange={(e) => setMessage(e.target.value)} required rows={5} />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" type="button" onClick={() => setShowPublish(false)}>إلغاء</Button>
                  <Button type="submit" disabled={publishMut.isPending}><Send className="ml-2 h-4 w-4" />{publishMut.isPending ? "جاري..." : "نشر"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="بحث في المنشورات..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
      ) : filteredPosts.length === 0 ? (
        <Card><CardContent className="text-center py-16">
          <FileText className="h-14 w-14 mx-auto mb-5 text-muted-foreground/40" />
          <p className="text-lg font-medium text-foreground mb-1">{search ? "لا توجد نتائج" : "لا توجد منشورات بعد"}</p>
          <p className="text-sm text-muted-foreground">{search ? "حاول تعديل البحث" : 'انقر على "نشر منشور" لإنشاء أول منشور'}</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map((post) => (
            <PostCard key={post.id} post={post} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  )
}

function PostCard({ post, canEdit }) {
  const queryClient = useQueryClient()
  const [detailOpen, setDetailOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["post-detail", post.id],
    queryFn: () => fetchPostDetail(post.id),
    enabled: detailOpen,
  })

  const deleteMut = useMutation({
    mutationFn: () => deletePost(post.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["posts"] }); setDeleteConfirm(false); toast.success("تم حذف المنشور") },
    onError: (e) => toast.error(e.message),
  })

  return (
    <>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                {post.message || <span className="text-muted-foreground italic">(بدون نص)</span>}
              </p>
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>{post.created_time ? format(new Date(post.created_time), "yyyy/MM/dd HH:mm") : "-"}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                    <Eye className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>تفاصيل المنشور</DialogTitle></DialogHeader>
                  {detailLoading ? (
                    <div className="space-y-3 p-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-10 w-full" /></div>
                  ) : detail ? (
                    <div className="space-y-4">
                      <div className="p-4 rounded-lg bg-muted/30">
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{detail.message || "(بدون نص)"}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {detail.created_time ? format(new Date(detail.created_time), "yyyy/MM/dd HH:mm") : ""}
                        </p>
                      </div>
                      {detail.permalink_url && (
                        <a href={detail.permalink_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-primary hover:underline">
                          <ExternalLink className="h-4 w-4" />فتح في فيسبوك
                        </a>
                      )}
                      <div className="border-t pt-4">
                        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                          <MessageCircle className="h-4 w-4" />التعليقات
                        </h4>
                        {detail.comments?.data?.length > 0 ? (
                          <div className="space-y-3">
                            {detail.comments.data.map((c) => (
                              <div key={c.id} className="p-3 rounded-lg bg-muted/20 text-sm">
                                <span className="font-medium text-foreground">{c.from?.name || "—"}</span>
                                <p className="text-muted-foreground mt-1">{c.message}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {c.created_time ? format(new Date(c.created_time), "yyyy/MM/dd HH:mm") : ""}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">لا توجد تعليقات</p>
                        )}
                      </div>
                    </div>
                  ) : <p className="text-sm text-muted-foreground py-4">فشل تحميل التفاصيل</p>}
                </DialogContent>
              </Dialog>

              {canEdit && (
                <Dialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>تأكيد حذف المنشور</DialogTitle></DialogHeader>
                    <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف هذا المنشور؟ لا يمكن التراجع عن هذا الإجراء.</p>
                    <div className="flex gap-2 justify-end pt-2">
                      <Button variant="outline" onClick={() => setDeleteConfirm(false)}>إلغاء</Button>
                      <Button variant="destructive" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>
                        {deleteMut.isPending ? "جاري..." : "حذف"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
