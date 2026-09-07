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
})

describe("ErrorState", () => {
  it("defaults to the fixed Arabic title and message", () => {
    render(<ErrorState />)

    expect(screen.getByText("حدث خطأ")).toBeInTheDocument()
    expect(screen.getByText("تعذر الاتصال، تحقق من الإنترنت")).toBeInTheDocument()
  })

  it("renders a retry button only when onRetry is provided, and wires it", () => {
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} />)

    const retry = screen.getByRole("button", { name: "إعادة المحاولة" })
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("renders no retry affordance without onRetry", () => {
    render(<ErrorState title="فشل التحميل" />)

    expect(screen.getByText("فشل التحميل")).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })
})

describe("LoadingState", () => {
  it("renders 3 pulsing skeleton rows by default", () => {
    const { container } = render(<LoadingState />)

    const rows = container.querySelectorAll("div.animate-pulse")
    expect(rows.length).toBe(3)
    // each row has the size-10 avatar tile + two text bars
    expect(container.querySelectorAll("div.size-10").length).toBe(3)
  })

  it("honors a custom row count", () => {
    const { container } = render(<LoadingState count={5} />)

    expect(container.querySelectorAll("div.animate-pulse").length).toBe(5)
  })
})
