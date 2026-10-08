/**
 * v11-A5 — global vitest setup, loaded for every unit test file.
 *
 * - jest-dom matchers (toBeInTheDocument, toHaveAttribute, …) on vitest's expect.
 * - Explicit RTL cleanup after each test (vitest globals are off, so
 *   @testing-library/react cannot auto-register its own afterEach).
 *
 * No next/navigation or fetch mocking here on purpose: the first batch of
 * unit tests targets pure modules (lib/, subscribe logic) and a presentational
 * SVG component, none of which touch router or network. Add narrow mocks
 * closer to the tests that actually need them when those tests arrive.
 */
import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

/* r131-F7c: jsdom implements no matchMedia. The prefers-reduced-motion live
 * subscription is now mounted by SHARED components (KpiCard's entrance
 * stagger, useCountUp, SectionHeader), so any page render containing one
 * throws inside the effect and React 19 unmounts the whole tree — 12 tests
 * across 2 suites died this way after the F8 KpiCard anatomy pass. Inert
 * global stub (the D8-verified per-suite recipe from AdminSettingsLoadError
 * / KpiCard.test, promoted to setup): matches=false, listeners are no-ops.
 * Suites that need `matches: true` still override via vi.stubGlobal. */
function inertMatchMedia(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }
}
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = inertMatchMedia
}

afterEach(() => {
  cleanup()
})
