/**
 * v17-E-F8 — عقد صفحات الميزات المفقودة (FEATURES-UI).
 *
 * Pins (the testable half of the D6 §7 promises, UI side):
 *   - tools: «عرض جديد» form submits FORM-ENCODED POST /api/offers
 *     (offers_routes declares Form(...) only — JSON would 422 forever),
 *     the offer toggle renders through the Switch component
 *     (button[role=switch] + aria-checked), and «تعديل القالب»
 *     prefills the inline form then PUTs /api/templates/{id} JSON (E-B1).
 *   - team: «عضو جديد» submits POST /api/users form-encoded and surfaces
 *     the E-B2 Arabic 403 (max_team) through brandedToast.error — the
 *     cross-agent contract #3 of the v17 plan; delete is a two-step
 *     ARABIC confirm (حذف → تأكيد الحذف → DELETE).
 *   - billing: «ترقية خطتك» opens the payment-pattern dialog and submits
 *     the REAL /api/subscriptions/upgrade contract {plan_id, provider,
 *     amount, phone} (wallet path).
 *   - broadcast: «إلغاء» appears ONLY for cancellable statuses
 *     (draft/pending/sending) and POSTs /{id}/cancel; a sent broadcast
 *     shows neither cancel nor send (send is draft-only per the endpoint).
 *   - reports: «تنزيل تقرير PDF» POSTs /api/reports/generate {type, days}
 *     and triggers the blob download (URL.createObjectURL + anchor).
 *   - admin/support: the close button POSTs the platform route
 *     /api/admin/support/tickets/{id}/close.
 *
 * Mock bundle (house pattern from MessagesPage.test.tsx): QueryClientProvider,
 * premium-toast spy, next/link anchor, useConfig stub (billing wallet cap),
 * URL-router fetch stub.
 */
import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import ToolsPage from "@/app/dashboard/tools/page"
import TeamPage from "@/app/dashboard/team/page"
import BillingPage from "@/app/dashboard/billing/page"
import BroadcastPage from "@/app/dashboard/broadcast/page"
import ReportsPage from "@/app/dashboard/reports/page"
import AdminSupportPage from "@/app/admin/support/page"

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  config: {} as Record<string, string>,
}))

vi.mock("@/lib/premium-toast", () => ({
  brandedToast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

/* billing imports next/link (the subscribe CTA) — keep the module graph free
 * of app-router context requirements in jsdom. */
vi.mock("next/link", () => ({
  default: function MockLink({ href, children }: { href: string; children: ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

/* billing's wallet cap reads /api/config through the shared TTL cache —
 * stubbed like PaymentDialog.test.tsx (no cross-test cache pollution). */
vi.mock("@/hooks/useConfig", () => ({
  useConfig: (): { config: Record<string, string>; loaded: boolean; error: string | null } => ({
    config: mocks.config,
    loaded: true,
    error: null,
  }),
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
    bodiesFor(path: string) {
      return calls.filter((c) => c.url === path && c.body).map((c) => c.body as string)
    },
  }
}

function renderPage(Page: () => ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <Page />
    </QueryClientProvider>,
  )
}

/** jsdom matchMedia stub — house recipe (MessagesPage.test.tsx): admin pages
 * render SectionHeader whose reveal effect reads prefers-reduced-motion. */
function installMatchMedia() {
  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList => ({
      matches: true, // reduced-motion: reveal effects resolve immediately
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  )
}

beforeEach(() => {
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
  mocks.config = {}
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete (URL as unknown as Record<string, unknown>).createObjectURL
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL
})

// ══════════════════════════════════════════════════════════════════════════
// tools — D6-1 (offer form) + D6 #7 (template PUT) + D6 #10 (Switch)
// ══════════════════════════════════════════════════════════════════════════

describe("tools page — offers & templates (E-F8 D6-1/#7/#10)", () => {
  const TEMPLATES = [{ id: 1, name: "ترحيب", text: "أهلاً بك", category: "عام" }]
  const OFFERS = [{ id: 5, title: "عرض الصيف", description: "خصم 20%", is_active: true }]

  function stubTools(offerRes: () => Response = () => jsonRes({ success: true, data: { id: 9 } })) {
    return stubFetch({
      "GET /api/templates": () => jsonRes({ success: true, data: TEMPLATES }),
      "GET /api/offers": () => jsonRes({ success: true, data: OFFERS }),
      "POST /api/offers": offerRes,
      "PUT /api/templates/1": () => jsonRes({ success: true, data: { ok: true } }),
      "POST /api/offers/5/toggle": () => jsonRes({ success: true, data: { ok: true, is_active: false } }),
    })
  }

  it("«عرض جديد» submits FORM-ENCODED POST /api/offers and toasts on success", async () => {
    const fetchState = stubTools()
    renderPage(ToolsPage)

    fireEvent.click(await screen.findByRole("button", { name: "عرض جديد" }))
    fireEvent.change(await screen.findByLabelText("عنوان العرض"), { target: { value: "خصم نهاية الموسم" } })
    fireEvent.change(screen.getByLabelText("كود الخصم (اختياري)"), { target: { value: "END20" } })

    const save = screen.getByRole("button", { name: "حفظ العرض" })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إنشاء العرض"))
    const posts = fetchState.callsFor("/api/offers").filter((c) => c.method === "POST")
    expect(posts).toHaveLength(1)
    // عقد Form: جسم URLSearchParams — JSON كان سيرد 422 (Form(...) حصرًا)
    const body = String(posts[0].body)
    expect(body).toContain("discount_type=percentage")
    expect(body).toContain("discount_value=10")
    expect(body).toContain("code=END20")
    expect(body).toContain("title=")
  })

  it("the offer toggle renders through Switch (role=switch + aria-checked)", async () => {
    stubTools()
    renderPage(ToolsPage)

    const sw = await screen.findByRole("switch", { name: "تبديل حالة العرض عرض الصيف" })
    expect(sw).toHaveAttribute("aria-checked", "true")
  })

  it("«تعديل القالب» prefills the form and PUTs /api/templates/{id} as JSON", async () => {
    const fetchState = stubTools()
    renderPage(ToolsPage)

    fireEvent.click(await screen.findByRole("button", { name: "تعديل القالب ترحيب" }))

    const nameInput = await screen.findByLabelText("اسم القالب")
    expect(nameInput).toHaveValue("ترحيب")
    expect(screen.getByLabelText("نص القالب")).toHaveValue("أهلاً بك")

    fireEvent.change(nameInput, { target: { value: "ترحيب معدّل" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }))

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("تم حفظ تعديلات القالب"))
    const puts = fetchState.callsFor("/api/templates/1").filter((c) => c.method === "PUT")
    expect(puts).toHaveLength(1)
    expect(JSON.parse(String(puts[0].body))).toMatchObject({
      name: "ترحيب معدّل",
      text: "أهلاً بك",
      category: "عام",
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════
// team — D6-5 (add member + E-B2 Arabic 403 + two-step delete)
// ══════════════════════════════════════════════════════════════════════════

describe("team page — members management (E-F8 D6-5)", () => {
  const MEMBERS = [
    { id: 2, username: "sara", email: "sara@test.ly", role: "editor" },
    { id: 3, username: "shopowner", email: "", role: "owner" },
  ]

  it("«عضو جديد» posts form-encoded /api/users and surfaces the E-B2 Arabic 403 toast", async () => {
    const LIMIT_MSG = "حد أعضاء الفريق لخطتك هو 2 — رقّ خطتك لإضافة المزيد"
    const fetchState = stubFetch({
      "GET /api/team/members": () => jsonRes({ success: true, data: MEMBERS }),
      "POST /api/users": () => jsonRes({ detail: LIMIT_MSG }, 403),
    })
    renderPage(TeamPage)

    fireEvent.click(await screen.findByRole("button", { name: "عضو جديد" }))
    fireEvent.change(await screen.findByLabelText("اسم المستخدم للعضو الجديد"), { target: { value: "newmember" } })
    fireEvent.change(screen.getByLabelText("كلمة المرور للعضو الجديد"), { target: { value: "pass123456" } })

    const submit = screen.getByRole("button", { name: "إضافة العضو" })
    await waitFor(() => expect(submit).toBeEnabled())
    fireEvent.click(submit)

    // عقد الواجهة رقم 3 (E-B2 → E-F8): الـ403 العربي يظهر toast حرفيًا
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(LIMIT_MSG))
    const posts = fetchState.callsFor("/api/users").filter((c) => c.method === "POST")
    expect(posts).toHaveLength(1)
    const body = String(posts[0].body)
    expect(body).toContain("username=newmember")
    expect(body).toContain("role=viewer")
  })

  it("delete is a two-step ARABIC confirm before DELETE /api/users/{id}", async () => {
    const fetchState = stubFetch({
      "GET /api/team/members": () => jsonRes({ success: true, data: MEMBERS }),
      "DELETE /api/users/2": () => jsonRes({ success: true, data: { ok: true } }),
    })
    renderPage(TeamPage)

    fireEvent.click(await screen.findByRole("button", { name: "حذف العضو sara" }))
    // الخطوة الأولى لا تطلق DELETE — يظهر زر التأكيد العربي فقط
    expect(fetchState.callsFor("/api/users/2")).toHaveLength(0)

    fireEvent.click(screen.getByRole("button", { name: "تأكيد الحذف" }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("تم حذف العضو"))
    const deletes = fetchState.callsFor("/api/users/2").filter((c) => c.method === "DELETE")
    expect(deletes).toHaveLength(1)
  })

  it("the owner row has no role select / delete (PUT rejects role=owner)", async () => {
    stubFetch({
      "GET /api/team/members": () => jsonRes({ success: true, data: MEMBERS }),
    })
    renderPage(TeamPage)

    await screen.findByText("shopowner")
    expect(screen.queryByLabelText("دور العضو shopowner")).toBeNull()
    expect(screen.queryByRole("button", { name: "حذف العضو shopowner" })).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════
// billing — D6-2 (upgrade dialog → POST /api/subscriptions/upgrade)
// ══════════════════════════════════════════════════════════════════════════

describe("billing page — plan upgrade (E-F8 D6-2)", () => {
  const PLANS = [
    { id: 1, name: "Free", name_ar: "مجاني", price: 0, period_days: 365 },
    { id: 2, name: "Basic", name_ar: "أساسية", price: 29, period_days: 30 },
    { id: 3, name: "Pro", name_ar: "احترافية", price: 129, period_days: 30 },
  ]

  function stubBilling() {
    return stubFetch({
      "GET /api/payments/balance": () => jsonRes({ success: true, data: { balance: 5, currency: "د.ل" } }),
      "GET /api/payments/history": () => jsonRes({ success: true, data: [] }),
      "GET /api/me": () => jsonRes({ success: true, data: { user: { subscriptionStatus: "free" } } }),
      "GET /api/plans": () => jsonRes({ success: true, data: PLANS }),
      "POST /api/subscriptions/upgrade": () => jsonRes({ success: true, data: { payment_id: 77, status: "pending" } }),
    })
  }

  it("«ترقية خطتك» opens the dialog and submits the upgrade contract (wallet path)", async () => {
    const fetchState = stubBilling()
    renderPage(BillingPage)

    const btn = await screen.findByRole("button", { name: "ترقية خطتك" })
    fireEvent.click(btn)

    const dialog = await screen.findByRole("dialog")
    // العرض = الخطط الأعلى فقط (id > 1) — مجاني مستبعد
    expect(within(dialog).queryByText("مجاني")).toBeNull()
    fireEvent.click(within(dialog).getByRole("radio", { name: /أساسية/ }))

    fireEvent.change(within(dialog).getByLabelText("رقم هاتف المحفظة"), { target: { value: "0912345678" } })
    fireEvent.click(within(dialog).getByRole("button", { name: /إرسال طلب الترقية/ }))

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إرسال طلب الترقية", "سيتم تفعيل الخطة الجديدة بعد موافقة الإدارة"))
    const posts = fetchState.callsFor("/api/subscriptions/upgrade").filter((c) => c.method === "POST")
    expect(posts).toHaveLength(1)
    expect(JSON.parse(String(posts[0].body))).toMatchObject({
      plan_id: 2,
      provider: "liyana",
      amount: 29,
      phone: "0912345678",
    })
  })

  it("a tenant on the top plan sees an honest «أنت على أعلى خطة متاحة» state", async () => {
    stubFetch({
      "GET /api/payments/balance": () => jsonRes({ success: true, data: { balance: 5, currency: "د.ل" } }),
      "GET /api/payments/history": () => jsonRes({ success: true, data: [] }),
      "GET /api/me": () => jsonRes({ success: true, data: { user: { subscriptionStatus: "pro" } } }),
      "GET /api/plans": () => jsonRes({ success: true, data: PLANS }),
    })
    renderPage(BillingPage)

    expect(await screen.findByText("أنت على أعلى خطة متاحة")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "ترقية خطتك" })).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════
// broadcast — D6 #6 (cancel for cancellable statuses only)
// ══════════════════════════════════════════════════════════════════════════

describe("broadcast page — pending cancel (E-F8 D6-6)", () => {
  const ROWS = [
    { id: 1, name: "بث معلق", status: "pending", created_at: "2026-09-01T10:00:00Z" },
    { id: 2, name: "بث مُرسل", status: "sent", created_at: "2026-09-01T09:00:00Z" },
  ]

  it("«إلغاء» appears only for cancellable statuses and POSTs /{id}/cancel", async () => {
    const fetchState = stubFetch({
      "GET /api/broadcasts": () => jsonRes({ success: true, data: ROWS }),
      "POST /api/broadcasts/1/cancel": () => jsonRes({ success: true, data: { ok: true } }),
    })
    renderPage(BroadcastPage)

    const cancel = await screen.findByRole("button", { name: "إلغاء البث بث معلق" })
    fireEvent.click(cancel)

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إلغاء البث"))
    expect(fetchState.callsFor("/api/broadcasts/1/cancel").filter((c) => c.method === "POST")).toHaveLength(1)

    // المُرسل: لا زر إلغاء ولا زر إرسال (الإرسال للمسودة حصرًا — عقد send)
    expect(screen.queryByRole("button", { name: "إلغاء البث بث مُرسل" })).toBeNull()
    expect(screen.queryByRole("button", { name: "إرسال" })).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════
// reports — D6-4 (PDF download: POST /api/reports/generate blob)
// ══════════════════════════════════════════════════════════════════════════

describe("reports page — PDF download (E-F8 D6-4)", () => {
  it("«تنزيل تقرير PDF» POSTs {type, days} and triggers the blob download", async () => {
    const createObjectURL = vi.fn(() => "blob:report")
    const revokeObjectURL = vi.fn()
    ;(URL as unknown as Record<string, unknown>).createObjectURL = createObjectURL
    ;(URL as unknown as Record<string, unknown>).revokeObjectURL = revokeObjectURL

    const fetchState = stubFetch({
      "GET /api/analytics/dashboard?days=30": () =>
        jsonRes({ success: true, data: { total_messages: 10, total_replies: 5, total_conversations: 3, total_customers: 2, today_replies: 1, unique_commenters: 4, active_rules: 2, period_days: 30, change_pct: 5 } }),
      "GET /api/analytics/top-commenters?limit=10": () => jsonRes({ success: true, data: [] }),
      "GET /api/reports/status": () => jsonRes({ success: true, data: { available: true, engine: "weasyprint" } }),
      "POST /api/reports/generate": () =>
        new Response(new Blob(["%PDF-1.4 fake"], { type: "application/pdf" }), {
          headers: { "Content-Disposition": 'attachment; filename="report-monthly-20260910.pdf"' },
        }),
    })
    renderPage(ReportsPage)

    const btn = await screen.findByRole("button", { name: "تنزيل تقرير PDF" })
    await waitFor(() => expect(btn).toBeEnabled())
    fireEvent.click(btn)

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("تم تنزيل تقرير شهري", "افتح الملف من مجلد التنزيلات"))
    const posts = fetchState.callsFor("/api/reports/generate").filter((c) => c.method === "POST")
    expect(posts).toHaveLength(1)
    expect(JSON.parse(String(posts[0].body))).toEqual({ type: "monthly", days: 30 })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// admin/support — D6 #5 (close button) + D6 #9 (pagination chevrons)
// ══════════════════════════════════════════════════════════════════════════

describe("admin/support page — platform close (E-F8 D6-5/#9)", () => {
  const PAGE = { items: [{ id: 7, subject: "مشكلة", status: "open", priority: "high", tenant_name: "متجر أ", created_at: "2026-09-09T10:00:00Z", email: "a@test.ly" }], total: 1, page: 1 }

  it("the close button POSTs /api/admin/support/tickets/{id}/close", async () => {
    installMatchMedia()
    const fetchState = stubFetch({
      "GET /api/admin/support/tickets?status=all&page=1": () => jsonRes({ success: true, data: PAGE }),
      "POST /api/admin/support/tickets/7/close": () => jsonRes({ success: true, data: { id: 7, status: "closed" } }),
    })
    renderPage(AdminSupportPage)

    const close = await screen.findByRole("button", { name: "إغلاق التذكرة رقم 7" })
    fireEvent.click(close)

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إغلاق التذكرة #7"))
    expect(fetchState.callsFor("/api/admin/support/tickets/7/close").filter((c) => c.method === "POST")).toHaveLength(1)
  })

  it("pagination renders prev/next buttons (DirectionalIcon chevrons — no raw imports)", async () => {
    installMatchMedia()
    stubFetch({
      "GET /api/admin/support/tickets?status=all&page=1": () => jsonRes({ success: true, data: PAGE }),
    })
    renderPage(AdminSupportPage)

    await screen.findByRole("button", { name: "إغلاق التذكرة رقم 7" })
    expect(screen.getByRole("button", { name: "الصفحة السابقة" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "الصفحة التالية" })).toBeEnabled()
  })
})
