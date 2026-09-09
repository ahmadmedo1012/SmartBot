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

import { ApprovedScreen, PendingScreen, RejectedScreen, SuccessScreen, WaitingScreen } from "./payment-status"

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

  it("carries the v18 honest admin-route line (close-and-return is safe)", () => {
    render(<WaitingScreen provider="liyana" />)

    expect(
      screen.getByText(
        "سيصل إشعار للمسؤول فوراً — يمكنك إغلاق النافذة والعودة لاحقاً، أو انتظار الموافقة هنا",
      ),
    ).toBeInTheDocument()
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

describe("PendingScreen (v18 1-b — the dead-end closure)", () => {
  it("shows the pending title, admin-review copy and both affordances", () => {
    render(<PendingScreen onCancel={vi.fn()} onWait={vi.fn()} />)

    expect(screen.getByText("لديك طلب دفع معلق")).toBeInTheDocument()
    // generic copy when no probe details are available (regex — the <p>
    // also carries the trailing affordance sentence)
    expect(screen.getByText(/طلبك السابق قيد المراجعة من قبل الإدارة/)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "إلغاء الطلب المعلق وإعادة المحاولة" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "الانتظار حتى الموافقة" })).toBeInTheDocument()
  })

  it("names the pending plan and amount when the probe provided them", () => {
    render(<PendingScreen planName="الاحترافية" amount={50} onCancel={vi.fn()} onWait={vi.fn()} />)

    expect(screen.getByText(/طلب «الاحترافية» بمبلغ 50 د.ل قيد المراجعة/)).toBeInTheDocument()
  })

  it("wires both cancel and wait actions", () => {
    const onCancel = vi.fn()
    const onWait = vi.fn()
    render(<PendingScreen onCancel={onCancel} onWait={onWait} />)

    fireEvent.click(screen.getByRole("button", { name: "إلغاء الطلب المعلق وإعادة المحاولة" }))
    expect(onCancel).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole("button", { name: "الانتظار حتى الموافقة" }))
    expect(onWait).toHaveBeenCalledTimes(1)
  })

  it("disables the cancel action and swaps its label while a cancel is in flight", () => {
    render(<PendingScreen onCancel={vi.fn()} onWait={vi.fn()} cancelling />)

    const cancel = screen.getByRole("button", { name: "جارٍ الإلغاء…" })
    expect(cancel).toBeDisabled()
    // the wait affordance stays available — it is a different decision
    expect(screen.getByRole("button", { name: "الانتظار حتى الموافقة" })).toBeEnabled()
  })
})
