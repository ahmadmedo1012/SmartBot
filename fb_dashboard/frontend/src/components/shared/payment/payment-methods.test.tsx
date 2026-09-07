/**
 * v13-E6 — PaymentMethodTabs contract (v11-A3 extraction).
 *
 * Pins the 3-provider tab rail: fixed tab order, wallet tabs disabling
 * above the mobile-wallet cap while the bank tab never disables, the
 * requiresBank hint rendered only when wallets are locked, provider change
 * events (never from a disabled tab), and the active-tab visual state.
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PaymentMethodTabs } from "./payment-methods"
import type { Provider } from "./payment-constants"

describe("PaymentMethodTabs rail", () => {
  it("renders the three provider tabs in fixed order", () => {
    render(
      <PaymentMethodTabs provider="liyana" onProviderChange={vi.fn()} requiresBank={false} walletCap={99} />,
    )

    const liyana = screen.getByRole("button", { name: /ليبيانا/ })
    const madar = screen.getByRole("button", { name: /مدار/ })
    const bank = screen.getByRole("button", { name: /تحويل بنكي/ })

    expect(liyana).toBeInTheDocument()
    // DOM order: ليبيانا → مدار → تحويل بنكي
    const order = [liyana, madar, bank]
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
  })

  it("disables both wallets above the cap while the bank tab stays enabled", () => {
    render(
      <PaymentMethodTabs provider="bank" onProviderChange={vi.fn()} requiresBank={true} walletCap={99} />,
    )

    expect(screen.getByRole("button", { name: /ليبيانا/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: /مدار/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: /تحويل بنكي/ })).toBeEnabled()
  })

  it("keeps every tab enabled when the price is within the wallet cap", () => {
    render(
      <PaymentMethodTabs provider="liyana" onProviderChange={vi.fn()} requiresBank={false} walletCap={99} />,
    )

    for (const name of [/ليبيانا/, /مدار/, /تحويل بنكي/]) {
      expect(screen.getByRole("button", { name })).toBeEnabled()
    }
  })

  it('shows the over-cap hint ONLY when requiresBank (with the grouped cap)', () => {
    const { unmount } = render(
      <PaymentMethodTabs provider="bank" onProviderChange={vi.fn()} requiresBank={true} walletCap={99} />,
    )
    expect(
      screen.getByText('المبالغ فوق 99 د.ل تتطلب تحويل بنكي — اختر "تحويل بنكي" لإتمام الدفع'),
    ).toBeInTheDocument()
    unmount()

    render(
      <PaymentMethodTabs provider="liyana" onProviderChange={vi.fn()} requiresBank={false} walletCap={99} />,
    )
    expect(screen.queryByText(/المبالغ فوق/)).toBeNull()
  })

  it("fires onProviderChange on an enabled tab click, never on a disabled one", () => {
    const onProviderChange = vi.fn<(p: Provider) => void>()
    render(
      <PaymentMethodTabs provider="bank" onProviderChange={onProviderChange} requiresBank={true} walletCap={99} />,
    )

    // wallet tabs are disabled above the cap — clicking must not fire
    fireEvent.click(screen.getByRole("button", { name: /ليبيانا/ }))
    expect(onProviderChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /تحويل بنكي/ }))
    expect(onProviderChange).toHaveBeenCalledWith("bank")
  })

  it("distinguishes the active tab with the accent border state", () => {
    const { container } = render(
      <PaymentMethodTabs provider="madar" onProviderChange={vi.fn()} requiresBank={false} walletCap={99} />,
    )

    const buttons = container.querySelectorAll("button")
    const [liyana, madar, bank] = Array.from(buttons)
    expect(liyana.className).toContain("border-border/30")
    expect(madar.className).toContain("border-accent-foreground")
    expect(bank.className).toContain("border-border/30")
  })

  it('labels the whole rail "طريقة الدفع"', () => {
    render(
      <PaymentMethodTabs provider="liyana" onProviderChange={vi.fn()} requiresBank={false} walletCap={99} />,
    )

    expect(screen.getByText("طريقة الدفع")).toBeInTheDocument()
  })
})
