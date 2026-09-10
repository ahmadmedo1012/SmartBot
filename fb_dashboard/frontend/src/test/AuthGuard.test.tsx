/**
 * v15-E5 — AuthGuard contract (D4-H1 + guard-level 401).
 *
 * D4-H1 pins THE skip fix: the wizard's «تخطي» used a RAW fetch() with no
 * X-CSRF-Token — app/middleware.py's double-submit layer 403'd every skip
 * POST and the .catch() swallowed it, so onboarding_completed never
 * persisted and the wizard re-appeared on every refresh. The skip now goes
 * through apiFetch, which echoes the csrf cookie the guard's own /api/me GET
 * planted (this is the exact browser sequence the middleware relies on).
 *
 * Guard-level 401: /api/me 401 → immediate /login?redirect=<pathname>
 * (the guard's own raw-fetch redirect — distinct from apiFetch's global
 * D4-H3 redirect covered in ApiGlobal401.test.ts).
 *
 * Mock bundle (house pattern): next/navigation usePathname, the two dynamic
 * wizard/tour imports (mocked so no heavy chunk loads), premium-toast spy,
 * URL-router fetch stub with real Response objects, jsdom cookie jar for
 * the csrf cookie, stubbed window.location (jsdom's real href/replace are
 * non-configurable; vi.stubGlobal works — RegisterForm.test.tsx precedent).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AuthGuard from "@/app/dashboard/AuthGuard"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  href: "",
  replace: vi.fn(),
  navReplace: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: (): string => "/dashboard/messages",
  useRouter: (): { replace: (to: string) => void } => ({ replace: mocks.navReplace }),
}))

/* dynamic() targets — mocked at module level so no real chunk loads. */
vi.mock("@/app/onboarding/OnboardingWizard", () => ({
  default: ({ onSkip }: { onSkip: () => void }) => (
    <button type="button" onClick={onSkip}>
      mock-wizard-skip
    </button>
  ),
}))
vi.mock("@/components/onboarding/OnboardingTour", () => ({
  OnboardingTour: () => <div>mock-tour</div>,
}))

vi.mock("@/lib/premium-toast", () => ({
  premiumToast: mocks.toast,
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
  headers: Headers
}

function stubFetch(routes: Record<string, () => Response>) {
  const calls: RecordedCall[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const method = ((init?.method ?? "GET") as string).toUpperCase()
    calls.push({ method, url: u, headers: new Headers(init?.headers) })
    const maker = routes[`${method} ${u}`]
    return maker ? maker() : jsonRes({ success: true, data: {} })
  })
  vi.stubGlobal("fetch", fn)
  return calls
}

function stubLocation(pathname = "/dashboard/messages") {
  mocks.href = ""
  const loc: Record<string, unknown> = {
    pathname,
    search: "",
    replace: mocks.replace,
    assign: vi.fn(),
  }
  Object.defineProperty(loc, "href", {
    get(this: Record<string, unknown>): string {
      return String(this._href ?? `http://localhost${pathname}`)
    },
    set(this: Record<string, unknown>, v: string): void {
      this._href = v
      mocks.href = v
    },
    configurable: true,
  })
  vi.stubGlobal("location", loc)
}

beforeEach(() => {
  mocks.toast.mockClear()
  mocks.replace.mockClear()
  mocks.navReplace.mockClear()
  // clean csrf cookie jar between cases (jsdom Set-Cookie semantics)
  document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT"
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("AuthGuard happy path (authenticated /api/me)", () => {
  it("renders children and never mounts the wizard when onboarding is complete", async () => {
    stubFetch({
      "GET /api/me": () =>
        jsonRes({
          success: true,
          data: {
            user: { id: 1, role: "admin", tenant_id: 5, onboardingCompleted: true },
          },
        }),
    })
    stubLocation()

    render(
      <AuthGuard>
        <div>dashboard-content</div>
      </AuthGuard>,
    )

    expect(await screen.findByText("dashboard-content")).toBeInTheDocument()
    expect(screen.queryByText("mock-wizard-skip")).toBeNull()
  })
})

describe("AuthGuard skip — X-CSRF-Token double-submit (D4-H1)", () => {
  it("POSTs /api/onboarding/skip through apiFetch with the csrf cookie echoed in the header", async () => {
    const calls = stubFetch({
      "GET /api/me": () =>
        jsonRes({
          success: true,
          data: {
            user: { id: 1, role: "admin", tenant_id: 5, onboardingCompleted: false },
          },
        }),
      "POST /api/onboarding/skip": () =>
        jsonRes({ success: true, data: { onboardingCompleted: true, skipped: true } }),
    })
    stubLocation()
    // the guard's /api/me GET plants this cookie server-side; plant it in
    // the jar exactly like the browser would (apiFetch reads document.cookie)
    document.cookie = "csrf_token=tok-skip-123"

    render(
      <AuthGuard>
        <div>dashboard-content</div>
      </AuthGuard>,
    )

    const skip = await screen.findByRole("button", { name: "mock-wizard-skip" })
    fireEvent.click(skip)

    await waitFor(() => {
      const skipCall = calls.find((c) => c.url === "/api/onboarding/skip")
      expect(skipCall).toBeDefined()
      expect(skipCall?.method).toBe("POST")
      // THE D4-H1 pin: the raw fetch() sent no X-CSRF-Token → middleware 403
      expect(skipCall?.headers.get("X-CSRF-Token")).toBe("tok-skip-123")
      expect(skipCall?.headers.get("Content-Type")).toBe("application/json")
    })
    // no visible error toast on the success path
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it("shows a visible Arabic toast when the skip POST fails (no more silent .catch)", async () => {
    stubFetch({
      "GET /api/me": () =>
        jsonRes({
          success: true,
          data: {
            user: { id: 1, role: "admin", tenant_id: 5, onboardingCompleted: false },
          },
        }),
      "POST /api/onboarding/skip": () => jsonRes({ detail: "خطأ ما" }, 500),
    })
    stubLocation()
    document.cookie = "csrf_token=tok-skip-123"

    render(
      <AuthGuard>
        <div>dashboard-content</div>
      </AuthGuard>,
    )

    fireEvent.click(await screen.findByRole("button", { name: "mock-wizard-skip" }))

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith(
        "error",
        "تعذر حفظ تخطي المعالج",
        "قد تظهر خطوات التهيئة مجدداً عند تحديث الصفحة — أعد المحاولة أو أكملها من لوحة التحكم",
      )
    })
  })
})

describe("AuthGuard guard-level 401 (session expired on load)", () => {
  it("redirects to /login?redirect=<current pathname> when /api/me answers 401", async () => {
    stubFetch({
      "GET /api/me": () => jsonRes({ detail: "انتهت صلاحية الجلسة" }, 401),
    })
    stubLocation()

    render(
      <AuthGuard>
        <div>dashboard-content</div>
      </AuthGuard>,
    )

    // the guard retries once (~500ms) before giving up and redirecting
    await waitFor(
      () => {
        expect(mocks.href).toBe("/login?redirect=%2Fdashboard%2Fmessages")
      },
      { timeout: 4000 },
    )
    expect(screen.queryByText("dashboard-content")).toBeNull()
  })
})

describe("AuthGuard requirePlatformAdmin (v22-D6 — /admin shell gate)", () => {
  it("keeps a platform admin (is_platform_admin=true) inside the shell", async () => {
    stubFetch({
      "GET /api/me": () =>
        jsonRes({
          success: true,
          data: {
            user: { id: 1, role: "admin", tenant_id: 5, is_platform_admin: true, onboardingCompleted: true },
          },
        }),
    })
    stubLocation()

    render(
      <AuthGuard requiredRole="admin" requirePlatformAdmin>
        <div>admin-content</div>
      </AuthGuard>,
    )

    expect(await screen.findByText("admin-content")).toBeInTheDocument()
    expect(mocks.navReplace).not.toHaveBeenCalled()
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it("redirects a tenant admin (is_platform_admin=false) to /dashboard with an Arabic toast and never renders the children", async () => {
    stubFetch({
      "GET /api/me": () =>
        jsonRes({
          success: true,
          data: {
            user: { id: 9, role: "admin", tenant_id: 77, is_platform_admin: false, onboardingCompleted: true },
          },
        }),
    })
    stubLocation()

    render(
      <AuthGuard requiredRole="admin" requirePlatformAdmin>
        <div>admin-content</div>
      </AuthGuard>,
    )

    await waitFor(() => {
      expect(mocks.navReplace).toHaveBeenCalledWith("/dashboard")
    })
    expect(mocks.toast).toHaveBeenCalledWith(
      "error",
      "لوحة الإدارة متاحة لمسؤول المنصة فقط",
      "تم إعادتك إلى لوحة التحكم — هذه المنطقة تتطلب صلاحيات مسؤول المنصة",
    )
    // the shell never mounted its (403-everything) children — UX gate, the
    // API 403s remain the security layer (documented in admin/layout.tsx)
    expect(screen.queryByText("admin-content")).toBeNull()
  })

  it("treats a missing is_platform_admin key as not-platform-admin (fail-closed guard, server stays the enforcer)", async () => {
    stubFetch({
      "GET /api/me": () =>
        jsonRes({
          success: true,
          data: {
            user: { id: 3, role: "admin", tenant_id: 5, onboardingCompleted: true },
          },
        }),
    })
    stubLocation()

    render(
      <AuthGuard requiredRole="admin" requirePlatformAdmin>
        <div>admin-content</div>
      </AuthGuard>,
    )

    await waitFor(() => {
      expect(mocks.navReplace).toHaveBeenCalledWith("/dashboard")
    })
    expect(screen.queryByText("admin-content")).toBeNull()
  })
})
