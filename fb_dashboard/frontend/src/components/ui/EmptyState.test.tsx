/**
 * v13-E6 — EmptyState / ErrorState / LoadingState contracts.
 *
 * These three presentational states carry the dashboard's Arabic empty/
 * error/loading language. Pinned here:
 *   - EmptyState: title/description/icon slots, icon precedence over
 *     iconNode, action + secondaryAction wiring, the three size paddings
 *   - ErrorState: the fixed Arabic defaults + conditional retry CTA
 *   - LoadingState: 3 skeleton rows by default, `count` when given
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Star } from "lucide-react"

import { EmptyState, ErrorState, LoadingState } from "./EmptyState"

describe("EmptyState", () => {
  it("renders the title alone with no description or buttons", () => {
    render(<EmptyState title="لا رسائل بعد" />)

    expect(screen.getByText("لا رسائل بعد")).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
    // no description paragraph was requested → nothing muted rendered
    expect(document.querySelectorAll("p.text-muted-foreground").length).toBe(0)
  })

  it("renders the icon tile and the description when provided", () => {
    render(<EmptyState icon={Star} title="لا بيانات" description="ستظهر النتائج لاحقًا" />)

    expect(screen.getByText("لا بيانات")).toBeInTheDocument()
    expect(screen.getByText("ستظهر النتائج لاحقًا")).toBeInTheDocument()
    // md default icon tile size on the lucide svg
    expect(document.querySelector("svg.size-14")).not.toBeNull()
  })

  it("prefers the lucide icon over iconNode when both are passed", () => {
    render(
      <EmptyState
        icon={Star}
        iconNode={<svg data-testid="custom-node" viewBox="0 0 24 24" />}
        title="عنوان"
      />,
    )

    expect(screen.queryByTestId("custom-node")).toBeNull()
    expect(document.querySelector("svg.size-14")).not.toBeNull()
  })

  it("renders iconNode when no lucide icon is passed", () => {
    render(
      <EmptyState
        iconNode={<svg data-testid="custom-node" viewBox="0 0 24 24" />}
        title="عنوان"
      />,
    )

    expect(screen.getByTestId("custom-node")).not.toBeNull()
  })

  it("fires both action spies on click", () => {
    const primary = vi.fn()
    const secondary = vi.fn()
    render(
      <EmptyState
        title="لا صفحات"
        action={{ label: "إنشاء صفحة", onClick: primary }}
        secondaryAction={{ label: "معرفة المزيد", onClick: secondary, variant: "ghost" }}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "إنشاء صفحة" }))
    expect(primary).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "معرفة المزيد" }))
    expect(secondary).toHaveBeenCalledTimes(1)
  })

  it("does not render the secondary action without a primary action", () => {
    render(
      <EmptyState title="لا صفحات" secondaryAction={{ label: "معرفة المزيد", onClick: vi.fn() }} />,
    )

    // secondary is nested inside the action block — no primary, no buttons
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("maps sm/md/lg to py-12 / py-16 / py-20 wrapper paddings", () => {
    const { container, unmount } = render(<EmptyState title="أ" size="sm" />)
    expect(container.firstElementChild).toHaveClass("py-12")
    unmount()

    const md = render(<EmptyState title="ب" size="md" />)
    expect(md.container.firstElementChild).toHaveClass("py-16")
    md.unmount()

    const lg = render(<EmptyState title="ج" size="lg" />)
    expect(lg.container.firstElementChild).toHaveClass("py-20")
  })

  /* phase6 r154 (P6-2-d1): the machine grammar — the ONE robot (RobotMark)
   * hosts the icon well: idle by default on icon-less calls, a pinned
   * RobotState when asked, always decorative (aria-hidden) with the
   * title/description carrying the semantics. */
  describe("robot register", () => {
    it("an icon-less call defaults to the idle robot in the well", () => {
      const { container } = render(<EmptyState title="لا بيانات" />)

      // RobotMark renders inside the petrol well tile at the md size
      const well = container.querySelector("div.bg-\\(--c-grey-bg\\)") as HTMLElement
      expect(well).not.toBeNull()
      const robot = well?.querySelector("svg")
      expect(robot).not.toBeNull()
      // decorative: the title/desc carry the meaning
      expect(robot).toHaveAttribute("aria-hidden", "true")
      expect(screen.getByText("لا بيانات")).toBeInTheDocument()
    })

    it("robot=true pins the idle register; an explicit icon still wins", () => {
      const { container, unmount } = render(<EmptyState title="أ" robot />)
      // no lucide svg (Star) — the robot svg is the well glyph
      expect(container.querySelectorAll("svg")).toHaveLength(1)
      unmount()

      // explicit icon beats the robot (domain glyphs stay)
      const withIcon = render(<EmptyState icon={Star} title="ب" robot />)
      const withIconWell = withIcon.container.querySelector("div.bg-\\(--c-grey-bg\\)") as HTMLElement
      const lucide = withIconWell?.querySelector("svg")
      expect(lucide).toBeInTheDocument()
      // one svg in the well — the lucide glyph, not the robot
      expect(withIconWell?.querySelectorAll("svg")).toHaveLength(1)
    })

    it('robot="greeting" pins the greeting register (state machine)', () => {
      const { container } = render(<EmptyState title="أ" robot="greeting" />)

      // the greeting state renders its wave path — presence of any svg
      // with the state machine is pinned by parity; here we pin the wire:
      // the robot renders at all and stays decorative
      const robot = container.querySelector("svg")
      expect(robot).not.toBeNull()
      expect(robot).toHaveAttribute("aria-hidden", "true")
    })
  })
})

describe("ErrorState", () => {
  it("defaults to the fixed Arabic title and message", () => {
    render(<ErrorState />)

    expect(screen.getByText("حدث خطأ")).toBeInTheDocument()
    expect(screen.getByText("تعذّر الاتصال، تحقق من الإنترنت")).toBeInTheDocument()
  })

  it("renders a retry button only when onRetry is provided, and wires it", () => {
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} />)

    const retry = screen.getByRole("button", { name: "إعادة المحاولة" })
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("renders no retry affordance without onRetry", () => {
    render(<ErrorState title="تعذّر التحميل" />)

    expect(screen.getByText("تعذّر التحميل")).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })
})

describe("LoadingState", () => {
  it("renders 3 skeleton shimmer rows by default", () => {
    const { container } = render(<LoadingState />)

    /* r131-F7c: the rows ride .skeleton (F7b swap) — count the size-10
       avatar wells (one per row); the old div.animate-pulse queries went
       stale when the pulse-blink idiom retired. */
    const rows = container.querySelectorAll("div.skeleton.size-10")
    expect(rows.length).toBe(3)
    // each row has the size-10 avatar tile + two text bars
    expect(container.querySelectorAll("div.skeleton").length).toBe(9)
  })

  it("honors a custom row count", () => {
    const { container } = render(<LoadingState count={5} />)

    expect(container.querySelectorAll("div.skeleton.size-10").length).toBe(5)
  })
})
