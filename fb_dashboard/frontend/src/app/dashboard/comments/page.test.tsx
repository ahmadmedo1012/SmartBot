/**
 * v17-E-F12 — comments page AI-suggest integration (the page-owned half).
 *
 * Pins the D6-6 promise («ردود ذكية AI» — Basic) end-to-end on the wire:
 *   - readiness: GET /api/ai/status on load; available:false flips the row
 *     button to the honest disabled-looking state (title hint) and a click
 *     shows the designed warning toast — NO POST /api/ai/suggest is fired
 *     (no dead call, no silent error)
 *   - suggest: click posts the Form contract (comment_text, commenter_name,
 *     page_context from the comment's post) and renders 1-3 suggestions
 *   - pending: the row button disables + «جارٍ الاقتراح…» and the dialog
 *     shows the spinner while the POST is in flight
 *   - insert: fills ONLY the target row's reply draft (existing per-row
 *     replyText pattern), closes the dialog, success toast, and refocuses
 *     the row's reply input (focus never falls to <body> after close)
 *   - error: a 400 «AI غير مفعل…» surfaces the backend Arabic detail in
 *     the dialog with a working retry
 *
 * Mock bundle (house pattern — MessagesPage.test.tsx): QueryClientProvider,
 * premium-toast spy, URL-router fetch stub. No next/link/image on this page.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import CommentsPage from "@/app/dashboard/comments/page"
import type { CommentRow } from "@/lib/types"

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock("@/lib/premium-toast", () => ({
  brandedToast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: vi.fn(),
    warning: mocks.toastWarning,
  },
}))

/** Build a real Response with a JSON body (house helper). */
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
    callsFor(path: string) {
      return calls.filter((c) => c.url === path)
    },
  }
}

const COMMENTS_ROUTE = "GET /api/comments?limit=30"
const STATUS_ROUTE = "GET /api/ai/status"
const SUGGEST_ROUTE = "POST /api/ai/suggest"

const c1: CommentRow = {
  id: "c1",
  message: "شحال سعر التوصيل؟",
  from_name: "أحمد",
  created_time: null,
  reply_text: null,
  post_message: "عرض الصيف على الأجهزة",
}
const c2: CommentRow = {
  id: "c2",
  message: "الجهاز ممتاز شكراً",
  from_name: "سارة",
  created_time: null,
  reply_text: null,
}

function okComments(): Response {
  return jsonRes({ success: true, data: { items: [c1, c2], source: "db" } })
}

function renderComments() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <CommentsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
  mocks.toastWarning.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("AI readiness gate (GET /api/ai/status)", () => {
  it("available:false → honest title hint + warning toast, and NO suggest POST/dialog", async () => {
    const api = stubFetch({
      [COMMENTS_ROUTE]: okComments,
      [STATUS_ROUTE]: () => jsonRes({ success: true, data: { available: false, provider: "" } }),
    })
    renderComments()
    await screen.findByText("شحال سعر التوصيل؟")

    const suggestBtn = screen.getByRole("button", {
      name: "اقترح ردًا بالذكاء الاصطناعي على تعليق أحمد",
    })
    // the honest state lands only after the status query resolves
    await waitFor(() =>
      expect(suggestBtn).toHaveAttribute(
        "title",
        "الذكاء الاصطناعي غير مفعّل — فعّله من إعدادات المنصة",
      ),
    )

    fireEvent.click(suggestBtn)
    expect(mocks.toastWarning).toHaveBeenCalledWith(
      "الذكاء الاصطناعي غير مفعّل",
      "فعّله من إعدادات المنصة",
    )
    // no dead network call, and the dialog never opened
    expect(api.callsFor("/api/ai/suggest")).toHaveLength(0)
    expect(screen.queryByText("اقتراحات الرد بالذكاء الاصطناعي")).toBeNull()
  })
})

describe("suggest journey (POST /api/ai/suggest Form contract)", () => {
  it("click → Form POST with comment_text/commenter_name/page_context → 1-3 suggestions", async () => {
    const api = stubFetch({
      [COMMENTS_ROUTE]: okComments,
      [STATUS_ROUTE]: () => jsonRes({ success: true, data: { available: true, provider: "openai" } }),
      [SUGGEST_ROUTE]: () =>
        jsonRes({
          success: true,
          data: {
            suggestions: ["رد مقترح ١", "رد مقترح ٢", "رد مقترح ٣"],
            intent: "استفسار",
            sentiment: "محايد",
            confidence: 0.8,
            latency_ms: 120,
          },
        }),
    })
    renderComments()
    await screen.findByText("شحال سعر التوصيل؟")

    fireEvent.click(
      screen.getByRole("button", { name: "اقترح ردًا بالذكاء الاصطناعي على تعليق أحمد" }),
    )

    expect(await screen.findByText("رد مقترح ١")).toBeInTheDocument()
    const sent = api.callsFor("/api/ai/suggest")
    expect(sent).toHaveLength(1)
    // routers/ai.py Form(...) contract — URLSearchParams, not JSON
    expect(sent[0].body).toBe(
      new URLSearchParams({
        comment_text: "شحال سعر التوصيل؟",
        commenter_name: "أحمد",
        page_context: "عرض الصيف على الأجهزة",
      }).toString(),
    )
  })

  it("pending → the row button disables + «جارٍ الاقتراح…» and the dialog spins", async () => {
    let resolveSuggest!: (r: Response) => void
    const deferred = new Promise<Response>(res => {
      resolveSuggest = res
    })
    stubFetch({
      [COMMENTS_ROUTE]: okComments,
      [STATUS_ROUTE]: () => jsonRes({ success: true, data: { available: true, provider: "openai" } }),
      [SUGGEST_ROUTE]: () => deferred as unknown as Response,
    })
    renderComments()
    await screen.findByText("شحال سعر التوصيل؟")

    const suggestBtn = screen.getByRole("button", {
      name: "اقترح ردًا بالذكاء الاصطناعي على تعليق أحمد",
    })
    fireEvent.click(suggestBtn)

    // dialog pending row + the row button's own loading state
    expect(await screen.findByText("جارٍ توليد الاقتراحات…")).toBeInTheDocument()
    expect(screen.getByText("جارٍ الاقتراح…")).toBeInTheDocument()
    expect(suggestBtn).toBeDisabled()

    resolveSuggest(
      jsonRes({ success: true, data: { suggestions: ["وصل الاقتراح أخيراً"] } }),
    )
    expect(await screen.findByText("وصل الاقتراح أخيراً")).toBeInTheDocument()
    expect(suggestBtn).toBeEnabled()
  })
})

describe("insert fills only the target row's draft", () => {
  it("«إدراج» populates that comment's reply box, closes the dialog, toasts, and refocuses", async () => {
    stubFetch({
      [COMMENTS_ROUTE]: okComments,
      [STATUS_ROUTE]: () => jsonRes({ success: true, data: { available: true, provider: "openai" } }),
      [SUGGEST_ROUTE]: () =>
        jsonRes({ success: true, data: { suggestions: ["رد مقترح ١", "رد مقترح ٢"] } }),
    })
    renderComments()
    await screen.findByText("شحال سعر التوصيل؟")

    fireEvent.click(
      screen.getByRole("button", { name: "اقترح ردًا بالذكاء الاصطناعي على تعليق أحمد" }),
    )
    expect(await screen.findByText("رد مقترح ١")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "إدراج الاقتراح 2 في مسودة الرد" }))

    // ONLY أحمد's draft carries the suggestion — سارة's stays empty
    const ahmedInput = screen.getByLabelText("الرد السريع على تعليق أحمد") as HTMLInputElement
    expect(ahmedInput.value).toBe("رد مقترح ٢")
    const saraInput = screen.getByLabelText("الرد السريع على تعليق سارة") as HTMLInputElement
    expect(saraInput.value).toBe("")

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "أُدرج الاقتراح في مسودة الرد",
        "عدّله كما تريد ثم أرسله",
      ),
    )
    // dialog closed (title unmounts) and focus landed on the row's input
    await waitFor(() =>
      expect(screen.queryByText("اقتراحات الرد بالذكاء الاصطناعي")).toBeNull(),
    )
    await waitFor(() => expect(ahmedInput).toHaveFocus())
  })
})

describe("suggest error path (honest Arabic error + retry)", () => {
  it("a 400 «AI غير مفعل» surfaces the backend detail and retry recovers", async () => {
    let suggestResponse: () => Response = () =>
      jsonRes({ detail: "AI غير مفعل — قم بتعيين OPENAI_API_KEY أو GEMINI_API_KEY في المتغيرات" }, 400)
    const api = stubFetch({
      [COMMENTS_ROUTE]: okComments,
      [STATUS_ROUTE]: () => jsonRes({ success: true, data: { available: true, provider: "openai" } }),
      [SUGGEST_ROUTE]: () => suggestResponse(),
    })
    renderComments()
    await screen.findByText("شحال سعر التوصيل؟")

    fireEvent.click(
      screen.getByRole("button", { name: "اقترح ردًا بالذكاء الاصطناعي على تعليق أحمد" }),
    )

    // the backend's Arabic detail surfaces verbatim in the alert region
    expect(await screen.findByRole("alert")).toHaveTextContent("AI غير مفعل")

    // retry fires the POST again and recovers
    suggestResponse = () =>
      jsonRes({ success: true, data: { suggestions: ["اقتراح بعد المحاولة"] } })
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))
    expect(await screen.findByText("اقتراح بعد المحاولة")).toBeInTheDocument()
    expect(api.callsFor("/api/ai/suggest")).toHaveLength(2)
  })
})
