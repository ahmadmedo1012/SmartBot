/**
 * v11-A5 — the first @testing-library/react component test.
 *
 * Target chosen deliberately: MiniSparkline is a pure presentational SVG
 * with real logic (point scaling, trend direction, empty guard) and no
 * router/network deps — no heavy mocks needed.
 *
 * "RTL" here means double duty: React Testing Library AND right-to-left —
 * every render is wrapped in dir="rtl" because this dashboard is
 * Arabic-first, so components must render correctly in an RTL context.
 */
import { render } from "@testing-library/react"
import type { ReactElement } from "react"
import { describe, expect, it } from "vitest"

import { MiniSparkline } from "./MiniSparkline"

/** The app is Arabic-first: render inside an RTL container like the real DOM. */
function renderRtl(ui: ReactElement) {
  return render(<div dir="rtl">{ui}</div>)
}

describe("MiniSparkline", () => {
  it("renders nothing for fewer than 2 data points", () => {
    const { container } = renderRtl(<MiniSparkline data={[5]} />)
    // the RTL wrapper div stays, but must have no children rendered into it
    expect(container.firstElementChild).toBeEmptyDOMElement()
    const { container: empty } = renderRtl(<MiniSparkline data={[]} />)
    expect(empty.firstElementChild).toBeEmptyDOMElement()
  })

  it("labels an uptrend with the Arabic ascending label and success stroke", () => {
    const { container } = renderRtl(<MiniSparkline data={[1, 5]} />)
    const svg = container.querySelector("svg")
    expect(svg).toHaveAttribute("role", "img")
    expect(svg).toHaveAttribute("aria-label", "اتجاه صاعد")
    const line = svg?.querySelector('path[fill="none"]')
    expect(line).toHaveAttribute("stroke", "var(--success, oklch(0.62 0.18 145))")
  })

  it("labels a downtrend with the Arabic descending label and destructive stroke", () => {
    const { container } = renderRtl(<MiniSparkline data={[5, 1]} />)
    const svg = container.querySelector("svg")
    expect(svg).toHaveAttribute("aria-label", "اتجاه هابط")
    const line = svg?.querySelector('path[fill="none"]')
    expect(line).toHaveAttribute("stroke", "var(--destructive, oklch(0.6 0.22 25))")
    // the area gradient id flips with the trend direction
    const area = svg?.querySelector('path[fill^="url(#"]')
    expect(area).toHaveAttribute("fill", "url(#spark-80-dn)")
  })

  it("scales points into the padded viewBox and keeps default 80×28 dimensions", () => {
    const { container } = renderRtl(<MiniSparkline data={[0, 10]} />)
    const svg = container.querySelector("svg")
    expect(svg).toHaveAttribute("width", "80")
    expect(svg).toHaveAttribute("height", "28")
    expect(svg).toHaveAttribute("viewBox", "0 0 80 28")
    // padding 2 → chartW 76, chartH 24: first point bottom-left, last top-right
    const line = svg?.querySelector('path[fill="none"]')
    expect(line).toHaveAttribute("d", "M 2 26 L 78 2")
  })
})
