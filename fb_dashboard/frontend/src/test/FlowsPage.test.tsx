/**
 * P21-W6-B1 — عقد صفحة «التدفقات» (Premium has_flows — أول مستهلك واجهة).
 *
 * Pins (the testable half of the promise):
 *   - list cards render the REAL backend statuses (draft/active/paused per
 *     ST_CYCLE in routers/flows.py) + the HONEST run counter («تنفيذ» not
 *     «رد»: the engine bumps total_replies on every execution incl. /test)
 *   - the honesty contract: «وضع الاختبار — التنفيذ اليدوي» is on the page
 *     (the engine is dormant — /test is the only execution path today), and
 *     the status toggle is a persisted-config switch (ST_CYCLE), never a
 *     "live automation" claim
 *   - create POSTs the REAL node/edge schema (flow_engine.py: TRIGGER
 *     {triggerType, keywords[], matchMode} + chained MESSAGE nodes)
 *   - create validation: no name → the save button is inert (API 422 class)
 *   - 403 plan gate (POST only) → PremiumLockBody with the SERVER's Arabic
 *     copy (GATE_MESSAGES.has_flows) + /subscribe CTA — not a bare toast
 *   - toggle → POST /{id}/toggle; a NON-plan 403 (viewer role) surfaces the
 *     server detail via brandedToast.error (the W5-C1 discrimination)
 *   - test run → POST /{id}/test with {text}; the returned trace renders
 *     VERBATIM (action/node_id/message — mono, the engine's own words)
 *   - delete is a two-step ARABIC confirm (icon → «تأكيد الحذف» → DELETE)
 *   - advanced graphs (CONDITION/DELAY nodes): edit PUTs metadata ONLY —
 *     nodes/edges are never rebuilt client-side (PUT replaces them; the
 *     data-loss guard)
 *
 * Mock bundle (house pattern from SequencesPage.test.tsx): QueryClientProvider,
 * premium-toast spy, next/navigation (useRouter for the lock CTA), fetch stub.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import FlowsPage from "@/app/dashboard/flows/page"

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  navPush: vi.fn(),
}))

vi.mock("@/lib/premium-toast", () => ({
  brandedToast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.navPush, replace: vi.fn(), back: vi.fn() }),
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
    bodiesFor(route: string) {
      const method = route.split(" ")[0]
      const path = route.slice(route.indexOf(" ") + 1)
      return calls
        .filter((c) => c.method === method && c.url === path && c.body)
        .map((c) => JSON.parse(c.body as string))
    },
  }
}

const ACTIVE_FLOW = {
  id: 1,
  name: "أسعار التوصيل",
  description: "يرد على أسئلة الأسعار",
  status: "active",
  version: 1,
  total_replies: 5,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-05T10:00:00Z",
}

const DRAFT_FLOW = {
  id: 2,
  name: "ترحيب المتابعين",
  description: "",
  status: "draft",
  version: 1,
  total_replies: 0,
  created_at: "2026-09-02T10:00:00Z",
  updated_at: "2026-09-02T10:00:00Z",
}

const SIMPLE_DETAIL = {
  ...ACTIVE_FLOW,
  nodes: [
    { id: "trigger", type: "TRIGGER", data: { triggerType: "keyword", keywords: ["سعر"], matchMode: "any" } },
    { id: "msg-1", type: "MESSAGE", data: { text: "أهلاً" } },
  ],
  edges: [{ source: "trigger", target: "msg-1" }],
}

function renderPage() {
  /* retryDelay 0: the page's list query carries the house `retry: 1`
   * (sequences/tools convention) — the default exponential backoff would
   * stall the error-branch assertions behind the 1s+ retry window. */
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <FlowsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
  mocks.navPush.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("list (contract: real statuses + honest run counter)", () => {
  it("renders skeleton slabs while the list loads", () => {
    /* never-resolving GET — the loading state is the contract under test */
    stubFetch({
      "GET /api/flows": () => new Promise<Response>(() => {}),
    })
    const { container } = renderPage()
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(3)
  })

  it("renders names, REAL statuses, and the honest «تنفيذ» counter (not «رد»)", async () => {
    stubFetch({
      "GET /api/flows": () => jsonRes({ success: true, data: [ACTIVE_FLOW, DRAFT_FLOW] }),
    })
    renderPage()

    expect(await screen.findByText("أسعار التوصيل")).toBeInTheDocument()
    expect(screen.getByText("ترحيب المتابعين")).toBeInTheDocument()
    /* real backend statuses — draft/active/paused (ST_CYCLE) */
    expect(screen.getByText("مفعّل")).toBeInTheDocument()
    expect(screen.getByText("مسودة")).toBeInTheDocument()
    /* the engine's counter counts executions (incl. tests), not replies */
    expect(screen.getByText("5 تنفيذات")).toBeInTheDocument()
    expect(screen.getByText("لا تنفيذات")).toBeInTheDocument()
    expect(screen.queryByText(/ردود/)).not.toBeInTheDocument()
    /* the honesty note rides the page: test mode, manual execution only */
    expect(screen.getByText(/وضع الاختبار — التنفيذ اليدوي/)).toBeInTheDocument()
  })

  it("renders the honest empty state with a create CTA", async () => {
    stubFetch({
      "GET /api/flows": () => jsonRes({ success: true, data: [] }),
    })
    renderPage()

    expect(await screen.findByText("لا توجد تدفقات")).toBeInTheDocument()
    /* the CTA rides BOTH the header and the empty well — both open the editor */
    const ctas = screen.getAllByRole("button", { name: "تدفق جديد" })
    expect(ctas.length).toBe(2)
    fireEvent.click(ctas[0]!)
    expect(await screen.findByLabelText("اسم التدفق")).toBeInTheDocument()
  })

  it("renders the canonical error state with retry (no plan-lock conflation)", async () => {
    stubFetch({
      "GET /api/flows": () => jsonRes({ success: false, error: "تعذّر الوصول" }, 500),
    })
    renderPage()

    expect(await screen.findByText("تعذّر تحميل التدفقات")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument()
  })
})

describe("create flow (real node/edge schema built client-side)", () => {
  it("save is inert without a name (the API 422 class)", async () => {
    const api = stubFetch({
      "GET /api/flows": () => jsonRes({ success: true, data: [] }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "تدفق جديد" }))
    const save = await screen.findByRole("button", { name: "إنشاء التدفق" })
    expect(save).toBeDisabled()

    fireEvent.click(save)
    expect(api.callsFor("POST /api/flows")).toHaveLength(0)
  })

  it("POSTs TRIGGER{keywords,matchMode} + chained MESSAGE nodes/edges", async () => {
    const api = stubFetch({
      "GET /api/flows": () => jsonRes({ success: true, data: [] }),
      "POST /api/flows": () => jsonRes({ success: true, data: { id: 10 } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "تدفق جديد" }))
    fireEvent.change(await screen.findByLabelText("اسم التدفق"), {
      target: { value: "تدفق الأسعار" },
    })
    fireEvent.change(screen.getByLabelText("كلمات التشغيل (اختياري)"), {
      target: { value: "سعر، توصيل" },
    })
    fireEvent.change(screen.getByLabelText("الرسالة 1"), { target: { value: "أهلاً بك" } })

    fireEvent.click(screen.getByRole("button", { name: "إنشاء التدفق" }))

    await waitFor(() => expect(api.callsFor("POST /api/flows")).toHaveLength(1), { timeout: 5000 })
    expect(api.bodiesFor("POST /api/flows")[0]).toEqual({
      name: "تدفق الأسعار",
      description: "",
      nodes: [
        { id: "trigger", type: "TRIGGER", data: { triggerType: "keyword", keywords: ["سعر", "توصيل"], matchMode: "any" } },
        { id: "msg-1", type: "MESSAGE", data: { text: "أهلاً بك" } },
      ],
      edges: [{ source: "trigger", target: "msg-1" }],
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إنشاء التدفق")
  })

  it("no keywords → the trigger is honest: triggerType manual (always matchable)", async () => {
    const api = stubFetch({
      "GET /api/flows": () => jsonRes({ success: true, data: [] }),
      "POST /api/flows": () => jsonRes({ success: true, data: { id: 11 } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "تدفق جديد" }))
    fireEvent.change(await screen.findByLabelText("اسم التدفق"), { target: { value: "تدفق يدوي" } })
    fireEvent.click(screen.getByRole("button", { name: "إنشاء التدفق" }))

    await waitFor(() => expect(api.callsFor("POST /api/flows")).toHaveLength(1), { timeout: 5000 })
    expect(api.bodiesFor("POST /api/flows")[0].nodes).toEqual([
      { id: "trigger", type: "TRIGGER", data: { triggerType: "manual" } },
    ])
  })
})

describe("403 plan gate (create only) → PremiumLockBody", () => {
  it("surfaces the server's Arabic upgrade copy + /subscribe CTA, not a toast", async () => {
    stubFetch({
      "GET /api/flows": () => jsonRes({ success: true, data: [] }),
      /* GATE_MESSAGES.has_flows — verbatim from fb_dashboard/_plan_gates.py */
      "POST /api/flows": () =>
        jsonRes({ success: false, error: "التدفقات متاحة في خطة مميز أو أعلى — رقِّ خطتك" }, 403),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "تدفق جديد" }))
    fireEvent.change(await screen.findByLabelText("اسم التدفق"), { target: { value: "تدفق ممنوع" } })
    fireEvent.click(screen.getByRole("button", { name: "إنشاء التدفق" }))

    expect(await screen.findByText("التدفقات — متاحة في Premium")).toBeInTheDocument()
    expect(screen.getByText("التدفقات متاحة في خطة مميز أو أعلى — رقِّ خطتك")).toBeInTheDocument()
    /* the lock body IS the surface — no error toast for the plan family */
    expect(mocks.toastError).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "ترقية الخطة" }))
    expect(mocks.navPush).toHaveBeenCalledWith("/subscribe")
  })
})

describe("status toggle (ST_CYCLE — persisted config)", () => {
  it("an active flow's switch POSTs /toggle and toasts the server-returned status", async () => {
    const api = stubFetch({
      "GET /api/flows": () => jsonRes({ success: true, data: [ACTIVE_FLOW] }),
      "POST /api/flows/1/toggle": () => jsonRes({ success: true, data: { status: "paused" } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("switch", { name: "إيقاف التدفق أسعار التوصيل" }))
    await waitFor(() => expect(api.callsFor("POST /api/flows/1/toggle")).toHaveLength(1), { timeout: 5000 })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إيقاف التدفق مؤقتًا")
  })

  it("a NON-plan 403 (viewer role) surfaces the server detail via toast — never the lock", async () => {
    const api = stubFetch({
      "GET /api/flows": () => jsonRes({ success: true, data: [ACTIVE_FLOW] }),
      "POST /api/flows/1/toggle": () => jsonRes({ success: false, error: "صلاحيات غير كافية" }, 403),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("switch", { name: "إيقاف التدفق أسعار التوصيل" }))
    await waitFor(() => expect(api.callsFor("POST /api/flows/1/toggle")).toHaveLength(1), { timeout: 5000 })
    expect(mocks.toastError).toHaveBeenCalledWith("صلاحيات غير كافية")
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    /* the W5-C1 discrimination: this 403 must NOT render the Premium lock */
    expect(screen.queryByText("التدفقات — متاحة في Premium")).not.toBeInTheDocument()
  })
})

describe("run test (POST /{id}/test — the only execution path today)", () => {
  it("POSTs {text} and renders the returned trace VERBATIM with the test-mode note", async () => {
    const api = stubFetch({
      "GET /api/flows": () => jsonRes({ success: true, data: [ACTIVE_FLOW] }),
      "POST /api/flows/1/test": () =>
        jsonRes({
          success: true,
          data: {
            execution_id: 7,
            trace: {
              action: "passed",
              node_id: "trigger",
              next: { action: "message_sent", node_id: "msg-1", message: "أهلاً أحمد" },
            },
          },
        }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "تشغيل اختبار التدفق أسعار التوصيل" }))
    /* the honesty note lives WHERE the results are shown — the dialog adds a
     * second instance to the page-level one (both are the contract) */
    const notes = await screen.findAllByText(/وضع الاختبار — التنفيذ اليدوي/)
    expect(notes.length).toBe(2)
    fireEvent.change(await screen.findByLabelText("نص الرسالة الواردة التجريبي"), {
      target: { value: "كم السعر؟" },
    })
    fireEvent.click(screen.getByRole("button", { name: "تشغيل" }))

    await waitFor(() => expect(api.callsFor("POST /api/flows/1/test")).toHaveLength(1), { timeout: 5000 })
    expect(api.bodiesFor("POST /api/flows/1/test")[0]).toEqual({ text: "كم السعر؟" })
    /* the engine's own words, verbatim (mono chain): ids + actions */
    expect(await screen.findByText("trigger")).toBeInTheDocument()
    expect(screen.getByText("passed")).toBeInTheDocument()
    expect(screen.getByText("msg-1")).toBeInTheDocument()
    expect(screen.getByText("message_sent")).toBeInTheDocument()
    expect(screen.getByText("«أهلاً أحمد»")).toBeInTheDocument()
    expect(screen.getByText("7")).toBeInTheDocument()
  })
})

describe("delete — two-step Arabic confirm", () => {
  it("icon click only arms the confirm; the DELETE fires on «تأكيد الحذف» only", async () => {
    const api = stubFetch({
      "GET /api/flows": () => jsonRes({ success: true, data: [ACTIVE_FLOW] }),
      "DELETE /api/flows/1": () => jsonRes({ success: true, data: { ok: true } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "حذف التدفق أسعار التوصيل" }))
    expect(api.callsFor("DELETE /api/flows/1")).toHaveLength(0)
    expect(screen.getByRole("button", { name: "تأكيد الحذف" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "تأكيد الحذف" }))
    await waitFor(() => expect(api.callsFor("DELETE /api/flows/1")).toHaveLength(1), { timeout: 5000 })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم حذف التدفق وسجل تنفيذاته")
  })
})

describe("edit (PUT contract + the advanced-graph data-loss guard)", () => {
  it("hydrates the simple chain and PUTs the rebuilt nodes/edges", async () => {
    const api = stubFetch({
      "GET /api/flows": () => jsonRes({ success: true, data: [ACTIVE_FLOW] }),
      "GET /api/flows/1": () => jsonRes({ success: true, data: SIMPLE_DETAIL }),
      "PUT /api/flows/1": () => jsonRes({ success: true, data: { ok: true } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "تحرير التدفق أسعار التوصيل" }))
    await waitFor(() => expect(screen.getByLabelText("الرسالة 1")).toHaveValue("أهلاً"))
    await waitFor(() => expect(screen.getByLabelText("كلمات التشغيل (اختياري)")).toHaveValue("سعر"))

    fireEvent.change(screen.getByLabelText("الرسالة 1"), { target: { value: "أهلاً وسهلاً" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }))

    await waitFor(() => expect(api.callsFor("PUT /api/flows/1")).toHaveLength(1), { timeout: 5000 })
    expect(api.bodiesFor("PUT /api/flows/1")[0]).toEqual({
      name: "أسعار التوصيل",
      description: "يرد على أسئلة الأسعار",
      nodes: [
        { id: "trigger", type: "TRIGGER", data: { triggerType: "keyword", keywords: ["سعر"], matchMode: "any" } },
        { id: "msg-1", type: "MESSAGE", data: { text: "أهلاً وسهلاً" } },
      ],
      edges: [{ source: "trigger", target: "msg-1" }],
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم حفظ تعديلات التدفق")
  })

  it("an ADVANCED graph (CONDITION node) edits metadata ONLY — nodes/edges never sent", async () => {
    const api = stubFetch({
      "GET /api/flows": () => jsonRes({ success: true, data: [ACTIVE_FLOW] }),
      "GET /api/flows/1": () =>
        jsonRes({
          success: true,
          data: {
            ...SIMPLE_DETAIL,
            nodes: [
              ...SIMPLE_DETAIL.nodes,
              { id: "cond-1", type: "CONDITION", data: { field: "text", operator: "contains", value: "سعر" } },
            ],
            edges: [
              ...SIMPLE_DETAIL.edges,
              { source: "msg-1", target: "cond-1", sourceHandle: "true" },
            ],
          },
        }),
      "PUT /api/flows/1": () => jsonRes({ success: true, data: { ok: true } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "تحرير التدفق أسعار التوصيل" }))
    /* the read-only contract is stated: advanced nodes are shown, not edited */
    expect(await screen.findByText(/للقراءة/)).toBeInTheDocument()
    expect(screen.getByText("شرط: text contains سعر")).toBeInTheDocument()
    expect(screen.queryByLabelText("الرسالة 1")).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("اسم التدفق"), { target: { value: "أسعار محدثة" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }))

    await waitFor(() => expect(api.callsFor("PUT /api/flows/1")).toHaveLength(1), { timeout: 5000 })
    /* metadata only — the CONDITION/branch nodes are preserved server-side */
    expect(api.bodiesFor("PUT /api/flows/1")[0]).toEqual({
      name: "أسعار محدثة",
      description: "يرد على أسئلة الأسعار",
    })
  })
})
