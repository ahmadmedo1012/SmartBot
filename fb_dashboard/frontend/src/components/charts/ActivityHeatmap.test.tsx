/**
 * v17-E-F10 (D6-8) — ActivityHeatmap contract (خريطة النشاط بالساعة).
 *
 * Pinned behaviors:
 *  - تجميع خلايا الباك-إند (يوم "YYYY-MM-DD" × ساعة UTC) إلى شبكة
 *    أيام-الأسبوع (٧ صفوف) × ٢٤ ساعة، بتاريخ UTC (getUTCDay) — الخلايا
 *    من أيام مختلفة بنفس اليوم/الساعة تُجمع
 *  - tooltip الخلية عربي عبر countPhrase: "الثلاثاء 14:00 — 5 ردود"
 *    (والمثنى: "— ردين")
 *  - صف عناوين الساعات يعرض 0/6/12/18 فقط (الباقي فراغ منع الازدحام)
 *  - لا بيانات (أو كل الأصفار) → رسالة فراغ عربية
 *  - summary (sr-only — v8-B14) يُعرض لقارئ الشاشة
 *
 * مواعيد مرجعية محسوبة لـUTC: 2026-09-08 ثلاثاء · 2026-09-07 اثنين.
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ActivityHeatmap, WEEKDAY_LABELS } from "./ActivityHeatmap"

function cell(hour: number, day: string, count: number) {
  return { hour, day, count }
}

describe("ActivityHeatmap aggregation", () => {
  it("maps a UTC cell to its weekday row and hour column with an Arabic countPhrase tooltip", () => {
    render(<ActivityHeatmap cells={[cell(14, "2026-09-08", 5)]} />)

    // 2026-09-08 is a Tuesday → the Tuesday cell at 14:00 carries the tooltip
    const tuesdayCell = document.querySelector<HTMLElement>(
      'div[title^="الثلاثاء 14:00"]',
    )
    expect(tuesdayCell).not.toBeNull()
    expect(tuesdayCell?.getAttribute("title")).toBe("الثلاثاء 14:00 — 5 ردود")
  })

  it("sums cells that land on the same weekday+hour from different dates", () => {
    render(<ActivityHeatmap cells={[cell(9, "2026-09-07", 3), cell(9, "2026-09-14", 2)]} />)

    const mondayCell = document.querySelector<HTMLElement>('div[title^="الاثنين 9:00"]')
    expect(mondayCell?.getAttribute("title")).toBe("الاثنين 9:00 — 5 ردود")
  })

  it("uses the Arabic dual form for a count of 2", () => {
    render(<ActivityHeatmap cells={[cell(20, "2026-09-08", 2)]} />)

    expect(
      document.querySelector<HTMLElement>('div[title="الثلاثاء 20:00 — ردين"]'),
    ).not.toBeNull()
  })

  it("renders all 7 weekday rows in getUTCDay order", () => {
    const { container } = render(<ActivityHeatmap cells={[cell(1, "2026-09-08", 1)]} />)

    const rowKeys = WEEKDAY_LABELS.map((w) => `[title="${w}"]`)
    // one label span per weekday row (the row container is keyed by weekday)
    for (const key of rowKeys) {
      expect(container.querySelectorAll(key).length).toBeGreaterThan(0)
    }
    // hour header labels: 0, 6, 12, 18 visible; 3 is blank
    expect(screen.getByText("0")).toBeInTheDocument()
    expect(screen.getByText("6")).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
    expect(screen.getByText("18")).toBeInTheDocument()
    expect(screen.queryByText("3")).toBeNull()
  })

  it("lays the grid out LTR so hours read left→right like the recharts X axis", () => {
    const { container } = render(<ActivityHeatmap cells={[cell(1, "2026-09-08", 1)]} />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.getAttribute("dir")).toBe("ltr")
  })
})

describe("ActivityHeatmap empty state", () => {
  it("shows the Arabic empty message for zero cells", () => {
    render(<ActivityHeatmap cells={[]} />)
    expect(screen.getByText("لا توجد بيانات لعرضها")).toBeInTheDocument()
  })

  it("shows the same empty message when every cell counts zero", () => {
    render(<ActivityHeatmap cells={[cell(14, "2026-09-08", 0)]} />)
    expect(screen.getByText("لا توجد بيانات لعرضها")).toBeInTheDocument()
  })
})

describe("ActivityHeatmap a11y summary", () => {
  it("exposes the sr-only summary to screen readers", () => {
    render(
      <ActivityHeatmap cells={[cell(14, "2026-09-08", 5)]} summary="خريطة كثافة الردود" />,
    )
    expect(screen.getByText("خريطة كثافة الردود", { selector: ".sr-only" })).toBeInTheDocument()
  })

  it("renders no summary paragraph when none is passed", () => {
    render(<ActivityHeatmap cells={[cell(14, "2026-09-08", 5)]} />)
    expect(document.querySelector("p.sr-only")).toBeNull()
  })
})
