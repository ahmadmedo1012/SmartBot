"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { toast } from "sonner"
import { Bot, Plus, ToggleLeft, ToggleRight, Trash2, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/PageHeader"
import { unwrapApi } from "@/lib/api"

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
      return unwrapApi(res)
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
      <PageHeader
        icon={<Bot className="size-4" />}
        title="الردود التلقائية"
        subtitle="قواعد الرد الآلي على التعليقات"
        compact
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">{rules.length} قاعدة</p>
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="shadow-sm shadow-orange/15">
            <Plus className="size-3.5" /> قاعدة جديدة
          </Button>
        </div>

        {showForm && (
          <Card className="border-orange/30 shadow-md shadow-orange/5">
            <CardContent className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">الكلمة المفتاحية</label>
                <input
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  placeholder="مثال: سعر، توصيل، عنوان"
                  className="w-full h-10 text-sm rounded-lg border border-input/60 bg-background px-3 transition-colors duration-200 focus:outline-none focus:border-orange/40 focus:ring-2 focus:ring-orange/15"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">نص الرد</label>
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="النص الذي سيرد به البوت عند تطابق الكلمة..."
                  rows={3}
                  className="w-full min-h-[80px] rounded-lg border border-input/60 bg-background p-3 text-sm transition-colors duration-200 focus:outline-none focus:border-orange/40 focus:ring-2 focus:ring-orange/15 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
                <Button size="sm" onClick={() => createMut.mutate()} disabled={!keyword.trim() || !replyText.trim() || createMut.isPending}>
                  {createMut.isPending ? "جاري الحفظ..." : "حفظ القاعدة"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4"><div className="h-4 bg-muted rounded animate-pulse w-1/3 mb-2" /><div className="h-3 bg-muted rounded animate-pulse w-2/3" /></CardContent></Card>)}</div>
        ) : isError ? (
          <div className="text-center py-16">
            <div className="size-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="size-8 text-red-500" />
            </div>
            <h2 className="text-sm font-bold mb-1">فشل تحميل القواعد</h2>
            <p className="text-xs text-muted-foreground mb-4">{(error as any)?.message || "تعذر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-border/50 rounded-2xl">
            <div className="size-16 rounded-2xl bg-orange/10 flex items-center justify-center mx-auto mb-3">
              <Bot className="size-8 text-orange" />
            </div>
            <p className="text-sm font-medium mb-1">لا توجد قواعد رد تلقائي</p>
            <p className="text-xs text-muted-foreground mb-4">أنشئ أول قاعدة ليبدأ البوت بالرد تلقائياً</p>
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="size-3.5" /> إنشاء قاعدة
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((r: any) => (
              <Card key={r.id} className="card-hover border-border/50 hover:border-orange/30 group">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <code className="text-xs font-bold bg-orange/10 text-orange px-2 py-0.5 rounded border border-orange/20">
                        {r.keyword}
                      </code>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${r.is_active === false ? "text-muted-foreground" : "text-green-500"}`}>
                        <span className={`size-1.5 rounded-full ${r.is_active === false ? "bg-muted-foreground" : "bg-green-500"}`} />
                        {r.is_active === false ? "متوقف" : "نشط"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{r.reply_text}</p>
                  </div>
                  <div className="flex gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" onClick={() => toggleMut.mutate(r.id)} className="size-8 p-0" aria-label="تبديل">
                      {r.is_active === false ? <ToggleLeft className="size-4" /> : <ToggleRight className="size-4 text-green-500" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(r.id)} className="size-8 p-0 hover:text-destructive" aria-label="حذف">
                      <Trash2 className="size-3.5" />
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
