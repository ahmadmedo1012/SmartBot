/**
 * v13-E6 — PageHeader contract (v6+ framer-free page header).
 *
 * Pins the shared dashboard header slots: h1 + icon tile, the four status
 * badge tones (neutral default), breadcrumb structure (link for non-last,
 * aria-current="page" for the last, one chevron separator between crumbs),
 * the compact height switch, and the subtitle/actions slots.
 *
 * next/link is mocked with the documented safe recipe (default export →
 * plain anchor) so the header renders without a Next router context.
 */
import type { ReactNode } from "react"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Star } from "lucide-react"

import { PageHeader } from "./PageHeader"

vi.mock("next/link", () => ({
  default: function MockLink({
    href,
    className,
    children,
  }: {
    href: string
    className?: string
    children: ReactNode
  }) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    )
  },
}))

describe("PageHeader", () => {
  it("renders the h1 title with the icon tile beside it", () => {
    render(<PageHeader icon={<Star data-testid="page-icon" />} title="التحليلات" />)

    expect(screen.getByRole("heading", { level: 1, name: "التحليلات" })).toBeInTheDocument()
    // the icon lands inside its gradient tile (size-8), not floating
    const tile = document.querySelector("header div.size-8")
    expect(tile).not.toBeNull()
    expect(within(tile as HTMLElement).getByTestId("page-icon")).toBeInTheDocument()
  })

  it("renders without an icon tile when none is passed", () => {
    render(<PageHeader title="الإعدادات" />)

    expect(document.querySelector("header div.size-8")).toBeNull()
    expect(screen.getByRole("heading", { name: "الإعدادات" })).toBeInTheDocument()
  })

  it("maps the four status tones to their color classes, defaulting to neutral", () => {
    const cases = [
      { tone: "success", label: "نشط", cls: "bg-success-soft text-success border-success/20" },
      { tone: "warning", label: "تنبيه", cls: "bg-warning-soft text-warning border-warning/20" },
      { tone: "danger", label: "متوقف", cls: "bg-destructive-soft text-destructive border-destructive/20" },
    ] as const
    for (const c of cases) {
      const { unmount } = render(
        <PageHeader title="أ" status={{ label: c.label, tone: c.tone }} />,
      )
      expect(screen.getByText(c.label)).toHaveClass(...c.cls.split(" "))
      unmount()
    }

    // no tone → neutral
    render(<PageHeader title="ب" status={{ label: "عادي" }} />)
    expect(screen.getByText("عادي")).toHaveClass(
      "bg-muted",
      "text-muted-foreground",
      "border-border/60",
    )
  })

  it("renders breadcrumbs: link for non-last, aria-current=page for last, one chevron between", () => {
    render(
      <PageHeader
        title="الفواتير"
        breadcrumbs={[
          { label: "لوحة التحكم", href: "/dashboard" },
          { label: "الفواتير" },
        ]}
      />,
    )

    const nav = screen.getByRole("navigation", { name: "مسار التنقل" })
    // non-last crumb with href → a real link
    const link = within(nav).getByRole("link", { name: "لوحة التحكم" })
    expect(link).toHaveAttribute("href", "/dashboard")
    // last crumb → plain span flagged as the current page
    const current = within(nav).getByText("الفواتير", { selector: "span" })
    expect(current).toHaveAttribute("aria-current", "page")
    // exactly ONE chevron separator between two crumbs
    expect(nav.querySelectorAll("svg").length).toBe(1)
  })

  it("switches the bar height min-h-14 → min-h-12 in compact mode", () => {
    /* v24-R2 (B4 P4): the height moved from the outer padding wrapper (fixed
     * h-12/h-14 — clipped 200%-zoom text) to the inner flex row as min-h —
     * same 48/56px visual, but the row GROWS when zoomed text wraps. */
    const { container, unmount } = render(<PageHeader title="أ" compact />)
    const row = container.querySelector("header > div > div") as HTMLElement
    expect(row).toHaveClass("min-h-12")
    expect(row).not.toHaveClass("h-12")
    unmount()

    const regular = render(<PageHeader title="ب" />)
    const regularRow = regular.container.querySelector("header > div > div") as HTMLElement
    expect(regularRow).toHaveClass("min-h-14")
    expect(regularRow).not.toHaveClass("h-14")
  })

  it("renders the subtitle and actions slots", () => {
    render(
      <PageHeader
        title="الجمهور"
        subtitle="آخر 30 يومًا"
        actions={<div data-testid="header-actions">إجراء</div>}
      />,
    )

    expect(screen.getByText("آخر 30 يومًا")).toBeInTheDocument()
    expect(screen.getByTestId("header-actions")).toBeInTheDocument()
  })

  it("appends the caller className onto the header element", () => {
    const { container } = render(<PageHeader title="أ" className="test-header-extra" />)

    expect(container.querySelector("header")).toHaveClass("test-header-extra")
  })
})
