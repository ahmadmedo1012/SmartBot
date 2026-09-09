/**
 * v18 (Task 1-b) — إغلاق طريق مسدّد «لديك طلب دفع معلق».
 *
 * The production complaint (evidence-v18): the FIRST payment request
 * succeeds server-side but the admin notification never arrives; every
 * retry hits the 400 «لديك طلب دفع معلق — انتظر الموافقة أو ألغِه» as a
 * vanish-fast toast while the user stays stuck in the form — no endpoint,
 * no button, the «ألغِه» half of the promise was a lie.
 *
 * Pins the new contract end-to-end:
 *   - open probe: GET /api/subscriptions/pending on the closed→open
 *     transition → lands DIRECTLY on the pending screen (form never shown)
 *   - probe failures (network / 401 anonymous) are silent non-events —
 *     the form stays, no toast, no global session kick
 *   - the create-path 400 «معلق» is a STATE now: pending screen with the
 *     probed details, NOT an error toast
 *   - «إلغاء الطلب المعلق وإعادة المحاولة» → POST /api/subscriptions/cancel
 *     {payment_id} → back to a clean form (+ success toast)
 *   - cancel failure re-probes: nothing pending anymore → form fallback
 *     (the cancel button can never dead-end of its own)
 *   - «الانتظار حتى الموافقة» → closes the dialog with an info toast
 *
 * Mock bundle (house pattern from PaymentDialog.test.tsx): useConfig,
 * premium-toast spy, image-compress passthrough, inert EventSource stub,
 * URL-aware fetch stub with real Response objects.
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

/** jsdom has no EventSource — inert stub keeps SSE silent. */
class FakeEventSource {
  onmessage: unknown = null
  onerror: unknown = null
  close() {}
  addEventListener() {}
}

/** The live pending row exactly as GET /api/subscriptions/pending shapes it. */
const PENDING_ROW = {
  payment_id: 15,
  status: "pending",
  plan_id: 2,
  plan_name: "الاحترافية",
  amount: 50,
  provider: "liyana",
  created_at: "2026-09-10T12:00:00Z",
}

function renderDialog(onOpenChange: (o: boolean) => void = vi.fn()) {
  return {
    onOpenChange,
    ...render(
      <PaymentDialog
        open
        onOpenChange={onOpenChange}
        planId={1}
        planNameAr="الأساسية"
        price={19}
        onSuccess={vi.fn()}
      />,
    ),
  }
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

describe("v18 (1-b) — open probe: the dialog opens on the pending screen", () => {
  it("lands directly on the pending screen when /pending answers with a live row", async () => {
    const fetchMock = vi.fn(
      async (url: string | URL | Request, _init?: RequestInit) => {
        if (String(url) === "/api/subscriptions/pending")
          return jsonRes({ success: true, data: PENDING_ROW })
        return jsonRes({ success: true })
      },
    )
    vi.stubGlobal("fetch", fetchMock)
    renderDialog()

    await waitFor(() => {
      expect(screen.getByText("لديك طلب دفع معلق")).toBeInTheDocument()
    })
    // the probed details name the PENDING plan (not the dialog's plan)
    expect(screen.getByText(/طلب «الاحترافية» بمبلغ 50 د.ل قيد المراجعة/)).toBeInTheDocument()
    // both affordances — the «أو ألغِه» promise is finally real
    expect(
      screen.getByRole("button", { name: "إلغاء الطلب المعلق وإعادة المحاولة" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "الانتظار حتى الموافقة" })).toBeInTheDocument()

    // the payment form was NEVER shown — the doomed fill is pre-empted
    expect(screen.queryByText("المبلغ المطلوب")).toBeNull()
    expect(screen.queryByRole("button", { name: "إرسال طلب الدفع" })).toBeNull()

    // exactly one probe call, on the closed→open transition
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/subscriptions/pending")
  })

  it("announces the pending step through the polite live region (WCAG 4.1.3)", async () => {
    const fetchMock = vi.fn(
      async (url: string | URL | Request, _init?: RequestInit) =>
        String(url) === "/api/subscriptions/pending"
          ? jsonRes({ success: true, data: PENDING_ROW })
          : jsonRes({ success: true }),
    )
    vi.stubGlobal("fetch", fetchMock)
    renderDialog()

    await waitFor(() => {
      expect(
        screen.getByText("لديك طلب دفع معلق — يمكنك إلغاؤه وإعادة المحاولة أو الانتظار حتى الموافقة"),
      ).toBeInTheDocument()
    })
  })

  it("probe network failure stays silent on the payment form (today's behavior)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    })
    vi.stubGlobal("fetch", fetchMock)
    renderDialog()

    // the form is the step — no pending screen, no toast
    await waitFor(() => {
      expect(screen.getByText("المبلغ المطلوب")).toBeInTheDocument()
    })
    expect(screen.queryByText("لديك طلب دفع معلق")).toBeNull()
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it("probe 401 (anonymous visitor) is a non-event — form stays, no session kick", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        jsonRes({ detail: "غير مصرح به" }, 401),
    )
    vi.stubGlobal("fetch", fetchMock)
    renderDialog()

    await waitFor(() => {
      expect(screen.getByText("المبلغ المطلوب")).toBeInTheDocument()
    })
    // skipAuthRedirect on the probe: no global «انتهت الجلسة» toast, no
    // redirect — the anonymous /subscribe visitor keeps browsing the form
    expect(mocks.toast).not.toHaveBeenCalled()
    expect(screen.queryByText("لديك طلب دفع معلق")).toBeNull()
  })
})

describe("v18 (1-b) — the create-path 400 «معلق» is a state, not a toast", () => {
  it("a 400 pending submission lands on the pending screen with the probed details", async () => {
    // 1st probe (on open): nothing pending; the submit then 400s; the 2nd
    // probe (from the 400 branch) returns the live row with its details.
    let pendingCalls = 0
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      if (u === "/api/subscriptions/pending") {
        pendingCalls += 1
        return jsonRes({ success: true, data: pendingCalls >= 2 ? PENDING_ROW : null })
      }
      if (u === "/api/subscriptions" && (init?.method ?? "GET").toUpperCase() === "POST") {
        return jsonRes({ detail: "لديك طلب دفع معلق — انتظر الموافقة أو ألغِه" }, 400)
      }
      return jsonRes({ success: true })
    })
    vi.stubGlobal("fetch", fetchMock)
    renderDialog()

    fireEvent.change(screen.getByLabelText("رقم هاتفك *"), { target: { value: "0912345678" } })
    fireEvent.click(screen.getByRole("button", { name: "إرسال طلب الدفع" }))

    await waitFor(() => {
      expect(screen.getByText("لديك طلب دفع معلق")).toBeInTheDocument()
    })
    expect(screen.getByText(/طلب «الاحترافية» بمبلغ 50 د.ل قيد المراجعة/)).toBeInTheDocument()

    // NO error toast — the pending screen replaces the vanish-fast message
    expect(mocks.toast).not.toHaveBeenCalled()

    // the doomed POST really happened (same body contract as the happy path)
    const postCall = fetchMock.mock.calls.find(
      ([u, init]) => String(u) === "/api/subscriptions" && String(init?.method) === "POST",
    ) as [string, RequestInit]
    expect(postCall).toBeTruthy()
    expect(JSON.parse(String(postCall[1].body))).toEqual({
      plan_id: 1,
      provider: "liyana",
      amount: 19,
      phone: "0912345678",
    })
  })
})

describe("v18 (1-b) — «إلغاء الطلب المعلق وإعادة المحاولة»", () => {
  it("POSTs /api/subscriptions/cancel {payment_id} and returns to the form", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      if (u === "/api/subscriptions/pending")
        return jsonRes({ success: true, data: PENDING_ROW })
      if (u === "/api/subscriptions/cancel")
        return jsonRes({ success: true, data: { id: 15, status: "cancelled" } })
      return jsonRes({ success: true })
    })
    vi.stubGlobal("fetch", fetchMock)
    renderDialog()

    await waitFor(() => {
      expect(screen.getByText("لديك طلب دفع معلق")).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole("button", { name: "إلغاء الطلب المعلق وإعادة المحاولة" }))

    // back to a CLEAN payment form — the dead end is closed
    await waitFor(() => {
      expect(screen.getByText("المبلغ المطلوب")).toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: "إرسال طلب الدفع" })).toBeInTheDocument()
    expect(screen.queryByText("لديك طلب دفع معلق")).toBeNull()

    // cancel contract: endpoint + body carries the probed payment_id
    const cancelCall = fetchMock.mock.calls.find(
      ([u, init]) => String(u) === "/api/subscriptions/cancel" && String(init?.method) === "POST",
    ) as [string, RequestInit]
    expect(cancelCall).toBeTruthy()
    expect(cancelCall[1].credentials).toBe("include")
    expect(JSON.parse(String(cancelCall[1].body))).toEqual({ payment_id: 15 })

    // the success toast tells the user a new request is now possible
    expect(mocks.toast).toHaveBeenCalledWith(
      "success",
      "تم إلغاء الطلب المعلق — يمكنك إرسال طلب جديد الآن",
    )
  })

  it("a cancel 400 with nothing pending anymore falls back to the form (server resolved it)", async () => {
    // open probe → row; cancel → 400 (admin already decided); the re-probe
    // finds nothing pending → the form returns, so the cancel button can
    // never become a dead end of its own.
    let pendingCalls = 0
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      if (u === "/api/subscriptions/pending") {
        pendingCalls += 1
        return jsonRes({ success: true, data: pendingCalls === 1 ? PENDING_ROW : null })
      }
      if (u === "/api/subscriptions/cancel")
        return jsonRes({ detail: "لا يمكن إلغاء طلب غير معلق" }, 400)
      return jsonRes({ success: true })
    })
    vi.stubGlobal("fetch", fetchMock)
    renderDialog()

    await waitFor(() => {
      expect(screen.getByText("لديك طلب دفع معلق")).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole("button", { name: "إلغاء الطلب المعلق وإعادة المحاولة" }))

    await waitFor(() => {
      expect(screen.getByText("المبلغ المطلوب")).toBeInTheDocument()
    })
    // the server's Arabic refusal surfaced verbatim
    expect(mocks.toast).toHaveBeenCalledWith("error", "لا يمكن إلغاء طلب غير معلق")
  })
})

describe("v18 (1-b) — «الانتظار حتى الموافقة»", () => {
  it("closes the dialog with an info toast (the request stays pending)", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const u = String(url)
      if (u === "/api/subscriptions/pending")
        return jsonRes({ success: true, data: PENDING_ROW })
      return jsonRes({ success: true })
    })
    vi.stubGlobal("fetch", fetchMock)
    const onOpenChange = vi.fn()
    renderDialog(onOpenChange)

    await waitFor(() => {
      expect(screen.getByText("لديك طلب دفع معلق")).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole("button", { name: "الانتظار حتى الموافقة" }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mocks.toast).toHaveBeenCalledWith(
      "info",
      "سيبقى طلبك قيد المراجعة — يمكنك إغلاق النافذة والعودة لاحقاً لمتابعة الحالة",
    )
  })
})
