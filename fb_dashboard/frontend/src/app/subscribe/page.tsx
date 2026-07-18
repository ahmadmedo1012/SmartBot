"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Sparkles, Crown, Star, Check, CreditCard, Timer, Phone, ArrowLeft, Loader2 } from "lucide-react"

import { SectionContainer } from "@/components/ui/SectionContainer"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { springGentle } from "@/lib/motion"
import { apiFetch } from "@/lib/csrf-client"

interface Plan {
  id: string
  name: string
  name_ar?: string
  price: number
  max_replies: number
  max_pages: number
  max_rules: number | string
  features: string[]
}

type Step = "select" | "form" | "payment" | "waiting" | "success" | "rejected"

export default function SubscribePage() {
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [step, setStep] = useState<Step>("select")
  const [form, setForm] = useState({ name: "", phone: "", email: "" })
  const [paymentInfo, setPaymentInfo] = useState<{ provider: string; ussd: string; payment_id: string } | null>(null)
  const [countdown, setCountdown] = useState(180)
  const [polling, setPolling] = useState(false)
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    apiFetch("/api/plans")
      .then((r) => r.json())
      .then(setPlans)
      .catch(() => toast.error("فشل تحميل الخطط"))
  }, [])

  const handleSelectPlan = useCallback((plan: Plan) => {
    setSelectedPlan(plan)
    setStep("form")
  }, [])

  const handleFormSubmit = useCallback(async () => {
    if (!form.phone) { toast.error("يرجى إدخال رقم الهاتف"); return }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error("البريد الإلكتروني غير صالح"); return }
    if (!selectedPlan) return
    setLoading(true)
    try {
      const res = await apiFetch("/api/subscriptions", {
        method: "POST",
        body: JSON.stringify({ plan_id: selectedPlan.id, phone: form.phone, name: form.name, email: form.email, amount: selectedPlan.price }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "فشل إنشاء الاشتراك"); return }
      setPaymentInfo({ provider: data.provider || "الخدمة", ussd: data.ussd || data.message || "أرسل المبلغ وانتظر تأكيد الأدمن", payment_id: data.payment_id })
      setCountdown(180)
      setStep("payment")
    } catch {
      toast.error("فشل الاتصال بالخادم")
    }
    setLoading(false)
  }, [form, selectedPlan])

  const handleConfirmPayment = useCallback(async () => {
    if (!paymentInfo) return
    setLoading(true)
    setStep("waiting")
    setPolling(true)
    const pid = paymentInfo.payment_id
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(async () => {
      try {
        const r = await apiFetch(`/api/subscriptions/status?payment_id=${pid}`)
        const d = await r.json()
        if (d.status === "verified") {
          if (intervalRef.current) clearInterval(intervalRef.current); intervalRef.current = null; setPolling(false); setStep("success")
          toast.success("تم تفعيل اشتراكك بنجاح")
        } else if (d.status === "cancelled") {
          if (intervalRef.current) clearInterval(intervalRef.current); intervalRef.current = null; setPolling(false); setStep("rejected")
          toast.error("تم رفض طلب الدفع")
        }
      } catch { /* retry */ }
    }, 3000)
  }, [paymentInfo])

  const handleRetry = useCallback(() => {
    setPaymentInfo(null)
    setStep("payment")
    setCountdown(180)
  }, [])

  useEffect(() => {
    if (step !== "waiting" || countdown <= 0) {
      if (step === "waiting" && countdown <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current); intervalRef.current = null
        setPolling(false)
        setStep("rejected")
        toast.error("انتهت مهلة انتظار الدفع")
      }
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [step, countdown])

  // cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`

  return (
    <SectionContainer className="min-h-screen py-12">
      <Button variant="ghost" size="sm" className="mb-6" onClick={() => router.push("/dashboard")}>
        <ArrowLeft className="size-4" /> العودة للوحة التحكم
      </Button>

      {/* Plan Selection */}
      {step === "select" && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={springGentle}>
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold tracking-tight mb-3">اختر خطتك</h1>
            <p className="text-muted-foreground text-lg">اختر الباقة المناسبة لاحتياجاتك</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
            {plans.map((plan, i) => (
              <Card key={plan.id} hover className="relative flex flex-col cursor-pointer"
                onClick={() => handleSelectPlan(plan)}>
                {i === 1 && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <Badge variant="default" className="text-xs">الأكثر شعبية</Badge>
                  </div>
                )}
                <CardHeader className="text-center">
                  <div className="mx-auto size-10 rounded-lg bg-orange-500/10 flex items-center justify-center mb-2">
                    {i === 0 ? <Sparkles className="size-5 text-orange-500" />
                      : i === 1 ? <Crown className="size-5 text-orange-500" />
                      : <Star className="size-5 text-orange-500" />}
                  </div>
                  <CardTitle>{plan.name_ar || plan.name}</CardTitle>
                  <CardDescription>
                    <span className="text-3xl font-bold text-orange-500">{plan.price}</span>
                    <span className="text-sm text-muted-foreground mr-1">د.ل/شهر</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <div className="grid grid-cols-3 gap-2 mb-4 p-3 bg-muted/50 rounded-lg text-center text-sm">
                    <div><span className="font-bold text-orange-500">{plan.max_replies >= 999999 ? "∞" : plan.max_replies}</span><p className="text-xs text-muted-foreground">ردود</p></div>
                    <div><span className="font-bold text-orange-500">{plan.max_pages >= 999 ? "∞" : plan.max_pages}</span><p className="text-xs text-muted-foreground">صفحات</p></div>
                    <div><span className="font-bold text-orange-500">{plan.max_rules || "—"}</span><p className="text-xs text-muted-foreground">قواعد</p></div>
                  </div>
                  <ul className="space-y-2 mb-6 flex-1">
                    {plan.features.slice(0, 5).map((f, j) => (
                      <li key={j} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="size-4 text-orange-500 shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full" onClick={() => handleSelectPlan(plan)}>{plan.price === 0 ? "ابدأ مجاناً" : "اختيار"}</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Registration Form */}
      {(step === "form" || step === "payment" || step === "waiting" || step === "success" || step === "rejected") && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={springGentle}
          className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => { setStep("select"); setSelectedPlan(null) }}>
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h2 className="text-xl font-bold">{selectedPlan?.name_ar || selectedPlan?.name}</h2>
              <p className="text-sm text-muted-foreground">{selectedPlan?.price} د.ل/شهر</p>
            </div>
          </div>

          {step === "form" && (
            <Card>
              <CardHeader>
                <CardTitle>معلومات الاشتراك</CardTitle>
                <CardDescription>أدخل بياناتك لإتمام عملية الاشتراك</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input label="الاسم" id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="الاسم (اختياري)" />
                <Input label="رقم الهاتف" id="phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="0912345678" dir="ltr" className="text-right" />
                <Input label="البريد الإلكتروني" id="email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@example.com" dir="ltr" className="text-right" />
                <Button className="w-full" loading={loading} onClick={handleFormSubmit}>
                  <CreditCard className="size-4" /> متابعة الدفع
                </Button>
              </CardContent>
            </Card>
          )}

          {step === "payment" && paymentInfo && (
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto size-12 rounded-full bg-orange-500/10 flex items-center justify-center mb-2">
                  <Phone className="size-6 text-orange-500" />
                </div>
                <CardTitle>بيانات الدفع</CardTitle>
                <CardDescription>قم بالدفع عبر خدمة {paymentInfo.provider}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-center">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">رمز USSD</p>
                  <p className="text-2xl font-mono font-bold tracking-wider text-orange-500" dir="ltr">{paymentInfo.ussd}</p>
                </div>
                <p className="text-sm text-muted-foreground">بعد الدفع، انقر على &quot;تأكيد الدفع&quot;</p>
                <Button className="w-full" onClick={handleConfirmPayment} loading={loading}>
                  <CreditCard className="size-4" /> تأكيد الدفع
                </Button>
              </CardContent>
            </Card>
          )}

          {step === "waiting" && (
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto size-12 rounded-full bg-orange-500/10 flex items-center justify-center mb-2">
                  <Timer className="size-6 text-orange-500" />
                </div>
                <CardTitle>في انتظار تأكيد الدفع</CardTitle>
                <CardDescription>جاري التحقق من حالة الدفع...</CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="text-4xl font-mono font-bold text-orange-500">{formatTime(countdown)}</div>
                {polling && <Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" />}
                <p className="text-sm text-muted-foreground">سيتم تأكيد اشتراكك تلقائياً بعد التحقق من الدفع</p>
              </CardContent>
            </Card>
          )}

          {step === "success" && (
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto size-12 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
                  <Check className="size-6 text-green-500" />
                </div>
                <CardTitle>تم تفعيل الاشتراك!</CardTitle>
                <CardDescription>اشتراكك نشط الآن، يمكنك البدء فوراً</CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Button onClick={() => router.push("/dashboard")}>الذهاب للوحة التحكم</Button>
              </CardContent>
            </Card>
          )}

          {step === "rejected" && (
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto size-12 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                  <Sparkles className="size-6 text-red-500" />
                </div>
                <CardTitle>لم يتم تأكيد الدفع</CardTitle>
                <CardDescription>لم يتم تأكيد الدفع بعد، يرجى المحاولة مرة أخرى</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-center">
                <Button onClick={handleRetry}>إعادة المحاولة</Button>
                <Button variant="outline" onClick={() => { setStep("select"); setSelectedPlan(null) }}>
                  اختيار خطة أخرى
                </Button>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}
    </SectionContainer>
  )
}
