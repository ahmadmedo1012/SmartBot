/**
 * v13-E6 — ThemeToggle contract (v6+ framer-free rewrite).
 *
 * Pins the a11y-critical behaviors of the theme toggle:
 *   - Arabic aria-label that reflects the ACTION (switch to the OTHER mode)
 *   - click → setTheme with the opposite theme
 *   - the sun/moon spans swap via tt-icon-active / tt-icon-hidden classes
 *
 * next-themes is mocked with the documented vi.hoisted recipe (the real
 * provider needs a ThemeProvider context that render-only tests never
 * mount). resolvedTheme undefined must behave as light (not dark).
 *
 * Not covered (documented, per D8): the pre-mount `!mounted` branch renders
 * a placeholder div — React Testing Library's render already flushes the
 * mount effect inside act(), so the placeholder is not observable without
 * deliberately racing the effect, which is not worth the flake.
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ThemeToggle } from "./ThemeToggle"

/** vi.hoisted: the mock factory runs before imports; state lives here. */
const themeState = vi.hoisted(() => ({
  resolvedTheme: "dark" as string | undefined,
  setTheme: vi.fn<(theme: string) => void>(),
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: themeState.resolvedTheme,
    setTheme: themeState.setTheme,
  }),
}))

beforeEach(() => {
  themeState.resolvedTheme = "dark"
  themeState.setTheme.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ThemeToggle", () => {
  it('carries the Arabic aria-label "الوضع النهاري" in dark mode', () => {
    themeState.resolvedTheme = "dark"
    render(<ThemeToggle />)

    expect(screen.getByRole("button", { name: "الوضع النهاري" })).toBeInTheDocument()
  })

  it('carries the Arabic aria-label "الوضع الليلي" in light mode', () => {
    themeState.resolvedTheme = "light"
    render(<ThemeToggle />)

    expect(screen.getByRole("button", { name: "الوضع الليلي" })).toBeInTheDocument()
  })

  it("treats an undefined resolvedTheme (SSR/first paint) as light", () => {
    themeState.resolvedTheme = undefined
    render(<ThemeToggle />)

    expect(screen.getByRole("button", { name: "الوضع الليلي" })).toBeInTheDocument()
  })

  it("clicking in dark mode switches to light, and vice versa", () => {
    themeState.resolvedTheme = "dark"
    const { unmount } = render(<ThemeToggle />)
    fireEvent.click(screen.getByRole("button", { name: "الوضع النهاري" }))
    expect(themeState.setTheme).toHaveBeenCalledWith("light")
    unmount()

    themeState.resolvedTheme = "light"
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole("button", { name: "الوضع الليلي" }))
    expect(themeState.setTheme).toHaveBeenCalledWith("dark")
  })

  it("swaps the sun/moon spans via tt-icon-active / tt-icon-hidden classes", () => {
    themeState.resolvedTheme = "dark"
    const { container, unmount } = render(<ThemeToggle />)

    // first tt-icon span = sun (visible in LIGHT), second = moon (dark)
    const [sunDark, moonDark] = container.querySelectorAll<HTMLSpanElement>("span.tt-icon")
    expect(sunDark.className).toContain("tt-icon-hidden")
    expect(moonDark.className).toContain("tt-icon-active")
    // and both glyphs are the right SVGs: sun has a circle, moon a crescent path
    expect(sunDark.querySelector("circle")).not.toBeNull()
    expect(moonDark.querySelector('path[d^="M21 12.79"]')).not.toBeNull()
    unmount()

    themeState.resolvedTheme = "light"
    const { container: lightContainer } = render(<ThemeToggle />)
    const [sunLight, moonLight] = lightContainer.querySelectorAll<HTMLSpanElement>("span.tt-icon")
    expect(sunLight.className).toContain("tt-icon-active")
    expect(moonLight.className).toContain("tt-icon-hidden")
  })

  it("appends the caller className onto the toggle button", () => {
    themeState.resolvedTheme = "dark"
    render(<ThemeToggle className="mt-2 test-extra" />)

    expect(screen.getByRole("button")).toHaveClass("test-extra", "mt-2")
  })
})
