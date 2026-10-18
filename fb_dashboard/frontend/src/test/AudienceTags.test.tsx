/**
 * P21-W6-B5 (gap #3a) — عقد مدير الوسوم في صفحة الجمهور.
 *
 * Pins (the W6-A1 verdict: tag APIs had ZERO consumers — segmentation was
 * sold via broadcast tag_contains but nobody could tag a subscriber):
 *   - the subscribers card gains «إدارة الوسوم» (list + create) and each
 *     row shows its tags + a 44px «وسوم المشترِك…» dialog button
 *   - create tag → POST /api/tags JSON {name, color} (editor); the
 *     server-error path toasts the SERVER's copy verbatim (400 duplicate)
 *   - apply/remove → the REAL per-subscriber endpoints: POST
 *     /api/subscribers/{id}/tags JSON {tag_id} and DELETE
 *     /api/subscribers/{id}/tags/{tag_id} (owner-checked server-side)
 *   - create-and-assign: an existing name is REUSED (no guaranteed 400),
 *     a new name runs POST /api/tags then the assign POST
 *   - a failed assign surfaces the server detail via brandedToast.error
 *
 * Mock bundle (house pattern): QueryClientProvider, premium-toast spy,
 * next/link anchor, fetch stub (jsonRes + stubFetch).
 */
import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AudiencePage from "@/app/dashboard/audience/page"

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

/* subscriber_engine.search wire shape — tags ride every row. */
const SUB_WITH_TAG = {
  id: 1,
  fb_user_id: "fb-1",
  name: "أحمد المهيدب",
  first_name: "أحمد",
  platform: "messenger",
  tags: [{ id: 10, name: "مهتم بالتوصيل", color: "#17C3A4" }],
  reply_count: 4,
  first_seen_at: "2026-09-01T10:00:00Z",
  last_interaction_at: "2026-10-01T10:00:00Z",
}

const TAGS = [
  { id: 10, name: "مهتم بالتوصيل", color: "#17C3A4", subscriber_count: 1 },
  { id: 11, name: "عميل متكرر", color: "#8A6FE0", subscriber_count: 0 },
]

function stubHappy(extra: Record<string, () => Response | Promise<Response>> = {}) {
  return stubFetch({
    "GET /api/analytics/overview?days=30": () =>
      jsonRes({ success: true, data: { total_replies: 30, today_replies: 3, fan_count: 120 } }),
    "GET /api/analytics/top-commenters?limit=5": () => jsonRes({ success: true, data: [] }),
    "GET /api/subscribers?page=1&per_page=10": () =>
      jsonRes({ success: true, data: { items: [SUB_WITH_TAG], total: 1, page: 1, per_page: 10 } }),
    "GET /api/tags": () => jsonRes({ success: true, data: TAGS }),
    ...extra,
  })
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <AudiencePage />
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

describe("subscribers card — the tag surface", () => {
  it("renders row tag chips (the search serializer's tags) + the manager button", async () => {
    stubHappy()
    renderPage()

    expect(await screen.findByText("أحمد المهيدب")).toBeInTheDocument()
    /* the row's live tags render as chips (name + the server's color dot). */
    expect(screen.getByText("مهتم بالتوصيل")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "إدارة الوسوم" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "وسوم المشترِك أحمد المهيدب" })).toBeInTheDocument()
  })

  it("the manager dialog lists tags with their subscriber counts", async () => {
    stubHappy()
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "إدارة الوسوم" }))

    /* the dialog opens with the tenant's tags (name + count per row) —
     * awaited: the tags query resolves AFTER the dialog mounts.
     * (مهتم بالتوصيل also rides the row chip behind the backdrop, so the
     * un-assigned tag is the clean single-match proof the list loaded.) */
    expect(await screen.findByText("عميل متكرر")).toBeInTheDocument()
  })
})

describe("create tag (POST /api/tags — editor role)", () => {
  it("posts JSON {name, color} and toasts success", async () => {
    const api = stubHappy({
      "POST /api/tags": () =>
        jsonRes({ success: true, data: { id: 12, name: "VIP", color: "#F59E0B", subscriber_count: 0 } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "إدارة الوسوم" }))
    fireEvent.change(await screen.findByLabelText("اسم الوسم"), { target: { value: "VIP" } })
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الوسم" }))

    await waitFor(() => expect(api.callsFor("POST /api/tags")).toHaveLength(1), { timeout: 5000 })
    expect(api.jsonBodiesFor("POST /api/tags")[0]).toEqual({
      name: "VIP",
      color: "#8A6FE0",
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إنشاء الوسم")
  })

  it("server 400 (duplicate) → the SERVER's copy rides the error toast", async () => {
    const api = stubHappy({
      "POST /api/tags": () =>
        jsonRes({ success: false, error: "Tag 'عميل متكرر' already exists" }, 400),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "إدارة الوسوم" }))
    fireEvent.change(await screen.findByLabelText("اسم الوسم"), { target: { value: "عميل متكرر" } })
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الوسم" }))

    /* the request DID fire — the server answered 400 and the toast rides
     * the server's own words. */
    await waitFor(() => expect(api.callsFor("POST /api/tags")).toHaveLength(1), { timeout: 5000 })
    expect(mocks.toastError).toHaveBeenCalledWith("Tag 'عميل متكرر' already exists")
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it("empty name keeps the create button inert (the 422 class)", async () => {
    const api = stubHappy()
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "إدارة الوسوم" }))
    const btn = await screen.findByRole("button", { name: "إنشاء الوسم" })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(api.callsFor("POST /api/tags")).toHaveLength(0)
  })
})

describe("apply/remove tag to a subscriber (the REAL per-subscriber contract)", () => {
  it("assign: POST /api/subscribers/{id}/tags JSON {tag_id}", async () => {
    const api = stubHappy({
      "POST /api/subscribers/1/tags": () => jsonRes({ success: true, data: { ok: true } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "وسوم المشترِك أحمد المهيدب" }))
    /* «عميل متكرر» is NOT on the row yet → its chip is the assign action. */
    fireEvent.click(await screen.findByRole("button", { name: "تعيين وسم عميل متكرر" }))

    await waitFor(() => expect(api.callsFor("POST /api/subscribers/1/tags")).toHaveLength(1), { timeout: 5000 })
    expect(api.jsonBodiesFor("POST /api/subscribers/1/tags")[0]).toEqual({ tag_id: 11 })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم تعيين الوسم")
  })

  it("remove: DELETE /api/subscribers/{id}/tags/{tag_id}", async () => {
    const api = stubHappy({
      "DELETE /api/subscribers/1/tags/10": () => jsonRes({ success: true, data: { ok: true } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "وسوم المشترِك أحمد المهيدب" }))
    /* «مهتم بالتوصيل» IS on the row (pressed chip) → clicking removes it. */
    fireEvent.click(await screen.findByRole("button", { name: "إزالة وسم مهتم بالتوصيل" }))

    await waitFor(() => expect(api.callsFor("DELETE /api/subscribers/1/tags/10")).toHaveLength(1), { timeout: 5000 })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تمت إزالة الوسم")
  })

  it("a failed assign surfaces the server detail (never a silent chip flip)", async () => {
    stubHappy({
      "POST /api/subscribers/1/tags": () =>
        jsonRes({ success: false, error: "صلاحيات غير كافية" }, 403),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "وسوم المشترِك أحمد المهيدب" }))
    fireEvent.click(await screen.findByRole("button", { name: "تعيين وسم عميل متكرر" }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("صلاحيات غير كافية"), { timeout: 5000 })
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it("create-and-assign: existing name is REUSED (one POST, no guaranteed 400)", async () => {
    const api = stubHappy({
      "POST /api/subscribers/1/tags": () => jsonRes({ success: true, data: { ok: true } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "وسوم المشترِك أحمد المهيدب" }))
    fireEvent.change(await screen.findByLabelText("اسم الوسم"), { target: { value: "عميل متكرر" } })
    fireEvent.click(screen.getByRole("button", { name: "إنشاء ووسم" }))

    await waitFor(() => expect(api.callsFor("POST /api/subscribers/1/tags")).toHaveLength(1), { timeout: 5000 })
    /* NO create fired — the name existed, the tag was reused honestly. */
    expect(api.callsFor("POST /api/tags")).toHaveLength(0)
    expect(mocks.toastSuccess).toHaveBeenCalledWith("الوسم موجود — تم تعيينه للمشترِك")
  })

  it("create-and-assign: NEW name → POST /api/tags then the assign POST", async () => {
    const api = stubHappy({
      "POST /api/tags": () =>
        jsonRes({ success: true, data: { id: 12, name: "متابع جديد", color: "#8A6FE0", subscriber_count: 0 } }),
      "POST /api/subscribers/1/tags": () => jsonRes({ success: true, data: { ok: true } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "وسوم المشترِك أحمد المهيدب" }))
    fireEvent.change(await screen.findByLabelText("اسم الوسم"), { target: { value: "متابع جديد" } })
    fireEvent.click(screen.getByRole("button", { name: "إنشاء ووسم" }))

    await waitFor(() => expect(api.callsFor("POST /api/subscribers/1/tags")).toHaveLength(1), { timeout: 5000 })
    expect(api.jsonBodiesFor("POST /api/tags")).toEqual([{ name: "متابع جديد" }])
    expect(api.jsonBodiesFor("POST /api/subscribers/1/tags")[0]).toEqual({ tag_id: 12 })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إنشاء الوسم وتعيينه للمشترِك")
  })
})
