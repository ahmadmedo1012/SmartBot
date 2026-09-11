"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import { Wrench, Plus, Trash2, Pencil, AlertCircle, RefreshCw, FileText, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { Switch } from "@/components/ui/switch"
import { unwrapApi } from "@/lib/api"
import type { Offer, ReplyTemplate } from "@/lib/types"

export default function ToolsPage() {
  const queryClient = useQueryClient()
  /* v25 (W-04 — نمط posts/sequences المؤسسي): حذف القالب/العرض بلمستين —
   * الضغط الأول يكشف «تأكيد الحذف / إلغاء» (أزرار 44px)، والثاني فقط
   * ينفّذ DELETE. لا حذف بلمسة أيقونة واحدة بعد الآن. */
  const [confirmDeleteTmplId, setConfirmDeleteTmplId] = useState<number | null>(null)
  const [confirmDeleteOfferId, setConfirmDeleteOfferId] = useState<number | null>(null)

  const { data: offers = [], isLoading: offLoad, isError: offErr, error: offError, refetch: offRefetch } = useQuery({
    queryKey: ["offers"],
    queryFn: async () => {
      const res = await apiFetch("/api/offers")
      if (!res.ok) throw new Error(`فشل تحميل العروض (${res.status})`)
      return unwrapApi<Offer[]>(res)
    },
    retry: 1,
  })

  const { data: templates = [], isLoading: tmplLoad, isError: tmplErr, error: tmplError, refetch: tmplRefetch } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const res = await apiFetch("/api/templates")
      if (!res.ok) throw new Error(`فشل تحميل القوالب (${res.status})`)
      return unwrapApi<ReplyTemplate[]>(res)
    },
    retry: 1,
  })

  const [showTmplForm, setShowTmplForm] = useState(false)
  const [tmplName, setTmplName] = useState("")
  const [tmplText, setTmplText] = useState("")
  const [tmplCategory, setTmplCategory] = useState("")
  /* v17-E-F8 (D6-1 #7): وضع تعديل القالب — نفس النموذج يتحول لوضع PUT
     (العقد بعد E-B1: PUT /api/templates/{id} يقبل JSON كما يرسل هذا النموذج). */
  const [editingTmplId, setEditingTmplId] = useState<number | null>(null)

  const createTmpl = useMutation({
    mutationFn: () => apiFetch("/api/templates", {
      method: "POST",
      body: JSON.stringify({ name: tmplName.trim(), text: tmplText.trim(), category: tmplCategory.trim() }),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["templates"] }); setShowTmplForm(false); setTmplName(""); setTmplText(""); setTmplCategory(""); brandedToast.success("تم إنشاء القالب") },
    onError: (e: Error) => brandedToast.error(e.message || "فشل الإنشاء"),
  })

  /* v17-E-F8 (D6 #7): تعديل قالب قائم — PUT بنفس جسم JSON الذي يرسله الإنشاء
     (E-B1 جعل PUT ثنائي JSON+Form — الواجهة ترسل JSON كما في الإنشاء). */
  const updateTmpl = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name: tmplName.trim(), text: tmplText.trim(), category: tmplCategory.trim() }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] })
      setEditingTmplId(null)
      setTmplName(""); setTmplText(""); setTmplCategory("")
      brandedToast.success("تم حفظ تعديلات القالب")
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل حفظ التعديلات"),
  })

  const deleteTmpl = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["templates"] }); setConfirmDeleteTmplId(null); brandedToast.success("تم حذف القالب") },
    onError: (e: Error) => brandedToast.error(e.message),
  })

  /* v17-E-F8 (D6-1): نموذج «عرض جديد» — مرآة حرفية لنموذج «قالب جديد».
   * العقد (routers/offers_routes.py:34-47): Form-encoded (title مطلوب؛
   * code/description اختيارية؛ discount_type percentage|fixed؛
   * discount_value رقم) — لذا الجسم URLSearchParams لا JSON
   * (apiFetch يترك المتصفح يضبط content-type للنموذج كما في autoreply). */
  const [showOfferForm, setShowOfferForm] = useState(false)
  const [offerTitle, setOfferTitle] = useState("")
  const [offerCode, setOfferCode] = useState("")
  const [offerDesc, setOfferDesc] = useState("")
  const [offerDiscountType, setOfferDiscountType] = useState("percentage")
  const [offerDiscountValue, setOfferDiscountValue] = useState("10")

  const createOffer = useMutation({
    mutationFn: () => apiFetch("/api/offers", {
      method: "POST",
      body: new URLSearchParams({
        title: offerTitle.trim(),
        code: offerCode.trim(),
        description: offerDesc.trim(),
        discount_type: offerDiscountType,
        discount_value: offerDiscountValue.trim() || "0",
      }),
    }).then((res) => unwrapApi<{ id: number }>(res)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["offers"] })
      setShowOfferForm(false)
      setOfferTitle(""); setOfferCode(""); setOfferDesc(""); setOfferDiscountType("percentage"); setOfferDiscountValue("10")
      brandedToast.success("تم إنشاء العرض")
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل إنشاء العرض"),
  })

  const toggleOffer = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/offers/${id}/toggle`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["offers"] }); brandedToast.success("تم التبديل") },
    onError: (e: Error) => brandedToast.error(e.message),
  })

  const deleteOffer = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/offers/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["offers"] }); setConfirmDeleteOfferId(null); brandedToast.success("تم حذف العرض") },
    onError: (e: Error) => brandedToast.error(e.message),
  })

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي. */}
      <PageHeader
        icon={<Wrench className="size-4" />}
        title="الأدوات"
        subtitle="قوالب الرد والعروض"
        compact
      />

      {/* D4-بند2 — قرار سقف العرض الموحد: max-w-5xl (1024px) + mx-auto. */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 max-w-5xl mx-auto w-full">
        {/* قوالب الرد */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm">قوالب الرد</h2>
            <Button size="sm" onClick={() => { setShowTmplForm(!showTmplForm); setEditingTmplId(null) }}><Plus className="size-3" /> قالب جديد</Button>
          </div>

          {(showTmplForm || editingTmplId !== null) && (
            <Card className="mb-3">
              <CardContent className="p-4 space-y-3">
                {/* v16-E3 (D1 C3): raw inputs bypass the shared Input seam —
                    dir="auto" isolates mixed Arabic/Latin template values. */}
                <input value={tmplName} onChange={e => setTmplName(e.target.value)} placeholder="اسم القالب" aria-label="اسم القالب" dir="auto" className="w-full h-11 text-base md:text-sm rounded-lg border border-input bg-background px-3 focus:outline-none focus:ring-2 focus:ring-accent-foreground/30" />
                <input value={tmplCategory} onChange={e => setTmplCategory(e.target.value)} placeholder="تصنيف (اختياري)" aria-label="تصنيف القالب (اختياري)" dir="auto" className="w-full h-11 text-base md:text-sm rounded-lg border border-input bg-background px-3 focus:outline-none focus:ring-2 focus:ring-accent-foreground/30" />
                <textarea value={tmplText} onChange={e => setTmplText(e.target.value)} placeholder="نص القالب…" aria-label="نص القالب" dir="auto" className="w-full min-h-[60px] rounded-lg border border-input bg-background p-3 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-accent-foreground/30 resize-none" />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setShowTmplForm(false); setEditingTmplId(null); setTmplName(""); setTmplText(""); setTmplCategory("") }}>إلغاء</Button>
                  {/* v17-E-F8 (D6 #10): زر الحفظ loading prop «جارٍ الحفظ…» —
                      الوضعان (إنشاء/تعديل) نفس الزر بصريًا، يفرقهما editingTmplId. */}
                  <Button
                    size="sm"
                    loading={createTmpl.isPending || updateTmpl.isPending}
                    disabled={!tmplName.trim() || !tmplText.trim() || createTmpl.isPending || updateTmpl.isPending}
                    onClick={() => { if (editingTmplId !== null) updateTmpl.mutate(editingTmplId); else createTmpl.mutate() }}
                  >
                    {(createTmpl.isPending || updateTmpl.isPending) ? "جارٍ الحفظ…" : editingTmplId !== null ? "حفظ التعديلات" : "حفظ"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {tmplLoad ? (
            <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-12" /></Card>)}</div>
          ) : tmplErr ? (
            <div className="text-center py-8">
              <AlertCircle className="size-8 mx-auto mb-2 text-destructive/50" />
              <p className="text-xs text-muted-foreground mb-3">{(tmplError as Error)?.message || "تعذر الاتصال"}</p>
              <Button size="sm" variant="outline" onClick={() => tmplRefetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
            </div>
          ) : templates.length === 0 ? (
            <Card><CardContent className="p-0">
              <EmptyState icon={FileText} size="sm" title="لا توجد قوالب بعد" description="أنشئ قالب رد جاهزاً لإعادة استخدامه في ردودك وتوفير الوقت." />
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <Card key={t.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold">{t.name}</span>
                        {t.category && <span className="text-3xs bg-muted px-1.5 py-0.5 rounded">{t.category}</span>}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{t.text}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {/* v17-E-F8 (D6 #7): تعديل القالب — يفتح نموذج PUT
                          معبّأ بقيم الصف (aria-label بالاسم للقارئ). */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-11 p-0"
                        onClick={() => {
                          setEditingTmplId(t.id)
                          setShowTmplForm(false)
                          setTmplName(t.name)
                          setTmplText(t.text)
                          setTmplCategory(t.category || "")
                        }}
                        aria-label={`تعديل القالب ${t.name}`}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      {/* v25 (W-04): الضغط الأول يكشف خطوة التأكيد — الضغط
                          الثاني فقط ينفّذ DELETE (أزرار 44px افتراضياً). */}
                      {confirmDeleteTmplId === t.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteTmpl.mutate(t.id)}
                            disabled={deleteTmpl.isPending && deleteTmpl.variables === t.id}
                            loading={deleteTmpl.isPending && deleteTmpl.variables === t.id}
                          >
                            <Trash2 className="size-3" aria-hidden="true" /> تأكيد الحذف
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteTmplId(null)}
                            aria-label="إلغاء حذف القالب"
                          >
                            إلغاء
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteTmplId(t.id)} className="size-11 p-0 hover:text-destructive" aria-label={`حذف القالب ${t.name}`}>
                          <Trash2 className="size-3" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* العروض */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm">العروض</h2>
            {/* v17-E-F8 (D6-1): وعد Premium «محرك العروض» كان بلا أي سبيل
                إنشاء — زر مرآة لزر «قالب جديد» في نفس الصفحة. */}
            <Button size="sm" onClick={() => setShowOfferForm(v => !v)}><Plus className="size-3" /> عرض جديد</Button>
          </div>

          {showOfferForm && (
            <Card
              className="mb-3"
              onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setShowOfferForm(false) } }}
            >
              <CardContent className="p-4 space-y-3">
                <input
                  value={offerTitle}
                  onChange={e => setOfferTitle(e.target.value)}
                  placeholder="عنوان العرض (مثال: خصم نهاية الموسم)"
                  aria-label="عنوان العرض"
                  dir="auto"
                  autoFocus
                  className="w-full h-11 text-base md:text-sm rounded-lg border border-input bg-background px-3 focus:outline-none focus:ring-2 focus:ring-accent-foreground/30"
                />
                <input
                  value={offerCode}
                  onChange={e => setOfferCode(e.target.value)}
                  placeholder="كود الخصم (اختياري)"
                  aria-label="كود الخصم (اختياري)"
                  dir="auto"
                  className="w-full h-11 text-base md:text-sm rounded-lg border border-input bg-background px-3 focus:outline-none focus:ring-2 focus:ring-accent-foreground/30"
                />
                <textarea
                  value={offerDesc}
                  onChange={e => setOfferDesc(e.target.value)}
                  placeholder="وصف العرض — سيستخدمه البوت عند تقديم العرض للعملاء…"
                  aria-label="وصف العرض"
                  dir="auto"
                  className="w-full min-h-[60px] rounded-lg border border-input bg-background p-3 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-accent-foreground/30 resize-none"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={offerDiscountType}
                    onChange={e => setOfferDiscountType(e.target.value)}
                    aria-label="نوع الخصم"
                    className="h-11 text-base md:text-sm rounded-lg border border-input bg-background px-3 focus:outline-none focus:ring-2 focus:ring-accent-foreground/30"
                  >
                    <option value="percentage">نسبة مئوية %</option>
                    <option value="fixed">مبلغ ثابت د.ل</option>
                  </select>
                  <input
                    value={offerDiscountValue}
                    onChange={e => setOfferDiscountValue(e.target.value)}
                    placeholder="قيمة الخصم"
                    aria-label="قيمة الخصم"
                    inputMode="numeric"
                    dir="ltr"
                    className="w-28 h-11 text-base md:text-sm rounded-lg border border-input bg-background px-3 focus:outline-none focus:ring-2 focus:ring-accent-foreground/30"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowOfferForm(false)}>إلغاء</Button>
                  <Button
                    size="sm"
                    loading={createOffer.isPending}
                    disabled={!offerTitle.trim() || createOffer.isPending}
                    onClick={() => createOffer.mutate()}
                  >
                    {createOffer.isPending ? "جارٍ الحفظ…" : "حفظ العرض"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {offLoad ? (
            <div className="space-y-2">{[1,2].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-12" /></Card>)}</div>
          ) : offErr ? (
            <div className="text-center py-8">
              <AlertCircle className="size-8 mx-auto mb-2 text-destructive/50" />
              <p className="text-xs text-muted-foreground mb-3">{(offError as Error)?.message || "تعذر الاتصال"}</p>
              <Button size="sm" variant="outline" onClick={() => offRefetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
            </div>
          ) : offers.length === 0 ? (
            <Card><CardContent className="p-0">
              <EmptyState
                icon={Tag}
                size="sm"
                title="لا توجد عروض"
                description="أضف عروض صفحتك الحالية ليستخدمها البوت في الردود على استفسارات العملاء."
                action={{ label: "عرض جديد", icon: Plus, onClick: () => setShowOfferForm(true) }}
              />
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {offers.map((o) => (
                <Card key={o.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {/* v4 §2.3 — offers_routes returns title/is_active */}
                      <p className="text-sm font-bold">{o.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{o.description}</p>
                    </div>
                    {/* v15-E6 (D5-M2) + v17-E-F8 (D6 #10): التبديل عبر مكون
                        Switch (button[role=switch] — aria-checked يكشف الحالة
                        برمجيًا، WCAG 4.1.2) بدل زر أيقونة خام ToggleRight/Left؛
                        الحذف يبقى زرًا أيقونيًا بحالة target معلنة. */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={!!o.is_active}
                        onCheckedChange={() => toggleOffer.mutate(o.id)}
                        disabled={toggleOffer.isPending && toggleOffer.variables === o.id}
                        aria-label={`تبديل حالة العرض ${o.title}`}
                      />
                      {/* v25 (W-04): حذف العرض بلمستين — نفس نمط القوالب أعلاه
                          (تأكيد الحذف/إلغاء 44px؛ الضغط الثاني فقط ينفّذ). */}
                      {confirmDeleteOfferId === o.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteOffer.mutate(o.id)}
                            disabled={deleteOffer.isPending && deleteOffer.variables === o.id}
                            loading={deleteOffer.isPending && deleteOffer.variables === o.id}
                          >
                            <Trash2 className="size-3" aria-hidden="true" /> تأكيد الحذف
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteOfferId(null)}
                            aria-label="إلغاء حذف العرض"
                          >
                            إلغاء
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteOfferId(o.id)} disabled={deleteOffer.isPending && deleteOffer.variables === o.id} aria-label={`حذف العرض ${o.title}`}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
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
