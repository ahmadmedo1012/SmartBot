/**
 * v13-E6 — payment resolution screens contract (v11-A3 extraction).
 *
 * Pins the four post-submit screens of the payment dialog:
 *   - WaitingScreen: fixed title + the provider-dependent live status line
 *     (ليبيانا waits for the transfer, everyone else for admin approval)
 *   - ApprovedScreen: fixed message + resolution copy + dashboard CTA
 *   - RejectedScreen: fixed message + close/retry wiring
 *   - SuccessScreen: acknowledgement only (no redirect — payment pending)
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ApprovedScreen, RejectedScreen, SuccessScreen, WaitingScreen } from "./payment-status"

describe("WaitingScreen", () => {
  it("renders the fixed waiting title and subtitle", () => {
    render(<WaitingScreen provider="liyana" />)

    expect(screen.getByText("في انتظار تأكيد الدفع")).toBeInTheDocument()
    expect(screen.getByText("بعد التحويل، انتظر موافقة الإدارة")).toBeInTheDocument()
  })

  it('tells ليبيانا users "بانتظار تأكيد التحويل"', () => {
    render(<WaitingScreen provider="liyana" />)

    expect(screen.getByText("بانتظار تأكيد التحويل")).toBeInTheDocument()
  })

  it('tells everyone else "بانتظار موافقة الإدارة" (madar AND bank)', () => {
    const { unmount } = render(<WaitingScreen provider="madar" />)
    expect(screen.getByText("بانتظار موافقة الإدارة")).toBeInTheDocument()
    unmount()

    render(<WaitingScreen provider="bank" />)
    expect(screen.getByText("بانتظار موافقة الإدارة")).toBeInTheDocument()
  })
})

describe("ApprovedScreen", () => {
  it("shows the approval message and the resolution copy", () => {
    render(<ApprovedScreen resolutionMsg="تم تفعيل اشتراكك" onContinue={vi.fn()} />)

    expect(screen.getByText("تم الموافقة على الاشتراك")).toBeInTheDocument()
    expect(screen.getByText("تم تفعيل اشتراكك")).toBeInTheDocument()
  })

  it('continues to the dashboard via "الانتقال إلى لوحة التحكم"', () => {
    const onContinue = vi.fn()
    render(<ApprovedScreen resolutionMsg="x" onContinue={onContinue} />)

    fireEvent.click(screen.getByRole("button", { name: "الانتقال إلى لوحة التحكم" }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})

describe("RejectedScreen", () => {
  it("shows the rejection message and the resolution copy", () => {
    render(<RejectedScreen resolutionMsg="سبب الرفض" onClose={vi.fn()} onRetry={vi.fn()} />)

    expect(screen.getByText("تم رفض طلب الاشتراك")).toBeInTheDocument()
    expect(screen.getByText("سبب الرفض")).toBeInTheDocument()
  })

  it("wires both close and retry actions", () => {
    const onClose = vi.fn()
    const onRetry = vi.fn()
    render(<RejectedScreen resolutionMsg="x" onClose={onClose} onRetry={onRetry} />)

    fireEvent.click(screen.getByRole("button", { name: "إغلاق" }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe("SuccessScreen", () => {
  it("acknowledges the sent request without any redirect affordance", () => {
    const onClose = vi.fn()
    render(<SuccessScreen onClose={onClose} />)

    expect(screen.getByText("تم إرسال طلب الدفع")).toBeInTheDocument()
    expect(screen.getByText("سيتم تفعيل اشتراكك بعد موافقة الإدارة")).toBeInTheDocument()
    // acknowledgement only — no "dashboard" CTA while payment is pending
    expect(screen.queryByRole("button", { name: /لوحة التحكم/ })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "إغلاق" }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
