/**
 * v17-E-F11 (D2-P2) — useCountUp contract (the unified count-up engine).
 *
 * Pinned behaviors:
 *  - reduced motion → the target value is returned immediately, no frames
 *    are ever scheduled (the pre-unification KpiCard + StatsSection rule);
 *  - a value change re-tweens FROM the current display (never resets to 0)
 *    over the single 800ms easeOutCubic curve;
 *  - `paused` holds the counter and schedules no frames (StatsSection's
 *    in-view gate), releasing it resumes the count.
 *
 * rAF harness: jsdom's requestAnimationFrame is stubbed so frames are
 * QUEUED, then pumped manually with a fake performance.now() clock — every
 * intermediate state is observable without real timing. The matchMedia stub
 * is the D8-verified recipe from KpiCard.test.tsx (jsdom implements no
 * matchMedia; the hook subscribes on every mount).
 */
import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useCountUp } from "./useCountUp"

/* ---------- jsdom stubs ---------- */

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

/** Queued rAF frames + a controllable clock. cancel actually removes the
 * frame (browser semantics) so the reduced-motion path can prove its
 * scheduled-but-cancelled frame never runs. */
let frames: Array<{ id: number; cb: (t: number) => void }> = []
let nextHandle = 0
let clock = 0

beforeEach(() => {
  installMatchMedia(false) // default: motion allowed, like most real visitors
  frames = []
  nextHandle = 0
  clock = 0
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
    const id = ++nextHandle
    frames.push({ id, cb })
    return id
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    const i = frames.findIndex((f) => f.id === id)
    if (i !== -1) frames.splice(i, 1)
  })
  vi.spyOn(performance, "now").mockImplementation(() => clock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Advance the fake clock by `dt` ms and run every queued frame at that time. */
function pump(dt: number) {
  clock += dt
  const queued = frames.splice(0)
  for (const { cb } of queued) cb(clock)
}

/* ---------- probe ---------- */

function Probe({ value, paused }: { value: number; paused?: boolean }) {
  const n = useCountUp(value, { paused })
  return <span data-testid="count">{n}</span>
}

const read = () => screen.getByTestId("count").textContent

/* ---------- contract ---------- */

describe("useCountUp", () => {
  it("returns the final value immediately under prefers-reduced-motion", () => {
    installMatchMedia(true)
    render(<Probe value={42} />)

    expect(read()).toBe("42")
    /* The count-up effect runs once with reduced=false (the subscription
     * reports `reduce` one commit later), schedules a frame — and the
     * re-run's cleanup must CANCEL it. With browser-faithful cancel
     * semantics nothing is left pending, so the tween never fires. */
    expect(frames.length).toBe(0)
  })

  it("counts up over the single 800ms easeOutCubic curve", () => {
    render(<Probe value={100} />)
    expect(read()).toBe("0")

    act(() => pump(400)) // progress 0.5 → eased 0.875 → 87.5 → 88
    expect(read()).toBe("88")
    act(() => pump(400)) // progress 1 → final
    expect(read()).toBe("100")
    expect(frames.length).toBe(0) // tween completed, nothing pending
  })

  it("re-tweens from the current value on change, never from zero", () => {
    const { rerender } = render(<Probe value={10} />)
    act(() => pump(800)) // 0 → 10 complete
    expect(read()).toBe("10")

    rerender(<Probe value={20} />)
    act(() => pump(400)) // 10 + (20-10) × 0.875 = 18.75 → 19
    expect(read()).toBe("19")
    act(() => pump(400))
    expect(read()).toBe("20")
  })

  it("holds the counter and schedules no frames while paused", () => {
    const { rerender } = render(<Probe value={7} paused />)
    expect(read()).toBe("0")
    expect(frames.length).toBe(0)

    rerender(<Probe value={7} />) // in-view gate opens
    act(() => pump(800))
    expect(read()).toBe("7")
  })

  it("stays at zero for a zero target (StatsSection's empty-stats case)", () => {
    render(<Probe value={0} />)
    expect(read()).toBe("0")
    expect(frames.length).toBe(0)
  })
})
