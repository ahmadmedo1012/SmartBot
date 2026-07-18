"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { toast } from "sonner"
import { Wrench, Plus, Trash2, AlertCircle, RefreshCw, ToggleLeft, ToggleRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function ToolsPage() {
  const queryClient = useQueryClient()

  const { data: offers = [], isLoading: offLoad, isError: offErr, error: offError, refetch: offRefetch } = useQuery({
    queryKey: ["offers"],
    queryFn: async () => {
      const res = await apiFetch("/api/offers")
      if (!res.ok) throw new Error(`فشل تحميل العروض (${res.status})`)
      return res.json()
    },
    retry: 1,
  })

  const { data: templates = [], isLoading: tmplLoad, isError: tmplErr, error: tmplError, refetch: tmplRefetch } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const res = await apiFetch("/api/templates")
      if (!res.ok) throw new Error(`فشل تحميل القوالب (${res.status})`)
      return res.json()
    },
    retry: 1,
  })

  const [showTmplForm, setShowTmplForm] = useState(false)
  const [tmplName, setTmplName] = useState("")
  const [tmplText, setTmplText] = useState("")
  const [tmplCategory, setTmplCategory] = useState("")

  const createTmpl = useMutation({
    mutationFn: () => apiFetch("/api/templates", {
      method: "POST",
      body: JSON.stringify({ name: tmplName.trim(), text: tmplText.trim(), category: tmplCategory.trim() }),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["templates"] }); setShowTmplForm(false); setTmplName(""); setTmplText(""); setTmplCategory(""); toast.success("تم إنشاء القالب") },
    onError: (e: Error) => toast.error(e.message || "فشل الإنشاء"),
  })

  const deleteTmpl = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["templates"] }); toast.success("تم حذف القالب") },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleOffer = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/offers/${id}/toggle`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["offers"] }); toast.success("تم التبديل") },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteOffer = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/offers/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["offers"] }); toast.success("تم حذف العرض") },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <Wrench className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">الأدوات</h1>
            <p className="text-[11px] text-muted-foreground">قوالب الرد والعروض</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* قوالب الرد */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm">قوالب الرد</h2>
            <Button size="sm" onClick={() => setShowTmplForm(!showTmplForm)}><Plus className="size-3" /> قالب جديد</Button>
          </div>

          {showTmplForm && (
            <Card className="mb-3">
              <CardContent className="p-4 space-y-3">
                <input value={tmplName} onChange={e => setTmplName(e.target.value)} placeholder="اسم القالب" className="w-full h-9 text-sm rounded-lg border border-input bg-background px-3 focus:outline-none focus:ring-2 focus:ring-orange/30" />
                <input value={tmplCategory} onChange={e => setTmplCategory(e.target.value)} placeholder="تصنيف (اختياري)" className="w-full h-9 text-sm rounded-lg border border-input bg-background px-3 focus:outline-none focus:ring-2 focus:ring-orange/30" />
                <textarea value={tmplText} onChange={e => setTmplText(e.target.value)} placeholder="نص القالب..." className="w-full min-h-[60px] rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange/30 resize-none" />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowTmplForm(false)}>إلغاء</Button>
                  <Button size="sm" onClick={() => createTmpl.mutate()} disabled={!tmplName.trim() || !tmplText.trim() || createTmpl.isPending}>حفظ</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {tmplLoad ? (
            <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-12" /></Card>)}</div>
          ) : tmplErr ? (
            <div className="text-center py-8">
              <AlertCircle className="size-8 mx-auto mb-2 text-red-500/50" />
              <p className="text-xs text-muted-foreground mb-3">{(tmplError as any)?.message || "تعذر الاتصال"}</p>
              <Button size="sm" variant="outline" onClick={() => tmplRefetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
            </div>
          ) : (templates as any[]).length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا توجد قوالب بعد</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {(templates as any[]).map((t: any) => (
                <Card key={t.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold">{t.name}</span>
                        {t.category && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{t.category}</span>}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{t.text}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => deleteTmpl.mutate(t.id)}>
                      <Trash2 className="size-3" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* العروض */}
        <section>
          <h2 className="font-bold text-sm mb-3">العروض</h2>
          {offLoad ? (
            <div className="space-y-2">{[1,2].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-12" /></Card>)}</div>
          ) : offErr ? (
            <div className="text-center py-8">
              <AlertCircle className="size-8 mx-auto mb-2 text-red-500/50" />
              <p className="text-xs text-muted-foreground mb-3">{(offError as any)?.message || "تعذر الاتصال"}</p>
              <Button size="sm" variant="outline" onClick={() => offRefetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
            </div>
          ) : (offers as any[]).length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا توجد عروض</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {(offers as any[]).map((o: any) => (
                <Card key={o.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{o.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{o.description}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => toggleOffer.mutate(o.id)}>
                        {o.active ? <ToggleRight className="size-4" /> : <ToggleLeft className="size-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteOffer.mutate(o.id)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
