/**
 * v15-E5 (C-FREE1) — the free-plan activation journey contract.
 *
 * The first CTA of the whole site («ابدأ الآن مجاناً» → /subscribe → the
 * «مجاني» card) used to dead-end at «ادفع الآن (0 د.ل)» → «سعر الباقة
 * غير صالح — أعد فتح نافذة الدفع» (payment/index.tsx rejected price<=0 for
 * wallets). These pins lock the fixed journey against the REAL backend
 * contract (routers/payments/plans.py):
 *
 *   - price=0 renders the dedicated free step: NO method tabs, NO
 *     wallet/bank instructions, NO receipt, NO «المبلغ المطلوب» block —
 *     header «تفعيل الخطة المجانية» + «مجاني» chip instead of «0 د.ل»
 *   - bad phone → Arabic toast, zero network
 *   - submit → POST /api/subscriptions {plan_id, provider:"liyana",
 *     amount:0, phone} (the endpoint requires a phone on every non-bank
 *     request; the request lands in the platform-admin approval queue —
 *     there is NO self-activation endpoint) → free waiting screen copy
 *   - 401 (anonymous visitor) → the dialog's OWN journey: tailored toast +
 *     /login?redirect=/subscribe?plan=N (D4-L7: the preselected plan
 *     survives the login round-trip now)
 *   - negative price still hits the invalid-price guard (never "free")
 *
 * Mock bundle (house pattern from PaymentDialog.test.tsx): useConfig,
 * premium-toast spy, image-compress passthrough, inert EventSource stub,
 * fetch stub with real Response objects, stubbed window.location.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PaymentDialog } from "@/components/shared/payment/index"

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, string>,
  toast: vi.fn(),
  href: "",
  replace: vi.fn(),
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

/** jsdom has no EventSource — inert stub keeps SSE silent. */
class FakeEventSource {
  onmessage: unknown = null
  onerror: unknown = null
  close() {}
  addEventListener() {}
}

function stubLocation(pathname: string, search: string) {
  mocks.href = ""
  const loc: Record<string, unknown> = {
    pathname,
    search,
    replace: mocks.replace,
    assign: vi.fn(),
  }
  Object.defineProperty(loc, "href", {
    get(this: Record<string, unknown>): string {
      return String(this._href ?? `http://localhost${pathname}${search}`)
    },
    set(this: Record<string, unknown>, v: string): void {
      this._href = v
      mocks.href = v
    },
    configurable: true,
  })
  vi.stubGlobal("location", loc)
}

function renderFreeDialog() {
  return render(
    <PaymentDialog
      open
      onOpenChange={vi.fn()}
      planId={1}
      planNameAr="مجاني"
      price={0}
      onSuccess={vi.fn()}
    />,
  )
}

beforeEach(() => {
  mocks.config = {}
  mocks.toast.mockClear()
  vi.stubGlobal("EventSource", FakeEventSource)
  stubLocation("/subscribe", "?plan=1")
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("PaymentFreePlan — dedicated free step (no payment machinery)", () => {
  it("renders the free activation UI without methods, wallet/bank forms or receipt", () => {
    renderFreeDialog()

    // the free header + summary (the plan-name span AND the price span both
    // read «مجاني» for the seeded free plan — two exact matches by design)
    expect(screen.getByRole("heading", { name: "تفعيل الخطة المجانية" })).toBeInTheDocument()
    expect(screen.getByText("بلا دفع ولا إيصال — تفعيل بعد موافقة الإدارة")).toBeInTheDocument()
    expect(screen.getByText("الخطة المجانية بلا دفع")).toBeInTheDocument()
    expect(screen.getAllByText("مجاني").length).toBe(2)

    // the paid-flow machinery must NOT exist for price=0
    expect(screen.queryByText("طريقة الدفع")).toBeNull()
    expect(screen.queryByText("أرسل المبلغ إلى ليبيانا")).toBeNull()
    expect(screen.queryByText("حوّل على الحساب البنكي التالي")).toBeNull()
    expect(screen.queryByText("رمز التحويل السريع")).toBeNull()
    expect(screen.queryByText("المبلغ المطلوب")).toBeNull()
    expect(screen.queryByLabelText("صورة التحويل (اختياري)")).toBeNull()
    expect(screen.queryByText("ادفع الآن (0 د.ل)")).toBeNull()

    // the phone (backend contract: required on every non-bank request)
    expect(screen.getByLabelText("رقم هاتفك *")).toBeInTheDocument()
    // the CTA
    expect(screen.getByRole("button", { name: "تفعيل الخطة المجانية" })).toBeInTheDocument()
    // the old dead-end message is gone
    expect(screen.queryByText(/سعر الباقة غير صالح/)).toBeNull()
  })
})

describe("PaymentFreePlan — phone validation (no network on bad input)", () => {
  it("rejects a non-09 phone with the Arabic toast and never POSTs", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => jsonRes({ success: true }),
    )
    vi.stubGlobal("fetch", fetchMock)
    renderFreeDialog()

    fireEvent.change(screen.getByLabelText("رقم هاتفك *"), { target: { value: "12345" } })
    fireEvent.click(screen.getByRole("button", { name: "تفعيل الخطة المجانية" }))

    expect(mocks.toast).toHaveBeenCalledWith(
      "error",
      "رقم الهاتف يجب أن يبدأ بـ 09 ويتكون من 10 أرقام (مثال: 0912345678)",
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText("في انتظار تفعيل الخطة المجانية")).toBeNull()
  })
})

describe("PaymentFreePlan — submit contract (the real backend journey)", () => {
  it("POSTs {plan_id, provider, amount:0, phone} and lands on the free waiting screen", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        jsonRes({ success: true, data: { payment_id: 7, status: "pending" } }),
    )
    vi.stubGlobal("fetch", fetchMock)
    renderFreeDialog()

    fireEvent.change(screen.getByLabelText("رقم هاتفك *"), { target: { value: "0912345678" } })
    fireEvent.click(screen.getByRole("button", { name: "تفعيل الخطة المجانية" }))

    await waitFor(() => {
      expect(screen.getByText("في انتظار تفعيل الخطة المجانية")).toBeInTheDocument()
    })
    // free waiting copy — never the paid-flow «بعد التحويل…»
    expect(screen.getByText("سيتم التفعيل بعد موافقة الإدارة — لا يوجد أي مبلغ")).toBeInTheDocument()
    expect(screen.getByText("بانتظار موافقة الإدارة")).toBeInTheDocument()

    // POST contract: exact endpoint + JSON body shape (no receipt, no bank fields)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/subscriptions")
    expect(init.method).toBe("POST")
    expect(init.credentials).toBe("include")
    expect(JSON.parse(String(init.body))).toEqual({
      plan_id: 1,
      provider: "liyana",
      amount: 0,
      phone: "0912345678",
    })
  })

  it("surfaces the backend's Arabic error verbatim when the request fails", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        jsonRes({ detail: "لديك طلب دفع معلق — انتظر الموافقة أو ألغِه" }, 400),
    )
    vi.stubGlobal("fetch", fetchMock)
    renderFreeDialog()

    fireEvent.change(screen.getByLabelText("رقم هاتفك *"), { target: { value: "0912345678" } })
    fireEvent.click(screen.getByRole("button", { name: "تفعيل الخطة المجانية" }))

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith(
        "error",
        "لديك طلب دفع معلق — انتظر الموافقة أو ألغِه",
      )
    })
    // still on the form step — retry allowed
    expect(screen.getByRole("button", { name: "تفعيل الخطة المجانية" })).toBeInTheDocument()
  })

  it("401 (anonymous visitor) → dialog-owned redirect keeps the preselected plan (?plan=1)", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        jsonRes({ detail: "بيانات تسجيل الدخول غير صحيحة" }, 401),
    )
    vi.stubGlobal("fetch", fetchMock)
    renderFreeDialog()

    fireEvent.change(screen.getByLabelText("رقم هاتفك *"), { target: { value: "0912345678" } })
    fireEvent.click(screen.getByRole("button", { name: "تفعيل الخطة المجانية" }))

    await waitFor(() => {
      expect(mocks.href).toBe("/login?redirect=%2Fsubscribe%3Fplan%3D1")
    })
    expect(mocks.toast).toHaveBeenCalledWith(
      "info",
      "سجّل الدخول أولاً لإتمام الاشتراك — سنعيدك هنا مباشرة",
    )
  })
})

describe("PaymentFreePlan — negative price is NOT free (guard stays)", () => {
  it("still rejects an invalid (negative) price instead of activating it", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => jsonRes({ success: true }),
    )
    vi.stubGlobal("fetch", fetchMock)
    render(
      <PaymentDialog
        open
        onOpenChange={vi.fn()}
        planId={1}
        planNameAr="مجاني"
        price={-5}
        onSuccess={vi.fn()}
      />,
    )

    // paid flow renders for non-zero prices — the phone field is the wallet one
    fireEvent.change(screen.getByLabelText("رقم هاتفك *"), { target: { value: "0912345678" } })
    fireEvent.click(screen.getByRole("button", { name: "إرسال طلب الدفع" }))

    expect(mocks.toast).toHaveBeenCalledWith(
      "error",
      "سعر الباقة غير صالح — أعد فتح نافذة الدفع",
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
