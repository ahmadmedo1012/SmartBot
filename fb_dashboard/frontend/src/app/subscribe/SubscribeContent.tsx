"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Sparkles,
  Crown,
  Star,
  Check,
  Loader2,
  Smartphone,
  Landmark,
  Copy,
  Phone,
  CreditCard,
  ArrowLeft,
  Upload,
  XCircle,
  CheckCircle2,
} from "lucide-react"

import { SectionContainer } from "@/components/ui/SectionContainer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { springGentle, springSnappy } from "@/lib/motion"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"

type Provider = "liyana" | "madar" | "bank"

interface Plan {
  id: number
  name: string
  name_ar?: string
  price: number
  max_replies: number
  max_pages: number
  max_rules: number
  max_team?: number
  features: string[]
}

interface PaymentConfig {
  balance_transfer_phone_1?: string // madar
  balance_transfer_phone_2?: string // libyana
  bank_transfer_bank_name?: string
  bank_transfer_account_number?: string
  bank_transfer_iban?: string
}

type Step = "select" | "form" | "waiting" | "success" | "rejected"

const MOBILE_WALLET_CAP = 99 // LYD — matches Smart-Menu

export default function SubscribePage() {
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [step, setStep] = useState<Step>("select")
  const [provider, setProvider] = useState<Provider>("liyana")
  const [config, setConfig] = useState<PaymentConfig>({})
  const [form, setForm] = useState({ name: "", phone: "", email: "" })
  const [bankAmount, setBankAmount] = useState<number>(0)
  const [senderName, setSenderName] = useState("")
  const [senderAccount, setSenderAccount] = useState("")
  const [receiptUrl, setReceiptUrl] = useState("")
  const [uploading, setUploading] = useState(false)
  const [paymentId, setPaymentId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resolutionMsg, setResolutionMsg] = useState("")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sseRef = useRef<EventSource | null>(null)
  const sentRef = useRef(false)

  // Load plans + payment config on mount
  useEffect(() => {
    apiFetch("/api/plans")
      .then(unwrapApi)
      .then((d) => {
        const list: Plan[] = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []
        setPlans(list)
      })
      .catch(() => toast.error("فشل تحميل الخطط"))
  }, [])

  // Public config — non-secret payment details from SystemConfig
  useEffect(() => {
    apiFetch("/api/config")
      .then(unwrapApi)
      .then((d) => setConfig(d || {}))
      .catch(() => {/* non-blocking — use hardcoded fallbacks */})
  }, [])

  // When the plan changes, default bank amount to its price
  useEffect(() => {
    if (selectedPlan) setBankAmount(Number(selectedPlan.price))
  }, [selectedPlan])

  // Wallet cap auto-switch: any plan > 99 LYD must use bank transfer
  useEffect(() => {
    if (!selectedPlan) return
    if (Number(selectedPlan.price) > MOBILE_WALLET_CAP && provider !== "bank") {
      setProvider("bank")
    }
  }, [selectedPlan, provider])

  // Cleanup polling + SSE on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      if (sseRef.current) {
        sseRef.current.close()
        sseRef.current = null
      }
    }
  }, [])

  const handleSelectPlan = useCallback((plan: Plan) => {
    setSelectedPlan(plan)
    setStep("form")
  }, [])

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("تم النسخ")
    } catch {
      toast.error("فشل النسخ")
    }
  }, [])

  const handleReceiptUpload = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await apiFetch("/api/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || "فشل رفع الصورة")
        return
      }
      const url = data?.data?.url
      if (url) {
        setReceiptUrl(url)
        toast.success("تم رفع الصورة")
      } else {
        toast.error("فشل رفع الصورة")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل رفع الصورة")
    } finally {
      setUploading(false)
    }
  }, [])

  const handleSubmit = useCallback(async () => {
    if (sentRef.current) return
    if (!selectedPlan) return

    // Validation
    if (provider !== "bank" && !form.phone.trim()) {
      toast.error("يرجى إدخال رقم هاتفك")
      return
    }
    if (provider === "bank") {
      if (!senderName.trim()) {
        toast.error("يرجى إدخال اسم صاحب الحساب")
        return
      }
      if (!senderAccount.trim()) {
        toast.error("يرجى إدخال رقم الحساب")
        return
      }
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("البريد الإلكتروني غير صالح")
      return
    }

    sentRef.current = true
    setSubmitting(true)
    try {
      const isBank = provider === "bank"
      const body: Record<string, unknown> = {
        plan_id: selectedPlan.id,
        provider,
        amount: isBank ? bankAmount : Number(selectedPlan.price),
        phone: isBank ? "" : form.phone.trim(),
        name: form.name.trim() || undefined,
        email: form.email.trim() || undefined,
      }
      if (isBank) {
        body.senderAccountName = senderName.trim()
        body.senderAccountNumber = senderAccount.trim()
        if (receiptUrl) body.receiptImageUrl = receiptUrl
      }
      const res = await apiFetch("/api/subscriptions", {
        method: "POST",
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || "فشل إنشاء الاشتراك")
        sentRef.current = false
        return
      }
      const pid = data?.data?.payment_id
      if (!pid) {
        toast.error("استجابة غير متوقعة من الخادم")
        sentRef.current = false
        return
      }
      setPaymentId(pid)
      setStep("waiting")
      startPolling(pid)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الاتصال بالخادم")
      sentRef.current = false
    } finally {
      setSubmitting(false)
    }
  }, [provider, selectedPlan, form, bankAmount, senderName, senderAccount, receiptUrl])

  const startPolling = useCallback((pid: number) => {
    if (pollRef.current) clearInterval(pollRef.current)
    let pollFailures = 0
    let warned = false
    let settled = false
    const onVerified = () => {
      if (settled) return
      settled = true
      cleanup()
      setResolutionMsg("تم تفعيل اشتراكك بنجاح!")
      setStep("success")
      toast.success("تم تفعيل اشتراكك بنجاح")
    }
    const onRejected = (message?: string) => {
      if (settled) return
      settled = true
      cleanup()
      setResolutionMsg(message || "عذراً، تم رفض طلب التفعيل. يمكنك المحاولة مجدداً.")
      setStep("rejected")
      toast.error("تم رفض طلب الدفع")
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      } else if (document.visibilityState === "visible" && !pollRef.current) {
        // Restart poll on visible
        pollRef.current = setInterval(poll, 5000)
      }
    }
    const poll = async () => {
      try {
        const r = await apiFetch(`/api/subscriptions/status?payment_id=${pid}`)
        const d = await r.json()
        pollFailures = 0
        const status = d?.data?.status
        if (status === "verified") {
          onVerified()
        } else if (status === "cancelled" || status === "rejected") {
          onRejected(d?.data?.message)
        }
      } catch {
        pollFailures++
        if (pollFailures >= 3 && !warned) {
          warned = true
          toast.error("تعذر الاتصال بالخادم — تحقق من الإنترنت")
        }
      }
    }
    const cleanup = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      if (sseRef.current) {
        sseRef.current.close()
        sseRef.current = null
      }
      document.removeEventListener("visibilitychange", onVisibility)
    }

    // ── Track B.5: SSE is PRIMARY — pushes the admin approval the moment it
    // happens (≤2s). Polling below is the automatic fallback (SSE unsupported,
    // proxy buffering, or hidden-tab reconnect).
    try {
      const es = new EventSource(`/api/subscriptions/status-stream?payment_id=${pid}`)
      sseRef.current = es
      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data)
          if (payload.status === "verified") onVerified()
          else if (payload.status === "cancelled" || payload.status === "rejected") onRejected(payload.message)
        } catch { /* malformed frame — polling still covers us */ }
      }
      es.addEventListener("close", () => { es.close(); if (sseRef.current === es) sseRef.current = null })
      es.onerror = () => {
        // SSE failed (proxy/unsupported) — close it; interval polling takes over
        es.close()
        if (sseRef.current === es) sseRef.current = null
      }
    } catch { /* EventSource unavailable — polling takes over */ }

    pollRef.current = setInterval(poll, 5000)
    document.addEventListener("visibilitychange", onVisibility)
  }, [])

  const handleRetry = useCallback(() => {
    sentRef.current = false
    setPaymentId(null)
    setSenderName("")
    setSenderAccount("")
    setReceiptUrl("")
    setStep("form")
  }, [])

  const handleBackToPlans = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (sseRef.current) {
      sseRef.current.close()
      sseRef.current = null
    }
    sentRef.current = false
    setStep("select")
    setSelectedPlan(null)
    setPaymentId(null)
  }, [])

  if (plans.length === 0) {
    return (
      <SectionContainer className="min-h-screen py-12 flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </SectionContainer>
    )
  }

  return (
    <SectionContainer className="min-h-screen py-12">
      <Button variant="ghost" size="sm" className="mb-6" onClick={() => router.push("/dashboard")}>
        <ArrowLeft className="size-4" /> العودة للوحة التحكم
      </Button>

      <AnimatePresence mode="wait">
        {step === "select" && (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={springGentle}
          >
            <div className="text-center mb-10">
              <h1 className="text-4xl font-bold tracking-tight mb-3">اختر خطتك</h1>
              <p className="text-muted-foreground text-lg">
                باقات مرنة تناسب جميع الأحجام — من المتاجر الصغيرة إلى المؤسسات الكبيرة
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
              {plans.map((plan, i) => {
                const isPopular = i === 1
                const Icon = i === 0 ? Sparkles : i === 1 ? Crown : Star
                const isFree = Number(plan.price) === 0
                return (
                  <Card
                    key={plan.id}
                    className={cn(
                      "card-hover relative flex flex-col cursor-pointer border-border/50",
                      isPopular && "border-orange/50 shadow-md shadow-orange/10 ring-1 ring-orange/20"
                    )}
                    onClick={() => handleSelectPlan(plan)}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                        <Badge className="text-xs bg-gradient-to-l from-orange to-orange/80 text-white shadow-md shadow-orange/30 px-3 py-1">
                          <Sparkles className="size-3 ms-1" /> الأكثر شعبية
                        </Badge>
                      </div>
                    )}
                    <CardHeader className="text-center pt-6">
                      <div className={cn(
                        "mx-auto size-11 rounded-xl flex items-center justify-center mb-3 transition-transform duration-200",
                        isPopular ? "bg-gradient-to-br from-orange to-orange/70 text-white shadow-md shadow-orange/30" : "bg-orange/10"
                      )}>
                        <Icon className={cn("size-5", isPopular ? "text-white" : "text-orange")} />
                      </div>
                      <CardTitle className="text-lg">{plan.name_ar || plan.name}</CardTitle>
                      <CardDescription className="mt-2 flex items-baseline justify-center gap-1">
                        <span className="text-4xl font-extrabold text-orange tabular-nums">
                          {Number(plan.price).toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground">د.ل/شهر</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col">
                      <div className="grid grid-cols-3 gap-2 mb-5 p-3 bg-muted/40 rounded-lg text-center text-sm border border-border/30">
                        <div>
                          <span className="font-bold text-orange block tabular-nums">
                            {plan.max_replies >= 999999 ? "∞" : plan.max_replies.toLocaleString()}
                          </span>
                          <p className="text-[10px] text-muted-foreground mt-0.5">ردود</p>
                        </div>
                        <div className="border-x border-border/40">
                          <span className="font-bold text-orange block tabular-nums">
                            {plan.max_pages >= 999 ? "∞" : plan.max_pages}
                          </span>
                          <p className="text-[10px] text-muted-foreground mt-0.5">صفحات</p>
                        </div>
                        <div>
                          <span className="font-bold text-orange block tabular-nums">
                            {plan.max_rules || "—"}
                          </span>
                          <p className="text-[10px] text-muted-foreground mt-0.5">قواعد</p>
                        </div>
                      </div>
                      <ul className="space-y-2 mb-6 flex-1">
                        {(plan.features || []).slice(0, 6).map((f, j) => (
                          <li
                            key={j}
                            className="flex items-start gap-2 text-sm text-muted-foreground"
                          >
                            <span className="mt-0.5 size-4 rounded-full bg-orange/15 flex items-center justify-center shrink-0">
                              <Check className="size-3 text-orange" />
                            </span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        className="w-full"
                        variant={isPopular ? "orange" : "outline"}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectPlan(plan)
                        }}
                      >
                        {isFree ? "ابدأ مجاناً" : "اشترك الآن"}
                        <ArrowLeft className="size-4 rtl:-scale-x-100" />
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </motion.div>
        )}

        {(step === "form" || step === "waiting" || step === "success" || step === "rejected") &&
          selectedPlan && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={springGentle}
              className="max-w-2xl mx-auto"
            >
              <div className="flex items-center gap-3 mb-6">
                <Button variant="ghost" size="sm" onClick={handleBackToPlans}>
                  <ArrowLeft className="size-4" />
                </Button>
                <div>
                  <h2 className="text-xl font-bold">{selectedPlan.name_ar || selectedPlan.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {Number(selectedPlan.price).toLocaleString()} د.ل / شهر
                  </p>
                </div>
              </div>

              {step === "form" && (
                <Card>
                  <CardHeader>
                    <CardTitle>إتمام الاشتراك</CardTitle>
                    <CardDescription>
                      اختر طريقة الدفع وأدخل بياناتك — التفعيل خلال دقائق بعد موافقة الإدارة
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Plan summary */}
                    <div className="rounded-xl bg-orange-500/5 border border-orange-500/15 p-4">
                      <div className="flex justify-between items-center">
                        <span className="font-bold">{selectedPlan.name_ar || selectedPlan.name}</span>
                        <span className="text-lg font-bold text-orange-500">
                          {Number(selectedPlan.price).toLocaleString()} د.ل
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">اشتراك شهري</p>
                    </div>

                    {/* Payment method tabs */}
                    <div>
                      <label className="text-sm font-semibold mb-1.5 block">طريقة الدفع</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            {
                              id: "liyana" as Provider,
                              label: "ليبيانا",
                              icon: Smartphone,
                              disabled: Number(selectedPlan.price) > MOBILE_WALLET_CAP,
                            },
                            {
                              id: "madar" as Provider,
                              label: "مدار",
                              icon: Smartphone,
                              disabled: Number(selectedPlan.price) > MOBILE_WALLET_CAP,
                            },
                            {
                              id: "bank" as Provider,
                              label: "تحويل بنكي",
                              icon: Landmark,
                              disabled: false,
                            },
                          ] as const
                        ).map((opt) => {
                          const Icon = opt.icon
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => !opt.disabled && setProvider(opt.id)}
                              disabled={opt.disabled}
                              className={cn(
                                "h-14 rounded-xl border-2 text-[13px] font-medium flex flex-col items-center justify-center gap-1 transition-all",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50",
                                opt.disabled && "opacity-40 cursor-not-allowed",
                                provider === opt.id
                                  ? "border-orange-500 bg-orange-500/10 shadow-sm"
                                  : "border-border/50 hover:border-orange-500/30 text-muted-foreground"
                              )}
                            >
                              <Icon className="size-4" />
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                      {Number(selectedPlan.price) > MOBILE_WALLET_CAP && (
                        <p className="text-xs text-orange-500 mt-2">
                          المبالغ فوق {MOBILE_WALLET_CAP} د.ل تتطلب تحويل بنكي — اختر &quot;تحويل بنكي&quot;
                        </p>
                      )}
                    </div>

                    {/* Mobile wallet: provider phone + USSD */}
                    {provider !== "bank" && (
                      <ProviderWalletPanel
                        provider={provider}
                        price={Number(selectedPlan.price)}
                        config={config}
                        onCopy={copyToClipboard}
                      />
                    )}

                    {/* Bank: account info + sender details + receipt */}
                    {provider === "bank" && (
                      <BankTransferPanel
                        price={Number(selectedPlan.price)}
                        amount={bankAmount}
                        onAmountChange={setBankAmount}
                        senderName={senderName}
                        senderAccount={senderAccount}
                        onSenderNameChange={setSenderName}
                        onSenderAccountChange={setSenderAccount}
                        receiptUrl={receiptUrl}
                        onReceiptChange={setReceiptUrl}
                        uploading={uploading}
                        onUpload={handleReceiptUpload}
                        config={config}
                        onCopy={copyToClipboard}
                      />
                    )}

                    {/* User info fields */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      {provider !== "bank" && (
                        <div className="sm:col-span-2">
                          <Input
                            label="رقم هاتفك"
                            id="phone"
                            value={form.phone}
                            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                            placeholder="09XXXXXXXXX"
                            inputMode="numeric"
                            maxLength={10}
                            dir="ltr"
                            className="text-left font-mono"
                          />
                          <p className="text-[11px] text-muted-foreground mt-1">
                            10 أرقام تبدأ بـ 09 — حتى نتمكن من التأكد من استلام التحويل
                          </p>
                        </div>
                      )}
                      <Input
                        label="الاسم (اختياري)"
                        id="name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="اسمك الكامل"
                      />
                      <Input
                        label="البريد الإلكتروني (اختياري)"
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="email@example.com"
                        dir="ltr"
                        className="text-left"
                      />
                    </div>

                    <Button
                      className="w-full h-12 text-base font-semibold"
                      onClick={handleSubmit}
                      loading={submitting}
                      disabled={
                        submitting ||
                        (provider !== "bank" && !form.phone.trim()) ||
                        (provider === "bank" && (!senderName.trim() || !senderAccount.trim()))
                      }
                    >
                      <CreditCard className="size-4" />
                      {submitting ? "جاري الإرسال..." : "إرسال طلب الدفع"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {step === "waiting" && (
                <Card>
                  <CardContent className="py-16 flex flex-col items-center text-center space-y-6">
                    <div className="relative size-24">
                      <div
                        className="absolute inset-0 rounded-full border-2 border-orange-500/20 animate-ping"
                        style={{ animationDuration: "2s" }}
                      />
                      <div className="absolute inset-2 rounded-full border border-orange-500/30" />
                      <div className="absolute inset-4 rounded-full bg-gradient-to-br from-orange-500 to-orange-500/80 flex items-center justify-center shadow-lg shadow-orange-500/25">
                        <Loader2 className="size-8 text-white animate-spin" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-base font-bold">في انتظار تأكيد الدفع</p>
                      <p className="text-xs text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                        بعد إتمام التحويل، انتظر موافقة الإدارة لتفعيل اشتراكك. عادةً ما يستغرق
                        ذلك بضع دقائق.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/30 border border-border/30">
                      <span className="relative flex size-2">
                        <span className="absolute inset-0 rounded-full bg-orange-500 animate-ping opacity-75" />
                        <span className="relative rounded-full size-2 bg-orange-500" />
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        بانتظار موافقة الإدارة...
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === "success" && (
                <Card>
                  <CardContent className="py-16 flex flex-col items-center text-center space-y-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={springSnappy}
                      className="relative size-20"
                    >
                      <div
                        className="absolute inset-0 rounded-full bg-green-500/20 animate-ping"
                        style={{ animationDuration: "1.5s" }}
                      />
                      <div className="relative size-full rounded-full bg-gradient-to-br from-green-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-green-500/30">
                        <CheckCircle2 className="size-10 text-white" />
                      </div>
                    </motion.div>
                    <div className="space-y-2">
                      <p className="text-lg font-bold text-green-600">تم تفعيل الاشتراك</p>
                      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                        {resolutionMsg || "اشتراكك نشط الآن — يمكنك البدء فوراً"}
                      </p>
                    </div>
                    <Button className="min-w-[200px]" onClick={() => router.push("/dashboard")}>
                      الانتقال إلى لوحة التحكم
                    </Button>
                  </CardContent>
                </Card>
              )}

              {step === "rejected" && (
                <Card>
                  <CardContent className="py-16 flex flex-col items-center text-center space-y-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={springSnappy}
                      className="relative size-20"
                    >
                      <div
                        className="absolute inset-0 rounded-full bg-red-500/20 animate-ping"
                        style={{ animationDuration: "1.5s" }}
                      />
                      <div className="relative size-full rounded-full bg-gradient-to-br from-red-500 to-rose-400 flex items-center justify-center shadow-lg shadow-red-500/30">
                        <XCircle className="size-10 text-white" />
                      </div>
                    </motion.div>
                    <div className="space-y-2">
                      <p className="text-lg font-bold text-red-600">تم رفض طلب الدفع</p>
                      <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                        {resolutionMsg || "يمكنك تعديل البيانات والمحاولة مجدداً"}
                      </p>
                    </div>
                    <div className="flex gap-2 w-full max-w-xs">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={handleBackToPlans}
                      >
                        اختيار خطة أخرى
                      </Button>
                      <Button className="flex-1" onClick={handleRetry}>
                        إعادة المحاولة
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}
      </AnimatePresence>
    </SectionContainer>
  )
}

/* ──────────────────────────────────────────────────────────────────────────── */
/* Sub-components                                                              */
/* ──────────────────────────────────────────────────────────────────────────── */

function ProviderWalletPanel({
  provider,
  price,
  config,
  onCopy,
}: {
  provider: "liyana" | "madar"
  price: number
  config: PaymentConfig
  onCopy: (text: string) => void
}) {
  const libyana = config.balance_transfer_phone_2 || "0942119637"
  const madar = config.balance_transfer_phone_1 || "0910089975"
  const phone = provider === "liyana" ? libyana : madar
  const providerName = provider === "liyana" ? "ليبيانا" : "مدار"

  // USSD quick transfer codes — Libyan operators
  const ussd =
    provider === "liyana"
      ? `*122*218${libyana.slice(1)}*${price * 1000}*1#`
      : `*140*4*1*${price}*${madar}#`
  const encodedUssd = ussd.replace(/#/g, "%23")

  return (
    <div className="space-y-3">
      {/* Provider phone */}
      <div className="rounded-xl bg-muted/30 border border-border/30 p-3">
        <p className="text-xs text-muted-foreground mb-1.5">أرسل المبلغ إلى {providerName}</p>
        <div className="flex items-center justify-between">
          <span className="font-bold text-lg tracking-wide font-mono" dir="ltr">
            {phone}
          </span>
          <button
            type="button"
            onClick={() => onCopy(phone)}
            className="size-10 rounded-lg border border-border/40 flex items-center justify-center hover:bg-accent transition-colors"
            title="نسخ الرقم"
          >
            <Copy className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Quick transfer code */}
      <div className="rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/20 p-3">
        <p className="text-xs font-medium text-green-600 mb-1.5">رمز التحويل السريع</p>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-bold text-orange-500 truncate" dir="ltr">
            {ussd}
          </span>
          <button
            type="button"
            onClick={async () => {
              await onCopy(ussd)
              setTimeout(() => {
                window.location.href = `tel:${encodedUssd}`
              }, 200)
            }}
            className="h-9 px-3 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0"
            title="نسخ الرمز وفتح الاتصال"
          >
            <Copy className="size-3.5" />
            نسخ واتصال
          </button>
        </div>
      </div>

      {/* Amount required */}
      <div className="rounded-xl bg-muted/30 border border-border/30 p-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">المبلغ المطلوب</span>
        <span className="text-lg font-bold text-orange-500">{price.toLocaleString()} د.ل</span>
      </div>
    </div>
  )
}

function BankTransferPanel({
  price,
  amount,
  onAmountChange,
  senderName,
  senderAccount,
  onSenderNameChange,
  onSenderAccountChange,
  receiptUrl,
  onReceiptChange,
  uploading,
  onUpload,
  config,
  onCopy,
}: {
  price: number
  amount: number
  onAmountChange: (n: number) => void
  senderName: string
  senderAccount: string
  onSenderNameChange: (v: string) => void
  onSenderAccountChange: (v: string) => void
  receiptUrl: string
  onReceiptChange: (v: string) => void
  uploading: boolean
  onUpload: (file: File) => void
  config: PaymentConfig
  onCopy: (text: string) => void
}) {
  const bankName = config.bank_transfer_bank_name || "—"
  const account = config.bank_transfer_account_number || "—"
  const iban = config.bank_transfer_iban || "—"

  return (
    <div className="space-y-3">
      {/* Bank info card */}
      <div className="rounded-xl bg-muted/30 border border-border/30 p-3 space-y-2.5">
        <p className="text-xs font-medium flex items-center gap-1.5">
          <Landmark className="size-3.5 text-orange-500" />
          حوّل على الحساب البنكي التالي
        </p>
        {[
          { label: "المصرف", value: bankName },
          { label: "رقم الحساب", value: account },
          { label: "IBAN", value: iban },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground shrink-0">{row.label}</span>
            <span className="font-mono text-sm font-bold text-left truncate" dir="ltr">
              {row.value}
            </span>
            <button
              type="button"
              onClick={() => onCopy(row.value)}
              className="size-9 rounded-lg border border-border/40 flex items-center justify-center hover:bg-accent transition-colors shrink-0"
              title={`نسخ ${row.label}`}
            >
              <Copy className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <Input
        label="المبلغ (د.ل)"
        type="number"
        value={amount}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (!Number.isNaN(v) && v >= 0) onAmountChange(v)
        }}
        min={1}
        dir="ltr"
        className="text-left"
      />

      <Input
        label="اسم صاحب الحساب المُرسِل"
        id="senderName"
        value={senderName}
        onChange={(e) => onSenderNameChange(e.target.value)}
        placeholder="الاسم كما يظهر في الحساب"
      />

      <Input
        label="رقم حساب المُرسِل"
        id="senderAccount"
        value={senderAccount}
        onChange={(e) => onSenderAccountChange(e.target.value)}
        placeholder="رقم الحساب الذي حُوّل منه"
        dir="ltr"
        className="text-left font-mono"
      />

      {/* Receipt upload */}
      <div>
        <label className="text-sm font-semibold mb-1.5 block">صورة التحويل (اختياري)</label>
        <div className="flex items-center gap-2">
          <label
            className={cn(
              "h-11 px-4 rounded-xl border border-border/40 flex items-center justify-center gap-2 cursor-pointer text-sm text-muted-foreground hover:bg-accent transition-colors",
              uploading && "opacity-50 pointer-events-none"
            )}
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onUpload(f)
              }}
            />
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {uploading ? "جاري الرفع..." : "اختر صورة"}
          </label>
          {receiptUrl && (
            <button
              type="button"
              onClick={() => onReceiptChange("")}
              className="text-xs text-red-500 hover:underline shrink-0"
            >
              حذف الصورة
            </button>
          )}
        </div>
        {receiptUrl && (
          <div className="mt-2 rounded-md overflow-hidden size-20 border border-border/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={receiptUrl} alt="صورة التحويل" className="size-full object-cover" />
          </div>
        )}
      </div>

      <div className="rounded-xl bg-muted/30 border border-border/30 p-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">سعر الباقة</span>
        <span className="text-lg font-bold text-orange-500">{price.toLocaleString()} د.ل</span>
      </div>
    </div>
  )
}
