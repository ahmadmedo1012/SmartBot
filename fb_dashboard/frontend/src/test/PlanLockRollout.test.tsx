/**
 * W2-BOT-5 (P42-W3) — عقد انتشار قفل الخطة: المجدول والبث الجماعي.
 *
 * الفجوة المسجلة: بوابتا has_scheduling (POST /api/scheduled-posts —
 * GATE_MESSAGES.has_scheduling) وhas_broadcast (POST /api/broadcasts +
 * /{id}/send — BROADCAST_PLAN_REQUIRED_MSG) كانتا تظهران كتوست عابر فقط،
 * بينما analytics/flows لهما الحالة الصادقة (PremiumLockBody). هذه
 * الدفعة توحّد الرحلة:
 *   - 403 عائلة البوابات (تنتهي بـ«رقِّ خطتك» — عقد _plan_gates.py؛
 *     رسالة البث انضمت للحرف العائلي) → PremiumLockCard بنص الخادم
 *     الحرفي + دعوة /subscribe — لا توست.
 *   - المؤلّف/النموذج وزر الإنشاء يختفيان عند القفل (لا زر ميت يعيد
 *     الضرب في البوابة)، وقائمة المحتوى القائم تبقى — عقيدة بوابة
 *     الإنشاء فقط (P21-W3-B): التخفيض لا يقتل المحتوى الموجود.
 *   - الإرسال (مسار التخفيض: مسودة سبقت ثم نزلت الباقة) → نفس القفل
 *     + إغلاق حوار التأكيد.
 *   - أي خطأ آخر (400/شبكة/صلاحيات) يبقى توستًا بالتفصيل العربي —
 *     تمييز P21-W5-C1 لا يُخلط.
 *
 * Mock bundle (نمط FlowsPage.test.tsx): QueryClientProvider،
 * premium-toast spy، next/navigation (useRouter لزر الترقية)، fetch stub.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import ScheduledPage from "@/app/dashboard/scheduled/page"
import BroadcastPage from "@/app/dashboard/broadcast/page"

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
  }
}

function renderPage(Page: React.ComponentType) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <Page />
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

/* ── GATE_MESSAGES.has_scheduling — النص الحرفي من _plan_gates.py ── */
const SCHEDULING_GATE_MSG = "جدولة المنشورات متاحة في خطة مميز أو أعلى — رقِّ خطتك"
/* ── BROADCAST_PLAN_REQUIRED_MSG — النص الحرفي من broadcast_engine.py
 *    بعد انضمامه لعائلة GATE_MESSAGES (W2-BOT-5) ── */
const BROADCAST_GATE_MSG = "ميزة البث الجماعي متاحة في خطة مميز أو أعلى — رقِّ خطتك"

describe("المجدول — W2-BOT-5: بوابة has_scheduling → القفل الصادق", () => {
  const EXISTING_POST = {
    id: 3,
    message: "منشور سبق جدولته",
    scheduled_at: "2026-11-05T10:00:00Z",
    status: "scheduled",
  }

  it("إنشاء يصطدم بالبوابة → بطاقة القفل بنص الخادم، والمؤلّف يختفي، والقائمة تبقى، ولا توست", async () => {
    const api = stubFetch({
      "GET /api/scheduled-posts?status=scheduled": () =>
        jsonRes({ success: true, data: [EXISTING_POST] }),
      "POST /api/scheduled-posts": () => jsonRes({ detail: SCHEDULING_GATE_MSG }, 403),
    })
    renderPage(ScheduledPage)

    fireEvent.change(await screen.findByLabelText("نص المنشور"), {
      target: { value: "منشور ممنوع على الباقة" },
    })
    fireEvent.change(screen.getByLabelText("وقت النشر"), {
      target: { value: "2026-11-10T10:00" },
    })
    fireEvent.click(screen.getByRole("button", { name: "جدولة" }))

    await waitFor(() => expect(api.callsFor("POST /api/scheduled-posts")).toHaveLength(1), { timeout: 5000 })

    /* القفل هو السطح — عنوان الميزة + نص الخادم الحرفي + CTA */
    expect(await screen.findByText("جدولة المنشورات — متاحة في Premium")).toBeInTheDocument()
    expect(screen.getByText(SCHEDULING_GATE_MSG)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "ترقية الخطة" })).toBeInTheDocument()
    /* لا توست لعائلة البوابات */
    expect(mocks.toastError).not.toHaveBeenCalled()
    /* المؤلّف اختفى — لا نموذج محكوم بالـ403 */
    expect(screen.queryByLabelText("نص المنشور")).not.toBeInTheDocument()
    /* عقيدة بوابة الإنشاء فقط: المحتوى القائم يبقى ظاهرًا */
    expect(screen.getByText("منشور سبق جدولته")).toBeInTheDocument()
  })

  it("زر الترقية يقود إلى /subscribe (router.push — لا إعادة تحميل)", async () => {
    stubFetch({
      "GET /api/scheduled-posts?status=scheduled": () => jsonRes({ success: true, data: [] }),
      "POST /api/scheduled-posts": () => jsonRes({ detail: SCHEDULING_GATE_MSG }, 403),
    })
    renderPage(ScheduledPage)

    fireEvent.change(await screen.findByLabelText("نص المنشور"), {
      target: { value: "منشور ممنوع" },
    })
    fireEvent.change(screen.getByLabelText("وقت النشر"), {
      target: { value: "2026-11-10T10:00" },
    })
    fireEvent.click(screen.getByRole("button", { name: "جدولة" }))

    fireEvent.click(await screen.findByRole("button", { name: "ترقية الخطة" }))
    expect(mocks.navPush).toHaveBeenCalledWith("/subscribe")
  })

  it("خطأ غير البوابة (400 تاريخ ماضٍ) → توست بالتفصيل العربي، لا قفل", async () => {
    const api = stubFetch({
      "GET /api/scheduled-posts?status=scheduled": () => jsonRes({ success: true, data: [] }),
      "POST /api/scheduled-posts": () =>
        jsonRes({ detail: "لا يمكن جدولة منشور في الماضي — اختر وقتاً مستقبلياً" }, 400),
    })
    renderPage(ScheduledPage)

    fireEvent.change(await screen.findByLabelText("نص المنشور"), {
      target: { value: "منشور ماضٍ" },
    })
    fireEvent.change(screen.getByLabelText("وقت النشر"), {
      target: { value: "2026-11-10T10:00" },
    })
    fireEvent.click(screen.getByRole("button", { name: "جدولة" }))

    await waitFor(() => expect(api.callsFor("POST /api/scheduled-posts")).toHaveLength(1), { timeout: 5000 })
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("لا يمكن جدولة منشور في الماضي — اختر وقتاً مستقبلياً"),
    )
    /* تمييز W5-C1: هذا ليس بوابة خطة — لا بطاقة قفل */
    expect(screen.queryByText("جدولة المنشورات — متاحة في Premium")).not.toBeInTheDocument()
    /* المؤلّف يبقى (الخطأ قابل للإصلاح من المستخدم) */
    expect(screen.getByLabelText("نص المنشور")).toBeInTheDocument()
  })
})

describe("البث الجماعي — W2-BOT-5: بوابة has_broadcast → القفل الصادق", () => {
  it("إنشاء يصطدم بالبوابة → بطاقة القفل، النموذج يُغلق، وزر «بث جديد» يختفي، ولا توست", async () => {
    const api = stubFetch({
      "GET /api/broadcasts": () => jsonRes({ success: true, data: [] }),
      "POST /api/broadcasts": () => jsonRes({ detail: BROADCAST_GATE_MSG }, 403),
    })
    renderPage(BroadcastPage)

    fireEvent.click(await screen.findByRole("button", { name: "بث جديد" }))
    fireEvent.change(await screen.findByLabelText("اسم البث"), {
      target: { value: "بث ممنوع" },
    })
    fireEvent.change(screen.getByLabelText("نص الرسالة"), {
      target: { value: "رسالة جماعية للاختبار" },
    })
    fireEvent.click(screen.getByRole("button", { name: "إنشاء البث" }))

    await waitFor(() => expect(api.callsFor("POST /api/broadcasts")).toHaveLength(1), { timeout: 5000 })

    /* القفل هو السطح — نص الخادم الحرفي بعد انضمامه للعائلة */
    expect(await screen.findByText("البث الجماعي — متاحة في Premium")).toBeInTheDocument()
    expect(screen.getByText(BROADCAST_GATE_MSG)).toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
    /* النموذج أُغلق وزر الإنشاء اختفى — لا زر ميت يعيد الضرب في البوابة */
    expect(screen.queryByLabelText("اسم البث")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "بث جديد" })).not.toBeInTheDocument()
  })

  it("إرسال مسودة (مسار التخفيض) يصطدم بالبوابة → القفل + حوار التأكيد يُغلق", async () => {
    const DRAFT = { id: 5, name: "مسودة قديمة", status: "draft", created_at: "2026-10-01T09:00:00Z" }
    const api = stubFetch({
      "GET /api/broadcasts": () => jsonRes({ success: true, data: [DRAFT] }),
      "GET /api/broadcasts/5": () =>
        jsonRes({
          success: true,
          data: { id: 5, name: "مسودة قديمة", message_template: "نص البث", segment_filters: {} },
        }),
      "POST /api/broadcasts/estimate": () => jsonRes({ success: true, data: { count: 12 } }),
      "POST /api/broadcasts/5/send": () => jsonRes({ detail: BROADCAST_GATE_MSG }, 403),
    })
    renderPage(BroadcastPage)

    /* فتح حوار التأكيد — لا إرسال بلمسة واحدة (عقد v24-C2) */
    fireEvent.click(await screen.findByRole("button", { name: "إرسال" }))
    expect(api.callsFor("POST /api/broadcasts/5/send")).toHaveLength(0)
    expect(await screen.findByText("تأكيد الإرسال الجماعي")).toBeInTheDocument()

    /* التأكيد التدميري هو ما يضرب البوابة — لكن أولاً ننتظر زر التأكيد
     * يتفعّل: حوار v24-C2 يفتح فورًا بينما سلسلة التقدير (GET تفاصيل +
     * POST estimate) لم تكتمل بعد — الزر disabled حتى اكتمالها (لا
     * إرسال جماعي غير مُخبَر). */
    const confirmBtn = screen.getByRole("button", { name: "تأكيد الإرسال" })
    await waitFor(() => expect(confirmBtn).toBeEnabled())
    fireEvent.click(confirmBtn)
    await waitFor(() => expect(api.callsFor("POST /api/broadcasts/5/send")).toHaveLength(1), { timeout: 5000 })

    /* نفس القفل الصادق + الحوار أُغلق */
    expect(await screen.findByText("البث الجماعي — متاحة في Premium")).toBeInTheDocument()
    expect(screen.getByText(BROADCAST_GATE_MSG)).toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(screen.queryByText("تأكيد الإرسال الجماعي")).not.toBeInTheDocument()
    /* المحتوى القائم يبقى (عقيدة بوابة الإنشاء) */
    expect(screen.getByText("مسودة قديمة")).toBeInTheDocument()
  })

  it("خطأ غير البوابة (422 جسم غير صالح) → توست بالتفصيل، لا قفل", async () => {
    const api = stubFetch({
      "GET /api/broadcasts": () => jsonRes({ success: true, data: [] }),
      "POST /api/broadcasts": () => jsonRes({ detail: "قيمة غير صالحة: جسم الطلب ليس JSON صالحاً" }, 422),
    })
    renderPage(BroadcastPage)

    fireEvent.click(await screen.findByRole("button", { name: "بث جديد" }))
    fireEvent.change(await screen.findByLabelText("اسم البث"), {
      target: { value: "بث مكسور" },
    })
    fireEvent.change(screen.getByLabelText("نص الرسالة"), {
      target: { value: "رسالة جماعية للاختبار" },
    })
    fireEvent.click(screen.getByRole("button", { name: "إنشاء البث" }))

    await waitFor(() => expect(api.callsFor("POST /api/broadcasts")).toHaveLength(1), { timeout: 5000 })
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("قيمة غير صالحة: جسم الطلب ليس JSON صالحاً"),
    )
    expect(screen.queryByText("البث الجماعي — متاحة في Premium")).not.toBeInTheDocument()
    /* زر الإنشاء باقٍ — الخطأ قابل للإصلاح */
    expect(screen.getByRole("button", { name: "بث جديد" })).toBeInTheDocument()
  })
})
