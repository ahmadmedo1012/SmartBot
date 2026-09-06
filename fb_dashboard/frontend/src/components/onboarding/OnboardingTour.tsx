"use client"

import React, { useState, useCallback } from "react"
import Joyride, { CallBackProps, STATUS } from "react-joyride"

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
    content: "قائمة المشتركين والمتابعين — أرسل رسائل جماعية مستهدفة.",
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

export function OnboardingTour({ autoStart = false, onComplete }: OnboardingTourProps) {
  const [run, setRun] = useState(autoStart)
  const [stepIndex, setStepIndex] = useState(0)

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
  )
}
