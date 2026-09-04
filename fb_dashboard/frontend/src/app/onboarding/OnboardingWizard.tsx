"use client"

import { useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Bot,
  Sparkles,
  CreditCard,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Zap,
  MessageSquare,
  Target,
  Link2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiFetch } from "@/lib/csrf-client"

interface OnboardingWizardProps {
  onComplete: () => void
  onSkip?: () => void
}

const STEPS = [
  {
    id: "welcome",
    icon: Bot,
    title: "مرحباً بك في SmartBot!",
    subtitle: "في 3 دقائق فقط، رحلتك تبدأ",
    description:
      "SmartBot يساعدك على الرد تلقائياً على تعليقات فيسبوك وتحليل أداء صفحتك — بدون أي خبرة تقنية.",
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
    title: "اختر باقتك",
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

  // Step 2 (index 2): First rule fields
  const [keyword, setKeyword] = useState("")
  const [reply, setReply] = useState("")

  const total = STEPS.length
  const current = STEPS[step]
  const Icon = current.icon

  const handleNext = useCallback(async () => {
    // Step 1 (index 1) → save page connection before advancing
    if (step === 1 && pageId) {
      try {
        await apiFetch("/api/onboarding/connect-page", {
          method: "POST",
          body: JSON.stringify({ page_id: pageId, page_name: pageName }),
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
        toast.error("فشل حفظ الإعدادات — يمكنك إكمالها لاحقاً من لوحة التحكم")
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-orange-500/5 to-transparent" />
        <div className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-gradient-to-tr from-orange-500/5 to-transparent" />
      </div>

      <motion.div
        key={step}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative w-full max-w-lg mx-4"
      >
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-muted-foreground">
              الخطوة {step + 1} من {total}
            </span>
            <span className="text-xs font-medium text-orange">{current.subtitle}</span>
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
                      done ? "bg-orange" : active ? "bg-orange/60" : "bg-muted"
                    }`}
                  />
                  {i < STEPS.length - 1 && (
                    <div className={`size-1.5 rounded-full shrink-0 ${i < step ? "bg-orange" : "bg-muted"}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/90 shadow-2xl shadow-orange-500/5 backdrop-blur-xl">
          {/* Header */}
          <div className="p-8 pb-6 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-400 shadow-lg shadow-orange-500/25"
            >
              <Icon className="size-8 text-white" />
            </motion.div>
            <h2 className="text-xl font-bold mb-1">{current.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>
          </div>

          {/* Step-specific content */}
          <div className="px-8 pb-4">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="connect-form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-3"
                >
                  <Input
                    label="معرف الصفحة (Page ID)"
                    id="pageId"
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                    placeholder="مثال: 1234567890"
                    dir="ltr"
                  />
                  <Input
                    label="اسم الصفحة"
                    id="pageName"
                    value={pageName}
                    onChange={(e) => setPageName(e.target.value)}
                    placeholder="اسم صفحتك على فيسبوك"
                  />
                  <p className="text-xs text-muted-foreground">
                    ستجد معرف الصفحة من{" "}
                    <a
                      href="https://business.facebook.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-500 hover:underline"
                    >
                      Meta Business
                    </a>
                    . يمكنك أيضاً نسخ رابط صفحتك لمعرفة المعرف.
                  </p>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="rule-form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-3"
                >
                  <Input
                    label="كلمة مفتاحية"
                    id="keyword"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="مثال: سعر"
                    hint="البوت يرد عند ذكر هذه الكلمة في التعليق"
                  />
                  <div className="space-y-1">
                    <label
                      htmlFor="reply"
                      className="text-sm font-semibold leading-none"
                    >
                      نص الرد
                    </label>
                    <textarea
                      id="reply"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="شكراً لسؤالك! السعر يبدأ من 50 د.ل..."
                      rows={3}
                      className="flex w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                    />
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="subscribe-info"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { name: "مجاني", price: "0", desc: "مثالي للتجربة", color: "border-border/40" },
                      { name: "أساسي", price: "50", desc: "للمتاجر الصغيرة", color: "border-orange-500/40" },
                      { name: "احترافي", price: "150", desc: "للمتاجر الكبيرة", color: "border-border/40" },
                    ].map((plan) => (
                      <div
                        key={plan.name}
                        className={`rounded-xl border-2 p-3 text-center ${plan.color}`}
                      >
                        <p className="text-xs font-bold">{plan.name}</p>
                        <p className="text-lg font-bold text-orange-500">{plan.price}</p>
                        <p className="text-[10px] text-muted-foreground">د.ل/شهر</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{plan.desc}</p>
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
                </motion.div>
              )}

              {step === 4 && (
                <motion.div
                  key="done-content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center gap-4 py-2"
                >
                  <CheckCircle2 className="size-16 text-green-500" />
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
                        <item.icon className="size-4 text-orange-500" />
                        <span className="text-[10px] font-medium">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer nav */}
          <div className="px-8 pb-6 flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="gap-1.5"
            >
              <ArrowLeft className="size-3" />
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
              className="gap-1.5 shadow-md shadow-orange/20"
            >
              {loading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <ArrowRight className="size-3 rtl:-scale-x-100" />
              )}
              {step === total - 1 ? "ابدأ الآن" : "التالي"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
