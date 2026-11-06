/**
 * P43-C-2 — عقد صفحة «التدفقات» = استوديو الأتمتة (قائمة + محرر + نشر).
 *
 * The engine is LIVE now (P43-SB1: FlowRuntime consumes Messenger ingress +
 * the automation beat), so the page's contracts grew from the v0 honest
 * test-mode form editor to a real automation studio:
 *   - list cards render the REAL backend statuses (draft/active/paused per
 *     routers/flows.py) + the per-flow stats summary (GET /{id}/stats:
 *     «تنفيذ» counter — total_executions, the engine's execution ledger —
 *     · مكتملة · رسائل مرسلة)
 *   - the honesty contract FLIPPED: the old «وضع الاختبار — التنفيذ اليدوي»
 *     note is GONE (it would be a lie now); the live copy is «ينشر المسار
 *     وينفّذه البوت فعليًا على رسائل ميسنجر الواردة»
 *   - create = a blank DRAFT dialog: POST {name, description} (no graph —
 *     nodes/edges are designed in the studio AFTER creation), then the
 *     studio opens for the fresh id
 *   - publish/unpublish replaced the ST_CYCLE toggle: POST /{id}/publish
 *     (422 Arabic graph validation surfaces in a role=alert card — the
 *     server is the only validator) / POST /{id}/unpublish
 *   - the manual test path SURVIVES as a real-engine probe: POST /{id}/test
 *     {text, from_name?}; the trace renders VERBATIM
 *   - edit: the studio rebuilds nodes/edges from the visual cards and PUTs
 *     the rebuilt graph; nodes the vertical editor cannot represent are
 *     warned EXPLICITLY and dropped on first save (the documented P43 guard
 *     contract — replacing v0's metadata-only guard)
 *   - delete is a two-step ARABIC confirm (icon → «تأكيد الحذف» → DELETE)
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

const ACTIVE_STATS = {
  flow_id: 1,
  status: "active",
  total_executions: 5,
  active: 0,
  completed: 4,
  failed: 1,
  expired: 0,
  messages_sent: 9,
  avg_steps: 2.5,
  total_replies: 5,
}

const DRAFT_STATS = {
  flow_id: 2,
  status: "draft",
  total_executions: 0,
  active: 0,
  completed: 0,
  failed: 0,
  expired: 0,
  messages_sent: 0,
  avg_steps: 0,
  total_replies: 0,
}

const SIMPLE_DETAIL = {
  ...ACTIVE_FLOW,
  nodes: [
    { id: "trigger", type: "TRIGGER", data: { triggerType: "keyword", keywords: ["سعر"], matchMode: "any" } },
    { id: "msg-1", type: "MESSAGE", data: { text: "أهلاً" } },
  ],
  edges: [{ source: "trigger", target: "msg-1" }],
}

/* استوديو كامل: القائمة + التفاصيل + الإحصاءات + التنفيذات كلها مُحاكاة */
function stubStudioList(extra: Record<string, () => Response | Promise<Response>> = {}) {
  return stubFetch({
    "GET /api/flows": () => jsonRes({ success: true, data: [ACTIVE_FLOW, DRAFT_FLOW] }),
    "GET /api/flows/1/stats": () => jsonRes({ success: true, data: ACTIVE_STATS }),
    "GET /api/flows/2/stats": () => jsonRes({ success: true, data: DRAFT_STATS }),
    ...extra,
  })
}

async function openStudio(api?: ReturnType<typeof stubFetch>) {
  const btn = await screen.findByRole("button", { name: "فتح محرر التدفق أسعار التوصيل" })
  fireEvent.click(btn)
  /* الترطيب اكتمل: بطاقة المشغّل (حصرية للاستوديو — عنوان القائمة يحمل
   * نفس نسخة «ينفّذه البوت» فلا يصلح كإشارة اكتمال) */
  await screen.findByLabelText("كلمات التشغيل", {}, { timeout: 5000 })
  return api
}

/** فتح إعداد بطاقة رسالة (تبدأ مطوية). */
async function expandMessage(stepId: string) {
  fireEvent.click(
    await screen.findByRole("button", { name: `رسالة ${stepId} — فتح الإعداد` }),
  )
  return screen.findByLabelText(`نص الرسالة ${stepId}`)
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

describe("list (contract: real statuses + per-flow stats summary)", () => {
  it("renders skeleton slabs while the list loads", () => {
    /* never-resolving GET — the loading state is the contract under test */
    stubFetch({
      "GET /api/flows": () => new Promise<Response>(() => {}),
    })
    const { container } = renderPage()
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(3)
  })

  it("renders names, REAL statuses, and the per-flow stats summary", async () => {
    stubStudioList()
    renderPage()

    expect(await screen.findByText("أسعار التوصيل")).toBeInTheDocument()
    expect(screen.getByText("ترحيب المتابعين")).toBeInTheDocument()
    /* real backend statuses — the studio labels: نشط/مسودة/متوقف/مؤرشف */
    expect(screen.getByText("نشط")).toBeInTheDocument()
    expect(screen.getByText("مسودة")).toBeInTheDocument()
    /* the stats summary comes from GET /{id}/stats (async) — the engine's
     * ledger; the line interleaves mono spans so assert on the body text */
    await waitFor(() => expect(document.body.textContent).toContain("مكتملة"))
    expect(document.body.textContent).toContain("رسائل مرسلة")
  })

  it("the honesty contract flipped: the live-engine copy, never the old test-mode note", async () => {
    stubStudioList()
    renderPage()

    expect(await screen.findByText(/أسعار التوصيل/)).toBeInTheDocument()
    /* المحرك حي — النسخة القديمة الكاذبة تقاعدت */
    expect(screen.getByText(/ينشر المسار وينفّذه البوت فعليًا/)).toBeInTheDocument()
    expect(screen.queryByText(/وضع الاختبار — التنفيذ اليدوي/)).not.toBeInTheDocument()
    expect(screen.queryByText(/الربط التلقائي غير مفعّل/)).not.toBeInTheDocument()
  })

  it("renders the honest empty state with a create CTA", async () => {
    stubFetch({
      "GET /api/flows": () => jsonRes({ success: true, data: [] }),
    })
    renderPage()

    expect(await screen.findByText("لا توجد تدفقات")).toBeInTheDocument()
    /* the CTA rides BOTH the header and the empty well — both open the dialog */
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

describe("create flow (blank draft → studio)", () => {
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

  it("POSTs the BLANK DRAFT {name, description} then opens the studio", async () => {
    const api = stubFetch({
      "GET /api/flows": () => jsonRes({ success: true, data: [] }),
      "POST /api/flows": () => jsonRes({ success: true, data: { id: 10 } }),
      "GET /api/flows/10": () => jsonRes({
        success: true,
        data: { id: 10, name: "تدفق الأسعار", description: "", status: "draft", nodes: [], edges: [] },
      }),
      "GET /api/flows/10/stats": () => jsonRes({ success: true, data: DRAFT_STATS }),
      "GET /api/flows/10/executions": () => jsonRes({ success: true, data: { executions: [], total: 0 } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "تدفق جديد" }))
    fireEvent.change(await screen.findByLabelText("اسم التدفق"), {
      target: { value: "تدفق الأسعار" },
    })
    fireEvent.change(screen.getByLabelText("الوصف (اختياري)"), {
      target: { value: "يرحّب ثم يعرض الأسعار" },
    })
    fireEvent.click(screen.getByRole("button", { name: "إنشاء التدفق" }))

    await waitFor(() => expect(api.callsFor("POST /api/flows")).toHaveLength(1), { timeout: 5000 })
    /* العقد الجديد: مسودة فارغة — nodes/edges تُصمَّم في الاستوديو بعد الإنشاء */
    expect(api.bodiesFor("POST /api/flows")[0]).toEqual({
      name: "تدفق الأسعار",
      description: "يرحّب ثم يعرض الأسعار",
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إنشاء المسودة — صمّم الخطوات وانشرها")
    /* the studio opens for the fresh id (trigger card = studio-only marker) */
    await screen.findByLabelText("كلمات التشغيل", {}, { timeout: 5000 })
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

describe("publish / unpublish (the studio activation contract)", () => {
  it("«نشر التدفق» saves the DIRTY draft then POSTs publish with the engine-live toast", async () => {
    const api = stubStudioList({
      "GET /api/flows/2": () => jsonRes({ success: true, data: { ...SIMPLE_DETAIL, ...DRAFT_FLOW } }),
      "GET /api/flows/2/executions": () => jsonRes({ success: true, data: { executions: [], total: 0 } }),
      "PUT /api/flows/2": () => jsonRes({ success: true, data: { ok: true } }),
      "POST /api/flows/2/publish": () => jsonRes({ success: true, data: { status: "active", version: 2 } }),
    })
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "فتح محرر التدفق ترحيب المتابعين" }))
    await screen.findByLabelText("كلمات التشغيل", {}, { timeout: 5000 })

    /* عدّل المسودة أولًا حتى يصبح «حفظ قبل النشر» قابلًا للرصد: حفظ
     * مسودة غير متغيرة يتخطى PUT (آخر حالة محفوظة = الخادم) — عقد صحيح
     * لكنه غير مرئي للشبكة. */
    fireEvent.click(await screen.findByRole("button", { name: "رسالة msg-1 — فتح الإعداد" }))
    const msgBox = await screen.findByLabelText("نص الرسالة msg-1")
    fireEvent.change(msgBox, { target: { value: "أهلاً وسهلاً" } })
    fireEvent.click(screen.getByRole("button", { name: /نشر التدفق/ }))

    await waitFor(() => expect(api.callsFor("POST /api/flows/2/publish")).toHaveLength(1), { timeout: 5000 })
    /* the DIRTY draft is persisted BEFORE activation (the publish contract) */
    const puts = api.bodiesFor("PUT /api/flows/2")
    expect(puts.length).toBeGreaterThanOrEqual(1)
    expect(puts[puts.length - 1]?.nodes?.[1]).toEqual({
      id: "msg-1", type: "MESSAGE", data: { text: "أهلاً وسهلاً" },
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم نشر التدفق — سينفّذه البوت على الرسائل الواردة")
  })

  it("publish 422 (graph validation) surfaces the SERVER's Arabic message in the alert card", async () => {
    /* P44-3b: `_api` — the stub's return is unused in THIS block (the test
     * asserts only on rendered surfaces); renamed per the ^_ unused-var
     * convention so `npm run lint` (never wired into CI — pre-existing red
     * at 2522399b) can gate green. */
    const _api = stubStudioList({
      "GET /api/flows/2": () => jsonRes({ success: true, data: { ...SIMPLE_DETAIL, ...DRAFT_FLOW } }),
      "GET /api/flows/2/executions": () => jsonRes({ success: true, data: { executions: [], total: 0 } }),
      "PUT /api/flows/2": () => jsonRes({ success: true, data: { ok: true } }),
      "POST /api/flows/2/publish": () =>
        jsonRes({ success: false, error: "قيمة غير صالحة: يجب أن يحتوي المسار على عقدة تشغيل (TRIGGER) واحدة بالضبط" }, 422),
    })
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "فتح محرر التدفق ترحيب المتابعين" }))
    await screen.findByLabelText("كلمات التشغيل", {}, { timeout: 5000 })

    fireEvent.click(screen.getByRole("button", { name: /نشر التدفق/ }))
    expect(await screen.findByText(/تعذّر النشر — الخادم ردّ:/)).toBeInTheDocument()
    expect(screen.getByText(/عقدة تشغيل \(TRIGGER\) واحدة بالضبط/)).toBeInTheDocument()
    /* a validation 422 is never a toast — the card is the surface */
    expect(mocks.toastError).not.toHaveBeenCalledWith(/TRIGGER/)
  })

  it("an ACTIVE flow offers «إيقاف النشر» and toasts the pause", async () => {
    const api = stubStudioList({
      "GET /api/flows/1": () => jsonRes({ success: true, data: SIMPLE_DETAIL }),
      "GET /api/flows/1/executions": () => jsonRes({ success: true, data: { executions: [], total: 0 } }),
      "POST /api/flows/1/unpublish": () => jsonRes({ success: true, data: { status: "paused" } }),
    })
    renderPage()
    await openStudio(api)

    fireEvent.click(screen.getByRole("button", { name: /إيقاف النشر/ }))
    await waitFor(() => expect(api.callsFor("POST /api/flows/1/unpublish")).toHaveLength(1), { timeout: 5000 })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إيقاف التدفق — لن تبدأ تنفيذات جديدة")
  })
})

describe("run test (POST /{id}/test — a REAL engine probe, logged to the executions ledger)", () => {
  it("POSTs {text, from_name} and renders the returned trace VERBATIM", async () => {
    const api = stubStudioList({
      "GET /api/flows/1": () => jsonRes({ success: true, data: SIMPLE_DETAIL }),
      "GET /api/flows/1/executions": () => jsonRes({ success: true, data: { executions: [], total: 0 } }),
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
    await openStudio(api)

    fireEvent.click(screen.getByRole("button", { name: /تشغيل اختبار/ }))
    /* the live-engine copy — never the retired test-mode note */
    expect(await screen.findByText(/تنفيذ حقيقي عبر المحرك يُسجَّل في سجل التنفيذات/)).toBeInTheDocument()
    fireEvent.change(await screen.findByLabelText("اسم المرسِل التجريبي (اختياري)"), {
      target: { value: "أحمد" },
    })
    fireEvent.change(screen.getByLabelText("نص الرسالة الواردة التجريبي"), {
      target: { value: "كم السعر؟" },
    })
    fireEvent.click(screen.getByRole("button", { name: "تشغيل" }))

    await waitFor(() => expect(api.callsFor("POST /api/flows/1/test")).toHaveLength(1), { timeout: 5000 })
    expect(api.bodiesFor("POST /api/flows/1/test")[0]).toEqual({ text: "كم السعر؟", from_name: "أحمد" })
    /* the engine's own words, verbatim (mono chain): ids + actions
     * (msg-1/trigger also ride the editor cards — findAll) */
    expect(await screen.findAllByText("trigger")).not.toHaveLength(0)
    expect(screen.getAllByText("passed")).not.toHaveLength(0)
    expect(screen.getAllByText("msg-1")).not.toHaveLength(0)
    expect(screen.getAllByText("message_sent")).not.toHaveLength(0)
    expect(screen.getAllByText("«أهلاً أحمد»")).not.toHaveLength(0)
    expect(screen.getAllByText("7")).not.toHaveLength(0)
  })
})

describe("delete — two-step Arabic confirm", () => {
  it("icon click only arms the confirm; the DELETE fires on «تأكيد الحذف» only", async () => {
    const api = stubStudioList({
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

describe("edit (the studio PUT contract + the P43 unrepresentable-node guard)", () => {
  it("hydrates the chain and «حفظ» PUTs the rebuilt nodes/edges", async () => {
    const api = stubStudioList({
      "GET /api/flows/1": () => jsonRes({ success: true, data: SIMPLE_DETAIL }),
      "GET /api/flows/1/executions": () => jsonRes({ success: true, data: { executions: [], total: 0 } }),
      "PUT /api/flows/1": () => jsonRes({ success: true, data: { ok: true } }),
    })
    renderPage()
    await openStudio(api)

    /* الترطيب: البطاقة تبدأ مطوية — افتحها واقرأ النص المحمّل */
    const msgBox = await expandMessage("msg-1")
    expect(msgBox).toHaveValue("أهلاً")

    fireEvent.change(msgBox, { target: { value: "أهلاً وسهلاً" } })
    fireEvent.click(screen.getByRole("button", { name: /^حفظ$/ }))

    await waitFor(() => expect(api.callsFor("PUT /api/flows/1").length).toBeGreaterThanOrEqual(1), { timeout: 5000 })
    /* (الحفظ الفوري أو التلقائي — كلاهما نفس الجسد) */
    const bodies = api.bodiesFor("PUT /api/flows/1")
    expect(bodies[bodies.length - 1]).toEqual({
      name: "أسعار التوصيل",
      description: "يرد على أسئلة الأسعار",
      nodes: [
        { id: "trigger", type: "TRIGGER", data: { triggerType: "keyword", keywords: ["سعر"], matchMode: "any" } },
        { id: "msg-1", type: "MESSAGE", data: { text: "أهلاً وسهلاً" } },
      ],
      edges: [{ source: "trigger", target: "msg-1" }],
    })
  })

  it("unrepresentable nodes are warned EXPLICITLY and dropped on save (the documented P43 guard)", async () => {
    const api = stubStudioList({
      "GET /api/flows/1": () =>
        jsonRes({
          success: true,
          data: {
            ...SIMPLE_DETAIL,
            nodes: [
              ...SIMPLE_DETAIL.nodes,
              /* a node NO edge points to — unreachable from the trigger
               * walk (graph.ts: visited) → orphan */
              { id: "seq-1", type: "SEQUENCE", data: { sequenceId: 3 } },
            ],
            edges: SIMPLE_DETAIL.edges,
          },
        }),
      "GET /api/flows/1/executions": () => jsonRes({ success: true, data: { executions: [], total: 0 } }),
      "PUT /api/flows/1": () => jsonRes({ success: true, data: { ok: true } }),
    })
    renderPage()
    await openStudio(api)

    /* العقد غير الممثَّلة: بطاقة تحذير صريحة بالأسماء */
    expect(await screen.findByText(/عقد خارج بنية المحرر الرأسي/)).toBeInTheDocument()
    expect(screen.getAllByText(/seq-1/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: /حذفها الآن وحفظ/ }))
    await waitFor(() => expect(api.callsFor("PUT /api/flows/1")).toHaveLength(1), { timeout: 5000 })
    /* الحفظ يعيد البناء من البطاقات المرئية فقط — seq-1 سقط */
    const body = api.bodiesFor("PUT /api/flows/1")[0]
    expect(body.nodes.map((n: { id: string }) => n.id).join(",")).toBe("trigger,msg-1")
  })
})
