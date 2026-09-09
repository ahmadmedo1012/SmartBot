/**
 * v17-E-F9 — عقد صفحة الحملات التسلسلية (Pro 129 drip).
 *
 * Pins (the testable half of the promise):
 *   - list cards render the REAL backend statuses (draft/active/paused) +
 *     step counts joined from the per-id detail fetches (the list serializer
 *     has no steps field — the page enriches it in parallel)
 *   - create flow saves steps with 0-BASED step_order (engine contract:
 *     subscribe starts current_step=0, so 1-based numbering never fires —
 *     documented in tests/test_v11_broadcast_sequence.py) AND reflects
 *     in-editor reordering into the persisted order
 *   - delete is a two-step ARABIC confirm (icon → «تأكيد الحذف» → DELETE)
 *   - activate/pause toggles PUT the sequence status
 *   - duplicate subscribe (ok:false envelope) surfaces an honest Arabic
 *     message, not a network error
 *
 * Mock bundle (house pattern from MessagesPage.test.tsx): QueryClientProvider,
 * premium-toast spy, next/link + next/image anchors, fetch stub.
 */
import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import SequencesPage from "@/app/dashboard/sequences/page"

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
vi.mock("next/image", () => ({
  default: function MockImage({ alt, src }: { alt: string; src: string }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} />
  },
}))

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function stubFetch(routes: Record<string, () => Response>) {
  const calls: { method: string; url: string; body?: string }[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const method = ((init?.method ?? "GET") as string).toUpperCase()
    calls.push({ method, url: u, body: init?.body ? String(init.body) : undefined })
    const maker = routes[`${method} ${u}`]
    return maker ? maker() : jsonRes({ success: true, data: {} })
  })
  vi.stubGlobal("fetch", fn)
  return {
    calls,
    /* v17-fix(coordinator): route strings are "METHOD /path" — match BOTH
       parts. The old helper compared the full route string to c.url alone,
       which never matched anything and failed every assertion below. */
    callsFor(route: string) {
      const method = route.split(" ")[0]
      const path = route.slice(route.indexOf(" ") + 1)
      return calls.filter((c) => c.method === method && c.url === path)
    },
    bodiesFor(route: string) {
      const method = route.split(" ")[0]
      const path = route.slice(route.indexOf(" ") + 1)
      return calls
        .filter((c) => c.method === method && c.url === path && c.body)
        .map((c) => JSON.parse(c.body as string))
    },
  }
}

const ACTIVE_SEQ = {
  id: 1,
  name: "سلسلة الترحيب",
  description: "ترحيب بالعملاء الجدد",
  status: "active",
  total_subscribers: 3,
  total_sent: 12,
  subscriber_count: 2,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-05T10:00:00Z",
}

const DRAFT_SEQ = {
  id: 2,
  name: "متابعة ما بعد الشراء",
  status: "draft",
  total_subscribers: 0,
  total_sent: 0,
  subscriber_count: 0,
  created_at: "2026-09-02T10:00:00Z",
  updated_at: "2026-09-02T10:00:00Z",
}

function detailOf(seq: Record<string, unknown>, steps: unknown[]) {
  return { ...seq, steps }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SequencesPage />
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

describe("list cards (contract: statuses + joined step counts)", () => {
  it("renders names, REAL statuses, step counts and subscriber stats from the list + detail endpoints", async () => {
    stubFetch({
      "GET /api/sequences": () => jsonRes({ success: true, data: [ACTIVE_SEQ, DRAFT_SEQ] }),
      "GET /api/sequences/1": () =>
        jsonRes({
          success: true,
          data: detailOf(ACTIVE_SEQ, [
            { id: 11, step_order: 0, delay_days: 0, delay_hours: 0, message_template: "أهلاً" },
            { id: 12, step_order: 1, delay_days: 2, delay_hours: 0, message_template: "كيف تجد المنتج؟" },
          ]),
        }),
      "GET /api/sequences/2": () => jsonRes({ success: true, data: detailOf(DRAFT_SEQ, []) }),
    })
    renderPage()

    expect(await screen.findByText("سلسلة الترحيب")).toBeInTheDocument()
    expect(screen.getByText("متابعة ما بعد الشراء")).toBeInTheDocument()
    /* real backend statuses — NOT the task-brief's pending/completed guesses */
    expect(screen.getByText("نشطة")).toBeInTheDocument()
    expect(screen.getByText("مسودة")).toBeInTheDocument()
    /* step count enriched from the detail fetch: "خطوتين" for seq 1 */
    expect(screen.getByText(/خطوتين/)).toBeInTheDocument()
  })
})

describe("create flow (engine contract: 0-based step_order + reorder persistence)", () => {
  it("POSTs the sequence then each step with step_order starting at 0, in the REORDERED order", async () => {
    const api = stubFetch({
      "GET /api/sequences": () => jsonRes({ success: true, data: [] }),
      "POST /api/sequences": () => jsonRes({ success: true, data: { id: 10 } }),
      "POST /api/sequences/10/steps": () => jsonRes({ success: true, data: { id: 101 } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "حملة جديدة" }))
    fireEvent.change(await screen.findByLabelText("اسم الحملة"), {
      target: { value: "سلسلة تجريبية" },
    })
    fireEvent.change(screen.getByLabelText("نص الخطوة 1"), { target: { value: "رسالة أولى" } })
    fireEvent.click(screen.getByRole("button", { name: "إضافة خطوة" }))
    fireEvent.change(screen.getByLabelText("نص الخطوة 2"), { target: { value: "رسالة ثانية" } })

    /* reorder: move the first step DOWN — the editor must persist the new order */
    fireEvent.click(screen.getByRole("button", { name: "نقل الخطوة 1 للأسفل" }))
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحملة" }))

    await waitFor(() => expect(api.callsFor("POST /api/sequences")).toHaveLength(1), { timeout: 5000 })
    expect(api.bodiesFor("POST /api/sequences")[0]).toEqual({
      name: "سلسلة تجريبية",
      description: "",
    })

    await waitFor(() => expect(api.callsFor("POST /api/sequences/10/steps")).toHaveLength(2))
    const payloads = api.bodiesFor("POST /api/sequences/10/steps")
    /* 0-based numbering (engine: subscribe starts current_step=0) and the
       reordered content — the moved-down step is now FIRST (order 0) */
    expect(payloads.map((p) => [p.step_order, p.message_template])).toEqual([
      [0, "رسالة ثانية"],
      [1, "رسالة أولى"],
    ])
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إنشاء الحملة التسلسلية")
  })
})

describe("activate/pause toggle", () => {
  it("an active campaign's «إيقاف» PUTs status paused", async () => {
    const api = stubFetch({
      "GET /api/sequences": () => jsonRes({ success: true, data: [ACTIVE_SEQ] }),
      "GET /api/sequences/1": () =>
        jsonRes({ success: true, data: detailOf(ACTIVE_SEQ, [{ id: 11, step_order: 0, message_template: "أهلاً" }]) }),
      "PUT /api/sequences/1": () => jsonRes({ success: true, data: { ok: true } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "إيقاف الحملة سلسلة الترحيب" }))
    await waitFor(() => expect(api.callsFor("PUT /api/sequences/1")).toHaveLength(1), { timeout: 5000 })
    expect(api.bodiesFor("PUT /api/sequences/1")[0]).toEqual({ status: "paused" })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إيقاف الحملة مؤقتًا")
  })
})

describe("delete — two-step Arabic confirm", () => {
  it("icon click only arms the confirm; the DELETE fires on «تأكيد الحذف» only", async () => {
    const api = stubFetch({
      "GET /api/sequences": () => jsonRes({ success: true, data: [ACTIVE_SEQ] }),
      "GET /api/sequences/1": () =>
        jsonRes({ success: true, data: detailOf(ACTIVE_SEQ, [{ id: 11, step_order: 0, message_template: "أهلاً" }]) }),
      "DELETE /api/sequences/1": () => jsonRes({ success: true, data: { ok: true } }),
    })
    renderPage()

    /* first click is NOT the delete itself */
    fireEvent.click(await screen.findByRole("button", { name: "حذف الحملة سلسلة الترحيب" }))
    expect(api.callsFor("DELETE /api/sequences/1")).toHaveLength(0)
    expect(screen.getByRole("button", { name: "تأكيد الحذف" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "تأكيد الحذف" }))
    await waitFor(() => expect(api.callsFor("DELETE /api/sequences/1")).toHaveLength(1), { timeout: 5000 })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم حذف الحملة وكل خطواتها")
  })
})

describe("audience enrollment (subscribe contract)", () => {
  it("a duplicate subscribe (ok:false) surfaces an honest Arabic message, not a network error", async () => {
    stubFetch({
      "GET /api/sequences": () => jsonRes({ success: true, data: [ACTIVE_SEQ] }),
      "GET /api/sequences/1": () =>
        jsonRes({
          success: true,
          data: detailOf(ACTIVE_SEQ, [{ id: 11, step_order: 0, delay_days: 1, message_template: "أهلاً {name}" }]),
        }),
      "GET /api/subscribers?per_page=20": () =>
        jsonRes({
          success: true,
          data: { items: [{ id: 5, first_name: "أحمد", platform: "messenger" }], total: 1 },
        }),
      "POST /api/sequences/1/subscribe/5": () => jsonRes({ success: true, data: { ok: false } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "تحرير الحملة سلسلة الترحيب" }))
    fireEvent.click(await screen.findByRole("button", { name: "إضافة أحمد إلى الحملة" }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("هذا المشترك مضاف بالفعل إلى الحملة"))
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith("أُضيف المشترك — سيبدأ من الخطوة الأولى")
  })
})
