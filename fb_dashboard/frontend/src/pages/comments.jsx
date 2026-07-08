import { motion } from "framer-motion"
import { useState, useEffect, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAdaptiveInterval } from "@/hooks/use-refresh-engine"
import { fetchAllComments, replyToComment, hideComment, deleteComment, suggestAiReplies } from "@/lib/api"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  MessageSquare, Send, EyeOff, Trash2, Search, Reply, Sparkles, Clock,
  AlertCircle, Inbox, CheckCircle2,
} from "lucide-react"

function timeAgo(dateStr) {
  if (!dateStr) return ""
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "الآن"
  if (mins < 60) return `منذ ${mins} د`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `منذ ${hrs} س`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `منذ ${days} ي`
  return new Date(dateStr).toLocaleDateString("ar-SA")
}

function getInitials(name) {
  if (!name) return "؟"
  return name.split(" ").slice(0, 2).map((s) => s[0]).join("").toUpperCase() || "؟"
}

function SkeletonCard() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="size-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2 items-center">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}
    </div>
  )
}

function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <AlertCircle className="size-14 text-destructive mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-1">فشل تحميل التعليقات</h3>
      <p className="text-sm text-muted-foreground mb-5 max-w-md">{error?.message || "حدث خطأ غير متوقع"}</p>
      <Button variant="outline" onClick={onRetry}>إعادة المحاولة</Button>
    </div>
  )
}

function EmptyState({ search }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Inbox className="size-16 text-muted-foreground/20 mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-1">
        {search ? "لا توجد نتائج" : "لا توجد تعليقات"}
      </h3>
      <p className="text-sm text-muted-foreground">
        {search ? "حاول تعديل كلمات البحث" : "التعليقات الجديدة ستظهر هنا تلقائياً"}
      </p>
    </div>
  )
}

function ReplyDialog({ comment, open, onOpenChange }) {
  const [message, setMessage] = useState("")
  const [aiSuggestions, setAiSuggestions] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const queryClient = useQueryClient()

  const genAi = useCallback(async () => {
    if (!comment?.message) return
    setAiLoading(true)
    try {
      const d = await suggestAiReplies(comment.message, comment.from_name)
      if (d?.suggestions) setAiSuggestions(d.suggestions)
    } catch {} finally {
      setAiLoading(false)
    }
  }, [comment])

  useEffect(() => {
    if (open) {
      setMessage("")
      setAiSuggestions([])
      genAi()
    }
  }, [open, genAi])

  const replyMut = useMutation({
    mutationFn: () => replyToComment(comment.id, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments"] })
      onOpenChange(false)
      toast.success("تم إرسال الرد بنجاح")
    },
    onError: (e) => toast.error(e.message),
  })

  const insertName = () => {
    const name = comment.from_name?.split(" ")[0] || comment.from_name || "صديقنا"
    setMessage((p) => p + `${name} `)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-heavy max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-4" /> رد على {comment?.from_name || "صاحب التعليق"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/30 text-sm border">
            <p className="text-xs text-muted-foreground mb-1 font-medium">التعليق الأصلي:</p>
            <p className="text-foreground">{comment?.message}</p>
          </div>

          {aiLoading && (
            <div className="flex items-center gap-2 text-sm text-info">
              <Sparkles className="size-4 animate-pulse" />جاري توليد ردود ذكية...
            </div>
          )}
          {aiSuggestions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Sparkles className="size-3.5 text-warning" /> ردود مقترحة:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {aiSuggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setMessage(s)}
                    className="px-2.5 py-1.5 rounded-lg text-xs bg-info/10 border border-info/20 text-info hover:bg-info/20 transition-colors text-right max-w-[250px]"
                  >
                    {s.substring(0, 80)}{s.length > 80 ? "..." : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={insertName} className="text-xs h-9">
            @{comment?.from_name?.split(" ")[0] || "الاسم"}
          </Button>

          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="اكتب ردك..."
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button
              onClick={() => replyMut.mutate()}
              disabled={!message.trim() || replyMut.isPending}
            >
              {replyMut.isPending ? "جاري..." : <><Send className="size-4 ml-1" />إرسال</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function Comments({ role }) {
  useEffect(() => { document.title = "التعليقات | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const isAdmin = role === "admin"
  const queryClient = useQueryClient()

  const [search, setSearch] = useState("")
  const [replyTarget, setReplyTarget] = useState(null)

  const cmInterval = useAdaptiveInterval("normal")

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["comments"],
    queryFn: () => fetchAllComments(30),
    staleTime: 15000,
    refetchOnWindowFocus: true,
    refetchInterval: cmInterval,
    retry: 2,
    placeholderData: (prev) => prev,
  })

  const comments = data?.items || []
  const filtered = search
    ? comments.filter(
        (c) =>
          c.message?.toLowerCase().includes(search.toLowerCase()) ||
          c.from_name?.toLowerCase().includes(search.toLowerCase())
      )
    : comments

  const hideMut = useMutation({
    mutationFn: (id) => hideComment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments"] })
      toast.success("تم إخفاء التعليق")
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => deleteComment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments"] })
      toast.success("تم حذف التعليق")
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="content-container space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="size-6 text-primary" />
            مركز التعليقات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            جميع التعليقات من فيسبوك — رد بذكاء وتحكم بسرعة
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="بحث في التعليقات..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-9 min-h-[44px] sm:min-h-0"
        />
      </div>

      {/* Body */}
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState search={search} />
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card key={c.id} className="border-r-2 border-r-primary/30 hover:border-r-primary/60 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <Avatar className="size-10 shrink-0 mt-0.5">
                    <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                      {getInitials(c.from_name)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Header row: name + user ID + timestamp + status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{c.from_name || "مستخدم فيسبوك"}</span>
                      <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                        {c.from_id ? c.from_id.substring(0, 8) + "..." : ""}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="size-3" />
                        {timeAgo(c.created_time)}
                      </span>
                      {/* ponytail: replied tracking via replied_at field from API — add dedicated endpoint field if missing */}
                      {c.replied_at && (
                        <span className="text-[10px] text-success flex items-center gap-1">
                          <CheckCircle2 className="size-3" />
                          تم الرد
                        </span>
                      )}
                    </div>

                    {/* Comment message */}
                    <p className="text-sm text-foreground leading-relaxed">{c.message}</p>

                    {/* Post context */}
                    {c.post_message && (
                      <p className="text-xs text-muted-foreground/60 truncate max-w-md">
                        على منشور: {c.post_message}
                      </p>
                    )}

                    {/* Actions */}
                    {canEdit && (
                      <div className="flex gap-1 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-info hover:text-info hover:bg-info/10"
                          onClick={() => setReplyTarget(c)}
                        >
                          <Reply className="size-3.5 ml-1" /> رد
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-warning hover:text-warning hover:bg-warning/10"
                          onClick={() => {
                            if (confirm("إخفاء هذا التعليق؟")) hideMut.mutate(c.id)
                          }}
                        >
                          <EyeOff className="size-3.5 ml-1" /> إخفاء
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (confirm("حذف هذا التعليق نهائياً؟")) deleteMut.mutate(c.id)
                            }}
                          >
                            <Trash2 className="size-3.5 ml-1" /> حذف
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reply Dialog */}
      {replyTarget && (
        <ReplyDialog
          comment={replyTarget}
          open={!!replyTarget}
          onOpenChange={(o) => { if (!o) setReplyTarget(null) }}
        />
      )}

      <div className="mobile-nav-spacer" />
    </motion.div>
  )
}
