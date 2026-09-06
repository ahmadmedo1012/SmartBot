/**
 * v7 §2.1 — THE single source of truth for directional (back/forward)
 * icons. Plan: smartbot-rtl-a11y-precision-plan-v7 §2.1.
 *
 * BEFORE v7 the codebase handled RTL direction in THREE different ways at
 * once (rtl:rotate-180 here, rtl:-scale-x-100 there, nothing elsewhere) —
 * see the plan's discovery table. This component is the one mandated fix:
 * every semantic directional arrow/chevron in the app renders through here.
 *
 * THE ONE flip mechanism (decisive, single choice): rtl:-scale-x-100 —
 * horizontal mirror, GPU-cheap, preserves stroke geometry. rotate-180 is
 * BANNED for icons (legacy uses were migrated in v7).
 *
 * Semantics (matches the OnboardingWizard convention the codebase already
 * used, Material Design RTL guidelines, and polished Arabic products —
 * the plan states it explicitly for back buttons):
 *   "back"    → LTR glyph ArrowLeft/ChevronLeft   → RTL: points RIGHT
 *   "forward" → LTR glyph ArrowRight/ChevronRight → RTL: points LEFT
 *
 * The component decides the glyph AND its orientation — callers pass the
 * MEANING ("back"/"forward"), never a raw icon name. Non-arrow directional
 * icons (Send/Reply/LogOut/external ArrowUpRight) stay direct lucide imports
 * but MUST use the same rtl:-scale-x-100 mechanism (see §2.2 audit).
 *
 * a11y: icons are decorative by default (aria-hidden) — the accessible
 * name lives on the interactive parent (button/link), never on the svg.
 */
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, type LucideProps } from "lucide-react"
import { cn } from "@/lib/utils"

export type SemanticDirection = "back" | "forward"
export type DirectionalVariant = "arrow" | "chevron"

const GLYPHS: Record<SemanticDirection, Record<DirectionalVariant, typeof ArrowLeft>> = {
  back: { arrow: ArrowLeft, chevron: ChevronLeft },
  forward: { arrow: ArrowRight, chevron: ChevronRight },
}

export function DirectionalIcon({
  semanticDirection,
  variant = "arrow",
  className,
  ...props
}: {
  /** The MEANING of the arrow, not its glyph: "back" (رجوع/سابق) or "forward" (التالي/متابعة/CTA). */
  semanticDirection: SemanticDirection
  /** arrow (standalone arrows) or chevron (breadcrumbs, compact navigators). */
  variant?: DirectionalVariant
} & Omit<LucideProps, "aria-hidden">) {
  const Glyph = GLYPHS[semanticDirection][variant]
  return (
    <Glyph
      aria-hidden="true"
      className={cn("rtl:-scale-x-100", className)}
      {...props}
    />
  )
}
