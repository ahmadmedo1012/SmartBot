"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Bot, Loader2 } from "lucide-react"
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

  const [plans, setPlans] = useState<ComparisonPlan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState(false)
  const [authLoaded, setAuthLoaded] = useState(false)
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
        setPlans(p)
        if (preselectedPlan) {
          // Try exact id first, then by position (ids may shift in DB)
          const sorted = [...p].sort((a, b) => a.sortOrder - b.sortOrder)
          const byId = p.find((pl) => pl.id === Number(preselectedPlan))
          const byPos = sorted[Number(preselectedPlan) - 1]
          const found = byId ?? byPos
          if (found) setSelectedPlan(found.id)
        }
      } catch {
        premiumToast("error", "تعذر تحميل الخطط")
        // auto-retry once after 1s — cold-start /api/plans may fail transiently
        if (!retried) {
          retried = true
          retryTimer = setTimeout(fetchPlans, 1000)
        }
      } finally {
        setLoading(false)
      }
    }
    fetchPlans()
    return () => {
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [preselectedPlan])

  // Manual retry after the auto-retry failed (no infinite skeleton)
  const handleRetryPlans = useCallback(() => {
    setLoading(true)
    setPlans([])
    apiFetch("/api/plans")
      .then((r) => unwrapApi<ComparisonPlanInput[]>(r))
      .then((raw) => {
        const p = (raw ?? []).map(toComparisonPlan)
        setPlans(p)
        if (preselectedPlan) {
          const sorted = [...p].sort((a, b) => a.sortOrder - b.sortOrder)
          const byId = p.find((pl: ComparisonPlan) => pl.id === Number(preselectedPlan))
          const byPos = sorted[Number(preselectedPlan) - 1]
          const found = byId ?? byPos
          if (found) setSelectedPlan(found.id)
        }
      })
      .catch(() => premiumToast("error", "تعذر تحميل الخطط"))
      .finally(() => setLoading(false))
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
    apiFetch("/api/me", { skipAuthRedirect: true })
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
      .finally(() => setAuthLoaded(true))
  }, [])

  const currentPlan = plans.find((p) => p.id === selectedPlan)

  const handlePaymentSuccess = useCallback(async () => {
    premiumToast("success", "تم تفعيل اشتراكك — جارٍ نقلك إلى لوحة التحكم…")
    router.push("/dashboard")
  }, [router])

  if (loading || !authLoaded)
    return (
      <SectionContainer className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
        <span className="sr-only">جارٍ التحميل…</span>
        <Loader2 className="size-8 animate-spin text-primary" />
      </SectionContainer>
    )

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

          {/* Step 1: Plan selector (with visible error state when plans never loaded) */}
          {step === "plan" && plans.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center animate-fade-in">
              <p className="text-muted-foreground">تعذر تحميل الخطط. يرجى المحاولة مرة أخرى.</p>
              <Button variant="outline" onClick={handleRetryPlans}>
                إعادة المحاولة
              </Button>
            </div>
          ) : (
            step === "plan" && (
              <PlanSelector
                plans={plans}
                selectedPlan={selectedPlan}
                onSelect={setSelectedPlan}
                onContinue={() => setStep("review")}
              />
            )
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
