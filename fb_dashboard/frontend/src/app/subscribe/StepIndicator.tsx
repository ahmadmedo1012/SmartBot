"use client"

import { cn } from "@/lib/utils"
import { toArabicNumber } from "@/lib/format"
import { MotionCheck } from "@/components/ui/motion-icons"
import { motion, useReducedMotion } from "framer-motion"

/* Ported from Smart-Menu (smart-link.ly shared identity) — identical
   wizard indicator: numbered gradient nodes, check marks on completed
   steps, animated connectors, click-to-navigate back. SmartBot's flow
   has two steps (plan → review) where Smart-Menu has four — the
   component contract is unchanged. */

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
  const reduceMotion = useReducedMotion()
  const currentIdx = stepIndex(current)

  return (
    <nav aria-label="خطوات الاشتراك" className="flex items-center justify-center mb-10">
      {STEP_ORDER.map((s, i) => {
        const isActive = s === current
        const isDone = i < currentIdx
        const clickable = isDone || isActive

        return (
          <div key={s} className="flex items-center">
            {/* Step node */}
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onNavigate?.(s)}
              className={cn(
                "flex flex-col items-center gap-1.5 group outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/40 rounded-full",
                !clickable && "cursor-default",
              )}
              aria-current={isActive ? "step" : undefined}
              aria-disabled={!clickable || undefined}
            >
              <motion.div
                initial={false}
                whileTap={clickable && !reduceMotion ? { scale: 0.94 } : undefined}
                className={cn(
                  "size-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors duration-300",
                  isActive
                    ? "bg-[linear-gradient(135deg,var(--c-ember),var(--c-saffron))] text-espresso border-transparent shadow-lg shadow-accent-foreground/30 font-extrabold"
                    : isDone
                      ? "bg-accent-foreground/15 text-accent-foreground border-accent-foreground/40"
                      : "bg-muted/50 text-muted-foreground border-border/40",
                )}
              >
                {isDone ? <MotionCheck className="size-4" /> : toArabicNumber(i + 1)}
              </motion.div>
              <span
                className={cn(
                  "text-[11px] sm:text-xs font-medium transition-colors hidden sm:block",
                  isActive
                    ? "text-accent-foreground font-bold"
                    : isDone
                      ? "text-foreground/70"
                      : "text-muted-foreground/50",
                )}
              >
                {STEP_LABELS[s]}
              </span>
            </button>

            {/* Connector */}
            {i < STEP_ORDER.length - 1 && (
              <div
                className={cn(
                  "w-8 sm:w-14 h-0.5 mx-1 sm:mx-2 rounded-full transition-colors duration-500",
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
