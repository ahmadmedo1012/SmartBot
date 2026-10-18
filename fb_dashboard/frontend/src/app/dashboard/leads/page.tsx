"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import { UserPlus, AlertCircle, RefreshCw, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
/* r132 (A8 F-SB-1): the retired «السابق/التالي» hand-rolled pager → the
 * canonical numbered TablePagination footer (fleet ruling "numbered pag" —
 * the audience/admin-support twin). */
import { TablePagination } from "@/components/shared/TablePagination"
import { unwrapApi } from "@/lib/api"
import type { CrmCustomer } from "@/lib/types"
import { formatDateOnly, formatNumber } from "@/lib/format"
import { normalizeLibyanPhone } from "@/lib/phone"

/* v26-F4 (P4-A4 §2 P2): مرشّح مرحلة العميل — الخادم يدعم ?stage= منذ v25
 * (routers/crm_routes.py:27) والصفحة لم تكن تمرّره قط؛ المراحل من
 * models.py:940 (stage = lead/prospect/trial/active/churned). */
const STAGE_FILTERS = [
  { key: "all", label: "الكل" },
  { key: "lead", label: "محتمل" },
  { key: "prospect", label: "مهتم" },
  { key: "trial", label: "تجريبي" },
  { key: "active", label: "نشط" },
  { key: "churned", label: "متوقف" },
] as const

const STAGE_BADGE: Record<string, { label: string; variant: "info" | "gold" | "success" | "warning" | "danger" | "outline" }> = {
  lead: { label: "محتمل", variant: "info" },
  prospect: { label: "مهتم", variant: "gold" },
  trial: { label: "تجريبي", variant: "warning" },
  active: { label: "نشط", variant: "success" },
  churned: { label: "متوقف", variant: "danger" },
}

/* P21-W6-B5 (gap #3b): المراحل القابلة للتحرير — نفس مجموعة العقد
 * (models.py:940 + مرشّح الصفحة أعلاه) لكن بترتيب مسار البيع. */
const STAGE_OPTIONS = ["lead", "prospect", "trial", "active", "churned"] as const

/** عقد الهاتف (r138): التطبيع من عائلة lib/phone الثلاثية. */
const PHONE_MAX_LEN = 16

export default function LeadsPage() {
  /* P21-W6-B5 (gap #3b): تحرير العميل — الحوار يفتح من زر القلم بصف
   * العميل (PUT /api/crm/customers/{id} — كان بلا مستهلك إطلاقاً). */
  const [editing, setEditing] = useState<CrmCustomer | null>(null)
  /* v25 (W-07): صفحة العملاء الحالية — /api/crm/customers (routers/
   * crm_routes.py:26) يقبل page ge=1 وper_page (افتراضي 25) ويُرجع
   * {items,total,page,per_page}؛ الصفحة كانت تعرض أول نافذة فقط بلا أي
   * سبيل للصفحات التالية. */
  const [page, setPage] = useState(1)
  const [stage, setStage] = useState<string>("all")
  /* أي تبديل مرحلة يعيد نافذة الصفحات للبداية (نمط admin/support v24-C3). */
  useEffect(() => {
    setPage(1)
  }, [stage])
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["crm-customers", page, stage],
    queryFn: async () => {
      const stageQ = stage === "all" ? "" : `&stage=${encodeURIComponent(stage)}`
      const res = await apiFetch(`/api/crm/customers?page=${page}${stageQ}`)
      if (!res.ok) throw new Error(`تعذّر تحميل العملاء (${res.status})`)
      // API returns a paginated envelope {total, page, per_page, items} —
      // this page maps the LIST. The old code mapped the envelope object
      // itself and crashed with "e.map is not a function" on first render.
      return unwrapApi<{ items: CrmCustomer[]; total: number; page: number; per_page: number }>(res)
    },
    /* v25 (W-07): تبديل الصفحة يُبقي الصفوف السابقة معروضة (بهتة
     * isFetching) بدل وميض الهيكل — نمط admin/support v24-C3. */
    placeholderData: (prev) => prev,
    retry: 1,
  })
  const customers = data?.items ?? []
  /* v25 (W-07): المؤشرات من الظرف — الصفحة الفعلية من data.page، وعدد
   * الصفحات من total/per_page (عقد admin/support نفسه مع «من Y» الإضافي
   * لأن هذا الظرف يفصح عن per_page). */
  const shownPage = data?.page ?? page
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.per_page ?? 25)))

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي (أيقونة القسم
          نفسها من AdminSidebar + subtitle الجملة الموجودة نصاً). */}
      <PageHeader
        icon={<UserPlus className="size-4" />}
        title="العملاء المتوقعون"
        subtitle="إدارة العملاء المحتملين"
        compact
        /* phase6 r154 — فاصل الأثر تحت الشريط (توقيع غرفة الآلة؛ الأثر
            الساكن — جدول العملاء ليس دفق أتمتة حيًا). */
        trace="static"
      />

      {/* v26-F4: مرشّح المرحلة — نفس نمط أزرار admin/support (aria-pressed +
          variant=gold للمفعّل)؛ يمرّر ?stage= للخادم فيُرشّح على كل الصفحات
          لا الصفحة الحالية فقط، مع عدّاد الصفوف من الظرف. */}
      {/* r131-F8 (task #12): 1024 → the canonical 1200 token. */}
      <div className="px-6 pt-2 max-w-(--marketing-max-w) mx-auto w-full">
        <div className="flex flex-wrap items-center gap-2">
          {STAGE_FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={stage === f.key ? "gold" : "outline"}
              size="sm"
              onClick={() => setStage(f.key)}
              aria-pressed={stage === f.key}
            >
              {f.label}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground" role="status">
            {formatNumber(data?.total ?? 0)} عميل
          </span>
        </div>
      </div>

      {/* D4-بند2 → r131-F8 (task #12): the content column rides the canonical
          1200 token (was max-w-5xl 1024). */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-(--marketing-max-w) mx-auto w-full">
        {isLoading ? (
          /* r131-F8 (A4 P1-2): pulse → .skeleton slabs. (plain JS comment —
             JSX-comment braces are invalid in a ternary expression slot;
             r131-F7b syntax repair) */
          <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4"><div className="skeleton h-14 rounded" /></CardContent></Card>)}</div>
        ) : isError ? (
          /* r131-F7b (A4 P2-8 completion): bare-AlertCircle → the .state family. */
          <div className="state state-danger py-16" role="alert">
            <div className="state-icon" aria-hidden="true">
              <AlertCircle />
            </div>
            <h2 className="state-title">تعذّر تحميل العملاء</h2>
            <p className="state-desc">{(error as Error)?.message || "تعذّر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : customers.length === 0 ? (
          <Card><CardContent className="p-0">
              {/* phase6 r154 — الروبوت يستضيف البئر الفارغ (خامل: الرقيب
                  ينتظر أول عميل محتمل؛ أيقونة UserPlus تتقاعد هنا). */}
              <EmptyState
                robot
                size="sm"
                title="لا يوجد عملاء متوقعون بعد"
                description="عند إضافة أول عميل محتمل ستظهر بياناته هنا مع سجل تواصلك معه."
              />
            </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {customers.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    {/* v14-E5 (D3-ج): name + notes are live CRM values —
                        dir="auto" isolates Latin/mixed names and free text. */}
                    <p className="text-sm font-bold" dir="auto">{c.name || "بدون اسم"}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* v26-F4: شارة المرحلة — المرشّح أعلاه بلا عرضها كان
                          يرشّح حقلًا لا يراه المستخدم. */}
                      {c.stage && STAGE_BADGE[c.stage] && (
                        <Badge variant={STAGE_BADGE[c.stage].variant}>{STAGE_BADGE[c.stage].label}</Badge>
                      )}
                      {/* P21-W6-B5 (gap #3b): زر التحرير — 44px (v25 W-09)،
                          نفس نمط تعديل القاعدة في الردود التلقائية. */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-11 p-0"
                        onClick={() => setEditing(c)}
                        aria-haspopup="dialog"
                        aria-label={`تحديث بيانات العميل ${c.name || "بدون اسم"}`}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {/* v4 §2.3 — backend crm_routes returns notes/first_seen_at/
                        last_contacted_at; email was never in the serializer.
                        phase6 r154 — هاتف العميل (قيمة آلة لاتينية) يركب
                        السجل المونو dir=ltr. */}
                    {c.phone && <p>الهاتف: <span className="font-mono" dir="ltr">{c.phone}</span></p>}
                    {c.notes && <p dir="auto">{c.notes}</p>}
                    {c.first_seen_at && (
                      <p className="text-xs">أول ظهور: {formatDateOnly(c.first_seen_at)}</p>
                    )}
                    {c.last_contacted_at && (
                      <p className="text-xs">آخر تواصل: {formatDateOnly(c.last_contacted_at)}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* r132 (A8 F-SB-1): the «السابق/التالي» link row → the canonical
             TablePagination footer (hairline-topped, count on the start side,
             windowed page-number buttons + ellipsis gaps, 44px touch below
             sm). The empty-guard joins audience/posts: the footer renders
             ONLY when there is something to page — the old row painted
             «صفحة 1 من 1» with both steps disabled on an empty list. The
             sr-only status line stays as the polite live region for the
             current window (admin/support:514 twin). */}
        {!isLoading && !isError && customers.length > 0 && (
          <>
            <p className="sr-only" role="status">
              صفحة {formatNumber(shownPage)} من {formatNumber(totalPages)}
            </p>
            <TablePagination
              page={shownPage}
              totalPages={totalPages}
              total={data?.total ?? 0}
              onPageChange={setPage}
              unitLabel="عميل"
            />
          </>
        )}

        {/* P21-W6-B5 (gap #3b): حوار تحرير العميل — المرحلة/الملاحظات/الهاتف
            عبر PUT الحقيقي. */}
        {editing && (
          <EditCustomerDialog customer={editing} onClosed={() => setEditing(null)} />
        )}
      </div>
    </div>
  )
}

/* ── P21-W6-B5 (gap #3b): حوار تحرير بيانات العميل ──────────────────────────
 * العقد الحقيقي (routers/crm_routes.py:100-123 — لا افتراضات):
 *   PUT /api/crm/customers/{id} عقد Form-encoded (name/phone/stage/notes/
 *   interested_in)؛ الخادم يطبّق القيم الصادقة فقط (السلاسل الفارغة
 *   تتجاهَل — لذا لا يُرسل حقل فارغ أصلاً ويُذكر القيد بصراحة في الحوار)،
 *   ويطلب صلاحية editor؛ 404 عربي إن غاب العميل.
 * المرحلة: مجموعة مغلقة (models.py:940). الهاتف: تطبيع r138 الثلاثي
 * (lib/phone) — نسخة صحيحة أو خطأ inline محايد للعقد. */
function EditCustomerDialog({ customer, onClosed }: { customer: CrmCustomer; onClosed: () => void }) {
  const queryClient = useQueryClient()
  const [stage, setStage] = useState<string>(
    (STAGE_OPTIONS as readonly string[]).includes(customer.stage ?? "") ? customer.stage! : "lead",
  )
  const [notes, setNotes] = useState(customer.notes ?? "")
  const [phone, setPhone] = useState(customer.phone ?? "")
  const [phoneError, setPhoneError] = useState("")

  /* التحقق من الهاتف عند المغادرة — عقد r138: النماذج القصيرة/الكاملة/
   * الدولية كلها تمر عبر التطبيع؛ الرفض برسالة محايدة للعقد (لا تصف
   * شكلاً بعينه — نفس نص التوأمين). */
  const validatePhone = (value: string) => {
    const v = value.trim()
    if (!v || normalizeLibyanPhone(v)) {
      setPhoneError("")
      return true
    }
    setPhoneError("رقم ليبي صحيح — مثال: 0912345678")
    return false
  }

  const saveMut = useMutation({
    mutationFn: () => {
      /* نرسل الحقول المعبّأة فقط — عقد الخادم يتجاهل الفارغة (القيد
       * مذكور في الحوار نفسه؛ لا إرسال سلاسل فارغة بلا أثر). */
      const params = new URLSearchParams({ stage })
      const notesV = notes.trim()
      const phoneV = phone.trim()
      if (notesV) params.set("notes", notesV)
      if (phoneV) params.set("phone", normalizeLibyanPhone(phoneV) || phoneV)
      return apiFetch(`/api/crm/customers/${customer.id}`, {
        method: "PUT",
        body: params,
      }).then(unwrapApi<{ ok: boolean }>)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-customers"] })
      brandedToast.success("تم حفظ بيانات العميل")
      onClosed()
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر حفظ بيانات العميل"),
  })

  /* لا حفظ بلا تغيير فعلي (تحقق إدخال صادق — ليس زراً ميتاً). */
  const changed =
    stage !== (customer.stage ?? "lead") ||
    notes.trim() !== (customer.notes ?? "") ||
    phone.trim() !== (customer.phone ?? "")
  const canSave = changed && !phoneError && !saveMut.isPending

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClosed() }}>
      <DialogContent>
        <DialogTitle>تحديث بيانات العميل</DialogTitle>
        <DialogDescription>
          {customer.name || "بدون اسم"} — حدّث المرحلة أو الملاحظات أو الهاتف ثم احفظ.
        </DialogDescription>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label htmlFor="edit-customer-stage" className="text-xs font-medium text-muted-foreground">المرحلة</label>
            <Select
              id="edit-customer-stage"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              aria-label="مرحلة العميل"
            >
              {STAGE_OPTIONS.map((s) => (
                <option key={s} value={s}>{STAGE_BADGE[s].label}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-customer-notes" className="text-xs font-medium text-muted-foreground">الملاحظات</label>
            <Textarea
              id="edit-customer-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات المتابعة (مثال: مهتم بعرض التوصيل)…"
              rows={3}
            />
            {/* قيد عقد الخادم المذكور بصراحة: PUT يتجاهل السلاسل الفارغة —
                تفريغ الحقل هنا لن يحذف الملاحظة المخزّنة. */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              الحقول الفارغة يتجاهلها الخادم — لتغيير الملاحظة اكتب نصاً بديلاً (التفريغ لا يحذف المخزّن).
            </p>
          </div>

          <Input
            id="edit-customer-phone"
            label="الهاتف (اختياري)"
            placeholder="0912345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => validatePhone(phone)}
            maxLength={PHONE_MAX_LEN}
            inputMode="tel"
            error={phoneError || undefined}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClosed}>إلغاء</Button>
          <Button
            size="sm"
            loading={saveMut.isPending}
            disabled={!canSave || saveMut.isPending}
            onClick={() => {
              if (!validatePhone(phone)) return
              saveMut.mutate()
            }}
          >
            {saveMut.isPending ? "جارٍ الحفظ…" : "حفظ البيانات"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
