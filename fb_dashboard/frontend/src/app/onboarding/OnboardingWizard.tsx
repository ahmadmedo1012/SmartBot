"use client"

import { useState, useCallback, useEffect, useRef } from "react"
/* v13-L1: the JS motion engine is gone from this file entirely — the three
 * entrances (panel rise, icon pop, step-content fade) are pure-CSS twins
 * (ob-* classes in WIZARD_MOTION_CSS below, injected via one <style> tag).
 * Timing mirrors the old motion props 1:1 (0.25s ease-out panel, 0.3s
 * cubic-bezier(0.25,0.1,0.35,1) fades, 100ms icon delay), disabled under
 * prefers-reduced-motion. key={step} remounts the subtree per step so the
 * CSS animations replay exactly like the old initial/animate mounts did. */
import { useRouter } from "next/navigation"
import { brandedToast } from "@/lib/premium-toast"
import {
  Bot,
  Sparkles,
  CreditCard,
  CheckCircle2,
  Loader2,
  Zap,
  MessageSquare,
  Target,
  Link2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import { Input } from "@/components/ui/input"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { countPhrase, formatNumber } from "@/lib/format"

interface OnboardingWizardProps {
  onComplete: () => void
  onSkip?: () => void
}

interface PlanPreview {
  id: number
  name_ar: string
  price: number
  features: string[]
}

const WIZARD_MOTION_CSS = `
@keyframes ob-step-in { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ob-icon-in { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
@keyframes ob-fade-in { from { opacity: 0; } to { opacity: 1; } }
.ob-step-enter { animation: ob-step-in 0.25s ease-out backwards; }
.ob-icon-pop { animation: ob-icon-in 0.3s cubic-bezier(0.25, 0.1, 0.35, 1) 0.1s backwards; }
.ob-fade-in { animation: ob-fade-in 0.3s cubic-bezier(0.25, 0.1, 0.35, 1) backwards; }
@media (prefers-reduced-motion: reduce) {
  .ob-step-enter, .ob-icon-pop, .ob-fade-in { animation: none; }
}
`

const STEPS = [
  {
    id: "welcome",
    icon: Bot,
    title: "مرحباً بك في SmartBot!",
    subtitle: "في 3 دقائق فقط، رحلتك تبدأ",
    description:
      "يساعدك SmartBot على الرد تلقائياً على تعليقات فيسبوك وتحليل أداء صفحتك — بدون أي خبرة تقنية.",
  },
  {
    id: "connect",
    icon: Link2,
    title: "اربط صفحة فيسبوك",
    subtitle: "خطوة واحدة فقط",
    description:
      "أدخل معرف صفحتك للحصول على رمز وصول من Meta. هذا يتيح للبوت القراءة والرد على التعليقات.",
  },
  {
    id: "first-rule",
    icon: Sparkles,
    title: "أنشئ أول قاعدة رد",
    subtitle: "اجعل البوت يعمل فوراً",
    description:
      "قاعدة الرد هي الطريقة التي يتعامل بها البوت مع التعليقات. ابدأ بكلمة مفتاحية بسيطة.",
  },
  {
    id: "subscribe",
    icon: CreditCard,
    title: "اختر خطتك",
    subtitle: "ابدأ مجاناً أو اختر ما يناسبك",
    description:
      "جميع الباقات تبدأ بتجربة مجانية. يمكنك الترقية أو الإلغاء في أي وقت.",
  },
  {
    id: "done",
    icon: Zap,
    title: "كل شيء جاهز!",
    subtitle: "ابدأ الآن",
    description:
      "مرحباً بك في مجتمع SmartBot! رحلتك مع الردود التلقائية تبدأ الآن.",
  },
]

export default function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  // Step 1 (index 1): Facebook page fields
  const [pageId, setPageId] = useState("")
  const [pageName, setPageName] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<
    { connected: boolean; page_name?: string; fan_count?: number; error?: string } | null
  >(null)

  // Step 2 (index 2): First rule fields
  const [keyword, setKeyword] = useState("")
  const [reply, setReply] = useState("")
  const [suggesting, setSuggesting] = useState(false)

  // Step 3 (index 3): real plans from API
  const [plans, setPlans] = useState<PlanPreview[]>([])
  useEffect(() => {
    // v13-L3 (dec-envelope-prune): /api/plans returns ok([...]) since v12 —
    // unwrapApi is the single envelope path; `?? []` is null-safety only
    // (bad JSON resolves null), not a dual-shape guard.
    apiFetch("/api/plans")
      .then((res) => unwrapApi<PlanPreview[]>(res))
      .then((d) => {
        setPlans((d ?? []).filter((p: PlanPreview) => Number(p.price) > 0).slice(0, 3))
      })
      .catch(() => {/* keep empty — the CTA link still works */})
  }, [])

  /* v8-B1: full-screen wizard = modal dialog. Previously keyboard users
   * tabbed straight into the obscured dashboard behind it (WCAG 2.1.2
   * No Keyboard Trap / 2.4.3 Focus Order / 4.1.2). Pattern replicated from
   * the exemplary Header MobileMenu: focus-in on mount, Tab-cycle trap,
   * Escape maps to the visible back/skip affordance, focus restored on
   * unmount. */
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])')
      if (focusable.length) focusable[0]?.focus()
    })
    return () => {
      cancelAnimationFrame(raf)
      restoreFocusRef.current?.focus?.()
    }
  }, [])

  const total = STEPS.length
  const current = STEPS[step]
  const Icon = current.icon

  const handleTestConnection = useCallback(async () => {
    if (!pageId.trim() || !accessToken.trim()) {
      setTestResult({ connected: false, error: "أدخل معرف الصفحة ورمز الوصول أولاً" })
      return
    }
    setTesting(true)
    try {
      const res = await apiFetch("/api/onboarding/test-connection", {
        method: "POST",
        body: JSON.stringify({ page_id: pageId, access_token: accessToken }),
      })
      /* v12-E5.5 (pairs with E2.11): the backend now answers with the ok()
       * envelope — unwrapApi returns {connected, page_name?, fan_count?,
       * error?} directly (it also throws on legacy success:false bodies and
       * apiFetch itself throws ApiError on non-2xx — both land in catch).
       * The old dual-shape res.json() + `d?.data ?? d` tolerance is retired. */
      const d = await unwrapApi<{
        connected: boolean
        page_name?: string
        fan_count?: number
        error?: string
      }>(res)
      setTestResult(d ?? { connected: false, error: "استجابة غير متوقعة من الخادم" })
      if (d?.connected && d?.page_name && !pageName) {
        setPageName(d.page_name)
      }
    } catch (e) {
      setTestResult({ connected: false, error: "تعذر الاتصال — تحقق من البيانات" })
    } finally {
      setTesting(false)
    }
  }, [pageId, accessToken, pageName])

  const handleSuggestReply = useCallback(async () => {
    if (!keyword.trim()) {
      brandedToast.error("أدخل كلمة مفتاحية أولاً")
      return
    }
    setSuggesting(true)
    try {
      const res = await apiFetch("/api/onboarding/suggest-reply", {
        method: "POST",
        body: JSON.stringify({ keyword }),
      })
      // v13-L3 (dec-envelope-prune): ok({suggestion, source}) since v12 —
      // unwrapApi replaces the raw json() + `d?.data?.` tolerance.
      const d = await unwrapApi<{ suggestion: string; source: string }>(res)
      if (d?.suggestion) {
        setReply(d.suggestion)
        brandedToast.success(d.source === "ai" ? "اقتراح بالذكاء الاصطناعي" : "اقتراح جاهز — عدّله كما تريد")
      }
    } catch {
      brandedToast.error("تعذر الاقتراح — اكتب الرد يدوياً")
    } finally {
      setSuggesting(false)
    }
  }, [keyword])

  const handleNext = useCallback(async () => {
    // Step 1 (index 1) → save page connection before advancing
    if (step === 1 && pageId) {
      try {
        await apiFetch("/api/onboarding/connect-page", {
          method: "POST",
          body: JSON.stringify({ page_id: pageId, page_name: pageName, access_token: accessToken }),
        })
      } catch {
        // Non-fatal — continue wizard
      }
    }
    // Step 2 (index 2) → save first rule before advancing
    if (step === 2 && keyword && reply) {
      try {
        await apiFetch("/api/onboarding/first-rule", {
          method: "POST",
          body: JSON.stringify({ keyword, reply }),
        })
      } catch {
        // Non-fatal — continue wizard
      }
    }
    if (step === total - 1) {
      setLoading(true)
      try {
        await apiFetch("/api/onboarding/complete", { method: "POST" })
        onComplete()
      } catch {
        brandedToast.error("فشل حفظ الإعدادات — يمكنك إكمالها لاحقاً من لوحة التحكم")
        onComplete()
      } finally {
        setLoading(false)
      }
      return
    }
    setStep((s) => s + 1)
  }, [step, total, onComplete, pageId, pageName, keyword, reply])

  const handleBack = useCallback(() => {
    if (step === 0) {
      onSkip?.()
    } else {
      setStep((s) => s - 1)
    }
  }, [step, onSkip])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // maps to the SAME behavior as the visible "السابق/تخطي" button
        e.preventDefault()
        handleBack()
        return
      }
      if (e.key !== "Tab") return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])')
      if (focusable.length === 0) { e.preventDefault(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    panel.addEventListener("keydown", handleKeyDown)
    return () => panel.removeEventListener("keydown", handleKeyDown)
  }, [handleBack])

  return (
    <>
    <style dangerouslySetInnerHTML={{ __html: WIZARD_MOTION_CSS }} />
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-step-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-accent-foreground/5 to-transparent" />
        <div className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-gradient-to-tr from-accent-foreground/5 to-transparent" />
      </div>

      <div key={step} className="ob-step-enter relative w-full max-w-lg mx-4">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-muted-foreground">
              الخطوة {step + 1} من {total}
            </span>
            <span className="text-xs font-medium text-accent-foreground">{current.subtitle}</span>
          </div>
          {/* Step dots */}
          <div className="flex items-center gap-1.5 mb-3">
            {STEPS.map((_, i) => {
              const done = i < step
              const active = i === step
              return (
                <div key={i} className="flex items-center gap-1.5 flex-1">
                  <div
                    className={`h-1 flex-1 rounded-full transition-all duration-400 ${
                      done ? "bg-primary" : active ? "bg-accent-foreground/60" : "bg-muted"
                    }`}
                  />
                  {i < STEPS.length - 1 && (
                    <div className={`size-1.5 rounded-full shrink-0 ${i < step ? "bg-primary" : "bg-muted"}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/90 shadow-2xl shadow-accent-foreground/5 backdrop-blur-xl">
          {/* Header */}
          <div className="p-8 pb-6 text-center">
            <div className="ob-icon-pop mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-foreground to-accent-foreground/80 shadow-lg shadow-accent-foreground/25">
              <Icon className="size-8 text-white" />
            </div>
            <h2 id="onboarding-step-title" className="text-xl font-bold mb-1">{current.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>
          </div>

          {/* Step-specific content */}
          <div className="px-8 pb-4">
              {step === 1 && (
                <div key="connect-form" className="ob-fade-in space-y-3">
                  <Input
                    label="معرف الصفحة (Page ID)"
                    id="pageId"
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                    placeholder="مثال: 1234567890"
                    dir="ltr"
                  />
                  <Input
                    label="رمز الوصول (Page Access Token)"
                    id="accessToken"
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="EAAG…"
                    dir="ltr"
                    hint="من Graph API Explorer بصلاحيات الصفحة — يُشفّر فور الحفظ"
                  />
                  <Input
                    label="اسم الصفحة (اختياري — يُملأ تلقائياً عند نجاح الاختبار)"
                    id="pageName"
                    value={pageName}
                    onChange={(e) => setPageName(e.target.value)}
                    placeholder="اسم صفحتك على فيسبوك"
                  />
                  {/* اختبار الاتصال قبل التأكيد — الخطة ٥.١ */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={handleTestConnection}
                    disabled={testing}
                  >
                    {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                    {testing ? "جارٍ اختبار الاتصال…" : "اختبار الاتصال قبل التأكيد"}
                  </Button>
                  {testResult && (
                    <div
                      role="status"
                      aria-live="polite"
                      className={`rounded-lg p-2.5 text-xs leading-relaxed ${
                        testResult.connected
                          ? "bg-success-soft text-success border border-success/20"
                          : "bg-destructive-soft text-destructive border border-destructive/20"
                      }`}
                    >
                      {testResult.connected
                        ? "✓ الاتصال ناجح — " +
                          testResult.page_name +
                          (testResult.fan_count
                            ? " (" + countPhrase(testResult.fan_count, "متابع", "متابعين", "متابعين") + ")"
                            : "")
                        : "✗ " + (testResult.error || "فشل الاتصال")}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    ستجد الرمز من{" "}
                    <a
                      href="https://developers.facebook.com/tools/explorer/"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Graph API Explorer — يفتح في تبويب جديد"
                      className="text-accent-foreground hover:underline"
                    >
                      Graph API Explorer
                    </a>{" "}
                    بعد اختيار صفحتك والصلاحيات.
                  </p>
                </div>
              )}

              {step === 2 && (
                <div key="rule-form" className="ob-fade-in space-y-3">
                  <Input
                    label="كلمة مفتاحية"
                    id="keyword"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="مثال: سعر"
                    hint="البوت يرد عند ذكر هذه الكلمة في التعليق"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label htmlFor="reply" className="text-sm font-semibold leading-none">
                        نص الرد
                      </label>
                      <button
                        type="button"
                        onClick={handleSuggestReply}
                        disabled={suggesting || !keyword.trim()}
                        className="text-2xs font-medium text-accent-foreground hover:text-accent-foreground/80 disabled:opacity-50 flex items-center gap-1"
                      >
                        {suggesting ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Sparkles className="size-3" />
                        )}
                        اقترح رداً
                      </button>
                    </div>
                    <textarea
                      id="reply"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="شكراً لسؤالك! السعر يبدأ من 50 د.ل…"
                      rows={3}
                      className="flex w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/30 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                    />
                    <p className="text-3xs text-muted-foreground">
                      اضغط "اقترح رداً" لكتابة تلقائية بالذكاء الاصطناعي ثم عدّلها كما تشاء
                    </p>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div key="subscribe-info" className="ob-fade-in space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {(plans.length > 0
                      ? plans.map((p) => ({
                          name: p.name_ar,
                          price: String(p.price),
                          desc: (p.features || [])[0] || "",
                          color: p.id === plans[1]?.id ? "border-accent-foreground/40" : "border-border/40",
                        }))
                      : [
                          { name: "…", price: "…", desc: "جارٍ التحميل", color: "border-border/40" },
                        ]
                    ).map((plan) => (
                      <div
                        key={plan.name}
                        className={`rounded-xl border-2 p-3 text-center ${plan.color}`}
                      >
                        <p className="text-xs font-bold">{plan.name}</p>
                        <p className="text-lg font-bold text-accent-foreground">{plan.price}</p>
                        <p className="text-3xs text-muted-foreground">د.ل/شهر</p>
                        <p className="text-3xs text-muted-foreground mt-1">{plan.desc}</p>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => router.push("/subscribe")}
                  >
                    <CreditCard className="size-3" /> عرض كل الباقات
                  </Button>
                </div>
              )}

              {step === 4 && (
                <div key="done-content" className="ob-fade-in flex flex-col items-center gap-4 py-2">
                  <CheckCircle2 className="size-16 text-success" />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium">مرحباً بك!</p>
                    <p className="text-xs text-muted-foreground">
                      إعداداتك جاهزة. ابدأ بإنشاء المزيد من القواعد من لوحة التحكم.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 w-full">
                    {[
                      { icon: MessageSquare, label: "الردود", href: "/dashboard/autoreply" },
                      { icon: Target, label: "الإعلانات", href: "/dashboard/ads" },
                      { icon: Bot, label: "الإعدادات", href: "/dashboard/settings" },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => router.push(item.href)}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border/40 hover:bg-muted/50 transition-colors"
                      >
                        <item.icon className="size-4 text-accent-foreground" />
                        <span className="text-3xs font-medium">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
          </div>

          {/* Footer nav */}
          <div className="px-8 pb-6 flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="gap-1.5"
            >
              <DirectionalIcon semanticDirection="back" className="size-3" />
              {step === 0 ? "تخطي" : "السابق"}
            </Button>
            <div className="flex-1" />
            {step === 3 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStep(total - 1)
                }}
                className="gap-1.5"
              >
                تخطي الإعداد
              </Button>
            )}
            <Button
              onClick={handleNext}
              loading={loading}
              className="gap-1.5 shadow-md shadow-accent-foreground/20"
            >
              {loading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <DirectionalIcon semanticDirection="forward" className="size-3" />
              )}
              {step === total - 1 ? "ابدأ الآن" : "التالي"}
            </Button>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
