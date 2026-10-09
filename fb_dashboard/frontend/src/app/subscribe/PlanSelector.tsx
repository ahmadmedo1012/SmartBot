"use client"

import { Sparkles, Star, Crown, Building2, Flame } from "lucide-react"
import { MotionCheck } from "@/components/ui/motion-icons"
import { Button } from "@/components/ui/button"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import { cn } from "@/lib/utils"
import { toArabicNumber } from "@/lib/format"
import { getArabicPlural } from "@/lib/arabic-plural"
import { repliesPhrase, type ComparisonPlan } from "@/components/subscribe/plan-comparison"

/* Ported from Smart-Menu (smart-link.ly shared identity) — identical
   plan-selection cards: selection check bubble (shape + position carry
   state alongside color), flame "most popular" badge, flat icon chip,
   price + items phrase + first features, and the continue CTA
   that names the selected plan. Fields adapted to SmartBot's plan
   model (replies/pages/rules caps instead of menus/items/orders).

   r133 (A5 S1 — money-path de-glow tail): the pre-r128 gradient recipe
   is flattened to the SM family twins (r128-F5 §4 flat cards): hairline
   1px card with border-color-only hover, flat saffron badge, flat pastel
   icon chips — no gradient, no shadow on the chrome (the SM
   SubscribeForm.tsx:526 flat-wash + 1px-border doctrine). */

/* v18-1e (البطاقة اليتيمة / orphan-card fix): the flat md:grid-cols-2
   lg:grid-cols-4 row stranded the 5th plan («مؤسسي») alone on a ragged
   second row that filled a quarter of the track — a random wrap, not a
   decision. The grid is now an explicit responsive contract:
   - <sm:  عمود واحد مكدس (الأقرأ عربياً — قوائم الميزات تحتفظ بالعرض
     الكامل، لا بطاقة نصف عرض يتيمة). sm: صفّان (2+2) والخطة الخامسة
     بعرض كامل (sm:col-span-2).
   - md:  ستة مسارات → صف 3 + زوج سفلي متمركز: البطاقة الرابعة تفتح
     المسار 2 (md:col-start-2) فتستقر الرابعة+الخامسة في المسارات
     2-3 و4-5 — زوج متمركز تحت الصف الثلاثي بلا فراغ جانبي.
   - lg+: صف 4 متوازن + كل خطة بعد الرابعة بطاقة عرض كامل DELIBERATE
     (lg:col-span-4): شريط أفقي أيقونة/اسم/سعر/ميزات بخط علوي لهب —
     «بطاقة الميزة» تحل محل الالتفاف العشوائي. */

type Plan = ComparisonPlan

// Map by plan name (not index) — survives plan reordering/adding.
// r133 (A5 S1): flat pastel chips (SM r128-F5 twin "شريحة أيقونة مسطّحة") —
// each plan keeps its brand hue as a /10–/15 wash with the same-family ink
// glyph; the gradient fill + shadow-lg are gone.
type PlanMeta = { icon: typeof Sparkles; chip: string; recommended?: boolean }
const PLAN_META: Record<string, PlanMeta> = {
  Free: { icon: Sparkles, chip: "bg-muted text-muted-foreground" },
  Basic: { icon: Star, chip: "bg-primary/10 text-primary", recommended: true },
  Premium: { icon: Crown, chip: "bg-saffron/15 text-saffron" },
  Pro: { icon: Building2, chip: "bg-bloom/15 text-bloom" },
  Enterprise: { icon: Building2, chip: "bg-ember/15 text-ember" },
}
const DEFAULT_META: PlanMeta = {
  icon: Sparkles,
  chip: "bg-muted text-muted-foreground",
}

/** Plans beyond this count render as full-width feature cards at lg+. */
const MAX_ROW_PLANS = 4

/** lg column count for the ≤4-plan grids — balanced at every count
   (3 plans never sit in a 4-track row with a hole beside them). */
const LG_COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
}

function PlanCard({
  plan,
  isSelected,
  onSelect,
  gridClass,
  wide = false,
}: {
  plan: Plan
  isSelected: boolean
  onSelect: (id: number) => void
  /** Track placement classes for the parent grid (v18-1e contract). */
  gridClass?: string
  /** Full-width feature card at lg+ (see the header comment). */
  wide?: boolean
}) {
  const meta = PLAN_META[plan.name] ?? DEFAULT_META
  const Icon = meta.icon

  return (
    <button
      type="button"
      onClick={() => onSelect(plan.id)}
      aria-pressed={isSelected}
      className={cn(
        /* r133 (A5 S1): SM r128-F5 flat-card twin — rounded-2xl hairline
           border, border-color-only hover, no shadow on either state
           (the selected card's ring-2 + border carry the selection). */
        "relative flex flex-col rounded-2xl border p-5 text-start transition-[border-color] duration-(--t-base) hover:border-accent-foreground/30 outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60",
        isSelected
          ? "border-accent-foreground/40 ring-2 ring-primary/30 bg-card"
          : "border-border/50 bg-card",
        wide && "lg:flex-row lg:items-center lg:gap-6",
        gridClass,
      )}
    >
      {/* v18-1e: the wide feature card's distinct top border — a flame
          hairline inset from the card corners. r133 (A5 S1): the
          ember→saffron gradient is flattened to a solid saffron rule
          (gradient ban on the money path). */}
      {wide && (
        <span
          aria-hidden="true"
          className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-[var(--c-saffron)]"
        />
      )}
      {/* Selection check — shape + position carry the state alongside color (a11y) */}
      <span
        aria-hidden={!isSelected}
        className={cn(
          "absolute -top-2 -end-2 size-6 rounded-full flex items-center justify-center shadow-lg transition-opacity duration-(--t-fast)",
          isSelected ? "bg-primary opacity-100" : "bg-border/60 opacity-0 pointer-events-none",
        )}
      >
        <MotionCheck className="size-3.5 text-primary-foreground" />
      </span>
      {meta.recommended && (
        /* r133 (A5 S1): SM r128-F5 twin — flat saffron plateau, no
           gradient, no shadow (espresso text 8.97:1). */
        <span className="absolute top-3 end-3 inline-flex items-center gap-1 rounded-full bg-[var(--c-saffron)] px-2.5 py-0.5 text-3xs font-bold text-espresso">
          <Flame className="size-3" aria-hidden="true" />
          الأكثر شعبية
        </span>
      )}
      <span
        className={cn(
          "size-10 rounded-xl flex items-center justify-center mb-3 shrink-0",
          meta.chip,
          wide && "lg:mb-0",
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className={cn("min-w-0", wide && "lg:shrink-0")}>
        <h3 className="font-bold text-lg mb-1">{plan.nameAr}</h3>
        <div className="flex items-baseline gap-1 mb-3">
          <span className="text-2xl font-bold tabular-nums">
            {Number(plan.price) === 0 ? "مجاني" : toArabicNumber(plan.price)}
          </span>
          {Number(plan.price) > 0 && <span className="text-xs text-muted-foreground">د.ل/شهر</span>}
        </div>
        <p className={cn("text-xs text-muted-foreground mb-3", wide && "lg:mb-0")}>{repliesPhrase(plan)}</p>
      </div>
      <div
        className={cn(
          "space-y-1.5 mb-4 flex-1 min-w-0",
          wide && "lg:mb-0 lg:flex lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6 lg:gap-y-2 lg:space-y-0",
        )}
      >
        {plan.features.slice(0, 4).map((f, j) => (
          <div key={j} className="flex items-center gap-2 text-xs">
            <MotionCheck className="size-3 text-primary shrink-0" />
            <span>{f}</span>
          </div>
        ))}
        {plan.features.length > 4 && (
          <p className="text-xs text-primary font-medium">
            {/* v9-E7: dir="ltr" keeps the "+" glued to the number — in the
                RTL paragraph it used to flip and render as "٣+" */}
            <span dir="ltr">+{toArabicNumber(plan.features.length - 4)}</span>{" "}
            {getArabicPlural(plan.features.length - 4, "ميزة أخرى", "ميزتان أخريان", "ميزات أخرى")}
          </p>
        )}
      </div>
    </button>
  )
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

  const hasWide = plans.length > MAX_ROW_PLANS
  const rowPlans = hasWide ? plans.slice(0, MAX_ROW_PLANS) : plans
  const widePlans = hasWide ? plans.slice(MAX_ROW_PLANS) : []

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-center mb-8">اختر خطة تناسب أعمالك</h2>
      <div
        className={cn(
          "grid gap-4 mb-8 max-w-4xl mx-auto",
          hasWide
            ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-6 lg:grid-cols-4"
            : cn("grid-cols-1 sm:grid-cols-2", LG_COLS[rowPlans.length] ?? "lg:grid-cols-4"),
        )}
      >
        {rowPlans.map((plan, i) => {
          const isLastRowCard = i === rowPlans.length - 1
          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              isSelected={selectedPlan === plan.id}
              onSelect={onSelect}
              gridClass={cn(
                /* 5+ plans: each row card takes a third of the md 6-track
                   grid, a single lg track. The 4th card opens track 2 so the
                   trailing pair centers under the 3-up row at md. */
                hasWide && "md:col-span-2 lg:col-span-1",
                hasWide && i === MAX_ROW_PLANS - 1 && "md:col-start-2 lg:col-start-auto",
                /* ≤4 plans with an odd count: the trailing card goes
                   full-width at sm so the 2-up grid never strands a
                   half-width orphan (same rule as the wide card). */
                !hasWide && rowPlans.length % 2 === 1 && isLastRowCard && rowPlans.length > 1 && "sm:col-span-2",
              )}
            />
          )
        })}
        {widePlans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            wide
            isSelected={selectedPlan === plan.id}
            onSelect={onSelect}
            /* sm: full-width under the 2-up rows · md: the centered pair's
               second member (auto-flows to tracks 4-5) · lg+: the
               deliberate full-width feature strip. */
            gridClass="sm:col-span-2 md:col-span-2 lg:col-span-4"
          />
        ))}
      </div>
      {/* v18-1e: bottom clearance for the floating WhatsApp affordance —
          at 390px the fixed FAB zone (16px inset + 56px) reaches ~88px
          from the viewport bottom; SectionContainer's py-12 (48px) plus
          this padding keeps the CTA clear of it when fully scrolled. */}
      <div className="text-center pb-16 md:pb-8">
        <Button
          size="lg"
          variant={selected ? "flame" : "outline"}
          /* r131-F7b (A4 P2-5, "subscribe radii → r10"): the continue CTA
             drops the h-14/text-lg/rounded-sm overrides — the canonical lg
             rung (h-11 44px / 14px / 600 / r-md) keeps the wide px-10. */
          className={cn("px-10 w-full sm:w-auto")}
          disabled={!selectedPlan}
          onClick={onContinue}
        >
          {selected ? `متابعة مع خطة ${selected.nameAr}` : "اختر خطة أولاً"}
          <DirectionalIcon semanticDirection="forward" className="motion-icon ms-2 size-5" />
        </Button>
      </div>
    </div>
  )
}
