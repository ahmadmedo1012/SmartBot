/**
 * v15-E5 (D4-H5) — dashboard/settings password change surfaces the REAL
 * backend detail.
 *
 * The backend answers 401 {detail: "كلمة المرور الحالية غير صحيحة"} for a
 * wrong current password (auth.py:364) — but apiFetch THROWS on non-2xx, so
 * the page's old `if (r.ok) … else …` was unreachable dead code and the
 * generic catch showed the network message «خطأ في الاتصال». The fix pins:
 *
 *   - the Arabic detail reaches the toast VERBATIM
 *   - no session-expiry redirect happens (the endpoint is in apiFetch's
 *     local-401 skip-list — its 401 is a wrong password, not a dead session)
 *   - the success path still toasts + clears the fields
 *
 * Mock bundle: QueryClientProvider (the page is a react-query consumer),
 * premium-toast spy, URL-router fetch stub, stubbed window.location.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import SettingsPage from "@/app/dashboard/settings/page"

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

/** Build a real Response with a JSON body. */
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

interface RecordedCall {
  method: string
  url: string
  body?: string
}

function stubFetch(routes: Record<string, () => Response>) {
  const calls: RecordedCall[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const method = ((init?.method ?? "GET") as string).toUpperCase()
    calls.push({ method, url: u, body: init?.body ? String(init.body) : undefined })
    const maker = routes[`${method} ${u}`]
    return maker ? maker() : jsonRes({ success: true, data: {} })
  })
  vi.stubGlobal("fetch", fn)
  return calls
}

const ME = "GET /api/me"

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SettingsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
  mocks.replace.mockClear()
  vi.stubGlobal("location", {
    pathname: "/dashboard/settings",
    search: "",
    href: "http://localhost/dashboard/settings",
    replace: mocks.replace,
    assign: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("settings password change — the backend's Arabic detail surfaces (D4-H5)", () => {
  it("wrong current password → toast shows «كلمة المرور الحالية غير صحيحة» (NOT «خطأ في الاتصال»), no redirect", async () => {
    stubFetch({
      [ME]: () =>
        jsonRes({
          success: true,
          data: { user: { id: 1, username: "aziz", role: "admin", email: "a@t.ly" } },
        }),
      "POST /api/auth/change-password": () =>
        jsonRes({ detail: "كلمة المرور الحالية غير صحيحة" }, 401),
    })
    renderSettings()

    // wait for the query, open the password form
    await screen.findByText("معلومات الحساب")
    fireEvent.click(screen.getByRole("button", { name: "تغيير كلمة المرور" }))

    fireEvent.change(screen.getByLabelText("كلمة المرور الحالية"), {
      target: { value: "WrongPass!1" },
    })
    fireEvent.change(screen.getByLabelText("كلمة المرور الجديدة"), {
      target: { value: "NewStr0ngPass" },
    })
    fireEvent.click(screen.getByRole("button", { name: "تغيير كلمة المرور" }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("كلمة المرور الحالية غير صحيحة")
    })
    // the network-message regression guard — the old catch showed this
    expect(mocks.toastError).not.toHaveBeenCalledWith("خطأ في الاتصال")
    // 401 from change-password is LOCAL (wrong password) — never a session kick
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("backend 400 («كلمة المرور الجديدة مطابقة للحالية») also surfaces verbatim", async () => {
    stubFetch({
      [ME]: () =>
        jsonRes({
          success: true,
          data: { user: { id: 1, username: "aziz", role: "admin", email: "a@t.ly" } },
        }),
      "POST /api/auth/change-password": () =>
        jsonRes({ detail: "كلمة المرور الجديدة مطابقة للحالية" }, 400),
    })
    renderSettings()

    await screen.findByText("معلومات الحساب")
    fireEvent.click(screen.getByRole("button", { name: "تغيير كلمة المرور" }))
    fireEvent.change(screen.getByLabelText("كلمة المرور الحالية"), {
      target: { value: "WrongPass!1" },
    })
    fireEvent.change(screen.getByLabelText("كلمة المرور الجديدة"), {
      target: { value: "NewStr0ngPass" },
    })
    fireEvent.click(screen.getByRole("button", { name: "تغيير كلمة المرور" }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("كلمة المرور الجديدة مطابقة للحالية")
    })
  })

  it("success path toasts, posts the exact body, and clears the fields", async () => {
    const calls = stubFetch({
      [ME]: () =>
        jsonRes({
          success: true,
          data: { user: { id: 1, username: "aziz", role: "admin", email: "a@t.ly" } },
        }),
      "POST /api/auth/change-password": () => jsonRes({ success: true, data: { changed: true } }),
    })
    renderSettings()

    await screen.findByText("معلومات الحساب")
    fireEvent.click(screen.getByRole("button", { name: "تغيير كلمة المرور" }))

    const current = screen.getByLabelText("كلمة المرور الحالية")
    const next = screen.getByLabelText("كلمة المرور الجديدة")
    fireEvent.change(current, { target: { value: "OldStr0ngPass" } })
    fireEvent.change(next, { target: { value: "NewStr0ngPass" } })
    fireEvent.click(screen.getByRole("button", { name: "تغيير كلمة المرور" }))

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("تم تغيير كلمة المرور بنجاح")
    })
    // success closes the form entirely (setShowPw(false)) — the inputs
    // unmount; their detached nodes would keep stale values, so assert the
    // close, then reopen and assert the state was ACTUALLY cleared
    await waitFor(() => {
      expect(screen.queryByLabelText("كلمة المرور الحالية")).toBeNull()
    })
    fireEvent.click(screen.getByRole("button", { name: "تغيير كلمة المرور" }))
    expect(screen.getByLabelText("كلمة المرور الحالية")).toHaveValue("")
    expect(screen.getByLabelText("كلمة المرور الجديدة")).toHaveValue("")

    const pw = calls.find((c) => c.url === "/api/auth/change-password")
    expect(pw?.method).toBe("POST")
    expect(JSON.parse(String(pw?.body))).toEqual({
      current_password: "OldStr0ngPass",
      new_password: "NewStr0ngPass",
    })
  })
})
