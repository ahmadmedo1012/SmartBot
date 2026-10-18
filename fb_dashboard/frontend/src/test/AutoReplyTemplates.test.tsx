/**
 * P21-W6-B5 (gap #1) — عقد معرض القوالب في صفحة الردود التلقائية.
 *
 * Pins (the testable half of the promise — W6-A5 market evidence:
 * ManyChat ships 60+ templates even on Free; our surface started blank):
 *   - the gallery renders on the EMPTY/first-use state only: all template
 *     cards (title + keyword chips) below the honest empty state, and it
 *     disappears once a rule exists
 *   - one click PRE-FILLS the real create form (name/keywords/reply/
 *     priority) — the form state is asserted input-by-input
 *   - NO hidden auto-save: the click fires ZERO POSTs; the only save path
 *     stays the existing «حفظ القاعدة» button (POST /api/rules,
 *     form-encoded — the exact template payload)
 *   - the review contract is stated on the surface («راجع النص…»)
 *
 * Mock bundle (house pattern from AutoReplyBehavior.test.tsx):
 * QueryClientProvider, premium-toast spy, next/link anchor, fetch stub.
 */
import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AutoReplyPage from "@/app/dashboard/autoreply/page"
import { RULE_TEMPLATES } from "@/lib/rule-templates"

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}))

vi.mock("@/lib/premium-toast", () => ({
  brandedToast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: mocks.toastInfo,
    warning: vi.fn(),
  },
}))

/* PageHeader imports next/link — keep the module graph free of app-router
 * context requirements in jsdom (house recipe). */
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
    /** Form-encoded bodies → a plain object (URLSearchParams string). */
    formBodiesFor(route: string) {
      const method = route.split(" ")[0]
      const path = route.slice(route.indexOf(" ") + 1)
      return calls
        .filter((c) => c.method === method && c.url === path && c.body)
        .map((c) => Object.fromEntries(new URLSearchParams(c.body as string)))
    },
  }
}

const BASE_BEHAVIOR = {
  mention_in_replies: true,
  comment_dm_enabled: false,
  ai_auto_reply: false,
  ai_tone: "",
  ai_available: true,
  ai_provider: "openai",
}

function renderPage() {
  /* retry: false + retryDelay 0 — the house `retry: 1` on the page's queries
   * would stall error-branch assertions behind the default backoff. */
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <AutoReplyPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
  mocks.toastInfo.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("template gallery — empty/first-use state only", () => {
  it("renders every template card with its keyword chips below the empty state", async () => {
    stubFetch({
      "GET /api/rules": () => jsonRes({ success: true, data: [] }),
      "GET /api/bot/behavior": () => jsonRes({ success: true, data: BASE_BEHAVIOR }),
    })
    renderPage()

    expect(await screen.findByText("لا توجد قواعد رد تلقائي")).toBeInTheDocument()
    expect(screen.getByText("قوالب جاهزة — قاعدة بنقرة واحدة")).toBeInTheDocument()
    /* every template card rides a one-click action (unique per title —
     * «العنوان» doubles as a keyword chip so text queries would collide). */
    for (const t of RULE_TEMPLATES) {
      expect(screen.getByRole("button", { name: `استخدام قالب ${t.title}` })).toBeInTheDocument()
    }
    /* the keyword chips ride the cards exactly as they will be sent
     * (the template's comma-separated string, split for display). */
    expect(screen.getByText("سلام")).toBeInTheDocument()
    expect(screen.getByText("سعر")).toBeInTheDocument()
    /* the review contract is stated on the surface (no auto-save promise). */
    expect(screen.getByText(/راجع النص وعدّله ليناسب متجرك ثم احفظ/)).toBeInTheDocument()
  })

  it("disappears once a rule exists (the gallery is the FIRST-use surface)", async () => {
    stubFetch({
      "GET /api/rules": () =>
        jsonRes({
          success: true,
          data: [{ id: 1, name: "ترحيب", keywords: ["سلام"], reply_template: "أهلاً" }],
        }),
      "GET /api/bot/behavior": () => jsonRes({ success: true, data: BASE_BEHAVIOR }),
    })
    renderPage()

    /* the rule ROW renders its keywords + reply preview (the name rides
     * the action aria-labels) — the reply text is the row's visible body. */
    expect(await screen.findByText("أهلاً")).toBeInTheDocument()
    expect(screen.queryByText("قوالب جاهزة — قاعدة بنقرة واحدة")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "استخدام قالب رد على كلمة سلام" })).not.toBeInTheDocument()
  })
})

describe("one-click prefill — the real create form, no hidden auto-save", () => {
  it("fills name/keywords/reply/priority and fires ZERO POSTs on the click", async () => {
    const api = stubFetch({
      "GET /api/rules": () => jsonRes({ success: true, data: [] }),
      "GET /api/bot/behavior": () => jsonRes({ success: true, data: BASE_BEHAVIOR }),
    })
    renderPage()

    const btn = await screen.findByRole("button", { name: "استخدام قالب رد على كلمة سلام" })
    fireEvent.click(btn)

    /* the create form OPENS prefilled — the four fields the backend
     * declares (rules.py RulePayload), asserted input-by-input. */
    expect(await screen.findByLabelText("اسم القاعدة")).toHaveValue("رد على كلمة سلام")
    expect(screen.getByLabelText("الكلمات المفتاحية (افصل بفاصلة)")).toHaveValue(
      "سلام, مرحبا, اهلا, صباح الخير, مساء الخير",
    )
    expect(screen.getByLabelText("نص الرد")).toHaveValue(
      "أهلاً وسهلاً بك 🌟 شكراً لتواصلك مع صفحتنا — كيف يمكننا مساعدتك اليوم؟",
    )
    expect(screen.getByLabelText("الأولوية (الرقم الأقل يُفحص أولاً: 1-999)")).toHaveValue("50")
    /* the info toast states the review-then-save contract. */
    expect(mocks.toastInfo).toHaveBeenCalledWith("تمت تعبئة النموذج من القالب — راجع النص وعدّله ثم احفظ")
    /* NO hidden auto-save: the click itself never POSTs a rule. */
    expect(api.callsFor("POST /api/rules")).toHaveLength(0)
    /* the save button is LIVE (prefilled payload is complete + valid). */
    expect(screen.getByRole("button", { name: "حفظ القاعدة" })).toBeEnabled()
  })

  it("the EXISTING save path posts the prefilled template payload verbatim", async () => {
    const api = stubFetch({
      "GET /api/rules": () => jsonRes({ success: true, data: [] }),
      "GET /api/bot/behavior": () => jsonRes({ success: true, data: BASE_BEHAVIOR }),
      "POST /api/rules": () => jsonRes({ success: true, data: { id: 9 } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "استخدام قالب إجابة عن السعر" }))
    fireEvent.click(await screen.findByRole("button", { name: "حفظ القاعدة" }))

    await waitFor(() => expect(api.callsFor("POST /api/rules")).toHaveLength(1), { timeout: 5000 })
    /* form-encoded, the four declared fields — the exact template content. */
    expect(api.formBodiesFor("POST /api/rules")[0]).toEqual({
      name: "إجابة عن السعر",
      keywords: "سعر, بكم, كم السعر, الاسعار, سعره",
      reply_template:
        "شكراً لاهتمامك! أسعارنا تختلف حسب المنتج — اذكر لنا اسم ما تبحث عنه في تعليق أو رسالة خاصة وسنرد بالسعر والتفاصيل فوراً.",
      priority: "50",
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إنشاء القاعدة")
  })
})
