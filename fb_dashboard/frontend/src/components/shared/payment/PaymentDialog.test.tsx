/**
 * v13-E6 — PaymentDialog money-path integration (P3, D8 file 18).
 *
 * The full state machine behind the /subscribe payment step, with the D8
 * documented mock bundle:
 *   - useConfig (vi.hoisted) — feeds the wallet cap / transfer phones
 *   - premium-toast — spy toasts (validation errors)
 *   - image-compress — pass-through (no receipt compression in jsdom)
 *   - fetch stub (house pattern) — the POST /api/subscriptions contract
 *   - EventSource stub — jsdom implements no SSE; polling fallback stays
 *     inert because no test advances the 5s interval
 *
 * Money-path pins: plan summary "19 د.ل", the default ليبيانا/مدار USSD
 * quick-transfer codes, the auto bank-switch above the wallet cap, phone
 * validation (toast, NO network call), and the successful POST body
 * {plan_id, provider, amount, phone} → waiting screen.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PaymentDialog } from "./index"

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, string>,
  toast: vi.fn(),
}))

vi.mock("@/hooks/useConfig", () => ({
  useConfig: (): { config: Record<string, string>; loaded: boolean; error: string | null } => ({
    config: mocks.config,
    loaded: true,
    error: null,
  }),
}))

vi.mock("@/lib/premium-toast", () => ({
  premiumToast: mocks.toast,
}))

vi.mock("@/lib/image-compress", () => ({
  compressImage: vi.fn(async (file: File) => file),
}))

/** Build a real Response with a JSON body. */
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** jsdom has no EventSource (D8-verified) — inert stub keeps SSE silent. */
class FakeEventSource {
  onmessage: unknown = null
  onerror: unknown = null
  close() {}
  addEventListener() {}
}

function renderDialog(overrides: { price?: number } = {}) {
  return render(
    <PaymentDialog
      open
      onOpenChange={vi.fn()}
      planId={1}
      planNameAr="الأساسية"
      price={overrides.price ?? 19}
      onSuccess={vi.fn()}
    />,
  )
}

beforeEach(() => {
  mocks.config = {}
  mocks.toast.mockClear()
  vi.stubGlobal("EventSource", FakeEventSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("PaymentDialog smoke render (base-ui Dialog in jsdom)", () => {
  it("renders the dialog shell, plan summary and wallet form", () => {
    renderDialog()

    // dialog shell
    expect(screen.getByText("دفع الاشتراك")).toBeInTheDocument()
    expect(screen.getByText("ادفع عبر المحفظة الإلكترونية")).toBeInTheDocument()
    // plan summary chip: name + monthly price (the required amount block
    // shows the same string — two occurrences by design)
    expect(screen.getByText("الأساسية")).toBeInTheDocument()
    expect(screen.getAllByText("19 د.ل").length).toBe(2)
    expect(screen.getByText("اشتراك شهري")).toBeInTheDocument()
    // form step: method rail + wallet instructions + submit
    expect(screen.getByText("طريقة الدفع")).toBeInTheDocument()
    expect(screen.getByText("المبلغ المطلوب")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "إرسال طلب الدفع" })).toBeInTheDocument()
  })
})

describe("PaymentDialog USSD quick-transfer codes", () => {
  it('builds the default ليبيانا code "*122*218942119637*19000*1#" (19 د.ل)', () => {
    renderDialog({ price: 19 })

    expect(screen.getByText("*122*218942119637*19000*1#")).toBeInTheDocument()
    // the ليبيانا transfer phone from the constants fallback
    expect(screen.getByText("أرسل المبلغ إلى ليبيانا")).toBeInTheDocument()
  })

  it('switches to the مدار code "*140*4*1*19*0910089975#" on tab click', async () => {
    renderDialog({ price: 19 })

    fireEvent.click(screen.getByRole("button", { name: "مدار" }))

    await waitFor(() => {
      expect(screen.getByText("*140*4*1*19*0910089975#")).toBeInTheDocument()
    })
    expect(screen.getByText("أرسل المبلغ إلى مدار")).toBeInTheDocument()
  })
})

describe("PaymentDialog wallet network mapping (v22 FIX-C regression)", () => {
  /* v22 FIX-C: the W1-D5 «wallet numbers swapped» finding was a FALSE
   * POSITIVE — it assumed Libyana=091 / Al Madar=094, while Libya's real
   * operator prefixes are Libyana 092/094 and Al Madar 091/093
   * (libyana.ly official transfer example `*122*092/94XXXXXXX*1000#`;
   * wazi.almadar.ly "091/093"; en.wikipedia "Telephone numbers in Libya").
   * /api/config semantics (plans_config.py allowlist + admin settings
   * labels): balance_transfer_phone_1 = the مدار wallet key,
   * balance_transfer_phone_2 = the ليبيانا wallet key. Feeding the
   * PRODUCTION SystemConfig values through that contract, each tab must
   * render its own network's number — pinning the money path so no future
   * "fix" can cross the networks. */
  it("renders the 094… (Libyana) number under ليبيانا and the 091… (Al Madar) number under مدار", async () => {
    mocks.config = {
      balance_transfer_phone_1: "0910089975", // production DB value — مدار key (091 = Al Madar)
      balance_transfer_phone_2: "0942119637", // production DB value — ليبيانا key (094 = Libyana)
    }
    renderDialog({ price: 19 })

    // default tab ليبيانا → the 094 number + Libyana's official *122* code
    expect(screen.getByText("أرسل المبلغ إلى ليبيانا")).toBeInTheDocument()
    expect(screen.getByText("0942119637")).toBeInTheDocument()
    expect(screen.getByText("*122*218942119637*19000*1#")).toBeInTheDocument()

    // switch to مدار → the 091 number + Al Madar's official *140* code
    fireEvent.click(screen.getByRole("button", { name: "مدار" }))
    await waitFor(() => {
      expect(screen.getByText("أرسل المبلغ إلى مدار")).toBeInTheDocument()
    })
    // the wallet phone card carries the 091 number (exact text node)…
    expect(screen.getByText("0910089975")).toBeInTheDocument()
    // …and Al Madar's official *140* quick-transfer code embeds it too
    expect(screen.getByText("*140*4*1*19*0910089975#")).toBeInTheDocument()
  })

  it("keeps each network's fallback constant network-correct when /api/config has no rows", () => {
    mocks.config = {} // no DB rows, no env fallbacks — constants path
    renderDialog({ price: 19 })

    // ليبيانا default = 0942119637 (Libyana prefix 094) — NOT the 091 number
    expect(screen.getByText("0942119637")).toBeInTheDocument()
    expect(screen.queryByText("0910089975")).toBeNull()
  })
})

describe("PaymentDialog auto bank-switch above the wallet cap", () => {
  it("locks the wallets, hints at the cap and renders the bank form", async () => {
    mocks.config = { mobile_wallet_cap: "99" } // arrives as a string from /api/config
    renderDialog({ price: 150 })

    // the effect flips provider → bank: wallet instructions vanish
    await waitFor(() => {
      expect(screen.getByText("حوّل على الحساب البنكي التالي")).toBeInTheDocument()
    })
    expect(screen.queryByText(/رمز التحويل السريع/)).toBeNull()

    // wallets disabled above the cap, hint shown with the grouped cap
    expect(screen.getByRole("button", { name: /ليبيانا/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: /مدار/ })).toBeDisabled()
    expect(
      screen.getByText('المبالغ فوق 99 د.ل تتطلب تحويل بنكي — اختر "تحويل بنكي" لإتمام الدفع'),
    ).toBeInTheDocument()

    // the plan summary still shows the real price
    expect(screen.getByText("150 د.ل")).toBeInTheDocument()
  })
})

describe("PaymentDialog phone validation (no network on bad input)", () => {
  it("rejects a non-09 phone with the Arabic toast and never POSTs", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => jsonRes({ success: true }),
    )
    vi.stubGlobal("fetch", fetchMock)
    renderDialog()

    // the submit CTA only enables once a phone is typed
    fireEvent.change(screen.getByLabelText("رقم هاتفك *"), { target: { value: "12345" } })
    fireEvent.click(screen.getByRole("button", { name: "إرسال طلب الدفع" }))

    expect(mocks.toast).toHaveBeenCalledWith(
      "error",
      "رقم الهاتف يجب أن يبدأ بـ 09 ويتكون من 10 أرقام (مثال: 0912345678)",
    )
    // v18 (1-b): the ONLY network call is the open probe (GET
    // /api/subscriptions/pending, dead-end guard — the stub answers empty
    // so the form stays); the invalid phone must never reach the POST.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/subscriptions/pending")
    // still on the form step — no waiting screen
    expect(screen.queryByText("في انتظار تأكيد الدفع")).toBeNull()
  })
})

describe("PaymentDialog successful submit → waiting screen", () => {
  it("POSTs {plan_id, provider, amount, phone} and lands on the waiting screen", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        jsonRes({ success: true, data: { payment_id: 42 } }),
    )
    vi.stubGlobal("fetch", fetchMock)
    renderDialog()

    fireEvent.change(screen.getByLabelText("رقم هاتفك *"), { target: { value: "0912345678" } })
    fireEvent.click(screen.getByRole("button", { name: "إرسال طلب الدفع" }))

    await waitFor(() => {
      expect(screen.getByText("في انتظار تأكيد الدفع")).toBeInTheDocument()
    })

    // v18 (1-b): the open probe (GET /api/subscriptions/pending — the
    // dead-end guard) precedes the POST; the stub answers data-less for it
    // so the dialog stays on the form until the submit.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/subscriptions/pending")
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toBe("/api/subscriptions")
    expect(init.method).toBe("POST")
    expect(init.credentials).toBe("include")
    expect(JSON.parse(String(init.body))).toEqual({
      plan_id: 1,
      provider: "liyana",
      amount: 19,
      phone: "0912345678",
    })

    // waiting screen shows the ليبيانا live status
    expect(screen.getByText("بانتظار تأكيد التحويل")).toBeInTheDocument()
  })
})
