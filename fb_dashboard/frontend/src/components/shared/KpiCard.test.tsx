/**
 * v13-E6 — KpiCard contract (v11-A7 framer-free rewrite).
 *
 * CRITICAL jsdom gap (verified by D8): jsdom 27.4 implements NO matchMedia /
 * MediaQueryList, and KpiCard's reduced-motion twin calls
 * window.matchMedia('(prefers-reduced-motion: reduce)') on every mount —
 * a stub is MANDATORY or every render throws.
 *
 * Pinned behaviors: static value + suffix, optional slots (subtitle/trend/
 * sparkline), trend arrow direction + color classes, sparkline only for
 * ≥2 points, the animated counter jumping straight to the final value under
 * reduced motion, the stretched-link a[href] + sr-only pattern, and the
 * entrance stagger delay that must disappear under reduced motion.
 *
 * next/link is mocked with the documented default→anchor recipe.
 */
import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MessageCircle } from "lucide-react"

import { KpiCard } from "./KpiCard"

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

/**
 * jsdom matchMedia stub — D8-verified recipe. Implements the full
 * MediaQueryList surface KpiCard touches (matches + change listener);
 * listeners are inert no-ops because no test fires a change event.
 */
function installMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_type: string, _listener: EventListenerOrEventListenerObject) => {},
      removeEventListener: (_type: string, _listener: EventListenerOrEventListenerObject) => {},
      dispatchEvent: () => false,
    }),
  )
}

beforeEach(() => {
  // default: motion allowed (matches=false), like most real visitors
  installMatchMedia(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("KpiCard static mode", () => {
  it("renders the value with Western digits plus the suffix", () => {
    render(<KpiCard label="الردود" value={1234} icon={MessageCircle} suffix=" رد" />)

    expect(screen.getByText("1234 رد")).toBeInTheDocument()
    expect(screen.getByText("الردود")).toBeInTheDocument()
  })

  it("omits subtitle, trend and sparkline when not provided", () => {
    const { container } = render(<KpiCard label="الصفحات" value={7} icon={MessageCircle} />)

    // lucide icons ARE svgs — the sparkline is the only svg[role=img]
    expect(container.querySelector("svg[role='img']")).toBeNull()
    expect(container.querySelector(".text-2xs")).toBeNull() // no subtitle line
    expect(screen.queryByText(/↑|↓/)).toBeNull() // no trend badge
  })

  it("renders the subtitle line when provided", () => {
    render(<KpiCard label="الردود" value={10} icon={MessageCircle} subtitle="هذا الشهر" />)

    expect(screen.getByText("هذا الشهر")).toBeInTheDocument()
  })
})

describe("KpiCard trend badge", () => {
  it("marks a positive trend with ↑ and success colors", () => {
    render(<KpiCard label="الردود" value={10} icon={MessageCircle} trend={12} />)

    const badge = screen.getByText(/↑/)
    expect(badge).toHaveTextContent("↑ 12%")
    expect(badge).toHaveClass("text-success")
  })

  it("marks a negative trend with ↓ and destructive colors (absolute value)", () => {
    render(<KpiCard label="الردود" value={10} icon={MessageCircle} trend={-7} />)

    const badge = screen.getByText(/↓/)
    expect(badge).toHaveTextContent("↓ 7%")
    expect(badge).toHaveClass("text-destructive")
  })
})

describe("KpiCard sparkline gate", () => {
  it("renders no sparkline for fewer than 2 points", () => {
    const { container } = render(
      <KpiCard label="الردود" value={10} icon={MessageCircle} sparklineData={[5]} />,
    )

    expect(container.querySelector("svg[role='img']")).toBeNull()
  })

  it("renders the sparkline for 2+ points", () => {
    const { container } = render(
      <KpiCard label="الردود" value={10} icon={MessageCircle} sparklineData={[1, 5, 3]} />,
    )

    expect(container.querySelector("svg[role='img']")).not.toBeNull()
  })
})

describe("KpiCard animated counter under reduced motion", () => {
  it("skips the count-up and shows the final value immediately", () => {
    installMatchMedia(true) // prefers-reduced-motion: reduce
    render(<KpiCard label="الرسائل" value={42} icon={MessageCircle} animated />)

    // not "0" mid-animation — the reduced-motion branch sets the final value
    expect(screen.getByText("42")).toBeInTheDocument()
  })

  it("cancels the entrance stagger delay under reduced motion", () => {
    installMatchMedia(true)
    const { container, unmount } = render(
      <KpiCard label="أ" value={1} icon={MessageCircle} index={2} />,
    )
    const card = container.firstElementChild as HTMLElement
    expect(card.style.animationDelay).toBe("")
    unmount()

    // motion allowed → delay = index × 0.06s
    installMatchMedia(false)
    const motion = render(<KpiCard label="ب" value={1} icon={MessageCircle} index={2} />)
    const motionCard = motion.container.firstElementChild as HTMLElement
    expect(motionCard.style.animationDelay).toBe("0.12s")
  })
})

describe("KpiCard stretched link (a11y)", () => {
  it("turns the card into a real anchor with an sr-only label", () => {
    render(
      <KpiCard label="الردود الآلية" value={10} icon={MessageCircle} href="/dashboard/autoreply" />,
    )

    const link = screen.getByRole("link", { name: "الردود الآلية" })
    expect(link).toHaveAttribute("href", "/dashboard/autoreply")
    // stretched-link pattern: the whole card is one link target
    expect(link.className).toContain("absolute inset-0")
    // the accessible name comes from the sr-only span, visible content stays
    expect(link.querySelector("span.sr-only")).toHaveTextContent("الردود الآلية")
  })

  it("keeps the value visible inside the linked card", () => {
    render(<KpiCard label="الردود" value={99} icon={MessageCircle} href="/x" />)

    expect(screen.getByText("99")).toBeInTheDocument()
  })
})
