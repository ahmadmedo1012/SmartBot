/**
 * v17-E-F10 (D6-8) — TrendLineChart contract (خطي الاتجاه اليومي).
 *
 * Pinned behaviors:
 *  - لا بيانات → رسالة الفراغ العربية (مرآة ActivityBarChart)
 *  - summary (sr-only — v8-B14) يُعرض للمخطط بغضّ النظر عن أبعاد jsdom
 *    (الرسم نفسه داخل ResponsiveContainer ولا يُختبر داخله)
 *  - التسميات تمر كما هي (label/hint) — التحويل صفحة الاستهلاك
 *
 * jsdom gaps (D8-verified recipe from KpiCard.test.tsx + useCountUp.test.tsx):
 *  - matchMedia غير منفذة وhook الـreduced-motion يشترك عند كل تركيب
 *  - recharts ResponsiveContainer يعتمد ResizeObserver — stub لا يفعل شيئًا
 *    (jsdom حجمه 0 فلا يرسم recharts أولاده؛ لا نختبر داخل الحاوية).
 */
import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TrendLineChart } from "./TrendLineChart"

function installMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  )
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  installMatchMedia(false)
  vi.stubGlobal("ResizeObserver", ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("TrendLineChart empty state", () => {
  it("shows the Arabic empty message for zero points", () => {
    render(<TrendLineChart data={[]} />)
    expect(screen.getByText("لا توجد بيانات لعرضها")).toBeInTheDocument()
  })

  it("keeps the requested height on the empty message so layout does not jump", () => {
    render(<TrendLineChart data={[]} height={180} />)
    const empty = screen.getByText("لا توجد بيانات لعرضها")
    expect(empty).toHaveStyle({ height: "180px" })
  })
})

describe("TrendLineChart a11y summary", () => {
  it("exposes the sr-only summary beside the chart", () => {
    render(
      <TrendLineChart
        data={[{ label: "09-01", value: 3, hint: "2026-09-01" }]}
        summary="منحنى خطي للردود اليومية — إجمالي 3 ردود"
      />,
    )
    expect(
      screen.getByText("منحنى خطي للردود اليومية — إجمالي 3 ردود", {
        selector: ".sr-only",
      }),
    ).toBeInTheDocument()
  })

  it("renders no summary paragraph when none is passed", () => {
    render(<TrendLineChart data={[{ label: "09-01", value: 3 }]} />)
    expect(document.querySelector("p.sr-only")).toBeNull()
  })
})

describe("TrendLineChart rendering shell", () => {
  it("renders without throwing with single and multiple points", () => {
    expect(() =>
      render(<TrendLineChart data={[{ label: "09-01", value: 1 }]} height={160} />),
    ).not.toThrow()
    expect(() =>
      render(
        <TrendLineChart
          data={[
            { label: "09-01", value: 1 },
            { label: "09-02", value: 5 },
          ]}
        />,
      ),
    ).not.toThrow()
  })
})
