"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import Joyride, { CallBackProps, STATUS } from "react-joyride"
import { X } from "lucide-react"
import { brandedToast } from "@/lib/premium-toast"
import { Button } from "@/components/ui/button"

interface TourStep {
  /** CSS selector or element ID — must match a rendered DOM node */
  target: string
  content: React.ReactNode
  title?: string
  disableBeacon?: boolean
  placement?: "top" | "right" | "bottom" | "left" | "auto"
  spotlightClicks?: boolean
}

const TOUR_STEPS: TourStep[] = [
  {
    target: "#sidebar-rules",
    disableBeacon: true,
    spotlightClicks: false,
    content: "هنا تُدارة قواعد الردود التلقائية. أنشئ، عدّل، أو عطّل أي قاعدة.",
    placement: "right",
  },
  {
    target: "#sidebar-analytics",
    disableBeacon: true,
    content: "شاشة الإحصائيات تُظهر أداء بوتك: الردود، التفاعل، وأفضل القواعد.",
    placement: "right",
  },
  {
    target: "#sidebar-pages",
    disableBeacon: true,
    content: "ربط صفحات فيسبوك متعددة وإدارة كل منها من لوحة واحدة.",
    placement: "right",
  },
  {
    target: "#sidebar-subscribers",
    disableBeacon: true,
    content: "قائمة المشتركين ومتابعي الصفحة — أرسل رسائل جماعية مستهدفة.",
    placement: "right",
  },
  {
    target: "#subscribe-btn",  // sidebar renders id={tourId} — was .subscribe-btn (no such class → broken step)
    disableBeacon: true,
    content: "اختر الخطة المناسبة لصفحتك وابدأ خلال دقائق.",
    placement: "bottom",
  },
]

interface OnboardingTourProps {
  /** Start the tour automatically on mount */
  autoStart?: boolean
  /** Callback fired when the tour is complete or skipped */
  onComplete?: () => void
}

/* v24-C2 (task 5 / A3-N6): the 5 tour targets (#sidebar-rules … #subscribe-btn)
 * all live in the `hidden md:block` sidebar — on phones they are
 * display:none, so react-joyride's spotlight/tooltip silently mis-positions
 * or stalls behind an overlay the user can't tap away (disableOverlayClose).
 * The bottom-nav buttons carry no stable ids (that component is owned by
 * another agent), so option (a) — retargeting to mobile equivalents — isn't
 * reliably selectable; option (b) it is: below md the joyride never renders
 * (no auto-start), a dismissible hint explains where things live instead,
 * and if the viewport shrinks below md WHILE the desktop tour is running the
 * tour ends with a toast. Desktop behavior is unchanged. */
const MOBILE_HINT_KEY = "smartbot-tour-mobile-hint-dismissed"

/** Reactive (max-width: 767px) viewport probe — same matchMedia recipe as
 * the messages page's usePrefersReducedMotion (7th-instance family). The
 * lazy initializer runs on the FIRST render (this component is dynamically
 * imported with ssr:false, so window always exists by then) — otherwise the
 * first client render would briefly see "desktop", flash the joyride one
 * frame on phones, and mis-fire the shrink toast below. */
function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false
    return window.matchMedia("(max-width: 767px)").matches
  })
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(max-width: 767px)")
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return isMobile
}

export function OnboardingTour({ autoStart = false, onComplete }: OnboardingTourProps) {
  const isMobile = useIsMobileViewport()
  const [run, setRun] = useState(autoStart)
  const [stepIndex, setStepIndex] = useState(0)
  /* v24-C2: mobile hint visibility — revealed once per browser (own
   * localStorage key; deliberately NOT TOUR_SEEN_KEY, so dismissing the
   * mobile hint never consumes the real desktop tour). */
  const [hintVisible, setHintVisible] = useState(false)
  /** True once the joyride has actually rendered on a desktop viewport —
   * distinguishes "mobile from the start" (silent, hint only) from "viewport
   * shrank mid-tour" (end + explain via toast). */
  const renderedOnDesktopRef = useRef(false)

  useEffect(() => {
    if (!isMobile) renderedOnDesktopRef.current = true
  }, [isMobile])

  // v24-C2: below md the tour must not run — its targets don't exist there.
  // If it was running (viewport shrank mid-tour), end it and say why.
  useEffect(() => {
    if (!isMobile || !run) return
    setRun(false)
    if (renderedOnDesktopRef.current) {
      brandedToast.info("الجولة متاحة على الشاشات الكبيرة")
    }
  }, [isMobile, run])

  // v24-C2: show the dismissible mobile hint (once per browser).
  useEffect(() => {
    if (!isMobile) return
    try {
      if (window.localStorage.getItem(MOBILE_HINT_KEY)) return
    } catch { /* private mode — session-only hint */ }
    setHintVisible(true)
  }, [isMobile])

  const dismissHint = useCallback(() => {
    setHintVisible(false)
    try { window.localStorage.setItem(MOBILE_HINT_KEY, "1") } catch { /* private mode */ }
  }, [])

  const handleCallback = useCallback(
    (data: CallBackProps) => {
      const { action, status, type } = data
      if (status === STATUS.FINISHED || status === STATUS.SKIPPED || action === "skip" || action === "close") {
        setRun(false)
        onComplete?.()
      }
      if (type === "step:after") {
        setStepIndex((prev) => prev + 1)
      }
    },
    [onComplete]
  )

  // Joyride is a class component with restrictive prop types from an old
  // version; cast through unknown to a loosely-typed component so our richer
  // step definitions (ReactNode content) and style tokens compile.
  const JoyrideAny = Joyride as unknown as React.ComponentType<Record<string, unknown>>

  return (
    <>
      {/* v24-C2: desktop joyride — exactly the same render/props as before;
          simply not mounted below md where its targets are display:none. */}
      {!isMobile && (
        <JoyrideAny
          steps={TOUR_STEPS}
          run={run}
          stepIndex={stepIndex}
          continuous
          showSkip
          showProgress
          disableOverlayClose
          spotlightClicks={false}
          callback={handleCallback}
          /* v9-C4 — design-system tokens instead of hardcoded hex/rgba.
           * joyride spreads these into React inline styles, so CSS var()
           * strings resolve at computed time against :root (dark) / .light:
           * --primary/--primary-foreground/--overlay/--muted-foreground live in
           * :root + .light; --radius-md/--radius-sm are real runtime vars since
           * v9-C1 moved the radius scale into a non-inline @theme block;
           * --font-sans needs --font-cairo (E-track fix in fonts.css, same wave).
           * Caveat: primaryColor feeds the beacon, and joyride's beaconOuter does
           * hex math on it (rgba(hexToRGB(...))) — the pulse-ring bg ignores a
           * var(). Harmless here: every step sets disableBeacon, so the beacon
           * never renders (beaconInner/border would use it directly anyway). */
          styles={{
            options: {
              arrowColor: "var(--primary)",
              beaconSize: 36,
              overlayColor: "var(--overlay)",
              primaryColor: "var(--primary)",
              spotlightShadow: "0 0 15px color-mix(in oklch, var(--primary) 50%, transparent)",
            },
            tooltip: {
              borderRadius: "var(--radius-md)",
              fontFamily: "var(--font-sans)",
              textAlign: "right",
              direction: "rtl",
            },
            tooltipContainer: {
              textAlign: "right",
            },
            buttonNext: {
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
              borderRadius: "var(--radius-sm)",
            },
            buttonBack: {
              color: "var(--muted-foreground)",
            },
          }}
          locale={{
            back: "السابق",
            close: "إغلاق",
            last: "إنهاء",
            next: "التالي",
            skip: "تخطي",
          }}
        />
      )}

      {/* v24-C2 (task 5): the mobile stand-in — a dismissible hint card
          above the bottom nav instead of a broken joyride overlay. */}
      {isMobile && hintVisible && (
        <div
          role="status"
          dir="rtl"
          className="fixed inset-x-3 bottom-24 z-40 rounded-xl border border-border/60 bg-popover/95 p-3 shadow-lg backdrop-blur-md"
        >
          <div className="flex items-start gap-2">
            <p className="text-xs leading-relaxed text-muted-foreground flex-1">
              جولة التعريف باللوحة تعمل على الشاشات الكبيرة — تصفّح كل الأقسام من
              زر «المزيد» في شريط التنقل بالأسفل، وافتح اللوحة من حاسوبك لتجربة
              الجولة كاملة.
            </p>
            <Button
              variant="ghost"
              size="icon"
              onClick={dismissHint}
              aria-label="إغلاق التنبيه"
              className="shrink-0 size-11"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
