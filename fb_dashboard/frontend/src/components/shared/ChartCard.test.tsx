/**
 * v13-E6 — ChartCard contract (ported Smart-Menu chart wrapper).
 *
 * Pins the four body states and the header slots:
 *   - default: title/description/children
 *   - loading: aria-busy skeleton + sr-only announcement
 *   - error: message + conditional retry button
 *   - empty: EmptyState with the caller's custom titles
 * plus the sr-only summary that screen readers get before the chart.
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { BarChart3 } from "lucide-react"

import { ChartCard } from "./ChartCard"

describe("ChartCard header", () => {
  it("renders the title, description, icon and children", () => {
    render(
      <ChartCard title="نمو الردود" description="آخر 30 يومًا" icon={BarChart3}>
        <div data-testid="chart-body">الرسم</div>
      </ChartCard>,
    )

    expect(screen.getByRole("heading", { name: "نمو الردود" })).toBeInTheDocument()
    expect(screen.getByText("آخر 30 يومًا")).toBeInTheDocument()
    expect(screen.getByTestId("chart-body")).toBeInTheDocument()
    expect(document.querySelector("svg")).not.toBeNull() // the lucide header icon
  })

  it("appends the caller className onto the section", () => {
    const { container } = render(
      <ChartCard title="أ" className="test-chart-extra">
        <div>body</div>
      </ChartCard>,
    )

    expect(container.querySelector("section")).toHaveClass("test-chart-extra")
  })
})

describe("ChartCard loading state", () => {
  it("renders an aria-busy skeleton with an sr-only announcement", () => {
    render(
      <ChartCard title="أ" loading>
        <div data-testid="chart-body">never</div>
      </ChartCard>,
    )

    const busy = document.querySelector("div[aria-busy='true']")
    expect(busy).not.toBeNull()
    expect(busy).toHaveAttribute("aria-label", "جارٍ تحميل الرسم البياني")
    expect(screen.getByText("جارٍ التحميل", { selector: ".sr-only" })).toBeInTheDocument()
    // children are NOT rendered while loading
    expect(screen.queryByTestId("chart-body")).toBeNull()
  })
})

describe("ChartCard error state", () => {
  it("shows the error message with a retry button when onRetry is provided", () => {
    const onRetry = vi.fn()
    render(
      <ChartCard title="أ" error="تعذر تحميل البيانات" onRetry={onRetry}>
        <div data-testid="chart-body">never</div>
      </ChartCard>,
    )

    expect(screen.getByText("تعذر تحميل البيانات")).toBeInTheDocument()
    expect(screen.queryByTestId("chart-body")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("renders no retry button without onRetry", () => {
    render(<ChartCard title="أ" error="تعذر تحميل البيانات">x</ChartCard>)

    expect(screen.queryByRole("button")).toBeNull()
  })
})

describe("ChartCard empty state", () => {
  it("falls back to EmptyState with the caller's custom titles", () => {
    render(
      <ChartCard title="أ" empty emptyTitle="لا رسائل بعد" emptyDescription="أرسل أول رسالة">
        <div data-testid="chart-body">never</div>
      </ChartCard>,
    )

    expect(screen.getByText("لا رسائل بعد")).toBeInTheDocument()
    expect(screen.getByText("أرسل أول رسالة")).toBeInTheDocument()
    expect(screen.queryByTestId("chart-body")).toBeNull()
  })

  it('defaults the empty copy to "لا توجد بيانات بعد" / "ستظهر النتائج هنا بعد أول التفاعلات."', () => {
    render(<ChartCard title="أ" empty>x</ChartCard>)

    expect(screen.getByText("لا توجد بيانات بعد")).toBeInTheDocument()
    expect(screen.getByText("ستظهر النتائج هنا بعد أول التفاعلات.")).toBeInTheDocument()
  })
})

describe("ChartCard summary", () => {
  it("exposes the summary only to screen readers, beside the children", () => {
    render(
      <ChartCard title="أ" summary="إجمالي 100 رد هذا الشهر">
        <div data-testid="chart-body">الرسم</div>
      </ChartCard>,
    )

    const srSummary = screen.getByText("إجمالي 100 رد هذا الشهر", { selector: ".sr-only" })
    expect(srSummary).toBeInTheDocument()
    expect(screen.getByTestId("chart-body")).toBeInTheDocument()
  })

  it("renders no summary paragraph when none is passed", () => {
    render(<ChartCard title="أ">x</ChartCard>)

    expect(document.querySelector("p.sr-only")).toBeNull()
  })
})
