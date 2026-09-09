/**
 * v18-1-e — FloatingWhatsApp contract.
 *
 * Pins the mobile-safe positioning (safe-area bottom offset, ≥16px
 * inline-end inset, 56px target, z-[60] toast layer) and the
 * modal-dialog rule: the FAB sits one z-layer ABOVE dialogs (z-50) per
 * z-index-scale.md, so it unmounts while any OPEN [role="dialog"] is in
 * the DOM — it can never cover the payment dialog or its «ادفع الآن»
 * CTA, and the link leaves the Tab order while the dialog's focus trap
 * is active. It returns when the dialog closes. Always-mounted shells
 * that gate themselves with aria-hidden (Header's mobile menu,
 * MobileBottomNav's sheet) must NOT trigger the hide.
 */
import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import FloatingWhatsApp from "./FloatingWhatsApp"
import type { ConfigState } from "@/hooks/useConfig"

vi.mock("@/hooks/useConfig", () => ({
  useConfig: (): ConfigState => ({ config: {}, loaded: true, error: null }),
}))

const LINK_NAME = /واتساب/

/** An open dialog node, as a Base UI portal would mount one. */
function mountOpenDialog(): HTMLElement {
  const el = document.createElement("div")
  el.setAttribute("role", "dialog")
  document.body.appendChild(el)
  return el
}

describe("FloatingWhatsApp positioning", () => {
  it("renders the fallback WhatsApp link with mobile-safe classes", () => {
    render(<FloatingWhatsApp />)

    const link = screen.getByRole("link", { name: LINK_NAME })
    expect(link).toHaveAttribute("href", "https://wa.me/218910089975")
    expect(link).toHaveAttribute("target", "_blank")
    // safe-area bottom + 16px inset, 56px target, toast layer
    expect(link.className).toContain("bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)]")
    expect(link.className).toContain("end-[max(1rem,env(safe-area-inset-left,0px))]")
    expect(link.className).toContain("size-14")
    expect(link.className).toContain("z-[60]")
  })
})

describe("FloatingWhatsApp vs modal dialogs", () => {
  it("hides while an open dialog is mounted and returns when it closes", async () => {
    render(<FloatingWhatsApp />)
    expect(screen.getByRole("link", { name: LINK_NAME })).toBeInTheDocument()

    const dialog = mountOpenDialog()
    await waitFor(() => expect(screen.queryByRole("link", { name: LINK_NAME })).toBeNull())

    dialog.remove()
    await waitFor(() => expect(screen.getByRole("link", { name: LINK_NAME })).toBeInTheDocument())
  })

  it("stays hidden while a shell is open, and returns when it flips to aria-hidden", async () => {
    render(<FloatingWhatsApp />)

    // Header's mobile menu pattern: the dialog node stays mounted and
    // toggles aria-hidden instead of unmounting.
    const shell = mountOpenDialog()
    await waitFor(() => expect(screen.queryByRole("link", { name: LINK_NAME })).toBeNull())

    shell.setAttribute("aria-hidden", "true")
    await waitFor(() => expect(screen.getByRole("link", { name: LINK_NAME })).toBeInTheDocument())

    shell.remove()
  })

  it("never hides for a closed (aria-hidden) shell from the start", async () => {
    render(<FloatingWhatsApp />)

    const shell = document.createElement("div")
    shell.setAttribute("role", "dialog")
    shell.setAttribute("aria-hidden", "true")
    document.body.appendChild(shell)

    // one observer round-trip must keep the FAB mounted
    await waitFor(() => expect(screen.getByRole("link", { name: LINK_NAME })).toBeInTheDocument())
    shell.remove()
  })
})
