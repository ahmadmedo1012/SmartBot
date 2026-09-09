/**
 * v13-E6 — PlanSelector contract (ported Smart-Menu selection cards).
 *
 * Pins the subscribe flow's step-1 surface: plan cards with selection
 * semantics (aria-pressed + the check bubble), the "most popular" flame
 * badge reserved for Basic, price/replies phrasing (free plan, unlimited
 * sentinel), the features overflow phrase with correct Arabic dual/plural,
 * and the continue CTA that names the selected plan (or begs for one).
 *
 * v18-1e — responsive-grid contract: the five production plans render as
 * a 4-up row + a deliberate full-width feature card at lg (no orphan
 * 5th card on a ragged second row), a centered 3+2 pair at md, and a
 * balanced 2-up/full-width layout below that. ≤4 plans keep a plain
 * balanced grid with no wide card.
 */
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PlanSelector } from "./PlanSelector"
import type { ComparisonPlan } from "@/components/subscribe/plan-comparison"

function makePlan(overrides: Partial<ComparisonPlan> = {}): ComparisonPlan {
  return {
    id: 1,
    name: "Free",
    nameAr: "المجانية",
    price: 0,
    features: ["ردود آلية", "تقارير"],
    maxReplies: 500,
    maxPages: 3,
    maxRules: 10,
    sortOrder: 1,
    ...overrides,
  }
}

function threePlans(): ComparisonPlan[] {
  return [
    makePlan({ id: 1, name: "Free", nameAr: "المجانية", price: 0 }),
    makePlan({ id: 2, name: "Basic", nameAr: "الأساسية", price: 19 }),
    makePlan({ id: 3, name: "Premium", nameAr: "المتقدمة", price: 49 }),
  ]
}

/** The five canonical production plans (mirror of lib/default-plans). */
function fivePlans(): ComparisonPlan[] {
  return [
    makePlan({ id: 1, name: "Free", nameAr: "مجاني", price: 0 }),
    makePlan({ id: 2, name: "Basic", nameAr: "أساسي", price: 19 }),
    makePlan({ id: 3, name: "Premium", nameAr: "مميز", price: 29 }),
    makePlan({ id: 4, name: "Pro", nameAr: "احترافي", price: 49 }),
    makePlan({ id: 5, name: "Enterprise", nameAr: "مؤسسي", price: 99, maxReplies: 999999 }),
  ]
}

describe("PlanSelector plan cards", () => {
  it('shows "مجاني" without the per-month unit for a zero-price plan', () => {
    render(
      <PlanSelector
        plans={[makePlan({ id: 1, name: "Free", nameAr: "المجانية", price: 0 })]}
        selectedPlan={null}
        onSelect={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    expect(screen.getByText("مجاني")).toBeInTheDocument()
    // zero price → no unit anywhere on the card
    expect(screen.queryByText("د.ل/شهر")).toBeNull()
  })

  it("shows the price with the د.ل/شهر unit for paid plans", () => {
    render(
      <PlanSelector plans={[makePlan({ id: 2, name: "Basic", nameAr: "الأساسية", price: 19 })]} selectedPlan={null} onSelect={vi.fn()} onContinue={vi.fn()} />,
    )

    expect(screen.getByText("19")).toBeInTheDocument()
    expect(screen.getByText("د.ل/شهر")).toBeInTheDocument()
  })

  it('phrases the unlimited sentinel as "ردود غير محدودة"', () => {
    render(
      <PlanSelector
        plans={[makePlan({ id: 3, name: "Premium", nameAr: "المتقدمة", maxReplies: 999999, price: 49 })]}
        selectedPlan={null}
        onSelect={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    expect(screen.getByText("ردود غير محدودة")).toBeInTheDocument()
  })

  it('reserves the "الأكثر شعبية" badge for the Basic card only', () => {
    render(
      <PlanSelector plans={threePlans()} selectedPlan={null} onSelect={vi.fn()} onContinue={vi.fn()} />,
    )

    const badges = screen.getAllByText("الأكثر شعبية")
    expect(badges.length).toBe(1)
    // and it lives on the Basic (الأساسية) card
    const basicCard = screen.getByRole("button", { name: /الأساسية/ })
    expect(badges[0].closest("button")).toBe(basicCard)
  })

  it("toggles aria-pressed and the selection bubble with the selected plan", () => {
    const { rerender } = render(
      <PlanSelector plans={threePlans()} selectedPlan={null} onSelect={vi.fn()} onContinue={vi.fn()} />,
    )

    const basicCard = screen.getByRole("button", { name: /الأساسية/ })
    expect(basicCard).toHaveAttribute("aria-pressed", "false")

    rerender(
      <PlanSelector plans={threePlans()} selectedPlan={2} onSelect={vi.fn()} onContinue={vi.fn()} />,
    )

    expect(basicCard).toHaveAttribute("aria-pressed", "true")
    // the check bubble becomes visible (aria-hidden=false, opacity-100)
    const bubble = basicCard.querySelector("span.bg-primary")
    expect(bubble).toHaveAttribute("aria-hidden", "false")
    expect(bubble).toHaveClass("opacity-100")
    // other cards keep the hidden bubble
    const freeCard = screen.getByRole("button", { name: /المجانية/ })
    const hiddenBubble = freeCard.querySelector("span.bg-border\\/60")
    expect(hiddenBubble).toHaveAttribute("aria-hidden", "true")
  })

  it("reports the clicked plan id via onSelect", () => {
    const onSelect = vi.fn()
    render(<PlanSelector plans={threePlans()} selectedPlan={null} onSelect={onSelect} onContinue={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: /المتقدمة/ }))

    expect(onSelect).toHaveBeenCalledWith(3)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})

describe("PlanSelector features overflow phrase", () => {
  it("counts 7 features as +3 with the few plural (ميزات أخرى)", () => {
    const features = ["واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة"]
    render(
      <PlanSelector
        plans={[makePlan({ id: 1, features })]}
        selectedPlan={null}
        onSelect={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    // first 4 render as-is; the overflow line is "+3 ميزات أخرى" — the
    // number sits in an ltr span so RTL cannot match it as one text node;
    // assert on the paragraph's full textContent instead
    const overflow = screen.getByText(/ميزات أخرى|ميزتان أخريان/)
    expect(overflow.textContent).toBe("+3 ميزات أخرى")
  })

  it("counts 6 features as +2 with the dual form (ميزتان أخريان)", () => {
    const features = ["واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة"]
    render(
      <PlanSelector
        plans={[makePlan({ id: 1, features })]}
        selectedPlan={null}
        onSelect={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    const overflow = screen.getByText(/ميزات أخرى|ميزتان أخريان/)
    expect(overflow.textContent).toBe("+2 ميزتان أخريان")
  })

  it("shows no overflow line for 4 features or fewer", () => {
    render(
      <PlanSelector
        plans={[makePlan({ id: 1, features: ["أ", "ب", "ج", "د"] })]}
        selectedPlan={null}
        onSelect={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    expect(screen.queryByText(/ميزات أخرى|ميزتان أخريان/)).toBeNull()
  })
})

describe("PlanSelector responsive grid (v18-1e — no orphan card)", () => {
  it("renders the five production plans as a 4-up row + a full-width feature card at lg", () => {
    const { container } = render(
      <PlanSelector plans={fivePlans()} selectedPlan={null} onSelect={vi.fn()} onContinue={vi.fn()} />,
    )

    const grid = container.querySelector(".grid") as HTMLElement
    // md: 6 tracks (3-up row + centered trailing pair) · lg: 4 tracks (row + wide strip)
    expect(grid.className).toContain("md:grid-cols-6")
    expect(grid.className).toContain("lg:grid-cols-4")

    const cards = grid.querySelectorAll("button[aria-pressed]")
    expect(cards).toHaveLength(5)
    // the first four stay single-track at lg
    for (const card of Array.from(cards).slice(0, 4)) {
      expect(card.className).toContain("lg:col-span-1")
    }
    // the 4th card opens track 2 at md so the trailing pair centers under the 3-up row
    expect(cards[3].className).toContain("md:col-start-2")
    // the 5th («مؤسسي») is the deliberate full-width feature strip — not an orphan
    expect(cards[4].className).toContain("lg:col-span-4")
    expect(cards[4].className).toContain("sm:col-span-2")
    expect(cards[4].className).toContain("lg:flex-row")
  })

  it("keeps ≤4 plans on a plain balanced grid with no wide feature card", () => {
    const { container } = render(
      <PlanSelector plans={threePlans()} selectedPlan={null} onSelect={vi.fn()} onContinue={vi.fn()} />,
    )

    const grid = container.querySelector(".grid") as HTMLElement
    expect(grid.className).not.toContain("md:grid-cols-6")
    expect(grid.className).toContain("lg:grid-cols-3")

    const cards = grid.querySelectorAll("button[aria-pressed]")
    expect(cards).toHaveLength(3)
    for (const card of Array.from(cards)) {
      expect(card.className).not.toContain("col-span-4")
      expect(card.className).not.toContain("lg:flex-row")
    }
    // odd count: the trailing card fills the sm 2-up row — no half-width orphan
    expect(cards[2].className).toContain("sm:col-span-2")
  })
})

describe("PlanSelector continue CTA", () => {
  it('starts disabled with "اختر خطة أولاً" and does not continue', () => {
    const onContinue = vi.fn()
    render(<PlanSelector plans={threePlans()} selectedPlan={null} onSelect={vi.fn()} onContinue={onContinue} />)

    const cta = screen.getByRole("button", { name: /اختر خطة أولاً/ })
    expect(cta).toBeDisabled()

    fireEvent.click(cta)
    expect(onContinue).not.toHaveBeenCalled()
  })

  it('enables and names the selected plan: "متابعة مع خطة {nameAr}"', () => {
    const onContinue = vi.fn()
    render(<PlanSelector plans={threePlans()} selectedPlan={2} onSelect={vi.fn()} onContinue={onContinue} />)

    const cta = screen.getByRole("button", { name: /متابعة مع خطة الأساسية/ })
    expect(cta).toBeEnabled()

    fireEvent.click(cta)
    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})
