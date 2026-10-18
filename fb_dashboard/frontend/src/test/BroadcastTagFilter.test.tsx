/**
 * P21-W6-B5 (gap #3c) — عقد تصفية البث بالوسوم في نموذج الإنشاء.
 *
 * Pins (the W6-A1 verdict: broadcast segment filters support tag_contains
 * server-side, broadcast_engine.py:250-257, but the UI had NO filter input —
 * the segmentation capability was sold yet unreachable):
 *   - the create form gains «تصفية بالوسوم (اختياري)»: toggle chips fed by
 *     GET /api/tags (fetched ONLY while the form is open — enabled gate)
 *   - no tags yet → the honest hint points at الجمهور/إدارة الوسوم (the
 *     tag manager shipped in the same batch) + the no-filter truth
 *   - selecting tags rides the POST /api/broadcasts body verbatim:
 *     segment_filters.tag_contains = [names] (the engine's exact match
 *     key); selecting NONE sends segment_filters: {} (no filtering)
 *
 * Mock bundle (house pattern): QueryClientProvider, premium-toast spy,
 * next/link anchor, fetch stub.
 */
import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import BroadcastPage from "@/app/dashboard/broadcast/page"

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
    jsonBodiesFor(route: string) {
      const method = route.split(" ")[0]
      const path = route.slice(route.indexOf(" ") + 1)
      return calls
        .filter((c) => c.method === method && c.url === path && c.body)
        .map((c) => JSON.parse(c.body as string))
    },
  }
}

const TAGS = [
  { id: 10, name: "مهتم بالتوصيل", color: "#17C3A4", subscriber_count: 3 },
  { id: 11, name: "عميل متكرر", color: "#8A6FE0", subscriber_count: 2 },
]

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <BroadcastPage />
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

describe("tag filter — the create form surface", () => {
  it("renders toggle chips fed by GET /api/tags once the form opens", async () => {
    stubFetch({
      "GET /api/broadcasts": () =>
        jsonRes({ success: true, data: [{ id: 1, name: "بث سابق", status: "sent", created_at: "2026-09-01T10:00:00Z" }] }),
      "GET /api/tags": () => jsonRes({ success: true, data: TAGS }),
    })
    renderPage()

    /* the tags query is enabled ONLY while the form is open (the gate);
     * the chips are awaited — they resolve after the form mounts. */
    fireEvent.click(await screen.findByRole("button", { name: "بث جديد" }))
    expect(await screen.findByText("تصفية بالوسوم (اختياري)")).toBeInTheDocument()
    expect(await screen.findByRole("button", { name: "تصفية بالوسم مهتم بالتوصيل" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "تصفية بالوسم عميل متكرر" })).toBeInTheDocument()
    /* the no-selection truth is stated (no filter = everyone). */
    expect(screen.getByText("بدون وسوم: يُرسَل لكل المشتركين.")).toBeInTheDocument()
  })

  it("no tags yet → the honest hint points at the audience tag manager", async () => {
    stubFetch({
      "GET /api/broadcasts": () =>
        jsonRes({ success: true, data: [{ id: 1, name: "بث سابق", status: "sent", created_at: "2026-09-01T10:00:00Z" }] }),
      "GET /api/tags": () => jsonRes({ success: true, data: [] }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "بث جديد" }))
    expect(
      await screen.findByText(/أنشئها من صفحة «الجمهور» \(إدارة الوسوم\)/),
    ).toBeInTheDocument()
  })
})

describe("the POST body — segment_filters.tag_contains (engine contract)", () => {
  it("selected tags ride the create body by NAME (the engine's match key)", async () => {
    const api = stubFetch({
      "GET /api/broadcasts": () =>
        jsonRes({ success: true, data: [{ id: 1, name: "بث سابق", status: "sent", created_at: "2026-09-01T10:00:00Z" }] }),
      "GET /api/tags": () => jsonRes({ success: true, data: TAGS }),
      "POST /api/broadcasts": () => jsonRes({ success: true, data: { id: 5 } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "بث جديد" }))
    fireEvent.change(await screen.findByLabelText("اسم البث"), { target: { value: "عرض التوصيل" } })
    fireEvent.change(screen.getByLabelText("نص الرسالة"), { target: { value: "خصم 20% على التوصيل هذا الأسبوع" } })
    fireEvent.click(await screen.findByRole("button", { name: "تصفية بالوسم مهتم بالتوصيل" }))
    /* pressed chip + the live selection count. */
    expect(screen.getByText("يُرسَل للمشتركين حامل أي وسم محدد (1).")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "إنشاء البث" }))

    await waitFor(() => expect(api.callsFor("POST /api/broadcasts")).toHaveLength(1), { timeout: 5000 })
    expect(api.jsonBodiesFor("POST /api/broadcasts")[0]).toEqual({
      name: "عرض التوصيل",
      message_template: "خصم 20% على التوصيل هذا الأسبوع",
      segment_filters: { tag_contains: ["مهتم بالتوصيل"] },
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إنشاء البث — يمكنك إرساله الآن")
  })

  it("multi-select sends the full name list; NO selection sends {} (no filter)", async () => {
    const api = stubFetch({
      "GET /api/broadcasts": () =>
        jsonRes({ success: true, data: [{ id: 1, name: "بث سابق", status: "sent", created_at: "2026-09-01T10:00:00Z" }] }),
      "GET /api/tags": () => jsonRes({ success: true, data: TAGS }),
      "POST /api/broadcasts": () => jsonRes({ success: true, data: { id: 6 } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "بث جديد" }))
    fireEvent.change(await screen.findByLabelText("اسم البث"), { target: { value: "بث عام" } })
    fireEvent.change(screen.getByLabelText("نص الرسالة"), { target: { value: "رسالة لكل المشتركين" } })

    /* two presses → both names; then deselect one → only the survivor. */
    fireEvent.click(await screen.findByRole("button", { name: "تصفية بالوسم مهتم بالتوصيل" }))
    fireEvent.click(screen.getByRole("button", { name: "تصفية بالوسم عميل متكرر" }))
    fireEvent.click(screen.getByRole("button", { name: "إزالة تصفية بالوسم مهتم بالتوصيل" }))
    fireEvent.click(screen.getByRole("button", { name: "إنشاء البث" }))

    await waitFor(() => expect(api.callsFor("POST /api/broadcasts")).toHaveLength(1), { timeout: 5000 })
    expect(api.jsonBodiesFor("POST /api/broadcasts")[0].segment_filters).toEqual({
      tag_contains: ["عميل متكرر"],
    })
  })
})
