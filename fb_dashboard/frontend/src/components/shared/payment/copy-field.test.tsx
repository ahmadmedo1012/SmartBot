/**
 * v13-E6 — copy-to-clipboard primitives contract (v11-A3 extraction).
 *
 * CopyIconButton is THE icon-only control that the a11y gate polices —
 * callers MUST pass title/ariaLabel, and this file pins that the attributes
 * actually land on the DOM button and that clicks fire onCopy.
 * CopyRow pins the bank-row layout: Arabic label + LTR mono value + a copy
 * button whose accessible name is "نسخ {label}" and which copies the value.
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CopyIconButton, CopyRow } from "./copy-field"

describe("CopyIconButton", () => {
  it("passes the caller title/aria-label onto the icon-only button (a11y gate)", () => {
    render(<CopyIconButton onCopy={vi.fn()} title="نسخ الرقم" ariaLabel="نسخ رقم المحفظة" />)

    const btn = screen.getByRole("button", { name: "نسخ رقم المحفظة" })
    expect(btn).toHaveAttribute("title", "نسخ الرقم")
    expect(btn).toHaveAttribute("aria-label", "نسخ رقم المحفظة")
  })

  it("fires onCopy when clicked", () => {
    const onCopy = vi.fn()
    render(<CopyIconButton onCopy={onCopy} title="نسخ" ariaLabel="نسخ" />)

    fireEvent.click(screen.getByRole("button", { name: "نسخ" }))
    expect(onCopy).toHaveBeenCalledTimes(1)
  })

  it("accepts custom container/icon classes for layout variants", () => {
    render(
      <CopyIconButton
        onCopy={vi.fn()}
        title="نسخ"
        ariaLabel="نسخ"
        className="test-copy-btn"
        iconClassName="test-copy-icon"
      />,
    )

    expect(screen.getByRole("button", { name: "نسخ" })).toHaveClass("test-copy-btn")
    expect(document.querySelector("div.test-copy-icon")).not.toBeNull()
  })
})

describe("CopyRow", () => {
  it("renders the Arabic label and the LTR monospace value", () => {
    render(<CopyRow label="رقم الحساب" value="0021-004-998877" onCopy={vi.fn()} />)

    expect(screen.getByText("رقم الحساب")).toBeInTheDocument()
    const value = screen.getByText("0021-004-998877")
    expect(value).toHaveAttribute("dir", "ltr")
    expect(value).toHaveClass("font-mono")
  })

  it('exposes a "نسخ {label}" copy button that copies the row value', () => {
    const onCopy = vi.fn<(value: string) => void>()
    render(<CopyRow label="IBAN" value="LY83002048000020100120361" onCopy={onCopy} />)

    const btn = screen.getByRole("button", { name: "نسخ IBAN" })
    expect(btn).toHaveAttribute("title", "نسخ IBAN")

    fireEvent.click(btn)
    expect(onCopy).toHaveBeenCalledWith("LY83002048000020100120361")
  })

  it("renders an empty value without crashing (unconfigured bank rows)", () => {
    const onCopy = vi.fn<(value: string) => void>()
    render(<CopyRow label="المصرف" value="" onCopy={onCopy} />)

    fireEvent.click(screen.getByRole("button", { name: "نسخ المصرف" }))
    expect(onCopy).toHaveBeenCalledWith("")
  })
})
