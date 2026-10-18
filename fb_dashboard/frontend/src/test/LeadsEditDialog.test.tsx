/**
 * P21-W6-B5 (gap #3b) — عقد حوار تحرير العميل في صفحة العملاء المتوقعين.
 *
 * Pins (the W6-A1 verdict: PUT /api/crm/customers/{id} had ZERO consumers —
 * the leads page was read-only; a sales lead could not be worked):
 *   - every row gains a 44px «تحديث بيانات العميل…» pencil → the edit
 *     dialog (the team-page role-change pattern: dialog + form + toast +
 *     invalidateQueries)
 *   - validation: no change → the save button stays INERT (the honest
 *     no-op guard); a bad phone (r138 contract) shows the neutral Arabic
 *     inline error and blocks the save
 *   - save: PUT form-encoded (name/phone/stage/notes — crm_routes.py:100
 *     Form contract), only the FILLED fields ride the body (the server
 *     ignores empty strings — stated in the dialog itself)
 *   - success toasts + the list invalidates; a server error toasts the
 *     SERVER's copy verbatim
 *
 * Mock bundle (house pattern): QueryClientProvider, premium-toast spy,
 * next/link anchor, fetch stub (jsonRes + stubFetch + formBodiesFor).
 */
import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LeadsPage from "@/app/dashboard/leads/page"

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("@/lib/premium-toast", () => ({
  brandedToast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock("next/link", () => ({
  default: function MockLink({ href, children }: { href: string; children: ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function stubFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: { method: string; url: string; body?: string }[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const method = ((init?.method ?? "GET") as string).toUpperCase()
    calls.push({ method, url: u, body: init?.body ? String(init.body) : undefined })
    const maker = routes[`${method} ${u}`]
    return maker ? await maker() : jsonRes({ success: true, data: {} })
  })
  vi.stubGlobal("fetch", fn)
  return {
    calls,
    callsFor(route: string) {
      const method = route.split(" ")[0]
      const path = route.slice(route.indexOf(" ") + 1)
      return calls.filter((c) => c.method === method && c.url === path)
    },
    formBodiesFor(route: string) {
      const method = route.split(" ")[0]
      const path = route.slice(route.indexOf(" ") + 1)
      return calls
        .filter((c) => c.method === method && c.url === path && c.body)
        .map((c) => Object.fromEntries(new URLSearchParams(c.body as string)))
    },
  }
}

/* crm_routes.py list serializer shape. */
const CUSTOMER = {
  id: 7,
  name: "سالم القذافي",
  phone: "0912345678",
  source: "comment",
  stage: "lead",
  total_interactions: 3,
  interested_in: null,
  last_intent: "price",
  notes: "سأل عن التوصيل",
  first_seen_at: "2026-09-01T10:00:00Z",
  last_contacted_at: "2026-10-01T10:00:00Z",
}

function stubHappy(extra: Record<string, () => Response | Promise<Response>> = {}) {
  return stubFetch({
    "GET /api/crm/customers?page=1": () =>
      jsonRes({ success: true, data: { items: [CUSTOMER], total: 1, page: 1, per_page: 25 } }),
    ...extra,
  })
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <LeadsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("row action + dialog hydration", () => {
  it("the pencil opens the dialog prefilled with the row's real values", async () => {
    stubHappy()
    renderPage()

    expect(await screen.findByText("سالم القذافي")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "تحديث بيانات العميل سالم القذافي" }))

    /* hydration: the closed-set stage select + notes + phone (r138 wire
     * value comes back verbatim — the server stores what we sent). */
    expect(await screen.findByLabelText("المرحلة")).toHaveValue("lead")
    expect(screen.getByLabelText("الملاحظات")).toHaveValue("سأل عن التوصيل")
    expect(screen.getByLabelText("الهاتف (اختياري)")).toHaveValue("0912345678")
    /* the honest server-contract hint rides the dialog (PUT ignores empty
     * strings — clearing a field does not delete the stored value). */
    expect(screen.getByText(/التفريغ لا يحذف المخزّن/)).toBeInTheDocument()
  })

  it("no change → the save button stays INERT (the no-op guard)", async () => {
    const api = stubHappy()
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "تحديث بيانات العميل سالم القذافي" }))
    await screen.findByLabelText("المرحلة")

    const save = screen.getByRole("button", { name: "حفظ البيانات" })
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(api.callsFor("PUT /api/crm/customers/7")).toHaveLength(0)
  })
})

describe("validation — the r138 phone contract", () => {
  it("an invalid phone shows the neutral Arabic error inline and blocks save", async () => {
    const api = stubHappy()
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "تحديث بيانات العميل سالم القذافي" }))
    const phone = await screen.findByLabelText("الهاتف (اختياري)")
    fireEvent.change(phone, { target: { value: "12345" } })
    fireEvent.blur(phone)

    /* the exact contract-neutral copy (r138-SO: never describes ONE shape). */
    expect(await screen.findByText("رقم ليبي صحيح — مثال: 0912345678")).toBeInTheDocument()
    const save = screen.getByRole("button", { name: "حفظ البيانات" })
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(api.callsFor("PUT /api/crm/customers/7")).toHaveLength(0)
  })

  it("a +218 international form is accepted (normalized on the wire)", async () => {
    const api = stubHappy({
      "PUT /api/crm/customers/7": () => jsonRes({ success: true, data: { ok: true } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "تحديث بيانات العميل سالم القذافي" }))
    const phone = await screen.findByLabelText("الهاتف (اختياري)")
    fireEvent.change(phone, { target: { value: "+218 91 234 5678" } })
    fireEvent.change(screen.getByLabelText("الملاحظات"), { target: { value: "مهتم بالعرض الجديد" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ البيانات" }))

    await waitFor(() => expect(api.callsFor("PUT /api/crm/customers/7")).toHaveLength(1), { timeout: 5000 })
    /* form-encoded + normalized to the Libyan wire form. */
    expect(api.formBodiesFor("PUT /api/crm/customers/7")[0]).toEqual({
      stage: "lead",
      notes: "مهتم بالعرض الجديد",
      phone: "0912345678",
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم حفظ بيانات العميل")
  })
})

describe("save (PUT /api/crm/customers/{id} — form-encoded, editor role)", () => {
  it("stage + notes ride the body; empty fields are NEVER sent (server contract)", async () => {
    const api = stubHappy({
      "PUT /api/crm/customers/7": () => jsonRes({ success: true, data: { ok: true } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "تحديث بيانات العميل سالم القذافي" }))
    await screen.findByLabelText("المرحلة")
    fireEvent.change(screen.getByLabelText("المرحلة"), { target: { value: "prospect" } })
    fireEvent.change(screen.getByLabelText("الملاحظات"), { target: { value: "يتابع السعر" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ البيانات" }))

    await waitFor(() => expect(api.callsFor("PUT /api/crm/customers/7")).toHaveLength(1), { timeout: 5000 })
    /* the row's phone is a FILLED field → it rides the body too; only
     * empty strings are never sent (the server ignores them). */
    expect(api.formBodiesFor("PUT /api/crm/customers/7")[0]).toEqual({
      stage: "prospect",
      notes: "يتابع السعر",
      phone: "0912345678",
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم حفظ بيانات العميل")
  })

  it("a server error toasts the SERVER's copy verbatim (the 403 family)", async () => {
    stubHappy({
      "PUT /api/crm/customers/7": () =>
        jsonRes({ success: false, error: "صلاحيات غير كافية" }, 403),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "تحديث بيانات العميل سالم القذافي" }))
    await screen.findByLabelText("المرحلة")
    fireEvent.change(screen.getByLabelText("المرحلة"), { target: { value: "active" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ البيانات" }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("صلاحيات غير كافية"), { timeout: 5000 })
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })
})
