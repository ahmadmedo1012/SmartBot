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

afterEach(() => {
  cleanup()
})
