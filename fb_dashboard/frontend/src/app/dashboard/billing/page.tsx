"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import { CreditCard, AlertCircle, RefreshCw, Zap, Receipt, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { unwrapApi } from "@/lib/api"
import { useConfig } from "@/hooks/useConfig"
import { useMe } from "@/hooks/useMe"
import { normalizeLibyanPhone } from "@/lib/phone"
import type { PaymentBalance, PaymentRecord } from "@/lib/types"
import { formatDate, formatNumber } from "@/lib/format"

/* r134 (فشل→تعذّر policy): «فاشل» خارج عائلة تعذّر — سجل العمليات يصوغ
 * بالمذكر المجرد مثل بقية الخريطة (مكتمل/مؤكد/ملغى). */
const STATUS_LABELS: Record<string, string> = {
  completed: "مكتمل", pending: "قيد الانتظار", failed: "تعذّر",
  confirmed: "مؤكد", cancelled: "ملغى", verified: "مُفعّل", rejected: "مرفوض",
}
const PROVIDER_LABELS: Record<string, string> = {
  liyana: "ليبيانا", madar: "مدار", bank: "تحويل بنكي",
}

/* v17-E-F8 (D6-2): عقد POST /api/subscriptions/upgrade
 * (routers/payments/plans.py:198) — جسم JSON: {plan_id, provider,
 * amount, phone, senderAccountName, senderAccountNumber} ويرد
 * ok({payment_id, status}). الخطة يجب أن تكون أعلى من الحالية
 * (خلافه 400 «هذه الباقة أقل أو تساوي باقتك الحالية»). نفس عائلة
 * الحقول التي يرسلها PaymentDialog لكن ال endpoint مختلف
 * (PaymentDialog يرسل /api/subscriptions الإنشاء — ثابت في ملفه
 * خارج ملكيتنا) لذا أُعيد استخدام نمط الدفع (تبويبات المزودين +
 * الهاتف/بيانات التحويل) في dialog محلي يرسل عقد الترقية. */
interface PlanRow {
  id: number
  name: string
  name_ar: string
  price: number
  period_days: number
}

type UpgradeProvider = "liyana" | "madar" | "bank"

export default function BillingPage() {
  const queryClient = useQueryClient()
  const { config } = useConfig()
  const { data: balance, isLoading: balLoad, isError: balErr, refetch: balRefetch } = useQuery({
    queryKey: ["balance"],
    queryFn: async () => {
      const res = await apiFetch("/api/payments/balance")
      if (!res.ok) throw new Error(`تعذّر تحميل الرصيد (${res.status})`)
      return unwrapApi<PaymentBalance>(res)
    },
    retry: 1,
  })

  const { data: history = [], isLoading: histLoad, isError: histErr, error, refetch } = useQuery({
    queryKey: ["payment-history"],
    queryFn: async () => {
      const res = await apiFetch("/api/payments/history")
      if (!res.ok) throw new Error(`تعذّر تحميل سجل الدفع (${res.status})`)
      return unwrapApi<PaymentRecord[]>(res)
    },
    retry: 1,
  })

  /* v17-E-F8 (D6-2): الخطة الحالية + الخطط المتاحة للترقية.
   * r133 (A5 N2 — v24-C3 doctrine): the inline /api/me rider retires onto
   * the shared useMe() hook (same ["me"] cache entry AuthGuard keeps
   * warm; the staleTime 5min contract + the single queryFn now apply). */
  const { data: me } = useMe()

  const { data: plans = [], isLoading: plansLoad } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const res = await apiFetch("/api/plans")
      if (!res.ok) throw new Error(`تعذّر تحميل الخطط (${res.status})`)
      return unwrapApi<PlanRow[]>(res)
    },
    retry: 1,
  })

  const subscriptionStatus = me?.user?.subscriptionStatus || ""
  const currentPlan = useMemo(
    () => plans.find(p => p.name.toLowerCase() === subscriptionStatus.toLowerCase()) || null,
    [plans, subscriptionStatus],
  )
  const upgradeablePlans = useMemo(
    /* price>0: الترقية إلى خطة مجانية ليست ترقية (والخادم يرفضها
       «هذه الباقة أقل أو تساوي باقتك الحالية») — استبعادها من العرض. */
    () => plans.filter(p => p.id > (currentPlan?.id ?? 0) && Number(p.price) > 0).sort((a, b) => a.id - b.id),
    [plans, currentPlan],
  )
  const currentPlanLabel = currentPlan?.name_ar
    || (subscriptionStatus.toLowerCase() === "free" || !subscriptionStatus ? "المجانية" : subscriptionStatus)

  /* غلاف المحافظ (نمط PaymentDialog): الخطة فوق السقف → بنكي فقط. */
  const capNumber = Number(config?.mobile_wallet_cap ?? 99)
  const walletCap = Number.isFinite(capNumber) && capNumber > 0 ? capNumber : 99

  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [provider, setProvider] = useState<UpgradeProvider>("liyana")
  const [phone, setPhone] = useState("")
  const [bankAmount, setBankAmount] = useState("")
  const [senderAccountName, setSenderAccountName] = useState("")
  const [senderAccountNumber, setSenderAccountNumber] = useState("")
  /* r133 (A5 S2): the money-path dialog validates like support/wizard —
   * per-field Arabic errors + aria-invalid (the Input error prop) +
   * focus-first-invalid on failed submit; errors clear as the user types
   * (the r132 OnboardingWizard clearFieldError recipe). */
  const [fieldErrors, setFieldErrors] = useState<{
    phone?: string
    bankAmount?: string
    senderName?: string
    senderNumber?: string
  }>({})

  const clearFieldError = (field: "phone" | "bankAmount" | "senderName" | "senderNumber") => {
    setFieldErrors((fe) => (fe[field] ? { ...fe, [field]: undefined } : fe))
  }

  /* r132 (A8 F-SB-3 twin): the first invalid field receives focus (rAF)
   * so keyboard/SR users land where the fix is. */
  const focusFirstInvalidField = (id: string) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(id) as HTMLElement | null
      el?.focus()
    })
  }

  const selectedPlan = upgradeablePlans.find(p => p.id === selectedPlanId) || null
  const requiresBank = !!selectedPlan && Number(selectedPlan.price) > walletCap

  /* غلاف المحافظ (نمط PaymentDialog): فوق السقف → تحويل تلقائي للبنكي
     وتعطيل تبويبات المحافظ (الخادم يرفضها بنفس الشرط). */
  const effectiveProvider: UpgradeProvider = requiresBank && provider !== "bank" ? "bank" : provider

  const upgradeMut = useMutation({
    mutationFn: async () => {
      if (!selectedPlan) throw new Error("اختر خطة أولًا")
      const isBank = provider === "bank"
      /* r133 (A12 S10): +218 / 00218 / Eastern-digit input is normalized
       * to the canonical 09XXXXXXXX mask before it leaves the client. */
      const normalizedPhone = normalizeLibyanPhone(phone)
      const amount = isBank
        ? (parseFloat(bankAmount) || selectedPlan.price)
        : selectedPlan.price
      const res = await apiFetch("/api/subscriptions/upgrade", {
        method: "POST",
        body: JSON.stringify({
          plan_id: selectedPlan.id,
          provider,
          amount,
          ...(isBank
            ? {
                senderAccountName: senderAccountName.trim(),
                senderAccountNumber: senderAccountNumber.trim(),
              }
            : { phone: normalizedPhone ?? phone.trim() }),
        }),
      })
      return unwrapApi<{ payment_id: number; status: string }>(res)
    },
    onSuccess: () => {
      brandedToast.success("تم إرسال طلب الترقية", "سيتم تفعيل الخطة الجديدة بعد موافقة الإدارة")
      setUpgradeOpen(false)
      setSelectedPlanId(null)
      setPhone(""); setBankAmount(""); setSenderAccountName(""); setSenderAccountNumber("")
      setFieldErrors({})
      queryClient.invalidateQueries({ queryKey: ["payment-history"] })
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر إرسال طلب الترقية"),
  })

  /* r133 (A5 S2): inline per-field verdicts (support:338-348 recipe) —
   * the toast-only grammar forced a read-locate-fix-resubmit loop on the
   * money path. Focus lands on the FIRST invalid field (rAF). */
  const submitUpgrade = () => {
    if (!selectedPlan) {
      brandedToast.error("اختر خطة للترقية أولاً")
      return
    }
    if (provider !== "bank") {
      if (!normalizeLibyanPhone(phone)) {
        setFieldErrors((fe) => ({ ...fe, phone: "رقم الهاتف يجب أن يبدأ بـ 09 ويتكون من 10 أرقام (مثال: 0912345678)" }))
        focusFirstInvalidField("upgrade-phone")
        return
      }
    } else {
      if (!senderAccountName.trim()) {
        setFieldErrors((fe) => ({ ...fe, senderName: "يرجى إدخال اسم صاحب الحساب" }))
        focusFirstInvalidField("upgrade-sender-name")
        return
      }
      if (!senderAccountNumber.trim()) {
        setFieldErrors((fe) => ({ ...fe, senderNumber: "يرجى إدخال رقم الحساب" }))
        focusFirstInvalidField("upgrade-sender-number")
        return
      }
      const amt = parseFloat(bankAmount) || selectedPlan.price
      if (amt < selectedPlan.price * 0.5) {
        setFieldErrors((fe) => ({ ...fe, bankAmount: "المبلغ المدخل أقل من الحد المقبول — نصف سعر الخطة على الأقل" }))
        focusFirstInvalidField("upgrade-bank-amount")
        return
      }
    }
    upgradeMut.mutate()
  }

  const anyError = balErr || histErr

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي؛ رابط الاشتراك
          انتقل إلى actions (وضعه ms-auto أسقطه حاوية actions). */}
      <PageHeader
        icon={<CreditCard className="size-4" />}
        title="الفواتير"
        subtitle="الرصيد وسجل الدفع"
        compact
        actions={
          /* Recharge CTA (plan v3 §7c — support FAQ pointed here with no button before)
              r131-F8 (A4 P2-4): the glowy hand-rolled span-button → a real
              Button inside the Link (single tab stop, neutral premium shadow). */
          <Link href="/subscribe" className="inline-flex">
            <Button size="sm">
              <Zap className="size-3.5" /> اشترك أو اشحن الرصيد
            </Button>
          </Link>
        }
      />

      {/* D4-بند2 → r131-F8 (task #12): the content column rides the canonical
          1200 token (was max-w-5xl 1024). */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-(--marketing-max-w) mx-auto w-full">
        {/* v17-E-F8 (D6-2): بطاقة الخطة + زر الترقية — مسار المال الجاهز
            (POST /api/subscriptions/upgrade) كان بلا أي مدخل واجهة؛ الترقية
            كانت تمر بالدعم يدويًا (D6 §7 بند 2). */}
        <Card>
          <CardContent className="p-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-accent-foreground/10 flex items-center justify-center">
                <TrendingUp className="size-4 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm font-bold">خطتك الحالية: {currentPlanLabel}</p>
                <p className="text-xs text-muted-foreground">رقّ خطتك لزيادة حدود الردود والفريق والميزات المتقدمة</p>
              </div>
            </div>
            {plansLoad ? (
              /* r133 (A5 N1): dead aria-label on a generic div (ignored by
                 AT per the v8-B13 ruling) — the slab joins the other
                 aria-hidden skeleton slabs. */
              <div className="skeleton h-9 w-28 rounded-lg" aria-hidden="true" />
            ) : upgradeablePlans.length === 0 ? (
              /* r131-F8 (A4 P2-3): hand-rolled chip → Badge. */
              <Badge variant="success" className="px-3 py-1.5">أنت على أعلى خطة متاحة</Badge>
            ) : (
              <Button size="sm" onClick={() => { setUpgradeOpen(true); setSelectedPlanId(null) }}>
                <Zap className="size-3.5" /> ترقية خطتك
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground mb-1">الرصيد الحالي</p>
            {balLoad ? (
              <div className="skeleton h-8 w-24 rounded" aria-hidden="true" />
            ) : balErr ? (
              /* v9-B11 — a balance load failure used to render "غير متاح"
                  as if the balance were genuinely absent.
                  r131-F8 (A7 Cluster B): status-as-text rides the -ink tier. */
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-destructive-ink">تعذّر تحميل الرصيد</p>
                <Button size="sm" variant="outline" onClick={() => balRefetch()}>إعادة المحاولة</Button>
              </div>
            ) : balance ? (
              /* r133 (A12 S9): KPI-grade money digits ride tnum (r131
                 KPI-tnum ruling — no jitter on live updates). */
              <p className="text-3xl font-bold tabular-nums">{formatNumber(balance.balance)} <span className="text-lg font-normal text-muted-foreground">{balance.currency}</span></p>
            ) : (
              <p className="text-sm text-muted-foreground">غير متاح</p>
            )}
          </CardContent>
        </Card>

        <div>
          <h2 className="sb-section-title mb-3 flex items-center gap-2">
            <Receipt className="size-4 text-muted-foreground" /> سجل الدفع
          </h2>
          {histLoad ? (
            /* r131-F8 (A4 P1-2): pulse → .skeleton slabs. */
            <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4"><div className="skeleton h-10 rounded" /></CardContent></Card>)}</div>
          ) : anyError ? (
            /* r131-F8 (A4 P2-8): the bare-AlertCircle error row → the canonical
                .state family. */
            <div className="state state-danger py-8" role="alert">
              <div className="state-icon" aria-hidden="true">
                <AlertCircle />
              </div>
              <p className="state-desc">{(error as Error)?.message || "تعذّر الاتصال"}</p>
              {/* v9-B11 — retry BOTH queries: either one may be the failed one */}
              <Button size="sm" variant="outline" onClick={() => { balRefetch(); refetch() }}><RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة</Button>
            </div>
          ) : history.length === 0 ? (
            <Card><CardContent className="p-0">
              <EmptyState icon={Receipt} size="sm" title="لا توجد معاملات سابقة" description="ستظهر عمليات الشحن والدفع هنا — يمكنك الاشتراك أو شحن رصيدك من زر الرصيد أعلى الصفحة." />
            </CardContent></Card>
          ) : (
            <div className="space-y-2" role="list">
              {history.map((p) => (
                <Card key={p.payment_id} role="listitem">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{formatNumber(p.amount)} د.ل</p>
                      {/* r127-F5a: provider/status are optional on PaymentRow —
                          `?? ""` indexes safely and falls through to the same
                          `|| p.provider` / `|| p.status` fallbacks. */}
                      <p className="text-xs text-muted-foreground" dir="auto">{PROVIDER_LABELS[p.provider ?? ""] || p.provider} · {p.phone}</p>
                      {/* r133 (A5 S3 — 12px floor): money-history timestamps
                          ride text-xs (content-bearing, was text-3xs). */}
                      <p className="text-xs text-muted-foreground">{formatDate(p.created_at)}</p>
                    </div>
                    {/* r131-F8 (A4 P2-3): hand-rolled status chips → Badge
                        (solid pastel after the F7 re-base; -ink text tier). */}
                    <Badge variant={
                      p.status === "completed" ? "success" :
                      p.status === "pending" ? "warning" :
                      p.status === "failed" ? "danger" :
                      "secondary"
                    }>{STATUS_LABELS[p.status ?? ""] || p.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* v17-E-F8 (D6-2): نافذة الترقية — إعادة استخدام نمط الدفع (PaymentDialog):
          اختيار خطة أعلى ← تبويبات المزود (محافظ/بنكي) ← إرسال عقد
          /api/subscriptions/upgrade. الحركات والبنية من dialog.tsx المشترك. */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        {/* r131-F8 (A4 P2-7): the sm:max-w-md override drops — the dialog rides
            F7's canonical 560px default (title/description unchanged). */}
        <DialogContent>
          <DialogTitle>ترقية خطتك</DialogTitle>
          <DialogDescription>
            اختر خطة أعلى من خطتك الحالية ({currentPlanLabel}) وطريقة الدفع — سيتم التفعيل بعد موافقة الإدارة
          </DialogDescription>

          <div className="space-y-2" role="radiogroup" aria-label="اختيار الخطة">
            {upgradeablePlans.map(p => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selectedPlanId === p.id}
                onClick={() => setSelectedPlanId(p.id)}
                className={`w-full flex items-center justify-between gap-3 rounded-lg border p-3 text-start transition-colors ${
                  selectedPlanId === p.id
                    ? "border-accent-foreground bg-accent-foreground/10"
                    : "border-border/60 hover:border-accent-foreground/30"
                }`}
              >
                <span className="text-sm font-bold">{p.name_ar}</span>
                <span className="text-xs text-muted-foreground" dir="auto">
                  {formatNumber(p.price)} د.ل / {formatNumber(p.period_days)} يوم
                </span>
              </button>
            ))}
          </div>

          {selectedPlan && (
            <div className="space-y-3 pt-1">
              {/* تبويبات المزود — نفس شكل PaymentDialog (تبويب محفظة/بنك) */}
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="طريقة الدفع">
                {(["liyana", "madar", "bank"] as const).map(pr => (
                  <button
                    key={pr}
                    type="button"
                    role="radio"
                    aria-checked={effectiveProvider === pr}
                    disabled={requiresBank && pr !== "bank"}
                    onClick={() => setProvider(pr)}
                    /* v24-C1: h-11 (44px) touch target — h-8 tabs (32px)
                        bypassed the Button min-h-11 guarantee (A1 S3). */
                    className={`h-11 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      effectiveProvider === pr
                        ? "border-accent-foreground bg-accent-foreground/10 text-accent-foreground"
                        : "border-border/60 text-muted-foreground hover:border-accent-foreground/30"
                    }`}
                  >
                    {PROVIDER_LABELS[pr]}
                  </button>
                ))}
              </div>

              {effectiveProvider !== "bank" ? (
                <div className="space-y-1">
                  <label htmlFor="upgrade-phone" className="text-xs font-medium text-muted-foreground">رقم هاتف المحفظة</label>
                  {/* r131-F8 (A4 P1-1b): raw input → the shared Input primitive
                      (16px floor / r-md / halo; the explicit dir="ltr" wins
                      over the built-in dir=auto for phone runs).
                      r133 (A5 S2): aria-invalid + inline error ride the Input
                      error prop; the error clears as the user types. */}
                  <Input
                    id="upgrade-phone"
                    value={phone}
                    onChange={e => { setPhone(e.target.value); clearFieldError("phone") }}
                    error={fieldErrors.phone}
                    placeholder="0912345678"
                    inputMode="tel"
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">
                    حوّل {formatNumber(selectedPlan.price)} د.ل عبر {PROVIDER_LABELS[effectiveProvider]} — انتظر تأكيد الإدارة
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label htmlFor="upgrade-bank-amount" className="text-xs font-medium text-muted-foreground">المبلغ المحوّل (د.ل)</label>
                    <div className="w-32">
                      <Input
                        id="upgrade-bank-amount"
                        value={bankAmount}
                        onChange={e => { setBankAmount(e.target.value); clearFieldError("bankAmount") }}
                        error={fieldErrors.bankAmount}
                        placeholder={String(selectedPlan.price)}
                        inputMode="decimal"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="upgrade-sender-name" className="text-xs font-medium text-muted-foreground">اسم صاحب الحساب</label>
                    <Input
                      id="upgrade-sender-name"
                      value={senderAccountName}
                      onChange={e => { setSenderAccountName(e.target.value); clearFieldError("senderName") }}
                      error={fieldErrors.senderName}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="upgrade-sender-number" className="text-xs font-medium text-muted-foreground">رقم الحساب</label>
                    <Input
                      id="upgrade-sender-number"
                      value={senderAccountNumber}
                      onChange={e => { setSenderAccountNumber(e.target.value); clearFieldError("senderNumber") }}
                      error={fieldErrors.senderNumber}
                      dir="ltr"
                    />
                  </div>
                </div>
              )}

              <Button className="w-full" loading={upgradeMut.isPending} disabled={!selectedPlanId || upgradeMut.isPending} onClick={submitUpgrade}>
                {upgradeMut.isPending ? "جارٍ الإرسال…" : `إرسال طلب الترقية — ${selectedPlan.name_ar}`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
