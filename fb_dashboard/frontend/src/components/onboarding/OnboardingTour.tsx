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
    content: "قائمة المشتركين والتابعين — أرسل رسائل جماعية مستهدفة.",
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const steps: any[] = TOUR_STEPS

  // Joyride is a class component with restrictive prop types from an old version;
  // cast through unknown to bypass class-component prop diff issues.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const JoyrideAny: any = Joyride

  return (
    <JoyrideAny
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      showSkip
      showProgress
      disableOverlayClose
      spotlightClicks={false}
      callback={handleCallback}
      styles={{
        options: {
          arrowColor: "#ea580c",
          beaconSize: 36,
          overlayColor: "rgba(0, 0, 0, 0.45)",
          spotlightShadow: "0 0 15px rgba(234, 88, 12, 0.5)",
        },
        tooltip: {
          borderRadius: "12px",
          fontFamily: "Cairo, sans-serif",
          textAlign: "right",
          direction: "rtl",
        },
        tooltipContainer: {
          textAlign: "right",
        },
        buttonNext: {
          backgroundColor: "#ea580c",
          borderRadius: "8px",
        },
        buttonBack: {
          color: "#888",
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
