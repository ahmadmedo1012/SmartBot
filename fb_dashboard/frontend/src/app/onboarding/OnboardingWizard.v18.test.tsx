/**
 * v18-1a — OnboardingWizard resilience contract (error honesty + progress).
 *
 * The v17 suite (src/test/OnboardingWizard.test.tsx) pins the happy path
 * and the a11y contracts. These pins cover the v18 production findings:
 *
 *   (أ) honest save failures — a 409 «هذه الصفحة مربوطة بمساحة عمل أخرى»
 *       (or ANY connect-page / first-rule failure) renders the server's
 *       Arabic detail in role="alert", BLOCKS the auto-advance, and offers
 *       «إعادة المحاولة» (re-POST, advance on success) and «المتابعة رغم
 *       ذلك» (explicit informed bypass, no second POST). Focus lands ON
 *       the alert.
 *   (ب) persisted progress — pagehide writes sb-onboarding-step; a remount
 *       RESUMES from it; garbage values are ignored; completion and skip
 *       clear the key.
 *   (هـ) «عرض كل الباقات» opens /subscribe in a NEW TAB (opener nulled,
 *       wizard tab stays put, step persisted); a blocked popup falls back
 *       to the pre-v18 same-tab push without persisting.
 *
 * Mock bundle: house pattern from src/test/OnboardingWizard.test.tsx
 * (next/navigation router spy, premium-toast spy, vi.stubGlobal(fetch)
 * URL router) + a window.open spy for the new-tab contract.
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

/** URL-router fetch stub (house helper — unmatched calls answer ok({})). */
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
      { id: 2, name_ar: "الأساسية", price: 19, features: ["500 رد شهرياً"] },
      { id: 3, name_ar: "المتقدمة", price: 49, features: ["ردود غير محدودة"] },
    ],
  })
}

const STEP_KEY = "sb-onboarding-step"

function renderWizard() {
  const onComplete = vi.fn()
  const onSkip = vi.fn()
  const view = render(<OnboardingWizard onComplete={onComplete} onSkip={onSkip} />)
  return { onComplete, onSkip, unmount: view.unmount }
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

/** Fill the connect step with a conflicting page and advance once. */
async function failConnectPage(
  api: ReturnType<typeof stubFetch>,
  detail = "هذه الصفحة مربوطة بمساحة عمل أخرى — تواصل مع الدعم إن كنت تعتقد أن ذلك خطأ",
  status = 409,
) {
  const f = await goToConnectStep(api)
  fireEvent.change(f.pageId, { target: { value: "1235690416285843" } })
  fireEvent.change(f.token, { target: { value: "EAAG.conflict" } })
  fireEvent.change(f.pageName, { target: { value: "Smart Link-الربط الذكي" } })
  clickNext()
  return f
}

beforeEach(() => {
  mocks.push.mockClear()
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
  /* v18-1a (ب): the wizard now persists its step — every case starts clean */
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe("v18-1a (أ) — honest save failures", () => {
  it("connect-page 409 → the server's Arabic detail in role=alert, NO auto-advance, focus on the alert", async () => {
    const api = stubFetch({
      [PLANS_ROUTE]: plansResponse,
      "POST /api/onboarding/connect-page": () =>
        jsonRes({ detail: "هذه الصفحة مربوطة بمساحة عمل أخرى — تواصل مع الدعم إن كنت تعتقد أن ذلك خطأ" }, 409),
    })
    renderWizard()
    await failConnectPage(api)

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("فشل ربط الصفحة")
    expect(alert).toHaveTextContent("هذه الصفحة مربوطة بمساحة عمل أخرى")
    expect(alert).toHaveTextContent("لم يتم ربط صفحتك بعد")
    // two explicit paths out — never a silent advance
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "المتابعة رغم ذلك" })).toBeInTheDocument()
    // still on the connect step — the wizard did NOT move on
    expect(screen.getByText("اربط صفحة فيسبوك")).toBeInTheDocument()
    expect(screen.queryByText("أنشئ أول قاعدة رد")).toBeNull()
    // exactly one save attempt, with the exact body
    expect(api.bodiesFor("/api/onboarding/connect-page")).toEqual([
      { page_id: "1235690416285843", page_name: "Smart Link-الربط الذكي", access_token: "EAAG.conflict" },
    ])
    // keyboard + SR users land ON the verdict (rAF contract, like focusStepTitle)
    await waitFor(() => expect(document.activeElement?.id).toBe("onboarding-save-error"))
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true)
  })

  it("«إعادة المحاولة» re-POSTs and advances when the retry succeeds", async () => {
    let attempts = 0
    const api = stubFetch({
      [PLANS_ROUTE]: plansResponse,
      "POST /api/onboarding/connect-page": () => {
        attempts += 1
        return attempts === 1
          ? jsonRes({ detail: "تعذر الوصول إلى الخادم" }, 503)
          : jsonRes({ success: true, data: { ok: true } })
      },
    })
    renderWizard()
    await failConnectPage(api, "تعذر الوصول إلى الخادم", 503)
    await screen.findByRole("alert")

    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))

    await screen.findByText("أنشئ أول قاعدة رد")
    expect(screen.queryByRole("alert")).toBeNull()
    expect(api.callsFor("/api/onboarding/connect-page").length).toBe(2)
  })

  it("«المتابعة رغم ذلك» advances WITHOUT a second save (explicit, informed bypass)", async () => {
    const api = stubFetch({
      [PLANS_ROUTE]: plansResponse,
      "POST /api/onboarding/connect-page": () =>
        jsonRes({ detail: "هذه الصفحة مربوطة بمساحة عمل أخرى" }, 409),
    })
    renderWizard()
    await failConnectPage(api, "هذه الصفحة مربوطة بمساحة عمل أخرى")
    await screen.findByRole("alert")

    fireEvent.click(screen.getByRole("button", { name: "المتابعة رغم ذلك" }))

    await screen.findByText("أنشئ أول قاعدة رد")
    expect(api.callsFor("/api/onboarding/connect-page").length).toBe(1)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("first-rule failure → Arabic detail in role=alert, step stays, form intact", async () => {
    const api = stubFetch({
      [PLANS_ROUTE]: plansResponse,
      "POST /api/onboarding/first-rule": () => jsonRes({ detail: "تعذر حفظ القاعدة" }, 500),
    })
    renderWizard()
    // empty page id → no connect POST → walk to the rule step
    clickNext()
    await screen.findByText("اربط صفحة فيسبوك")
    clickNext()
    await screen.findByText("أنشئ أول قاعدة رد")

    fireEvent.change(screen.getByLabelText("كلمة مفتاحية"), { target: { value: "سعر" } })
    fireEvent.change(screen.getByLabelText("نص الرد"), { target: { value: "السعر يبدأ من 50 د.ل" } })
    clickNext()

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("فشل حفظ قاعدة الرد")
    expect(alert).toHaveTextContent("تعذر حفظ القاعدة")
    expect(alert).toHaveTextContent("لم تُحفظ قاعدة الرد")
    expect(screen.queryByText("اختر خطتك")).toBeNull()
    // the typed rule is still in the form — nothing was lost
    expect((screen.getByLabelText("نص الرد") as HTMLTextAreaElement).value).toBe("السعر يبدأ من 50 د.ل")
    expect(api.bodiesFor("/api/onboarding/first-rule")).toEqual([
      { keyword: "سعر", reply: "السعر يبدأ من 50 د.ل" },
    ])
  })

  it("a 200 success:false envelope is ALSO a failure (unwrapApi contract)", async () => {
    const api = stubFetch({
      [PLANS_ROUTE]: plansResponse,
      "POST /api/onboarding/connect-page": () =>
        jsonRes({ success: false, error: "رمز الوصول منتهي الصلاحية" }),
    })
    renderWizard()
    await failConnectPage(api, "رمز الوصول منتهي الصلاحية")

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("رمز الوصول منتهي الصلاحية")
    expect(screen.queryByText("أنشئ أول قاعدة رد")).toBeNull()
  })
})

describe("v18-1a (ب) — persisted progress (sb-onboarding-step)", () => {
  it("pagehide persists the step; a remount RESUMES from it (not step 1)", async () => {
    stubFetch({ [PLANS_ROUTE]: plansResponse })
    const first = renderWizard()
    clickNext()
    await screen.findByText("اربط صفحة فيسبوك")

    // leaving the tab / reloading mid-journey
    fireEvent(window, new Event("pagehide"))
    expect(window.localStorage.getItem(STEP_KEY)).toBe("1")
    first.unmount()

    // back on /dashboard — the wizard picks up where it left off
    renderWizard()
    expect(await screen.findByText("اربط صفحة فيسبوك")).toBeInTheDocument()
    expect(screen.queryByText("مرحباً بك في SmartBot!")).toBeNull()
    expect(screen.getByText("الخطوة 2 من 5")).toBeInTheDocument()
  })

  it("garbage / out-of-range persisted values are ignored — fresh start", () => {
    window.localStorage.setItem(STEP_KEY, "not-a-number")
    stubFetch({ [PLANS_ROUTE]: plansResponse })
    renderWizard()
    expect(screen.getByText("مرحباً بك في SmartBot!")).toBeInTheDocument()
    expect(screen.getByText("الخطوة 1 من 5")).toBeInTheDocument()

    window.localStorage.setItem(STEP_KEY, "99")
    renderWizard()
    expect(screen.getAllByText("مرحباً بك في SmartBot!").length).toBe(2) // second mount, still fresh
  })

  it("completion clears the persisted step", async () => {
    window.localStorage.setItem(STEP_KEY, "4") // left at the done step
    stubFetch({
      [PLANS_ROUTE]: plansResponse,
      "POST /api/onboarding/complete": () => jsonRes({ success: true, data: { done: true } }),
    })
    const { onComplete } = renderWizard()
    expect(await screen.findByText("كل شيء جاهز!")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "ابدأ الآن" }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(window.localStorage.getItem(STEP_KEY)).toBeNull()
  })

  it("skip clears the persisted step (the journey must not resurrect)", async () => {
    window.localStorage.setItem(STEP_KEY, "1")
    stubFetch({ [PLANS_ROUTE]: plansResponse })
    const { onSkip } = renderWizard()
    expect(await screen.findByText("اربط صفحة فيسبوك")).toBeInTheDocument()

    // walk back to the welcome step, then تخطي
    fireEvent.click(screen.getByRole("button", { name: "السابق" }))
    await screen.findByText("مرحباً بك في SmartBot!")
    fireEvent.click(screen.getByRole("button", { name: "تخطي" }))

    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(STEP_KEY)).toBeNull()
  })

  it("a done-step shortcut persists the step before navigating (return resumes at «كل شيء جاهز»)", async () => {
    stubFetch({ [PLANS_ROUTE]: plansResponse })
    renderWizard()
    clickNext()
    await screen.findByText("اربط صفحة فيسبوك")
    clickNext()
    await screen.findByText("أنشئ أول قاعدة رد")
    clickNext()
    await screen.findByText("اختر خطتك")
    clickNext()
    await screen.findByText("كل شيء جاهز!")

    fireEvent.click(screen.getByRole("button", { name: "الردود" }))
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/autoreply")
    expect(window.localStorage.getItem(STEP_KEY)).toBe("4")
  })
})

describe("v18-1a (هـ) — «عرض كل الباقات» opens a new tab", () => {
  async function goToPlanStep() {
    clickNext()
    await screen.findByText("اربط صفحة فيسبوك")
    clickNext()
    await screen.findByText("أنشئ أول قاعدة رد")
    clickNext()
    await screen.findByText("اختر خطتك")
  }

  it("opens /subscribe in a new tab, nulls the opener, stays in this tab, persists the step", async () => {
    stubFetch({ [PLANS_ROUTE]: plansResponse })
    const newTab = { opener: { __dangerous: true } as unknown }
    const openSpy = vi.spyOn(window, "open").mockReturnValue(newTab as unknown as Window)
    renderWizard()
    await goToPlanStep()

    fireEvent.click(screen.getByRole("button", { name: "عرض كل الباقات" }))

    expect(openSpy).toHaveBeenCalledWith("/subscribe", "_blank")
    expect(newTab.opener).toBeNull() // reverse tab-nabbing guard
    expect(mocks.push).not.toHaveBeenCalled() // the wizard tab never navigates away
    expect(window.localStorage.getItem(STEP_KEY)).toBe("3") // reload/close-safe
  })

  it("popup blocked → same-tab fallback keeps the pre-v18 escape hatch (no persist)", async () => {
    stubFetch({ [PLANS_ROUTE]: plansResponse })
    vi.spyOn(window, "open").mockReturnValue(null)
    renderWizard()
    await goToPlanStep()

    fireEvent.click(screen.getByRole("button", { name: "عرض كل الباقات" }))

    expect(mocks.push).toHaveBeenCalledWith("/subscribe")
    expect(window.localStorage.getItem(STEP_KEY)).toBeNull()
  })
})
