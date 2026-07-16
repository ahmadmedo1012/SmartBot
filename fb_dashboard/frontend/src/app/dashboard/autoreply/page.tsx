"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { toast } from "sonner"
import { Bot, Plus, ToggleLeft, ToggleRight, Trash2, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function AutoReplyPage() {
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState("")
  const [replyText, setReplyText] = useState("")
  const queryClient = useQueryClient()

  const { data: rules = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["rules"],
    queryFn: async () => {
      const res = await apiFetch("/api/rules")
      if (!res.ok) throw new Error(`فشل تحميل القواعد (${res.status})`)
      return res.json()
    },
    refetchInterval: 30000,
    retry: 1,
  })

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch("/api/rules", {
        method: "POST",
        body: new URLSearchParams({ keyword: keyword.trim(), reply_text: replyText.trim() }),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); setShowForm(false); setKeyword(""); setReplyText(""); toast.success("تم إنشاء القاعدة") },
    onError: (e: Error) => toast.error(e.message || "فشل الإنشاء"),
  })

  const toggleMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/rules/${id}/toggle`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); toast.success("تم التبديل") },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); toast.success("تم حذف القاعدة") },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-9 rounded-lg bg-orange/10 flex items-center justify-center">
            <Bot className="size-4 text-orange" />
          </div>
          <div>
            <h1 className="font-bold text-sm">الردود التلقائية</h1>
            <p className="text-[11px] text-muted-foreground">قواعد الرد الآلي على التعليقات</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">{rules.length} قاعدة</p>
          <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus className="size-3" /> قاعدة جديدة</Button>
        </div>

        {showForm && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="كلمة مفتاحية (مثال: سعر)" className="w-full h-9 text-sm rounded-lg border border-input bg-background px-3 focus:outline-none focus:ring-2 focus:ring-orange/30" />
              <textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="نص الرد..." className="w-full min-h-[60px] rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange/30 resize-none" />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
                <Button size="sm" onClick={() => createMut.mutate()} disabled={!keyword.trim() || !replyText.trim() || createMut.isPending}>حفظ</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-12" /></Card>)}</div>
        ) : isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-red-500/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل القواعد</h2>
            <p className="text-xs text-muted-foreground mb-4">{(error as any)?.message || "تعذر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center py-16">
            <Bot className="size-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">لا توجد قواعد رد تلقائي بعد</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((r: any) => (
              <Card key={r.id}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded">{r.keyword}</span>
                      <span className={`text-[11px] ${r.is_active === false ? "text-muted-foreground" : "text-green-500"}`}>
                        {r.is_active === false ? "متوقف" : "نشط"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{r.reply_text}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => toggleMut.mutate(r.id)}>
                      {r.is_active === false ? <ToggleLeft className="size-4" /> : <ToggleRight className="size-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(r.id)}>
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
