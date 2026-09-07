/**
 * v13-E6 — MiniSparkline GEOMETRY expansion (new file — the behavioral
 * contract lives in MiniSparkline.test.tsx, untouched).
 *
 * Pins the point-scaling math itself:
 *   - custom width/height → custom viewBox + gradient id + scaled path
 *   - flat series [7,7] → horizontal line (min clamp 0 → range 7 → top),
 *     still labeled ascending by the >= comparison
 *   - all-zero series [0,0] → the max(...data, 1) clamp lifts the ceiling
 *     to 1 so the zero baseline stays at the bottom, not the middle
 *   - negative series [-5,5] → min clamp keeps both in-frame
 *   - multi-point series → one M + N-1 L segments, closed area triangle
 *     (no fragile decimal pinning — structural assertions only)
 */
import { render } from "@testing-library/react"
import type { ReactElement } from "react"
import { describe, expect, it } from "vitest"

import { MiniSparkline } from "./MiniSparkline"

/** The app is Arabic-first: render inside an RTL container like the real DOM. */
function renderRtl(ui: ReactElement) {
  return render(<div dir="rtl">{ui}</div>)
}

/** The stroke path of the sparkline (fill="none"), like the base test file. */
function lineD(container: HTMLElement): string | null {
  return container.querySelector('path[fill="none"]')?.getAttribute("d") ?? null
}

/** The area path (gradient fill). */
function areaD(container: HTMLElement): string | null {
  return container.querySelector('path[fill^="url(#"]')?.getAttribute("d") ?? null
}

describe("MiniSparkline geometry", () => {
  it("scales into a custom width/height with a matching viewBox and gradient id", () => {
    const { container } = renderRtl(<MiniSparkline data={[0, 10]} width={100} height={40} />)

    const svg = container.querySelector("svg")
    expect(svg).toHaveAttribute("width", "100")
    expect(svg).toHaveAttribute("height", "40")
    expect(svg).toHaveAttribute("viewBox", "0 0 100 40")
    // padding 2 → chartW 96, chartH 36: first bottom-left, last top-right
    expect(lineD(container)).toBe("M 2 38 L 98 2")
    const area = container.querySelector('path[fill^="url(#"]')
    expect(area).toHaveAttribute("fill", "url(#spark-100-up)")
  })

  it("renders a flat [7,7] series as a horizontal, ascending line", () => {
    const { container } = renderRtl(<MiniSparkline data={[7, 7]} />)

    // minVal = min(7,7,0) = 0 → range 7, so the constant 7 fills the whole
    // vertical range and lands at the TOP — the meaningful contract is that
    // both endpoints share one y (a horizontal line)
    expect(lineD(container)).toMatch(/^M 2 (\S+) L 78 \1$/)
    // 7 >= 7 still counts as ascending (>= comparison)
    expect(container.querySelector("svg")).toHaveAttribute("aria-label", "اتجاه صاعد")
  })

  it("clamps the all-zero ceiling with max(...data, 1) so zeros sit on the baseline", () => {
    const { container } = renderRtl(<MiniSparkline data={[0, 0]} />)

    // without the clamp, maxVal=0= minVal → range guard; with it the zeros
    // map to the bottom of the chart instead of an arbitrary middle
    expect(lineD(container)).toBe("M 2 26 L 78 26")
    expect(container.querySelector("svg")).toHaveAttribute("aria-label", "اتجاه صاعد")
  })

  it("keeps a negative series in-frame via the min(..., 0) floor", () => {
    const { container } = renderRtl(<MiniSparkline data={[-5, 5]} />)

    // range = 10 (−5→5): first point at the bottom, last at the top
    expect(lineD(container)).toBe("M 2 26 L 78 2")
    // ascending series → success stroke
    const line = container.querySelector('path[fill="none"]')
    expect(line).toHaveAttribute("stroke", "var(--success, oklch(0.62 0.18 145))")
  })

  it("emits one M + N−1 L segments and closes the area under the line", () => {
    const { container } = renderRtl(<MiniSparkline data={[1, 2, 3, 4]} />)

    const d = lineD(container)
    expect(d).not.toBeNull()
    expect(d?.startsWith("M ")).toBe(true)
    // 4 points → exactly 3 line segments
    expect((d?.match(/ L /g) ?? []).length).toBe(3)

    // the area path is the line + the baseline triangle, closed with Z:
    //   <line> L <lastX> 26 L 2 26 Z
    const a = areaD(container)
    expect(a).not.toBeNull()
    expect(a?.startsWith(d as string)).toBe(true)
    expect(a?.endsWith("L 78 26 L 2 26 Z")).toBe(true)
  })
})
