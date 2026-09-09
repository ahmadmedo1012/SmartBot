"use client"

import { cn } from "@/lib/utils"
import { toArabicNumber } from "@/lib/format"
import { MotionCheck } from "@/components/ui/motion-icons"

/* Ported from Smart-Menu (smart-link.ly shared identity) — identical
   wizard indicator: numbered gradient nodes, check marks on completed
   steps, animated connectors, click-to-navigate back. SmartBot's flow
   has two steps (plan → review) where Smart-Menu has four — the
   component contract is unchanged. v6+: framer-free (CSS active tap).

   v18-1e (mobile density, 390px): the labels used to hide below sm —
   two bare numbered circles with no context. Two short steps total
   ~170px at 320px, so the labels now stay visible at every breakpoint
   (text-2xs → sm:text-xs), the connector shrinks to w-6 on mobile, and
   the row aligns items-start with the connector at mt-5 so it centers
   on the 40px node row (the old items-center hung it ~9px low once
   labels joined the column). Step buttons get min-w-11 — a 44px tap
   target on every node (WCAG 2.2 / gstack touch-target rule). */

export type WizardStep = "plan" | "review"

const STEP_ORDER: WizardStep[] = ["plan", "review"]

const STEP_LABELS: Record<WizardStep, string> = {
  plan: "اختر الخطة",
  review: "المراجعة والدفع",
}

export function stepIndex(step: WizardStep) {
  return STEP_ORDER.indexOf(step)
}

export function StepIndicator({
  current,
  onNavigate,
}: {
  current: WizardStep
  onNavigate?: (s: WizardStep) => void
}) {
  const currentIdx = stepIndex(current)

  return (
    <nav aria-label="خطوات الاشتراك" className="flex items-center justify-center mb-10">
      {STEP_ORDER.map((s, i) => {
        const isActive = s === current
        const isDone = i < currentIdx
        const clickable = isDone || isActive

        return (
          <div key={s} className="flex items-start">
            {/* Step node */}
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onNavigate?.(s)}
              className={cn(
                "flex flex-col items-center gap-1.5 group outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/40 rounded-full min-w-11",
                !clickable && "cursor-default",
              )}
              aria-current={isActive ? "step" : undefined}
              aria-disabled={!clickable || undefined}
              aria-label={`الانتقال إلى خطوة ${STEP_LABELS[s]}`}
            >
              <div
                className={cn(
                  "size-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-[color,background-color,border-color,box-shadow,scale] duration-300",
                  clickable && "active:scale-[0.94]",
                  isActive
                    ? "bg-[linear-gradient(135deg,var(--c-ember),var(--c-saffron))] text-espresso border-transparent shadow-lg shadow-accent-foreground/30 font-extrabold"
                    : isDone
                      ? "bg-accent-foreground/15 text-accent-foreground border-accent-foreground/40"
                      : "bg-muted/50 text-muted-foreground border-border/40",
                )}
              >
                {isDone ? <MotionCheck className="size-4" /> : toArabicNumber(i + 1)}
              </div>
              <span
                className={cn(
                  "text-2xs sm:text-xs font-medium transition-colors text-center",
                  /* v14-E4 (D4 H-04): inactive labels were muted-foreground/50 —
                     2.14:1, the worst failing pair in the audit. Full token
                     passes 5.59/6.54:1; done-vs-inactive distinction stays via
                     the node fill/border, not text opacity. */
                  isActive
                    ? "text-accent-foreground font-bold"
                    : isDone
                      ? "text-foreground/70"
                      : "text-muted-foreground",
                )}
              >
                {STEP_LABELS[s]}
              </span>
            </button>

            {/* Connector — v18-1e: mt-5 centers it on the 40px node row
                (20px = node center) now that the row is items-start. */}
            {i < STEP_ORDER.length - 1 && (
              <div
                className={cn(
                  "w-6 sm:w-14 h-0.5 mt-5 mx-1 sm:mx-2 rounded-full transition-colors duration-500",
                  i < currentIdx ? "bg-accent-foreground/50" : "bg-muted-foreground/15",
                )}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}
