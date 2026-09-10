"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import { CreditCard, AlertCircle, RefreshCw, Zap, Receipt, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { unwrapApi } from "@/lib/api"
import { useConfig } from "@/hooks/useConfig"
import type { PaymentBalance, PaymentRecord } from "@/lib/types"
import { formatDate, formatNumber } from "@/lib/format"

const STATUS_LABELS: Record<string, string> = {
  completed: "مكتمل", pending: "قيد الانتظار", failed: "فاشل",
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
      if (!res.ok) throw new Error(`فشل تحميل الرصيد (${res.status})`)
      return unwrapApi<PaymentBalance>(res)
    },
    retry: 1,
  })

  const { data: history = [], isLoading: histLoad, isError: histErr, error, refetch } = useQuery({
    queryKey: ["payment-history"],
    queryFn: async () => {
      const res = await apiFetch("/api/payments/history")
      if (!res.ok) throw new Error(`فشل تحميل سجل الدفع (${res.status})`)
      return unwrapApi<PaymentRecord[]>(res)
    },
    retry: 1,
  })

  /* v17-E-F8 (D6-2): الخطة الحالية + الخطط المتاحة للترقية.
   * /api/me يعيد user.subscriptionStatus (اسم الخطة صغيرًا) — نطابقه
   * مع GET /api/plans (name) لاستخراج معرف الخطة الحالية، والعروض
   * = الخطط ذات id أعلى (نفس شرط الخادم). */
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await apiFetch("/api/me")
      if (!res.ok) throw new Error(`فشل تحميل الحساب (${res.status})`)
      return unwrapApi<{ user: { subscriptionStatus?: string } }>(res)
    },
    retry: 1,
  })

  const { data: plans = [], isLoading: plansLoad } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const res = await apiFetch("/api/plans")
      if (!res.ok) throw new Error(`فشل تحميل الخطط (${res.status})`)
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

  const selectedPlan = upgradeablePlans.find(p => p.id === selectedPlanId) || null
  const requiresBank = !!selectedPlan && Number(selectedPlan.price) > walletCap

  /* غلاف المحافظ (نمط PaymentDialog): فوق السقف → تحويل تلقائي للبنكي
     وتعطيل تبويبات المحافظ (الخادم يرفضها بنفس الشرط). */
  const effectiveProvider: UpgradeProvider = requiresBank && provider !== "bank" ? "bank" : provider

  const upgradeMut = useMutation({
    mutationFn: async () => {
      if (!selectedPlan) throw new Error("اختر خطة أولًا")
      const isBank = provider === "bank"
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
            : { phone: phone.trim() }),
        }),
      })
      return unwrapApi<{ payment_id: number; status: string }>(res)
    },
    onSuccess: () => {
      brandedToast.success("تم إرسال طلب الترقية", "سيتم تفعيل الخطة الجديدة بعد موافقة الإدارة")
      setUpgradeOpen(false)
      setSelectedPlanId(null)
      setPhone(""); setBankAmount(""); setSenderAccountName(""); setSenderAccountNumber("")
      queryClient.invalidateQueries({ queryKey: ["payment-history"] })
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل إرسال طلب الترقية"),
  })

  const submitUpgrade = () => {
    if (!selectedPlan) {
      brandedToast.error("اختر خطة للترقية أولاً")
      return
    }
    if (provider !== "bank") {
      if (!/^09\d{8}$/.test(phone.trim().replace(/[\s-]/g, ""))) {
        brandedToast.error("رقم الهاتف يجب أن يبدأ بـ 09 ويتكون من 10 أرقام (مثال: 0912345678)")
        return
      }
    } else {
      if (!senderAccountName.trim()) {
        brandedToast.error("يرجى إدخال اسم صاحب الحساب")
        return
      }
      if (!senderAccountNumber.trim()) {
        brandedToast.error("يرجى إدخال رقم الحساب")
        return
      }
      const amt = parseFloat(bankAmount) || selectedPlan.price
      if (amt < selectedPlan.price * 0.5) {
        brandedToast.error("المبلغ المدخل أقل من الحد المقبول — نصف سعر الخطة على الأقل")
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
              v16-E3 (D1 C2): un-nested Link>Button — orange sm visuals moved to
              a span, the anchor is the single tab stop. */
          <Link href="/subscribe">
            <span className="relative inline-flex shrink-0 items-center justify-center rounded-lg border-0 font-sans text-xs font-bold whitespace-nowrap select-none isolate overflow-hidden bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm shadow-accent-foreground/15 hover:shadow-xl hover:shadow-accent-foreground/40 dark:shadow-accent-foreground/35 dark:hover:shadow-accent-foreground/50 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 ease-smooth h-10 min-h-11 min-w-11 gap-1.5 px-3.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>*]:relative before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(105deg,transparent_30%,oklch(1_0_0_/_0.22)_50%,transparent_70%)] before:-translate-x-full before:transition-transform before:duration-700 before:ease-out hover:before:translate-x-full before:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none after:bg-[radial-gradient(circle_at_50%_50%,oklch(1_0_0_/_0.16),transparent_45%)] after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-500">
              <Zap className="size-3.5" /> اشترك أو اشحن الرصيد
            </span>
          </Link>
        }
      />

      {/* D4-بند2 — قرار سقف العرض الموحد: max-w-5xl (1024px) + mx-auto. */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
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
                <p className="text-3xs text-muted-foreground">رقّ خطتك لزيادة حدود الردود والفريق والميزات المتقدمة</p>
              </div>
            </div>
            {plansLoad ? (
              <div className="h-9 w-28 bg-muted rounded-lg animate-pulse" aria-label="جارٍ تحميل الخطط" />
            ) : upgradeablePlans.length === 0 ? (
              <span className="text-xs text-success font-bold bg-success-soft px-3 py-1.5 rounded-full">
                أنت على أعلى خطة متاحة
              </span>
            ) : (
              <Button size="sm" className="shadow-sm shadow-accent-foreground/15" onClick={() => { setUpgradeOpen(true); setSelectedPlanId(null) }}>
                <Zap className="size-3.5" /> ترقية خطتك
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground mb-1">الرصيد الحالي</p>
            {balLoad ? (
              <div className="h-8 w-24 bg-muted rounded animate-pulse" />
            ) : balErr ? (
              /* v9-B11 — a balance load failure used to render "غير متاح"
                  as if the balance were genuinely absent */
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-destructive">فشل تحميل الرصيد</p>
                <Button size="sm" variant="outline" onClick={() => balRefetch()}>إعادة المحاولة</Button>
              </div>
            ) : balance ? (
              <p className="text-3xl font-bold">{formatNumber(balance.balance)} <span className="text-lg font-normal text-muted-foreground">{balance.currency}</span></p>
            ) : (
              <p className="text-sm text-muted-foreground">غير متاح</p>
            )}
          </CardContent>
        </Card>

        <div>
          <h2 className="font-bold text-sm mb-3 flex items-center gap-2">
            <Receipt className="size-4 text-muted-foreground" /> سجل الدفع
          </h2>
          {histLoad ? (
            <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-10" /></Card>)}</div>
          ) : anyError ? (
            <div className="text-center py-8">
              <AlertCircle className="size-8 mx-auto mb-2 text-destructive/50" />
              <p className="text-xs text-muted-foreground mb-3">{(error as Error)?.message || "تعذر الاتصال"}</p>
              {/* v9-B11 — retry BOTH queries: either one may be the failed one */}
              <Button size="sm" variant="outline" onClick={() => { balRefetch(); refetch() }}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
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
                      <p className="text-xs text-muted-foreground" dir="auto">{PROVIDER_LABELS[p.provider] || p.provider} · {p.phone}</p>
                      <p className="text-3xs text-muted-foreground">{formatDate(p.created_at)}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      p.status === "completed" ? "bg-success-soft text-success" :
                      p.status === "pending" ? "bg-warning/10 text-warning" :
                      p.status === "failed" ? "bg-destructive-soft text-destructive" :
                      "bg-muted text-muted-foreground"
                    }`}>{STATUS_LABELS[p.status] || p.status}</span>
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
        <DialogContent className="sm:max-w-md">
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
                  <input
                    id="upgrade-phone"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="0912345678"
                    inputMode="tel"
                    dir="ltr"
                    className="w-full h-11 text-base md:text-sm rounded-lg border border-input/60 bg-background px-3 focus:outline-none focus:border-accent-foreground/40 focus:ring-2 focus:ring-accent-foreground/15"
                  />
                  <p className="text-2xs text-muted-foreground">
                    حوّل {formatNumber(selectedPlan.price)} د.ل عبر {PROVIDER_LABELS[effectiveProvider]} — انتظر تأكيد الإدارة
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label htmlFor="upgrade-bank-amount" className="text-xs font-medium text-muted-foreground">المبلغ المحوّل (د.ل)</label>
                    <input
                      id="upgrade-bank-amount"
                      value={bankAmount}
                      onChange={e => setBankAmount(e.target.value)}
                      placeholder={String(selectedPlan.price)}
                      inputMode="decimal"
                      dir="ltr"
                      /* v24-C1: 44px target + 16px font — iOS no-zoom contract
                          (h-10 text-sm zoomed the viewport on focus). */
                      className="w-32 h-11 text-base md:text-sm rounded-lg border border-input/60 bg-background px-3 focus:outline-none focus:border-accent-foreground/40 focus:ring-2 focus:ring-accent-foreground/15"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="upgrade-sender-name" className="text-xs font-medium text-muted-foreground">اسم صاحب الحساب</label>
                    <input
                      id="upgrade-sender-name"
                      value={senderAccountName}
                      onChange={e => setSenderAccountName(e.target.value)}
                      dir="auto"
                      className="w-full h-11 text-base md:text-sm rounded-lg border border-input/60 bg-background px-3 focus:outline-none focus:border-accent-foreground/40 focus:ring-2 focus:ring-accent-foreground/15"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="upgrade-sender-number" className="text-xs font-medium text-muted-foreground">رقم الحساب</label>
                    <input
                      id="upgrade-sender-number"
                      value={senderAccountNumber}
                      onChange={e => setSenderAccountNumber(e.target.value)}
                      dir="ltr"
                      className="w-full h-11 text-base md:text-sm rounded-lg border border-input/60 bg-background px-3 focus:outline-none focus:border-accent-foreground/40 focus:ring-2 focus:ring-accent-foreground/15"
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
