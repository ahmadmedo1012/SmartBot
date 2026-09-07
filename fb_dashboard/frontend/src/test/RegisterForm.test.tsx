/**
 * v14-E6 (D9 gap G5) — RegisterForm contract.
 *
 * 268 lines of v10-B6 Arabic validation + v12-E4.8 429 lockout with ZERO
 * tests before this file. Pins:
 *
 *   - the Arabic validation matrix in priority order (empty username →
 *     short username → empty email → bad email → empty/short password →
 *     mismatch confirm), each with NO network call (fetch never fires)
 *   - the per-field validity verdicts (aria-label صالح/غير صالح) that
 *     drive the aria-describedby wiring
 *   - the 429 rate-limit lockout: the backend's Arabic detail surfaces,
 *     the countdown line appears, submit stays disabled for the parsed
 *     window, then re-enables (fake timers advance the interval)
 *   - the happy path: exact POST /api/register body (trimmed username +
 *     trimmed email, raw password), success toast, and the redirect to
 *     /dashboard via window.location.replace
 *
 * Mock bundle (house pattern): premium-toast spy, next-themes stub (the
 * ThemeToggle in the corner needs no real provider), vi.stubGlobal fetch
 * returning real Response objects, and a stubbed window.location (probed:
 * jsdom's replace is non-configurable, vi.stubGlobal works).
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import RegisterForm from "@/app/register/RegisterForm"

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  replace: vi.fn(),
}))

vi.mock("@/lib/premium-toast", () => ({
  brandedToast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}))

/** Build a real Response with a JSON body (house helper). */
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function stubFetch(res: () => Response) {
  const fn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => res())
  vi.stubGlobal("fetch", fn)
  return fn
}

function stubLocation() {
  vi.stubGlobal("location", {
    href: "http://localhost/register",
    replace: mocks.replace,
    assign: vi.fn(),
  })
}

interface Fields {
  username: HTMLInputElement
  email: HTMLInputElement
  password: HTMLInputElement
  confirm: HTMLInputElement
}

function renderForm(): Fields {
  render(<RegisterForm />)
  return {
    username: screen.getByLabelText("اسم المستخدم"),
    email: screen.getByLabelText("البريد الإلكتروني"),
    password: screen.getByLabelText("كلمة المرور"),
    confirm: screen.getByLabelText("تأكيد كلمة المرور"),
  }
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "إنشاء حساب" }))
}

function fillValid(f: Fields, overrides: Partial<Record<keyof Fields, string>> = {}) {
  fireEvent.change(f.username, { target: { value: "user01" } })
  fireEvent.change(f.email, { target: { value: "user01@t.ly" } })
  fireEvent.change(f.password, { target: { value: "Str0ngPass!ly" } })
  fireEvent.change(f.confirm, { target: { value: "Str0ngPass!ly" } })
  for (const [k, v] of Object.entries(overrides)) {
    fireEvent.change(f[k as keyof Fields], { target: { value: v } })
  }
}

/** The single <p role="alert"> form-level error line. */
function formError(): HTMLElement {
  return screen.getByRole("alert")
}

beforeEach(() => {
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
  mocks.replace.mockClear()
  stubLocation()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("RegisterForm Arabic validation matrix (no network on bad input)", () => {
  it.each([
    {
      what: "empty username",
      fill: { username: "" },
      message: "يرجى إدخال اسم المستخدم",
    },
    {
      what: "2-char username",
      fill: { username: "ab" },
      message: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل",
    },
    {
      what: "empty email",
      fill: { email: "" },
      message: "يرجى إدخال البريد الإلكتروني",
    },
    {
      what: "malformed email",
      fill: { email: "ليس-بريداً" },
      message: "أدخل بريداً إلكترونياً صالحاً",
    },
    {
      what: "empty password",
      fill: { password: "", confirm: "" },
      message: "يرجى إدخال كلمة المرور",
    },
    {
      what: "7-char password (v12-E4.9 8-char gate)",
      fill: { password: "Ab1!xyz", confirm: "Ab1!xyz" },
      message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل",
    },
    {
      what: "mismatched confirm",
      fill: { confirm: "Different99!" },
      message: "كلمتا المرور غير متطابقتين",
    },
  ])("$what → Arabic message, submit never POSTs", ({ fill, message }) => {
    const fetchMock = stubFetch(() => jsonRes({ success: true }))
    const f = renderForm()
    fillValid(f, fill)
    submit()

    expect(formError()).toHaveTextContent(message)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("RegisterForm per-field validity verdicts", () => {
  it("flips the username verdict icon with length ≥3", () => {
    const f = renderForm()

    fireEvent.change(f.username, { target: { value: "عب" } })
    expect(screen.getByLabelText("غير صالح")).toBeInTheDocument()

    fireEvent.change(f.username, { target: { value: "user01" } })
    expect(screen.getByLabelText("صالح")).toBeInTheDocument()
  })

  it("flips the email verdict with the regex", () => {
    const f = renderForm()

    fireEvent.change(f.email, { target: { value: "bad-email" } })
    expect(screen.getByLabelText("غير صالح")).toBeInTheDocument()

    fireEvent.change(f.email, { target: { value: "good@t.ly" } })
    expect(screen.getByLabelText("صالح")).toBeInTheDocument()
  })

  it("marks the confirm field غير صالح while the passwords differ", () => {
    const f = renderForm()

    fireEvent.change(f.password, { target: { value: "Str0ngPass!ly" } })
    fireEvent.change(f.confirm, { target: { value: "Str0ngPass!lX" } })

    // two verdict icons exist at this point; the confirm one must be X
    const verdicts = screen.getAllByRole("img", { name: "غير صالح" })
    expect(verdicts.length).toBeGreaterThanOrEqual(1)

    fireEvent.change(f.confirm, { target: { value: "Str0ngPass!ly" } })
    expect(screen.queryByRole("img", { name: "غير صالح" })).toBeNull()
    expect(screen.getAllByRole("img", { name: "صالح" }).length).toBeGreaterThanOrEqual(2)
  })
})

describe("RegisterForm 429 rate-limit lockout (v12-E4.8)", () => {
  it("surfaces the Arabic detail, locks the CTA, counts down, re-enables", async () => {
    vi.useFakeTimers()
    // 429 with the backend's Arabic rate-limit phrasing — the parser must
    // pick "2 ثانية" out of it (not the 60s fallback)
    const fetchMock = stubFetch(() =>
      jsonRes({ detail: "محاولات كثيرة — أعد المحاولة بعد 2 ثانية" }, 429),
    )
    const f = renderForm()
    fillValid(f)

    await act(async () => {
      submit()
    })

    // the backend's Arabic detail surfaced on the form error line
    expect(formError()).toHaveTextContent("محاولات كثيرة — أعد المحاولة بعد 2 ثانية")
    // countdown line + disabled CTA
    const cta = screen.getByRole("button", { name: "إنشاء حساب" })
    expect(screen.getByText(/يمكنك إعادة المحاولة بعد 2 ثانية/)).toBeInTheDocument()
    expect(cta).toBeDisabled()

    // one second later: still locked, countdown at 1
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText(/يمكنك إعادة المحاولة بعد 1 ثانية/)).toBeInTheDocument()
    expect(cta).toBeDisabled()

    // window exhausted: the line disappears and the CTA unlocks
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByText(/يمكنك إعادة المحاولة/)).toBeNull()
    expect(cta).toBeEnabled()
    // exactly one POST happened (the locked window blocked re-submits)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("falls back to a 60s window when the detail has no seconds", async () => {
    vi.useFakeTimers()
    stubFetch(() => jsonRes({ detail: "محاولات كثيرة جداً" }, 429))
    const f = renderForm()
    fillValid(f)

    await act(async () => {
      submit()
    })

    expect(screen.getByText(/يمكنك إعادة المحاولة بعد 60 ثانية/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "إنشاء حساب" })).toBeDisabled()
  })
})

describe("RegisterForm happy path", () => {
  it("POSTs the trimmed body, toasts success, and redirects to /dashboard", async () => {
    const fetchMock = stubFetch(() =>
      jsonRes({ success: true, data: { user: { username: "user01" } } }),
    )
    const f = renderForm()

    // whitespace on both ends: the contract sends the TRIMMED values
    fireEvent.change(f.username, { target: { value: "  user01  " } })
    fireEvent.change(f.email, { target: { value: "  user01@t.ly " } })
    fireEvent.change(f.password, { target: { value: "Str0ngPass!ly" } })
    fireEvent.change(f.confirm, { target: { value: "Str0ngPass!ly" } })
    submit()

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إنشاء الحساب بنجاح"))

    // exact POST contract: endpoint, method, credentials, JSON body
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/register")
    expect(init.method).toBe("POST")
    expect(init.credentials).toBe("include")
    expect(JSON.parse(String(init.body))).toEqual({
      username: "user01",
      email: "user01@t.ly",
      password: "Str0ngPass!ly",
    })
    expect(mocks.toastError).not.toHaveBeenCalled()

    // redirect (setTimeout 150ms) → location.replace("/dashboard")
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"))
    // no form-level error line on success
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("shows the backend's Arabic conflict detail on a non-2xx register", async () => {
    stubFetch(() => jsonRes({ detail: "اسم المستخدم مستخدم بالفعل" }, 400))
    const f = renderForm()
    fillValid(f)

    await act(async () => {
      submit()
    })

    expect(formError()).toHaveTextContent("اسم المستخدم مستخدم بالفعل")
    expect(mocks.toastError).toHaveBeenCalledWith("اسم المستخدم مستخدم بالفعل")
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
