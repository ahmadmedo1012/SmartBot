/**
 * v13-E6 — StepIndicator contract (ported Smart-Menu wizard indicator).
 *
 * Pins the two-step subscribe flow: pure stepIndex mapping, numbered
 * gradient nodes with Arabic labels, aria-current="step" on the active
 * node, click-to-navigate-back only on done/active nodes (the future node
 * is disabled), MotionCheck replacing the number on completed nodes, and
 * the connector that fills after the first step.
 */
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { StepIndicator, stepIndex } from "./StepIndicator"

const PLAN_BTN = "الانتقال إلى خطوة اختر الخطة"
const REVIEW_BTN = "الانتقال إلى خطوة المراجعة والدفع"

describe("stepIndex (pure)", () => {
  it("maps plan → 0 and review → 1", () => {
    expect(stepIndex("plan")).toBe(0)
    expect(stepIndex("review")).toBe(1)
  })
})

describe("StepIndicator rendering", () => {
  it("renders the two Arabic labels and numbered nodes in order", () => {
    render(<StepIndicator current="plan" />)

    const nav = screen.getByRole("navigation", { name: "خطوات الاشتراك" })
    expect(within(nav).getByText("اختر الخطة")).toBeInTheDocument()
    expect(within(nav).getByText("المراجعة والدفع")).toBeInTheDocument()

    const planNode = screen.getByRole("button", { name: PLAN_BTN })
    const reviewNode = screen.getByRole("button", { name: REVIEW_BTN })
    // numbered nodes: 1 then 2 (Western digits)
    expect(within(planNode).getByText("1")).toBeInTheDocument()
    expect(within(reviewNode).getByText("2")).toBeInTheDocument()
    expect(nav.compareDocumentPosition(planNode as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("marks the active node with aria-current=step and disables the other", () => {
    render(<StepIndicator current="plan" />)

    const planNode = screen.getByRole("button", { name: PLAN_BTN })
    const reviewNode = screen.getByRole("button", { name: REVIEW_BTN })

    expect(planNode).toHaveAttribute("aria-current", "step")
    expect(planNode).toBeEnabled()
    expect(planNode).not.toHaveAttribute("aria-disabled")

    // the future step is not clickable yet
    expect(reviewNode).toBeDisabled()
    expect(reviewNode).toHaveAttribute("aria-disabled", "true")
    expect(reviewNode).not.toHaveAttribute("aria-current")
  })
})

describe("StepIndicator navigation", () => {
  it("renders MotionCheck (not the number) on the done plan node at review", () => {
    render(<StepIndicator current="review" />)

    const planNode = screen.getByRole("button", { name: PLAN_BTN })
    // done node → check glyph instead of the number 1
    expect(within(planNode).queryByText("1")).toBeNull()
    expect(planNode.querySelector("svg")).not.toBeNull()
    // the review node keeps its number 2
    const reviewNode = screen.getByRole("button", { name: REVIEW_BTN })
    expect(within(reviewNode).getByText("2")).toBeInTheDocument()
  })

  it("navigates back via onNavigate only from a done/active node", () => {
    const onNavigate = vi.fn()
    render(<StepIndicator current="review" onNavigate={onNavigate} />)

    // done plan node → clickable, reports the step name
    fireEvent.click(screen.getByRole("button", { name: PLAN_BTN }))
    expect(onNavigate).toHaveBeenCalledWith("plan")
    expect(onNavigate).toHaveBeenCalledTimes(1)

    // the ACTIVE review node is also clickable (re-select current step)
    fireEvent.click(screen.getByRole("button", { name: REVIEW_BTN }))
    expect(onNavigate).toHaveBeenCalledWith("review")
    expect(onNavigate).toHaveBeenCalledTimes(2)
  })

  it("never navigates from the disabled future node", () => {
    const onNavigate = vi.fn()
    render(<StepIndicator current="plan" onNavigate={onNavigate} />)

    fireEvent.click(screen.getByRole("button", { name: REVIEW_BTN }))
    expect(onNavigate).not.toHaveBeenCalled()
  })
})

describe("StepIndicator mobile density (v18-1e)", () => {
  it("keeps both step labels visible at every breakpoint — no hidden class", () => {
    render(<StepIndicator current="plan" />)

    const planNode = screen.getByRole("button", { name: PLAN_BTN })
    const label = within(planNode).getByText("اختر الخطة")
    // labels used to hide below sm — two bare circles with no step context
    expect(label.className).not.toContain("hidden")
    expect(label.className).toContain("text-2xs")
    expect(label.className).toContain("sm:text-xs")
  })

  it("guarantees a 44px tap target on every step button (min-w-11)", () => {
    render(<StepIndicator current="plan" />)

    for (const name of [PLAN_BTN, REVIEW_BTN]) {
      expect(screen.getByRole("button", { name }).className).toContain("min-w-11")
    }
  })

  it("centers the connector on the node row (mt-5 on the 40px node)", () => {
    const { container } = render(<StepIndicator current="plan" />)
    const nav = container.querySelector("nav") as HTMLElement
    const connector = (nav.firstElementChild as HTMLElement).lastElementChild as HTMLElement
    expect(connector.className).toContain("mt-5")
  })
})

describe("StepIndicator connector", () => {
  it("fills with bg-accent-foreground/50 once the first step is done", () => {
    const { container, unmount } = render(<StepIndicator current="review" />)
    const nav = container.querySelector("nav") as HTMLElement
    // the connector is the trailing sibling of the first step's button
    const connector = (nav.firstElementChild as HTMLElement).lastElementChild as HTMLElement
    expect(connector.className).toContain("bg-accent-foreground/50")
    unmount()

    const early = render(<StepIndicator current="plan" />)
    const earlyNav = early.container.querySelector("nav") as HTMLElement
    const earlyConnector = (earlyNav.firstElementChild as HTMLElement).lastElementChild as HTMLElement
    expect(earlyConnector.className).toContain("bg-muted-foreground/15")
  })
})
