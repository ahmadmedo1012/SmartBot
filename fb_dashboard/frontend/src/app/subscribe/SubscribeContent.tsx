"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Bot } from "lucide-react"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import { Button } from "@/components/ui/button"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { premiumToast } from "@/lib/premium-toast"
import { PlanSelector } from "./PlanSelector"
import { ReviewSummary } from "./PaymentSection"
import { StepIndicator, type WizardStep } from "./StepIndicator"
import { toComparisonPlan, type ComparisonPlan, type ComparisonPlanInput } from "@/components/subscribe/plan-comparison"
/* v18-1-c: الخطط تُرسم فوراً من الثوابت المدمجة (مرآة بذرة الخادم) ثم
   hydrate من GET /api/plans بتبديل صامت — الوكيل 1-b يملك منطق الدفع
   المعلق في هذا الملف؛ هذه التعديلات تلمس حالة الخطط/الحاجب فقط. */
import { DEFAULT_COMPARISON_PLANS, plansEqual } from "@/lib/default-plans"
import FloatingWhatsApp from "@/components/shared/FloatingWhatsApp"
import dynamic from "next/dynamic"

/* Restructured onto Smart-Menu's subscribe architecture (smart-link.ly
   shared identity): wizard steps + plan cards + review summary + the
   payment dialog modal. PaymentSection (which pulls the dialog chunk)
   is dynamically imported and deferred until the payment flow starts. */
const PaymentDialogWrapper = dynamic(
  () => import("./PaymentSection").then((m) => ({ default: m.PaymentDialogWrapper })),
  { ssr: false },
)

export default function SubscribeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedPlan = searchParams.get("plan")

  /* v18-1-c: حالة الخطط الابتدائية = الافتراضية المدمجة — البطاقات
     تُرسم من أول إطار (كانت skeleton تنتظر دالة باردة ~12.5 ث)؛ فشل
     الـAPI النهائي يُبقيها مع لافتة «تُعرض الباقات الافتراضية». */
  const [plans, setPlans] = useState<ComparisonPlan[]>(DEFAULT_COMPARISON_PLANS)
  const [plansFailed, setPlansFailed] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<number | null>(() => {
    // حلّ ?plan= على الافتراضية فوراً — الرابط المباشر يفتح خطوة
    // المراجعة بلا انتظار؛ يُعاد الحل على بيانات الـAPI عند hydrate
    if (!preselectedPlan) return null
    const n = Number(preselectedPlan)
    const byId = DEFAULT_COMPARISON_PLANS.find((p) => p.id === n)
    const byPos = [...DEFAULT_COMPARISON_PLANS].sort((a, b) => a.sortOrder - b.sortOrder)[n - 1]
    return (byId ?? byPos)?.id ?? null
  })
  const [authed, setAuthed] = useState(false)
  const [step, setStep] = useState<WizardStep>(preselectedPlan ? "review" : "plan")
  const [paymentOpen, setPaymentOpen] = useState(false)

  useEffect(() => {
    let retried = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const fetchPlans = async () => {
      try {
        const res = await apiFetch("/api/plans")
        const raw = await unwrapApi<ComparisonPlanInput[]>(res)
        const p = (raw ?? []).map(toComparisonPlan)
        if (p.length > 0) {
          // تبديل صامت: الشكل المتطابق يُبقي مرجع المصفوفة → React يتخلى
          // عن التحديث، لا وميض بين الرسم الافتراضي وبيانات الـAPI
          setPlans((prev) => (plansEqual(prev, p) ? prev : p))
        }
        setPlansFailed(p.length === 0)
        if (preselectedPlan) {
          // Try exact id first, then by position (ids may shift in DB)
          const sorted = [...p].sort((a, b) => a.sortOrder - b.sortOrder)
          const byId = p.find((pl) => pl.id === Number(preselectedPlan))
          const byPos = sorted[Number(preselectedPlan) - 1]
          const found = byId ?? byPos
          if (found) setSelectedPlan(found.id)
        }
      } catch {
        // auto-retry once after 1s — cold-start /api/plans may fail transiently;
        // اللافتة/التوست فقط بعد استنفاد إعادة المحاولة (لا ضجيج أثناءها)
        if (!retried) {
          retried = true
          retryTimer = setTimeout(fetchPlans, 1000)
        } else {
          setPlansFailed(true)
          premiumToast("error", "تعذر تحميل الخطط")
        }
      }
    }
    fetchPlans()
    return () => {
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [preselectedPlan])

  // Manual retry after the auto-retry failed — الافتراضية تبقى مرسومة
  // أثناء إعادة المحاولة (v18-1-c: لا تفريغ للحالة إلى skeleton)
  const handleRetryPlans = useCallback(() => {
    setPlansFailed(false)
    apiFetch("/api/plans")
      .then((r) => unwrapApi<ComparisonPlanInput[]>(r))
      .then((raw) => {
        const p = (raw ?? []).map(toComparisonPlan)
        if (p.length > 0) setPlans((prev) => (plansEqual(prev, p) ? prev : p))
        setPlansFailed(p.length === 0)
        if (preselectedPlan) {
          const sorted = [...p].sort((a, b) => a.sortOrder - b.sortOrder)
          const byId = p.find((pl: ComparisonPlan) => pl.id === Number(preselectedPlan))
          const byPos = sorted[Number(preselectedPlan) - 1]
          const found = byId ?? byPos
          if (found) setSelectedPlan(found.id)
        }
      })
      .catch(() => {
        setPlansFailed(true)
        premiumToast("error", "تعذر تحميل الخطط")
      })
  }, [preselectedPlan])

  // v6 §D/SEO — /subscribe is listed in the public sitemap, so it must NOT
  // redirect anonymous visitors (a redirecting sitemap URL is an SEO defect
  // and lighthouse measured it as a login redirect). Anonymous visitors now
  // browse plans publicly; auth is enforced at the PAYMENT step (401 →
  // login with return path, handled in PaymentDialog).
  // v17-E-F2 (D8-G1 — P0): the probe itself must opt out of apiFetch's
  // global 401 handler — a 401 here is the EXPECTED «anonymous visitor»
  // answer, not a session expiry, but handleSessionExpired() kicked the
  // anonymous visitor to /login?redirect=%2Fsubscribe (1.2s toast + replace),
  // defeating the public contract above and the middleware publicPrefixes.
  // skipAuthRedirect keeps the rejection local: authed=false → «العودة
  // للرئيسية» back button; PaymentDialog's tailored 401 journey untouched.
  useEffect(() => {
    // v18-1-c: نتيجة الفحص تُحدّث تسمية زر الرجوع فقط (لوحة التحكم
    // مقابل الرئيسية) — لم يعد يحجب رسم الصفحة خلف spinner كامل
    apiFetch("/api/me", { skipAuthRedirect: true })
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
  }, [])

  const currentPlan = plans.find((p) => p.id === selectedPlan)

  const handlePaymentSuccess = useCallback(async () => {
    premiumToast("success", "تم تفعيل اشتراكك — جارٍ نقلك إلى لوحة التحكم…")
    router.push("/dashboard")
  }, [router])

  // v18-1-c: لا حاجب تحميل — البطاقات الافتراضية تُرسم فوراً؛ زر الرجوع
  // يبدأ «للرئيسية» (افتراضي زائر) ويتبدل لـ«لوحة التحكم» إن صحّ الفحص

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-accent/20 to-background dark:via-accent/10">
      <SectionContainer className="py-12">
        {authed ? (
          <Button variant="ghost" size="sm" className="mb-6" onClick={() => router.push("/dashboard")}>
            <DirectionalIcon semanticDirection="back" className="size-4" /> العودة للوحة التحكم
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="mb-6" onClick={() => router.push("/")}>
            <DirectionalIcon semanticDirection="back" className="size-4" /> العودة للرئيسية
          </Button>
        )}

        <div className="max-w-4xl mx-auto px-0">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm mb-4">
              <Bot className="size-4" /> اشترك الآن
            </div>
            <h1 className="text-3xl md:text-5xl font-bold mb-3">
              <span>فعّل اشتراك بوتك الذكي</span>
            </h1>
            <p className="text-muted-foreground text-lg">اختر الخطة المناسبة لأعمالك على فيسبوك وماسنجر</p>
          </div>

          {/* Step indicator */}
          <StepIndicator current={step} onNavigate={setStep} />

          {/* Step 1: بطاقات تُرسم فوراً من الافتراضية؛ فشل الـAPI النهائي
              يُبقيها مع لافتة + زر إعادة المحاولة (v18-1-c) */}
          {step === "plan" && plansFailed && (
            <div className="mb-6 flex flex-col items-center gap-3 py-4 text-center animate-fade-in" role="status">
              <p className="text-sm text-muted-foreground">تُعرض الباقات الافتراضية — أعد المحاولة</p>
              <Button variant="outline" size="sm" onClick={handleRetryPlans}>
                إعادة المحاولة
              </Button>
            </div>
          )}
          {step === "plan" && (
            <PlanSelector
              plans={plans}
              selectedPlan={selectedPlan}
              onSelect={setSelectedPlan}
              onContinue={() => setStep("review")}
            />
          )}

          {/* Step 2: Review + pay */}
          {step === "review" && currentPlan && (
            <ReviewSummary currentPlan={currentPlan} onBack={() => setStep("plan")} onPay={() => setPaymentOpen(true)} />
          )}
          {step === "review" && !currentPlan && (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <p className="text-muted-foreground">لم تُختر خطة بعد.</p>
              <Button variant="outline" onClick={() => setStep("plan")}>
                اختيار خطة
              </Button>
            </div>
          )}

          {/* Payment Dialog */}
          {currentPlan && (
            <PaymentDialogWrapper
              open={paymentOpen}
              onOpenChange={setPaymentOpen}
              currentPlan={currentPlan}
              onSuccess={handlePaymentSuccess}
            />
          )}
        </div>
      </SectionContainer>

      {/* v12-E4.12 (WCAG 3.2.6 Consistent Help): same one-tap WhatsApp help
          affordance as the landing — same component, same fixed slot. */}
      <FloatingWhatsApp />
    </div>
  )
}
