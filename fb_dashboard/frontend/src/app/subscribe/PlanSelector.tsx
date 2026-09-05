"use client"

import { Sparkles, Star, Crown, Building2, Flame } from "lucide-react"
import { MotionArrowLeft } from "@/components/ui/motion-icons"
import { MotionCheck } from "@/components/ui/motion-icons"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toArabicNumber } from "@/lib/format"
import { getArabicPlural } from "@/lib/arabic-plural"
import { repliesPhrase, type ComparisonPlan } from "@/components/subscribe/plan-comparison"

/* Ported from Smart-Menu (smart-link.ly shared identity) — identical
   plan-selection cards: selection check bubble (shape + position carry
   state alongside color), flame "most popular" badge, gradient icon
   tile, price + items phrase + first features, and the continue CTA
   that names the selected plan. Fields adapted to SmartBot's plan
   model (replies/pages/rules caps instead of menus/items/orders). */

type Plan = ComparisonPlan

// Map by plan name (not index) — survives plan reordering/adding.
const PLAN_META: Record<string, { icon: typeof Sparkles; gradient: string; recommended?: boolean }> = {
  Free: { icon: Sparkles, gradient: "from-muted-foreground/60 to-muted-foreground/80" },
  Basic: { icon: Star, gradient: "from-accent-foreground to-accent-foreground/80", recommended: true },
  Premium: { icon: Crown, gradient: "from-saffron to-primary" },
  Pro: { icon: Building2, gradient: "from-primary to-bloom" },
  Enterprise: { icon: Building2, gradient: "from-bloom to-primary" },
}
const DEFAULT_META: { icon: typeof Sparkles; gradient: string; recommended?: boolean } = {
  icon: Sparkles,
  gradient: "from-muted-foreground/60 to-muted-foreground/80",
}

export function PlanSelector({
  plans,
  selectedPlan,
  onSelect,
  onContinue,
}: {
  plans: Plan[]
  selectedPlan: number | null
  onSelect: (id: number) => void
  onContinue: () => void
}) {
  const selected = plans.find((p) => p.id === selectedPlan)

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-center mb-8">اختر خطة تناسب أعمالك</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 max-w-4xl mx-auto">
        {plans.map((plan) => {
          const meta = PLAN_META[plan.name] ?? DEFAULT_META
          const Icon = meta.icon
          const isSelected = selectedPlan === plan.id
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onSelect(plan.id)}
              aria-pressed={isSelected}
              className={cn(
                "relative flex flex-col rounded-md p-5 text-start transition-[border-color,box-shadow] duration-300 border-2 hover:shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60",
                isSelected
                  ? "border-accent-foreground ring-2 ring-accent-foreground/40 bg-accent/50 dark:bg-accent shadow-lg shadow-accent-foreground/15"
                  : "border-border/30 hover:border-accent-foreground/30 hover:shadow-accent-foreground/5 bg-card/50",
              )}
            >
              {/* Selection check — shape + position carry the state alongside color (a11y) */}
              <span
                aria-hidden={!isSelected}
                className={cn(
                  "absolute -top-2 -end-2 size-6 rounded-full flex items-center justify-center shadow-lg transition-opacity duration-200",
                  isSelected ? "bg-primary opacity-100" : "bg-border/60 opacity-0 pointer-events-none",
                )}
              >
                <MotionCheck className="size-3.5 text-white" />
              </span>
              {meta.recommended && (
                <span className="absolute top-3 end-3 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[var(--c-ember)] to-[var(--c-saffron)] px-2.5 py-0.5 text-[10px] font-bold text-espresso shadow-sm">
                  <Flame className="size-3" aria-hidden="true" />
                  الأكثر شعبية
                </span>
              )}
              <span className={cn("size-10 rounded-sm bg-gradient-to-br flex items-center justify-center mb-3 shadow-lg", meta.gradient)}>
                <Icon className="size-5 text-white" aria-hidden="true" />
              </span>
              <h3 className="font-bold text-lg mb-1">{plan.nameAr}</h3>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-2xl font-bold tabular-nums">
                  {Number(plan.price) === 0 ? "مجاني" : toArabicNumber(plan.price)}
                </span>
                {Number(plan.price) > 0 && <span className="text-xs text-muted-foreground">د.ل/شهر</span>}
              </div>
              <p className="text-xs text-muted-foreground mb-3">{repliesPhrase(plan)}</p>
              <div className="space-y-1.5 mb-4 flex-1">
                {plan.features.slice(0, 4).map((f, j) => (
                  <div key={j} className="flex items-center gap-2 text-xs">
                    <MotionCheck className="size-3 text-primary shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
                {plan.features.length > 4 && (
                  <p className="text-xs text-primary font-medium">
                    +{toArabicNumber(plan.features.length - 4)}{" "}
                    {getArabicPlural(plan.features.length - 4, "ميزة أخرى", "ميزتان أخريان", "ميزات أخرى")}
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>
      <div className="text-center">
        <Button
          size="lg"
          variant={selected ? "flame" : "outline"}
          className={cn("px-10 h-14 text-lg rounded-sm")}
          disabled={!selectedPlan}
          onClick={onContinue}
        >
          {selected ? `متابعة مع خطة ${selected.nameAr}` : "اختر خطة أولاً"}
          <MotionArrowLeft className="ms-2 size-5" />
        </Button>
      </div>
    </div>
  )
}
