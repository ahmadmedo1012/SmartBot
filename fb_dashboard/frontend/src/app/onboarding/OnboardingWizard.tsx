"use client"

import { useState, useCallback, useEffect, useRef } from "react"
/* v13-L1: the JS motion engine is gone from this file entirely — the three
 * entrances (panel rise, icon pop, step-content fade) are pure-CSS twins
 * (ob-* classes in WIZARD_MOTION_CSS below, injected via one <style> tag).
 * Timing mirrors the old motion props 1:1 (0.25s ease-out panel, 0.3s
 * cubic-bezier(0.25,0.1,0.35,1) fades, 100ms icon delay), disabled under
 * prefers-reduced-motion. key={step} remounts the subtree per step so the
 * CSS animations replay exactly like the old initial/animate mounts did.
 *
 * v18-1a (ج): a fourth twin — .ob-panel-enter — animates the shell ONCE on
 * mount: on mobile the sheet slides up from the bottom edge (same 0.32s /
 * --ease-out-quart contract as MobileBottomNav's .sheet-panel); from sm up
 * it keeps the centered-card 24px rise. */
import { useRouter } from "next/navigation"
import { brandedToast } from "@/lib/premium-toast"
import {
  Bot,
  Sparkles,
  CreditCard,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  MessageSquare,
  Target,
  Link2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import { Input } from "@/components/ui/input"
import { ApiError, apiFetch } from "@/lib/csrf-client"
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
@keyframes ob-panel-in { from { opacity: 0; transform: translate3d(0, 24px, 0); } to { opacity: 1; transform: none; } }
@keyframes ob-sheet-in { from { transform: translate3d(0, 100%, 0); } to { transform: none; } }
.ob-step-enter { animation: ob-step-in 0.25s ease-out backwards; }
.ob-icon-pop { animation: ob-icon-in 0.3s cubic-bezier(0.25, 0.1, 0.35, 1) 0.1s backwards; }
.ob-fade-in { animation: ob-fade-in 0.3s cubic-bezier(0.25, 0.1, 0.35, 1) backwards; }
/* v18-1a (ج): one-shot shell entrance — mobile bottom-sheet slides up from
   the bottom edge; sm+ keeps the centered-card rise twin. */
.ob-panel-enter { animation: ob-sheet-in 0.32s var(--ease-out-quart) backwards; }
@media (min-width: 640px) {
  .ob-panel-enter { animation: ob-panel-in 0.25s ease-out backwards; }
}
@media (prefers-reduced-motion: reduce) {
  .ob-step-enter, .ob-icon-pop, .ob-fade-in, .ob-panel-enter { animation: none; }
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

/* v18-1a (ب — حفظ تقدم الجولة): the wizard is a client-only surface
 * (dynamic ssr:false in AuthGuard), so localStorage IS the persistence
 * story — no backend change. The step index is written only at REAL
 * abandonment moments (pagehide / tab hidden / a deliberate exit: the
 * plans new-tab or a done-step shortcut), never on a plain unmount:
 * in-app navigation inside /dashboard/* keeps the wizard MOUNTED (its
 * state lives in memory), and the resumed step never runs deeper than
 * what its preceding saves actually reached — a step is only advanced
 * past a failed save via the explicit «المتابعة رغم ذلك» bypass (أ).
 * Cleared on completion and on skip. */
const STEP_KEY = "sb-onboarding-step"

/** A save step that failed server-side (the form values stay in place). */
type SaveFailure = { what: "page" | "rule"; message: string }

/** Read + validate the persisted wizard step (1..last; 0/absent = fresh). */
function readPersistedStep(): number | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STEP_KEY)
    if (raw === null) return null
    const n = Number.parseInt(raw, 10)
    if (Number.isInteger(n) && n >= 1 && n < STEPS.length) return n
  } catch {
    /* private-mode / storage disabled — a fresh start is the safe fallback */
  }
  return null
}

/** v18-1a (أ): the backend's Arabic verdict, verbatim. ApiError already
 * resolves body.detail ?? body.error into .message (v4 §2.1); this funnels
 * BOTH failure shapes — HTTP 4xx/5xx (409 page-conflict included) and the
 * 200 ok({success:false}) envelope that unwrapApi throws on — into ONE
 * honest string for the role="alert" region. */
function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = (e.body ?? null) as Record<string, unknown> | null
    const detail = body?.detail ?? body?.error
    if (typeof detail === "string" && detail.trim()) return detail
    return e.message // "فشل الطلب (status)" Arabic fallback built into ApiError
  }
  return "تعذر الوصول إلى الخادم — تحقق من اتصالك ثم أعد المحاولة"
}

/* v18-1a (أ): the honest save-failure verdict — rendered INSIDE the failing
 * step's content, above the still-editable form, with the exact Arabic
 * detail the server answered (e.g. the 409 «هذه الصفحة مربوطة بمساحة عمل
 * أخرى…»). The wizard does NOT auto-advance past a failed save: the user
 * retries, or explicitly continues after reading what was NOT saved. */
function SaveErrorAlert({
  failure,
  retrying,
  onRetry,
  onContinue,
}: {
  failure: SaveFailure
  retrying: boolean
  onRetry: () => void
  onContinue: () => void
}) {
  const isPage = failure.what === "page"
  return (
    <div
      id="onboarding-save-error"
      role="alert"
      tabIndex={-1}
      className="rounded-lg border border-destructive/25 bg-destructive-soft p-3 outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
    >
      <div className="flex items-start gap-2 text-start">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-bold text-destructive">
            {isPage ? "فشل ربط الصفحة" : "فشل حفظ قاعدة الرد"}
          </p>
          {/* the server's own Arabic message — 409 conflicts, envelopes, all */}
          <p className="text-xs leading-relaxed text-destructive">{failure.message}</p>
          <p className="text-xs leading-relaxed text-foreground">
            {isPage
              ? "تنبيه: لم يتم ربط صفحتك بعد — لن يستطيع البوت الرد على تعليقاتها حتى تربطها لاحقاً من الإعدادات."
              : "تنبيه: لم تُحفظ قاعدة الرد — يمكنك إنشاؤها لاحقاً من صفحة «الردود التلقائية»."}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="destructive" size="sm" onClick={onRetry} loading={retrying} className="gap-1.5">
          {!retrying && <RefreshCw className="size-3" />}
          إعادة المحاولة
        </Button>
        <Button variant="ghost" size="sm" onClick={onContinue} className="gap-1.5">
          المتابعة رغم ذلك
          <DirectionalIcon semanticDirection="forward" className="size-3" />
        </Button>
      </div>
    </div>
  )
}

export default function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const router = useRouter()
  /* v18-1a (ب): resume from the persisted step (validated 1..4) — leaving
   * /dashboard (new tab / reload / a done-step shortcut) and coming back no
   * longer restarts the journey from «مرحباً بك». */
  const [step, setStep] = useState(() => readPersistedStep() ?? 0)
  const [loading, setLoading] = useState(false)
  /* v18-1a (أ): the failed-save verdict — set by handleNext, rendered by the
   * failing step's content, cleared on retry / bypass / step change. */
  const [saveError, setSaveError] = useState<SaveFailure | null>(null)

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

  /* v18-1a (ب): localStorage is best-effort — quota/private-mode must never
   * break the wizard itself. */
  const persistStep = useCallback((value: number) => {
    try {
      window.localStorage.setItem(STEP_KEY, String(value))
    } catch {
      /* best-effort only */
    }
  }, [])
  const clearPersistedStep = useCallback(() => {
    try {
      window.localStorage.removeItem(STEP_KEY)
    } catch {
      /* best-effort only */
    }
  }, [])

  /* v18-1a (ب): persist at the real abandonment moments — pagehide (reload,
   * tab close, external nav) and tab-hidden (the new /subscribe tab taking
   * focus). Listeners re-register per step so they capture the live value. */
  useEffect(() => {
    const persist = () => persistStep(step)
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persist()
    }
    window.addEventListener("pagehide", persist)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("pagehide", persist)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [step, persistStep])

  /* v18-1a (أ): a failed save must be SEEN, not just announced — keyboard
   * and screen-reader users land ON the role="alert" region the moment it
   * appears (rAF, same contract as focusStepTitle). */
  useEffect(() => {
    if (!saveError) return
    const raf = requestAnimationFrame(() => {
      document.getElementById("onboarding-save-error")?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [saveError])

  /* v18-1a (أ): a stale error never survives a step transition — going back
   * (or a successful retry's advance) resets the verdict state. */
  useEffect(() => {
    setSaveError(null)
  }, [step])

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

  /* v16-E3 (D1 LEAD B — p12-wizard-focus-advance): the forward path already
   * re-focused the step title via rAF (v15-fix below), but the BACK and
   * skip-setup paths called setStep() with no focus management — the clicked
   * button unmounts (key={step} remounts the whole card incl. the footer)
   * so focus fell to <body> OUTSIDE role="dialog" and the panel-scoped Tab
   * trap (:274-295) stopped intercepting → the first Tab escaped the modal.
   * Same rAF pattern, now factored out and shared by all three transitions. */
  const focusStepTitle = useCallback(() => {
    requestAnimationFrame(() => {
      document.getElementById("onboarding-step-title")?.focus()
    })
  }, [])

  const handleNext = useCallback(async () => {
    /* v18-1a (أ — أخطاء الحفظ بصدق): the two save steps used to swallow
     * their failures with a silent "Non-fatal — continue wizard" catch — a
     * 409 «هذه الصفحة مربوطة بمساحة عمل أخرى» advanced the wizard and the
     * user believed the page was linked. Now: unwrap the ok() envelope (so a
     * 200 success:false is ALSO a failure), surface the server's Arabic
     * detail in a role="alert" region, and BLOCK the advance — the only
     * way forward is a successful retry or the explicit «المتابعة رغم ذلك». */
    // Step 1 (index 1) → save page connection before advancing
    if (step === 1 && pageId) {
      setLoading(true)
      setSaveError(null)
      let saved = false
      try {
        const res = await apiFetch("/api/onboarding/connect-page", {
          method: "POST",
          body: JSON.stringify({ page_id: pageId, page_name: pageName, access_token: accessToken }),
        })
        // ok() envelope since v12 — unwrapApi throws ApiError(200, envelope)
        // when the backend answers success:false, so both failure shapes
        // land in the same catch below.
        await unwrapApi(res)
        saved = true
      } catch (e) {
        setSaveError({ what: "page", message: apiErrorMessage(e) })
      } finally {
        setLoading(false)
      }
      if (!saved) return
    }
    // Step 2 (index 2) → save first rule before advancing
    if (step === 2 && keyword && reply) {
      setLoading(true)
      setSaveError(null)
      let saved = false
      try {
        const res = await apiFetch("/api/onboarding/first-rule", {
          method: "POST",
          body: JSON.stringify({ keyword, reply }),
        })
        await unwrapApi(res)
        saved = true
      } catch (e) {
        setSaveError({ what: "rule", message: apiErrorMessage(e) })
      } finally {
        setLoading(false)
      }
      if (!saved) return
    }
    if (step === total - 1) {
      setLoading(true)
      try {
        await apiFetch("/api/onboarding/complete", { method: "POST" })
        clearPersistedStep()
        onComplete()
      } catch {
        brandedToast.error("فشل حفظ الإعدادات — يمكنك إكمالها لاحقاً من لوحة التحكم")
        clearPersistedStep()
        onComplete()
      } finally {
        setLoading(false)
      }
      return
    }
    setStep((s) => s + 1)
    /* v15-fix (بطارية p12-t8 — D4 M-04c): عند تقديم الخطوة كان التركيز
     * يقع على body (العنصر السابق يُفك) فلا يعرف قارئ الشاشة أين هو —
     * نعيده إلى عنوان الخطوة الجديدة (نمط v14-E4 في نافذة الدفع) */
    focusStepTitle()
    /* v14-E4 (D2 H1): accessToken added — it is sent to
     * /api/onboarding/connect-page on the step-1→2 transition; without it
     * in the deps a stale/empty token could be POSTed silently when the
     * user typed it after the callback was memoized (pageId/pageName were
     * already listed — the omission was an oversight). */
  }, [step, total, onComplete, pageId, pageName, accessToken, keyword, reply, focusStepTitle, clearPersistedStep])

  /* v18-1a (أ): the explicit bypass — advance WITHOUT saving, after the
   * alert spelled out exactly what was not persisted. Same focus contract
   * as «التالي»/«السابق» (focus must land on the new step's title). */
  const handleContinueAnyway = useCallback(() => {
    setSaveError(null)
    setStep((s) => s + 1)
    focusStepTitle()
  }, [focusStepTitle])

  const handleBack = useCallback(() => {
    if (step === 0) {
      /* v18-1a (ب): skipping the wizard is an exit — the persisted step
       * must not resurrect the journey on the next /dashboard visit. */
      clearPersistedStep()
      onSkip?.()
    } else {
      setStep((s) => s - 1)
      /* v16-E3 (D1 LEAD B): focus follows the step change — without this,
       * focus fell to <body> outside role="dialog" (key={step} unmounts the
       * clicked button) and the modal's Tab trap stopped intercepting. */
      focusStepTitle()
    }
  }, [step, onSkip, focusStepTitle, clearPersistedStep])

  /* v18-1a (هـ): «عرض كل الباقات» opens /subscribe in a NEW TAB so the
   * wizard tab stays open at the same step. window.open carries no implicit
   * noopener (unlike target=_blank links) — the opener is nulled manually
   * (reverse tab-nabbing guard). A null/undefined return = popup blocked →
   * the pre-v18 same-tab push remains the fallback. */
  const handleViewAllPlans = useCallback(() => {
    const win = window.open("/subscribe", "_blank")
    if (win) {
      try {
        win.opener = null
      } catch {
        /* cross-origin hardening already applies */
      }
      // the wizard keeps running in THIS tab — persist for reload/close
      persistStep(step)
    } else {
      router.push("/subscribe")
    }
  }, [step, persistStep, router])

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
    {/* v14-E4 (D4 M-02c): sr-only page-level heading — the wizard is a
        full-screen dialog layered over /dashboard, and its own title was an
        h2 with no h1 above it in reading order. This gives heading
        navigation (and axe page-has-heading-one) a target while the wizard
        is mounted. */}
    <h1 className="sr-only">إعداد الحساب خطوة بخطوة</h1>
    <style dangerouslySetInnerHTML={{ __html: WIZARD_MOTION_CSS }} />
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-step-title"
      /* v16 (p12 battery finding): the shell was bg-background/80 +
       * backdrop-blur-sm — axe's color-contrast check composes the
       * translucent shell with WHATEVER renders behind the dialog (populated
       * dashboard cards in the battery vs empty skeletons elsewhere), so the
       * progress header texts (muted-foreground) crossed below 4.5:1
       * non-deterministically depending on page state. A full-screen
       * onboarding modal with a SOLID shell is the deterministic contract —
       * contrast no longer depends on the page behind it. */
      /* v18-1a (ج): the shell is now SCROLLABLE (overflow-y-auto +
       * overscroll-contain) — the old items-center with no scroll clipped
       * the dialog header/footer out of reach on short screens / open
       * keyboards. The card anchors itself to the bottom via mt-auto (the
       * auto-margin twin of justify-end that stays fully scrollable when
       * taller than the viewport) and caps its own height, so the footer
       * nav is ALWAYS reachable; sm+ re-centers it. */
      className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto overscroll-contain bg-background sm:justify-center"
    >
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-accent-foreground/5 to-transparent" />
        <div className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-gradient-to-tr from-accent-foreground/5 to-transparent" />
      </div>

      {/* v18-1a (ج): the shell — on mobile a bottom sheet (full-width,
          rounded top edge, grab handle, slide-up entrance, flush with the
          screen bottom, footer clears the iOS home indicator via
          safe-area padding); from sm up the same card re-centers with its
          2rem breathing room. max-h + the inner flex column keep the
          header/footer as fixed chrome while ONLY the step content
          scrolls — the header/footer can never be clipped again. */}
      <div className="ob-panel-enter relative mt-auto flex w-full flex-col overflow-hidden rounded-t-2xl border-t border-border/60 bg-card shadow-2xl shadow-accent-foreground/5 backdrop-blur-xl max-h-[calc(100dvh-2rem)] sm:mx-4 sm:mt-0 sm:max-w-lg sm:rounded-2xl sm:border sm:border-border/60 sm:max-h-[calc(100dvh-4rem)]">
        {/* bottom-sheet grab affordance (decorative) */}
        <div aria-hidden="true" className="mx-auto mb-1 mt-2.5 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25 sm:hidden" />

        {/* Progress bar — v18-1a (ج): moved INSIDE the sheet chrome so it is
            always visible/reachable (was a sibling above the card, clipped
            with the rest when the fixed shell had no scroll). */}
        <div className="shrink-0 px-5 pt-3 sm:px-8 sm:pt-6">
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-xs text-muted-foreground">
              الخطوة {step + 1} من {total}
            </span>
            <span className="text-xs font-medium text-accent-foreground">{current.subtitle}</span>
          </div>
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => {
              const done = i < step
              const active = i === step
              return (
                <div key={i} className="flex items-center gap-1.5 flex-1">
                  <div
                    /* v17-S3 (D2 §3.2): duration-400 was a lone off-scale
                       value — now the --duration-slow token (500ms). */
                    className={`h-1 flex-1 rounded-full transition-all duration-(--duration-slow) ${
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

        <div key={step} className="ob-step-enter flex min-h-0 flex-1 flex-col">
          {/* Header */}
          <div className="shrink-0 p-6 pb-4 text-center sm:p-8 sm:pb-6">
            <div className="ob-icon-pop mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-foreground to-accent-foreground/80 shadow-lg shadow-accent-foreground/25">
              <Icon className="size-8 text-white" />
            </div>
            <h2 id="onboarding-step-title" tabIndex={-1} className="text-xl font-bold mb-1 outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/40 rounded-md px-1">{current.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>
          </div>

          {/* Step-specific content — v18-1a (ج): the ONLY scrollable region */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 sm:px-8">
              {step === 1 && (
                <div key="connect-form" className="ob-fade-in space-y-3">
                  {saveError?.what === "page" && (
                    <SaveErrorAlert
                      failure={saveError}
                      retrying={loading}
                      onRetry={handleNext}
                      onContinue={handleContinueAnyway}
                    />
                  )}
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
                      className={`flex items-start gap-1.5 rounded-lg p-2.5 text-xs leading-relaxed ${
                        testResult.connected
                          ? "bg-success-soft text-success border border-success/20"
                          : "bg-destructive-soft text-destructive border border-destructive/20"
                      }`}
                    >
                      {/* v17-E-F4 (D3 #7): the literal ✓/✗ text glyphs are
                          replaced with the app's state verdict icons
                          (CheckCircle2/XCircle — same pair as RegisterForm),
                          aria-hidden so the live region announces clean
                          Arabic text instead of a bare check/cross symbol. */}
                      {testResult.connected ? (
                        <CheckCircle2 className="size-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                      ) : (
                        <XCircle className="size-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                      )}
                      <span className="min-w-0">
                        {testResult.connected ? (
                          <>
                            {"الاتصال ناجح — "}
                            {/* v15-E6 (D5-M7): page_name is a live Latin Facebook
                                value inside an aria-live region — dir="auto"
                                isolates it so the Arabic sentence order survives
                                (and a missing name renders empty, not "undefined"). */}
                            <span dir="auto">{testResult.page_name ?? ""}</span>
                            {testResult.fan_count
                              ? ` (${countPhrase(testResult.fan_count, "متابع", "متابعين", "متابعين")})`
                              : ""}
                          </>
                        ) : (
                          testResult.error || "فشل الاتصال"
                        )}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    ستجد الرمز من{" "}
                    <a
                      href="https://developers.facebook.com/tools/explorer/"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Graph API Explorer — يفتح في تبويب جديد"
                      /* v15-fix (بطارية p12-t8 axe): link-in-text-block — الرابط
                       * داخل نص اعتمد على اللون وحده (WCAG 1.4.1) — خط سفلي دائم */
                      className="text-accent-foreground underline decoration-accent-foreground/50 underline-offset-2 hover:decoration-accent-foreground"
                    >
                      Graph API Explorer
                    </a>{" "}
                    بعد اختيار صفحتك والصلاحيات.
                  </p>
                </div>
              )}

              {step === 2 && (
                <div key="rule-form" className="ob-fade-in space-y-3">
                  {saveError?.what === "rule" && (
                    <SaveErrorAlert
                      failure={saveError}
                      retrying={loading}
                      onRetry={handleNext}
                      onContinue={handleContinueAnyway}
                    />
                  )}
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
                        /* v14-E4 (D4 H-07, WCAG 2.5.8 AA 24×24): the old
                           text-2xs strip measured ≈16–18px tall — below the
                           minimum target size. min-h-8 + px-2.5 clears it
                           (32px) while staying visually subordinate to the
                           textarea label. */
                        className="min-h-8 px-2.5 rounded-md text-2xs font-medium text-accent-foreground hover:text-accent-foreground/80 disabled:opacity-50 flex items-center gap-1 transition-colors"
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
                      /* v16-E3 (D1 C3): raw textarea bypasses the shared
                         Textarea seam — dir="auto" isolates mixed Arabic/Latin
                         reply text (bidi garbling risk, same fix as the
                         dashboard raw fields). */
                      dir="auto"
                      className="flex w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-placeholder-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/30 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                    />
                    <p className="text-3xs text-muted-foreground">
                      اضغط "اقترح رداً" لكتابة تلقائية بالذكاء الاصطناعي ثم عدّلها كما تشاء
                    </p>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div key="subscribe-info" className="ob-fade-in space-y-3">
                  {/* v18-1a (د): grid-cols-3 at ~110px per card squeezed the
                      Arabic plan text into text-3xs rags on phones. The cards
                      now stack full-width below md — name + feature
                      inline-start, price inline-end, every text ≥ text-xs —
                      and return to the 3-column centered grid from md up. */}
                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3 md:gap-2">
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
                        className={`flex items-center gap-3 rounded-xl border-2 p-3 text-start md:block md:text-center ${plan.color}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold">{plan.name}</p>
                          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{plan.desc}</p>
                        </div>
                        <div className="shrink-0 md:mt-1.5">
                          <p className="text-lg font-bold leading-none text-accent-foreground">{plan.price}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">د.ل/شهر</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleViewAllPlans}
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
                  {/* v18-1a (د): shortcut labels text-3xs → text-xs (WCAG-
                      readable on the ~110px mobile columns; the single-word
                      labels + icon keep the 3-column quick-actions shape). */}
                  <div className="grid grid-cols-3 gap-2 w-full">
                    {[
                      { icon: MessageSquare, label: "الردود", href: "/dashboard/autoreply" },
                      { icon: Target, label: "الإعلانات", href: "/dashboard/ads" },
                      { icon: Bot, label: "الإعدادات", href: "/dashboard/settings" },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          /* v18-1a (ب): deliberate exit — persist first so the
                           * return to /dashboard resumes at «كل شيء جاهز»
                           * instead of restarting the journey. */
                          persistStep(step)
                          router.push(item.href)
                        }}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border/40 hover:bg-muted/50 transition-colors"
                      >
                        <item.icon className="size-4 text-accent-foreground" />
                        <span className="text-xs font-medium">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
          </div>

          {/* Footer nav — v18-1a (ج): fixed sheet chrome (never clipped);
              mobile bottom padding clears the iOS home indicator. */}
          <div className="flex shrink-0 items-center gap-3 px-5 pt-2 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] sm:px-8 sm:pb-6">
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
                  /* v16-E3 (D1 LEAD B): same focus contract as «السابق»/«التالي» —
                   * the step-3 skip jumps to the done step; focus must land on
                   * its title, not <body> outside the dialog. */
                  focusStepTitle()
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
