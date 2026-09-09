/**
 * v14-E6 (D9 gap G2) — OnboardingWizard contract.
 *
 * The wizard is the money-journey gate for every fresh tenant (568 lines,
 * fully rewritten in v13 with ZERO tests). These pins cover:
 *
 *   - step progression 0→4 with the exact POST bodies of the two save
 *     steps (connect-page / first-rule) and the completion call
 *   - the connection-test states: empty guard, transport failure, backend
 *     ok({connected:false}) and the success state (page name auto-fill +
 *     fan-count phrase)
 *   - completion: /api/onboarding/complete → onComplete; backend failure →
 *     Arabic toast + onComplete still fires (non-fatal by design)
 *   - the plan grid fetch (envelope unwrap, price>0 filter, top-3 slice)
 *     and its degraded "جارٍ التحميل" fallback
 *   - "عرض كل الباقات" routes to /subscribe; skip/Escape semantics
 *
 * Mock bundle (house pattern from PaymentDialog.test.tsx): next/navigation
 * router spy, premium-toast spy, vi.stubGlobal(fetch) with a URL router.
 * The POST bodies assert the FINAL correct behavior — including the
 * freshest accessToken (E4 owns the useCallback deps fix in the component;
 * the token-recency test pins it).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import OnboardingWizard from "@/app/onboarding/OnboardingWizard"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn() }),
}))

vi.mock("@/lib/premium-toast", () => ({
  brandedToast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

/** Build a real Response with a JSON body (house helper). */
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

interface RecordedCall {
  method: string
  url: string
  init?: RequestInit
}

/**
 * URL-router fetch stub. Keys are "METHOD /path"; unmatched calls fall
 * through to ok({}) so unexpected traffic is RECORDED (assertable) rather
 * than crashing the wizard.
 */
function stubFetch(routes: Record<string, () => Response>) {
  const calls: RecordedCall[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const method = ((init?.method ?? "GET") as string).toUpperCase()
    calls.push({ method, url: u, init })
    const maker = routes[`${method} ${u}`]
    return maker ? maker() : jsonRes({ success: true, data: {} })
  })
  vi.stubGlobal("fetch", fn)
  return {
    calls,
    callsFor(path: string): RecordedCall[] {
      return calls.filter((c) => c.url === path)
    },
    bodiesFor(path: string): unknown[] {
      return calls
        .filter((c) => c.url === path && c.method === "POST")
        .map((c) => JSON.parse(String(c.init?.body)))
    },
  }
}

const PLANS_ROUTE = "GET /api/plans"

function plansResponse(): Response {
  return jsonRes({
    success: true,
    data: [
      { id: 1, name_ar: "المجانية", price: 0, features: ["ردود محدودة"] },
      { id: 2, name_ar: "الأساسية", price: 19, features: ["500 رد شهرياً", "تحليلات"] },
      { id: 3, name_ar: "المتقدمة", price: 49, features: ["ردود غير محدودة"] },
      { id: 4, name_ar: "الاحترافية", price: 99, features: ["وكيل ذكي"] },
      { id: 5, name_ar: "الشركات", price: 199, features: ["دعم مخصص"] },
    ],
  })
}

function renderWizard() {
  const onComplete = vi.fn()
  const onSkip = vi.fn()
  render(<OnboardingWizard onComplete={onComplete} onSkip={onSkip} />)
  return { onComplete, onSkip }
}

function clickNext() {
  fireEvent.click(screen.getByRole("button", { name: "التالي" }))
}

async function goToConnectStep(api: ReturnType<typeof stubFetch>) {
  clickNext()
  await screen.findByText("اربط صفحة فيسبوك")
  expect(api.callsFor("/api/plans").length).toBe(1) // plans fetched on mount
  return {
    pageId: screen.getByLabelText("معرف الصفحة (Page ID)"),
    token: screen.getByLabelText(/رمز الوصول \(Page Access Token\)/),
    pageName: screen.getByLabelText(/اسم الصفحة \(اختياري/),
  }
}

beforeEach(() => {
  mocks.push.mockClear()
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("OnboardingWizard step progression", () => {
  it("walks welcome → connect → first-rule → plan → done with the exact POST bodies", async () => {
    const api = stubFetch({
      [PLANS_ROUTE]: plansResponse,
      "POST /api/onboarding/connect-page": () => jsonRes({ success: true, data: { ok: true } }),
      "POST /api/onboarding/first-rule": () => jsonRes({ success: true, data: { id: 7 } }),
      "POST /api/onboarding/complete": () => jsonRes({ success: true, data: { done: true } }),
    })
    const { onComplete } = renderWizard()

    // Step 0 — welcome
    expect(screen.getByText("مرحباً بك في SmartBot!")).toBeInTheDocument()
    expect(screen.getByText("الخطوة 1 من 5")).toBeInTheDocument()

    // Step 1 — connect: token FIRST, then page id + name (the deps order
    // that also works pre-E4-fix; the dedicated recency test below pins the
    // component fix itself).
    const f = await goToConnectStep(api)
    fireEvent.change(f.token, { target: { value: "EAAG.wizard.token" } })
    fireEvent.change(f.pageId, { target: { value: "1234567890" } })
    fireEvent.change(f.pageName, { target: { value: "متجر الواحة" } })
    clickNext()

    // connect-page POST contract
    await screen.findByText("أنشئ أول قاعدة رد")
    expect(api.bodiesFor("/api/onboarding/connect-page")).toEqual([
      { page_id: "1234567890", page_name: "متجر الواحة", access_token: "EAAG.wizard.token" },
    ])

    // Step 2 — first rule
    fireEvent.change(screen.getByLabelText("كلمة مفتاحية"), { target: { value: "سعر" } })
    fireEvent.change(screen.getByLabelText("نص الرد"), { target: { value: "السعر يبدأ من 50 د.ل" } })
    clickNext()

    await screen.findByText("اختر خطتك")
    expect(api.bodiesFor("/api/onboarding/first-rule")).toEqual([
      { keyword: "سعر", reply: "السعر يبدأ من 50 د.ل" },
    ])

    // Step 3 — plan grid: paid plans only (free filtered), top-3 slice
    await waitFor(() => {
      expect(screen.getByText("الأساسية")).toBeInTheDocument()
      expect(screen.getByText("المتقدمة")).toBeInTheDocument()
    })
    expect(screen.queryByText("المجانية")).toBeNull() // price 0 filtered out
    expect(screen.getByText("الاحترافية")).toBeInTheDocument() // 3rd paid plan kept
    expect(screen.queryByText("الشركات")).toBeNull() // sliced to 3
    expect(screen.getByText("19")).toBeInTheDocument()
    expect(screen.getAllByText("د.ل/شهر").length).toBe(3) // one per rendered card

    // Step 4 — done
    clickNext()
    await screen.findByText("كل شيء جاهز!")
    expect(screen.getByText("الخطوة 5 من 5")).toBeInTheDocument()

    // Completion call + callback
    fireEvent.click(screen.getByRole("button", { name: "ابدأ الآن" }))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(api.callsFor("/api/onboarding/complete").length).toBe(1)
    expect(api.callsFor("/api/onboarding/complete")[0].method).toBe("POST")
  })

  it("sends the freshest accessToken typed after the page id (E4 deps pin)", async () => {
    // Natural typing order: page id first, token last. The connect-page
    // body must carry the token the user just typed — the useCallback deps
    // fix (E4 task 6) is what guarantees this post-render value.
    const api = stubFetch({
      [PLANS_ROUTE]: plansResponse,
      "POST /api/onboarding/connect-page": () => jsonRes({ success: true, data: {} }),
    })
    renderWizard()

    const f = await goToConnectStep(api)
    fireEvent.change(f.pageId, { target: { value: "987654321" } })
    fireEvent.change(f.pageName, { target: { value: "صفحة الاختبار" } })
    fireEvent.change(f.token, { target: { value: "EAAG.typed-last-token" } })
    clickNext()

    await screen.findByText("أنشئ أول قاعدة رد")
    expect(api.bodiesFor("/api/onboarding/connect-page")).toEqual([
      { page_id: "987654321", page_name: "صفحة الاختبار", access_token: "EAAG.typed-last-token" },
    ])
  })
})

describe("OnboardingWizard connection test (خطوة الربط)", () => {
  it("blocks the test with the Arabic guard when both fields are empty", async () => {
    const api = stubFetch({ [PLANS_ROUTE]: plansResponse })
    renderWizard()
    await goToConnectStep(api)

    fireEvent.click(screen.getByRole("button", { name: /اختبار الاتصال قبل التأكيد/ }))

    const status = await screen.findByRole("status")
    expect(status).toHaveTextContent("أدخل معرف الصفحة ورمز الوصول أولاً")
    expect(api.callsFor("/api/onboarding/test-connection").length).toBe(0)
  })

  it("shows the Arabic transport-failure message when the backend is unreachable", async () => {
    const api = stubFetch({
      [PLANS_ROUTE]: plansResponse,
      "POST /api/onboarding/test-connection": () => jsonRes({ detail: "خادم مشغول" }, 500),
    })
    renderWizard()
    const f = await goToConnectStep(api)

    fireEvent.change(f.pageId, { target: { value: "123" } })
    fireEvent.change(f.token, { target: { value: "EAAG.any" } })
    fireEvent.click(screen.getByRole("button", { name: /اختبار الاتصال قبل التأكيد/ }))

    const status = await screen.findByRole("status")
    expect(status).toHaveTextContent("تعذر الاتصال — تحقق من البيانات")
  })

  it("surfaces the backend's ok({connected:false}) error verbatim", async () => {
    const api = stubFetch({
      [PLANS_ROUTE]: plansResponse,
      "POST /api/onboarding/test-connection": () =>
        jsonRes({ success: true, data: { connected: false, error: "رمز الوصول غير صالح للصفحة" } }),
    })
    renderWizard()
    const f = await goToConnectStep(api)

    fireEvent.change(f.pageId, { target: { value: "123" } })
    fireEvent.change(f.token, { target: { value: "EAAG.bad" } })
    fireEvent.click(screen.getByRole("button", { name: /اختبار الاتصال قبل التأكيد/ }))

    const status = await screen.findByRole("status")
    expect(status).toHaveTextContent("✗ رمز الوصول غير صالح للصفحة")
    // failure must NOT auto-fill the page name
    expect((screen.getByLabelText(/اسم الصفحة \(اختياري/) as HTMLInputElement).value).toBe("")
  })

  it("announces success with the page name + follower count and auto-fills the name", async () => {
    const api = stubFetch({
      [PLANS_ROUTE]: plansResponse,
      "POST /api/onboarding/test-connection": () =>
        jsonRes({
          success: true,
          data: { connected: true, page_name: "متجر الواحة", fan_count: 1200 },
        }),
    })
    renderWizard()
    const f = await goToConnectStep(api)

    fireEvent.change(f.pageId, { target: { value: "123" } })
    fireEvent.change(f.token, { target: { value: "EAAG.good" } })
    fireEvent.click(screen.getByRole("button", { name: /اختبار الاتصال قبل التأكيد/ }))

    const status = await screen.findByRole("status")
    expect(status).toHaveTextContent("✓ الاتصال ناجح — متجر الواحة")
    expect(status).toHaveTextContent("(1200 متابع)")
    await waitFor(() => {
      expect((screen.getByLabelText(/اسم الصفحة \(اختياري/) as HTMLInputElement).value).toBe(
        "متجر الواحة",
      )
    })
    // the POST body contract of the test call itself
    expect(api.bodiesFor("/api/onboarding/test-connection")).toEqual([
      { page_id: "123", access_token: "EAAG.good" },
    ])
  })
})

describe("OnboardingWizard completion + skip semantics", () => {
  it("complete failure → Arabic toast, wizard still finishes (non-fatal by design)", async () => {
    stubFetch({
      [PLANS_ROUTE]: plansResponse,
      "POST /api/onboarding/complete": () => jsonRes({ detail: "boom" }, 500),
    })
    const { onComplete } = renderWizard()

    // fast-forward to the done step
    clickNext()
    await screen.findByText("اربط صفحة فيسبوك")
    clickNext()
    await screen.findByText("أنشئ أول قاعدة رد")
    clickNext()
    await screen.findByText("اختر خطتك")
    clickNext()
    await screen.findByText("كل شيء جاهز!")

    fireEvent.click(screen.getByRole("button", { name: "ابدأ الآن" }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(mocks.toastError).toHaveBeenCalledWith(
      "فشل حفظ الإعدادات — يمكنك إكمالها لاحقاً من لوحة التحكم",
    )
  })

  it("skip on the welcome step fires onSkip (used by AuthGuard to persist dismissal)", async () => {
    stubFetch({ [PLANS_ROUTE]: plansResponse })
    const { onSkip } = renderWizard()

    fireEvent.click(screen.getByRole("button", { name: "تخطي" }))

    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it("Escape maps to the visible back affordance: step 1 → welcome → onSkip", async () => {
    stubFetch({ [PLANS_ROUTE]: plansResponse })
    const { onSkip } = renderWizard()

    clickNext()
    await screen.findByText("اربط صفحة فيسبوك")

    // Escape inside the dialog panel goes back one step…
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    await screen.findByText("مرحباً بك في SmartBot!")

    // …and from step 0 it skips (same behavior as the تخطي button).
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(onSkip).toHaveBeenCalledTimes(1)
  })
})

describe("OnboardingWizard first-rule suggestion", () => {
  async function goToRuleStep() {
    clickNext()
    await screen.findByText("اربط صفحة فيسبوك")
    clickNext()
    await screen.findByText("أنشئ أول قاعدة رد")
    return {
      keyword: screen.getByLabelText("كلمة مفتاحية"),
      reply: screen.getByLabelText("نص الرد"),
    }
  }

  it("fills the reply textarea from the AI suggestion and toasts the source", async () => {
    const api = stubFetch({
      [PLANS_ROUTE]: plansResponse,
      "POST /api/onboarding/suggest-reply": () =>
        jsonRes({ success: true, data: { suggestion: "السعر يبدأ من 50 د.ل وشحن مجاني!", source: "ai" } }),
    })
    renderWizard()

    const f = await goToRuleStep()
    fireEvent.change(f.keyword, { target: { value: "سعر" } })
    fireEvent.click(screen.getByRole("button", { name: "اقترح رداً" }))

    await waitFor(() => {
      expect((screen.getByLabelText("نص الرد") as HTMLTextAreaElement).value).toBe(
        "السعر يبدأ من 50 د.ل وشحن مجاني!",
      )
    })
    expect(api.bodiesFor("/api/onboarding/suggest-reply")).toEqual([{ keyword: "سعر" }])
    expect(mocks.toastSuccess).toHaveBeenCalledWith("اقتراح بالذكاء الاصطناعي")
  })

  it("suggest failure → Arabic toast, textarea untouched", async () => {
    stubFetch({
      [PLANS_ROUTE]: plansResponse,
      "POST /api/onboarding/suggest-reply": () => jsonRes({ detail: "x" }, 500),
    })
    renderWizard()

    const f = await goToRuleStep()
    fireEvent.change(f.keyword, { target: { value: "سعر" } })
    fireEvent.change(f.reply, { target: { value: "رد يدوي" } })
    fireEvent.click(screen.getByRole("button", { name: "اقترح رداً" }))

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("تعذر الاقتراح — اكتب الرد يدوياً"),
    )
    expect((screen.getByLabelText("نص الرد") as HTMLTextAreaElement).value).toBe("رد يدوي")
  })
})

describe("OnboardingWizard plan grid degradation", () => {
  it("shows the loading placeholder when /api/plans fails (CTA link still works)", async () => {
    stubFetch({ [PLANS_ROUTE]: () => jsonRes({ detail: "down" }, 500) })
    renderWizard()

    clickNext()
    await screen.findByText("اربط صفحة فيسبوك")
    clickNext()
    await screen.findByText("أنشئ أول قاعدة رد")
    clickNext()
    await screen.findByText("اختر خطتك")

    // degraded single placeholder card
    expect(screen.getByText("جارٍ التحميل")).toBeInTheDocument()
    // the escape hatch still routes to /subscribe
    fireEvent.click(screen.getByRole("button", { name: "عرض كل الباقات" }))
    expect(mocks.push).toHaveBeenCalledWith("/subscribe")
  })
})

/* v16-E3 (D1 LEAD B — p12-wizard-focus-advance): the forward path has always
 * re-focused #onboarding-step-title, but handleBack and the step-3 «تخطي
 * الإعداد» button called setStep() with NO focus management — key={step}
 * unmounts the clicked button, so focus fell to <body> OUTSIDE the
 * role="dialog" panel and the modal's Tab trap stopped intercepting. These
 * pins assert the v16 fix: after «السابق»/«تخطي الإعداد» the active element
 * IS the new step's title h2 and it lives inside the dialog container. */
describe("OnboardingWizard focus management (back / skip-setup)", () => {
  it("«السابق» moves focus to the new step's title inside [role=dialog]", async () => {
    stubFetch({ [PLANS_ROUTE]: plansResponse })
    renderWizard()

    // advance to step 1 so «السابق» is a step-back, not a skip
    clickNext()
    await screen.findByText("اربط صفحة فيسبوك")

    fireEvent.click(screen.getByRole("button", { name: "السابق" }))
    await screen.findByText("مرحباً بك في SmartBot!")

    // rAF fires after the remount: focus must have landed on the step title
    await waitFor(() => {
      const active = document.activeElement as HTMLElement | null
      expect(active?.id).toBe("onboarding-step-title")
      expect(screen.getByRole("dialog").contains(active)).toBe(true)
    })
  })

  it("«تخطي الإعداد» (step 3) moves focus to the done step's title inside [role=dialog]", async () => {
    stubFetch({ [PLANS_ROUTE]: plansResponse })
    renderWizard()

    clickNext()
    await screen.findByText("اربط صفحة فيسبوك")
    clickNext()
    await screen.findByText("أنشئ أول قاعدة رد")
    clickNext()
    await screen.findByText("اختر خطتك")

    fireEvent.click(screen.getByRole("button", { name: "تخطي الإعداد" }))
    await screen.findByText("كل شيء جاهز!")

    await waitFor(() => {
      const active = document.activeElement as HTMLElement | null
      expect(active?.id).toBe("onboarding-step-title")
      expect(screen.getByRole("dialog").contains(active)).toBe(true)
    })
  })
})
