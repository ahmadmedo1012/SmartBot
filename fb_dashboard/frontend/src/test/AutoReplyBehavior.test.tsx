/**
 * v23 (المهمة 2-ب) — عقد بطاقة «سلوك البوت» في صفحة الردود التلقائية.
 *
 * Pinned behaviors (the testable half of the contract):
 *   - the card renders ABOVE the rules section with the three switches
 *     (mention / comment-DM / AI auto-reply) fed by GET /api/bot/behavior,
 *     each a button[role=switch] with aria-checked + an Arabic aria-label
 *     that includes its state (WCAG 4.1.2 — same seam as the tools page)
 *   - flipping a switch fires an immediate PUT with a single-key JSON body
 *     (`{comment_dm_enabled: true}` — patch semantics) and flips the switch
 *     optimistically, then toasts success
 *   - ai_available=false swaps the green status line for the amber warning
 *     («أضف مفتاح API من إعدادات الأدمن») inside role=status
 *   - a failed GET shows the Arabic error card with retry (the rules list
 *     below keeps rendering independently of the behavior card)
 *   - ai_auto_reply=true reveals the tone input, and blur saves it through
 *     the same PUT seam with the exact body (debounce is flushed on blur)
 *
 * Mock bundle (house pattern from MessagesPage/SettingsChangePassword
 * tests): QueryClientProvider, premium-toast spy, URL-router fetch stub
 * (jsonRes + stubFetch), next/link anchor (PageHeader imports it).
 */
import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AutoReplyPage from "@/app/dashboard/autoreply/page"

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

/* PageHeader imports next/link — keep the module graph free of app-router
 * context requirements in jsdom (house recipe). */
vi.mock("next/link", () => ({
  default: function MockLink({ href, children }: { href: string; children: ReactNode }) {
    return <a href={href}>{children}</a>
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
    putsFor(path: string) {
      return calls.filter((c) => c.url === path && c.method === "PUT" && c.body)
    },
  }
}

/* GET /api/bot/behavior default state (backend contract: ok() envelope). */
const BASE_BEHAVIOR = {
  mention_in_replies: true,
  comment_dm_enabled: false,
  ai_auto_reply: false,
  ai_tone: "",
  ai_available: true,
  ai_provider: "openai",
}

function behaviorRes(over: Record<string, unknown> = {}) {
  return jsonRes({ success: true, data: { ...BASE_BEHAVIOR, ...over } })
}

/** Both page queries must resolve: rules (empty list) + behavior.
 * putOver lets a test stub the AFTER-PUT state separately — the real backend
 * answers PUT with the full persisted state, and the page trusts it (no
 * invalidate/refetch), so an echoing stub would be a false contract. */
function stubHappyBehavior(over: Record<string, unknown> = {}, putOver?: Record<string, unknown>) {
  return stubFetch({
    "GET /api/rules": () => jsonRes({ success: true, data: [] }),
    "GET /api/bot/behavior": () => behaviorRes(over),
    "PUT /api/bot/behavior": () => behaviorRes(putOver ?? over),
  })
}

function renderAutoReply() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AutoReplyPage />
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

describe("بطاقة سلوك البوت — العرض الأولي (GET /api/bot/behavior)", () => {
  it("تعرض البطاقة فوق قسم القواعد بالمفاتيح الثلاثة وحالة المزود (openai متاح)", async () => {
    stubHappyBehavior()
    renderAutoReply()

    // the card itself
    expect(await screen.findByText("سلوك البوت")).toBeInTheDocument()
    // three switches, each labeled with the feature name + its state
    const switches = screen.getAllByRole("switch")
    expect(switches).toHaveLength(3)

    const mention = screen.getByRole("switch", { name: /إشارة المعلّق في الرد/ })
    expect(mention).toHaveAttribute("aria-checked", "true") // mention_in_replies: true
    const dm = screen.getByRole("switch", { name: /رسالة مباشرة عند التعليق/ })
    expect(dm).toHaveAttribute("aria-checked", "false") // comment_dm_enabled: false
    const ai = screen.getByRole("switch", { name: /رد الذكاء الاصطناعي عند عدم مطابقة قاعدة/ })
    expect(ai).toHaveAttribute("aria-checked", "false") // ai_auto_reply: false

    // AI readiness strip — green path with the provider name
    expect(screen.getByText("الذكاء الاصطناعي جاهز (OpenAI)")).toBeInTheDocument()

    // tone field is hidden until ai_auto_reply is on
    expect(screen.queryByLabelText("نبرة الردود (اختياري)")).toBeNull()

    // the rules section below still renders its own empty state
    expect(screen.getByText("لا توجد قواعد رد تلقائي")).toBeInTheDocument()
    // and the page subtitle now announces the behavior card too
    expect(screen.getByText("قواعد الرد الآلي وسلوك البوت على التعليقات")).toBeInTheDocument()
  })
})

describe("تبديل مفتاح — PUT فوري بجسم المفتاح الواحد", () => {
  it("النقر على «رسالة مباشرة عند التعليق» يطلق PUT {comment_dm_enabled: true} ويقلب المفتاح تفاؤلياً + toast", async () => {
    const api = stubHappyBehavior({}, { comment_dm_enabled: true })
    renderAutoReply()

    const dm = await screen.findByRole("switch", { name: /رسالة مباشرة عند التعليق/ })
    fireEvent.click(dm)

    // exactly one PUT with the single-key patch body (JSON, not form-encoded)
    await waitFor(() => {
      expect(api.putsFor("/api/bot/behavior")).toHaveLength(1)
    })
    expect(api.putsFor("/api/bot/behavior")[0].body && JSON.parse(api.putsFor("/api/bot/behavior")[0].body as string)).toEqual({
      comment_dm_enabled: true,
    })
    expect(api.callsFor("/api/bot/behavior").filter((c) => c.method === "GET")).toHaveLength(1)

    // optimistic flip lands without waiting for the PUT round-trip
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: /رسالة مباشرة عند التعليق/ })).toHaveAttribute("aria-checked", "true")
    })
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("تم حفظ سلوك البوت")
    })
  })
})

describe("مؤشر حالة الذكاء الاصطناعي", () => {
  it("ai_available=false → تحذير كهرماني بدل سطر الجاهزية (role=status)", async () => {
    stubHappyBehavior({ ai_available: false, ai_provider: "none" })
    renderAutoReply()

    expect(
      await screen.findByText("الذكاء الاصطناعي غير مفعّل — أضف مفتاح API من إعدادات الأدمن"),
    ).toBeInTheDocument()
    // the readiness line is replaced, not added
    expect(screen.queryByText(/الذكاء الاصطناعي جاهز/)).toBeNull()
    // the strip is an announcable status region
    expect(screen.getByRole("status")).toBeInTheDocument()
  })
})

describe("فشل تحميل السلوك (GET)", () => {
  it("بطاقة خطأ عربية مع زر إعادة — والقواعد تستمر أسفلها", async () => {
    const api = stubFetch({
      "GET /api/rules": () => jsonRes({ success: true, data: [] }),
      "GET /api/bot/behavior": () => jsonRes({ detail: "تعذر قراءة إعدادات سلوك البوت" }, 500),
    })
    renderAutoReply()

    /* the query retries once (retry: 1) with TanStack's ~1s backoff — the
       default 1s findByText timeout races it, so give the settle room */
    expect(await screen.findByText("فشل تحميل سلوك البوت", {}, { timeout: 4000 })).toBeInTheDocument()
    // the backend's Arabic detail surfaces verbatim (ApiError contract)
    expect(screen.getByText("تعذر قراءة إعدادات سلوك البوت")).toBeInTheDocument()

    // the rules section is independent: its own data loaded fine
    expect(await screen.findByText("لا توجد قواعد رد تلقائي")).toBeInTheDocument()

    // retry actually refetches the behavior endpoint
    const before = api.callsFor("/api/bot/behavior").length // 1 + query retry(1)
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))
    await waitFor(() => {
      expect(api.callsFor("/api/bot/behavior").length).toBeGreaterThanOrEqual(before + 1)
    })
  })
})

describe("حقل نبرة AI (يظهر عند تفعيل رد الذكاء الاصطناعي)", () => {
  it("ai_auto_reply=true يكشف الحقل، وblur يحفظ النبرة عبر PUT بالجسم الصحيح فوراً", async () => {
    const api = stubHappyBehavior({ ai_auto_reply: true, ai_tone: "" }, { ai_auto_reply: true, ai_tone: "ودية ومهنية" })
    renderAutoReply()

    const tone = await screen.findByLabelText("نبرة الردود (اختياري)")
    expect(tone).toHaveAttribute("maxlength", "40")

    fireEvent.change(tone, { target: { value: "ودية ومهنية" } })
    fireEvent.blur(tone) // blur flushes the 600ms debounce immediately

    await waitFor(() => {
      expect(api.putsFor("/api/bot/behavior")).toHaveLength(1)
    })
    expect(api.putsFor("/api/bot/behavior")[0].body && JSON.parse(api.putsFor("/api/bot/behavior")[0].body as string)).toEqual({
      ai_tone: "ودية ومهنية",
    })
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("تم حفظ سلوك البوت")
    })
    // the server's persisted tone is now the field's value (PUT response is
    // the source of truth — no stale draft left behind)
    await waitFor(() => {
      expect(screen.getByLabelText("نبرة الردود (اختياري)")).toHaveValue("ودية ومهنية")
    })
  })

  it("ai_auto_reply=false يخفي الحقل تماماً (لا PUT صامت للنبرة)", async () => {
    const api = stubHappyBehavior({ ai_auto_reply: false })
    renderAutoReply()

    await screen.findByText("سلوك البوت")
    expect(screen.queryByLabelText("نبرة الردود (اختياري)")).toBeNull()
    expect(api.putsFor("/api/bot/behavior")).toHaveLength(0)
  })
})
