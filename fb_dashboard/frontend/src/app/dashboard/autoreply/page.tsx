"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import { countPhrase } from "@/lib/format"
import { Bot, Plus, ToggleLeft, ToggleRight, Trash2, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/PageHeader"
import { EmptyState } from "@/components/ui/EmptyState"
import { unwrapApi } from "@/lib/api"
import type { ReplyRule } from "@/lib/types"

export default function AutoReplyPage() {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [keyword, setKeyword] = useState("")
  const [replyText, setReplyText] = useState("")
  const [priority, setPriority] = useState("50")
  const queryClient = useQueryClient()

  const { data: rules = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["rules"],
    queryFn: async () => {
      const res = await apiFetch("/api/rules")
      if (!res.ok) throw new Error(`فشل تحميل القواعد (${res.status})`)
      return unwrapApi<ReplyRule[]>(res)
    },
    refetchInterval: 30000,
    retry: 1,
  })

  const createMut = useMutation({
    // v4 §2.3/§5.14 — send the fields the backend actually declares
    // (name, keywords, reply_template, priority). The old body sent
    // keyword/reply_text → guaranteed 422, so NO rule was ever creatable
    // from this page.
    mutationFn: () =>
      apiFetch("/api/rules", {
        method: "POST",
        body: new URLSearchParams({
          name: name.trim() || keyword.trim(),
          keywords: keyword.trim(),
          reply_template: replyText.trim(),
          priority: priority.trim() || "50",
        }),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); setShowForm(false); setName(""); setKeyword(""); setReplyText(""); setPriority("50"); brandedToast.success("تم إنشاء القاعدة") },
    onError: (e: Error) => brandedToast.error(e.message || "فشل الإنشاء"),
  })

  const toggleMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/rules/${id}/toggle`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); brandedToast.success("تم التبديل") },
    onError: (e: Error) => brandedToast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); brandedToast.success("تم حذف القاعدة") },
    onError: (e: Error) => brandedToast.error(e.message),
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
          <p className="text-sm text-muted-foreground">{countPhrase(rules.length, "قاعدة", "قاعدتين", "قواعد")}</p>
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="shadow-sm shadow-accent-foreground/15">
            <Plus className="size-3.5" /> قاعدة جديدة
          </Button>
        </div>

        {showForm && (
          <Card
            className="border-accent-foreground/30 shadow-md shadow-accent-foreground/5"
            /* v10-B7 (G2-05): Escape closes the inline form (same as «إلغاء») —
               the first field is focused on open so the key lands inside */
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setShowForm(false) } }}
          >
            <CardContent className="p-4 space-y-3">
              <div>
                <label htmlFor="rule-name" className="text-xs font-medium text-muted-foreground mb-1.5 block">اسم القاعدة</label>
                <input
                  id="rule-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="مثال: الرد على الاستفسارات"
                  autoFocus
                  /* v16-E3 (D1 C3): raw input bypasses the shared Input seam —
                     dir="auto" isolates mixed Arabic/Latin values. */
                  dir="auto"
                  className="w-full h-10 text-sm rounded-lg border border-input/60 bg-background px-3 transition-colors duration-200 focus:outline-none focus:border-accent-foreground/40 focus:ring-2 focus:ring-accent-foreground/15"
                />
              </div>
              <div>
                <label htmlFor="rule-keywords" className="text-xs font-medium text-muted-foreground mb-1.5 block">الكلمات المفتاحية (افصل بفاصلة)</label>
                <input
                  id="rule-keywords"
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  placeholder="مثال: سعر، توصيل، عنوان"
                  dir="auto"
                  className="w-full h-10 text-sm rounded-lg border border-input/60 bg-background px-3 transition-colors duration-200 focus:outline-none focus:border-accent-foreground/40 focus:ring-2 focus:ring-accent-foreground/15"
                />
              </div>
              <div>
                <label htmlFor="rule-reply" className="text-xs font-medium text-muted-foreground mb-1.5 block">نص الرد</label>
                <textarea
                  id="rule-reply"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="النص الذي سيرد به البوت عند تطابق الكلمة…"
                  rows={3}
                  dir="auto"
                  className="w-full min-h-[80px] rounded-lg border border-input/60 bg-background p-3 text-sm transition-colors duration-200 focus:outline-none focus:border-accent-foreground/40 focus:ring-2 focus:ring-accent-foreground/15 resize-none"
                />
              </div>
              <div>
                <label htmlFor="rule-priority" className="text-xs font-medium text-muted-foreground mb-1.5 block">الأولوية (الرقم الأقل يُفحص أولاً: 1-999)</label>
                <input
                  id="rule-priority"
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  inputMode="numeric"
                  dir="auto"
                  className="w-32 h-10 text-sm rounded-lg border border-input/60 bg-background px-3 transition-colors duration-200 focus:outline-none focus:border-accent-foreground/40 focus:ring-2 focus:ring-accent-foreground/15"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
                <Button size="sm" onClick={() => createMut.mutate()} disabled={!keyword.trim() || !replyText.trim() || createMut.isPending}>
                  {createMut.isPending ? "جارٍ الحفظ…" : "حفظ القاعدة"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4"><div className="h-4 bg-muted rounded animate-pulse w-1/3 mb-2" /><div className="h-3 bg-muted rounded animate-pulse w-2/3" /></CardContent></Card>)}</div>
        ) : isError ? (
          <div className="text-center py-16">
            <div className="size-16 rounded-2xl bg-destructive-soft flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="size-8 text-destructive" />
            </div>
            <h2 className="text-sm font-bold mb-1">فشل تحميل القواعد</h2>
            <p className="text-xs text-muted-foreground mb-4">{(error as Error)?.message || "تعذر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="لا توجد قواعد رد تلقائي"
            description="أنشئ أول قاعدة من زر قاعدة جديدة أعلى الصفحة ليبدأ البوت بالرد تلقائياً على التعليقات المتطابقة."
          />
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <Card key={r.id} className="card-hover border-border/50 hover:border-accent-foreground/30 group">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {/* v4 §2.3 — backend returns keywords[] / reply_template / enabled;
                          the old r.keyword / r.reply_text / r.is_active rendered blanks
                          and every rule showed "نشط" even when disabled */}
                      {(r.keywords || []).map((k: string, i: number) => (
                        <code key={i} className="text-xs font-bold bg-accent-foreground/10 text-accent-foreground px-2 py-0.5 rounded border border-accent-foreground/20">
                          {k}
                        </code>
                      ))}
                      <span className={`inline-flex items-center gap-1 text-2xs font-medium ${r.enabled === false ? "text-muted-foreground" : "text-success"}`}>
                        <span className={`size-1.5 rounded-full ${r.enabled === false ? "bg-muted-foreground" : "bg-success"}`} />
                        {r.enabled === false ? "متوقف" : "نشط"}
                      </span>
                      <span className="text-3xs text-muted-foreground" title="الأولوية — الأقل يُفحص أولاً">
                        أولوية {r.priority ?? 999}
                      </span>
                      {(r.replies_count ?? 0) > 0 && (
                        <span className="text-3xs text-muted-foreground">{countPhrase(r.replies_count, "رد", "ردين", "ردود")}</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{r.reply_template}</p>
                  </div>
                  {/* v15-E6 (D5-M2 + L10): toggle/delete disclose their state
                      and target row programmatically (the icon alone isn't a
                      state for SRs — WCAG 4.1.2), and the hover-only opacity
                      reveal now also lifts on keyboard focus. */}
                  <div className="flex gap-1 shrink-0 opacity-70 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" onClick={() => toggleMut.mutate(r.id)} disabled={toggleMut.isPending && toggleMut.variables === r.id} className="size-8 p-0" aria-pressed={r.enabled !== false} aria-label={`تبديل حالة قاعدة ${r.name}`}>
                      {r.enabled === false ? <ToggleLeft className="size-4" /> : <ToggleRight className="size-4 text-success" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(r.id)} disabled={deleteMut.isPending && deleteMut.variables === r.id} className="size-8 p-0 hover:text-destructive" aria-label={`حذف قاعدة ${r.name}`}>
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
