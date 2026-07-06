import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchConversations, fetchConversationMessages } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Inbox, MessageSquare, User } from "lucide-react"
import { format } from "date-fns"

export function Messages() {
  useEffect(() => { document.title = "الرسائل | SmartBot" }, [])
  const [selectedId, setSelectedId] = useState(null)
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations"], queryFn: fetchConversations, refetchInterval: 30000, refetchIntervalInBackground: false,
  })

  const { data: messages = [], isLoading: msgLoading, refetch: refetchMsgs } = useQuery({
    queryKey: ["conversation-messages", selectedId],
    queryFn: () => fetchConversationMessages(selectedId),
    enabled: !!selectedId,
  })

  const sendMessage = async () => {
    if (!replyText.trim() || !selectedId) return
    setSending(true)
    try {
      const fd = new FormData()
      fd.append("message", replyText)
      const r = await fetch("/api/messages/" + selectedId + "/reply", { method: "POST", body: fd })
      if (!r.ok) throw new Error((await r.text()).slice(0, 200))
      setReplyText("")
      refetchMsgs()
      toast.success("تم إرسال الرسالة")
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">الرسائل</h1>
          <p className="text-sm text-muted-foreground mt-1">رسائل الصفحة من فيسبوك</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : conversations.length === 0 ? (
        <Card><CardContent className="text-center py-16">
          <Inbox className="h-14 w-14 mx-auto mb-5 text-muted-foreground/40" />
          <p className="text-lg font-medium text-foreground mb-1">لا توجد رسائل</p>
          <p className="text-sm text-muted-foreground">الرسائل ستظهر هنا عند تلقي رسائل جديدة من فيسبوك</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {conversations.map((conv) => (
            <Card key={conv.id} className="cursor-pointer hover:shadow-md transition-all"
              onClick={() => setSelectedId(conv.id)}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0 mt-1">
                    <MessageSquare className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {conv.subject || "بدون موضوع"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {conv.senders?.map(s => s.name).join("، ") || "غير معروف"}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{conv.message_count} رسالة</span>
                      {conv.unread_count > 0 && (
                        <Badge variant="destructive" className="text-xs px-1.5 py-0">{conv.unread_count} جديدة</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null) }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>الرسائل</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 -mx-6 px-6">
            {msgLoading ? (
              <div className="space-y-3 p-4">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">لا توجد رسائل</p>
            ) : (
              [...messages].reverse().map((m) => (
                <div key={m.id} className={`p-3 rounded-lg ${m.from?.id?.includes("page") ? "bg-primary/10 border border-primary/20 mr-8" : "bg-muted/30 ml-8"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-semibold text-foreground">{m.from?.name || "—"}</span>
                  </div>
                  <p className="text-sm text-foreground">{m.message || <span className="text-muted-foreground italic">(وسائط)</span>}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {m.created_time ? format(new Date(m.created_time), "yyyy/MM/dd HH:mm") : ""}
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2 pt-3 border-t mt-3">
            <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)}
              placeholder="اكتب ردك..." rows={2} className="min-h-0" />
            <Button onClick={sendMessage} disabled={!replyText.trim() || sending}
              className="shrink-0 self-end">
              {sending ? "جاري..." : "إرسال"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
