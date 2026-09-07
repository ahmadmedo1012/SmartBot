/**
 * v15-E5 (D4-H2 + D4-H4) — admin/telegram settings + diagnostics honesty.
 *
 * D4-H2 (masked token never sent): GET /api/telegram/config answers only
 * `botTokenMasked` (never the token) — the page used to seed the FIELD with
 * «••••••••» and post it back on every save (400 «telegram_bot_token غير
 * صالح»), so no chatId/isActive change was possible without re-pasting the
 * secret. Pins: the field starts EMPTY with the «الرمز محفوظ…» placeholder;
 * an untouched save OMITS botToken from the payload entirely (backend:
 * absent = keep stored token); a typed token rides along.
 *
 * D4-H4 (diagnostics FE/BE field match + honest dry-run): the frontend used
 * `linkedAdmins` (never in the response → «0» forever) and claimed
 * «البوت يعمل بشكل صحيح» on configExists alone — even when dryRunResult
 * said fail. Pins: adminCount renders; dryRunResult "ok" → success card;
 * "fail: …" → honest failure card; absent → explicit «لم يُجرَ اختبار…».
 *
 * Mock bundle: QueryClientProvider, premium-toast spy, URL-router fetch
 * stub serving the REAL backend response shapes.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AdminTelegramPage from "@/app/admin/telegram/page"

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

/** The REAL GET /api/telegram/config shape (telegram_config.py:38-50). */
function configResponse(masked: boolean): Response {
  return jsonRes({
    success: true,
    data: {
      chatId: "-1001234567890",
      botTokenConfigured: masked,
      botTokenSource: masked ? "db" : "",
      events: ["new_order", "payment", "settings_change"],
      isActive: masked,
      botTokenMasked: masked,
    },
  })
}

/** The REAL GET /api/telegram/diagnose?dryRun=true shape. */
function diagnoseResponse(dryRunResult: string | undefined): Response {
  return jsonRes({
    success: true,
    data: {
      configExists: true,
      isActive: true,
      source: "db-or-env",
      adminCount: 3,
      botTokenPreview: "123456789:AA...",
      ...(dryRunResult !== undefined ? { dryRunResult } : {}),
    },
  })
}

function baseRoutes(overrides: Record<string, () => Response> = {}) {
  return {
    "GET /api/me": () =>
      jsonRes({
        success: true,
        data: { user: { id: 1, role: "admin", tenant_id: 0 } },
      }),
    "GET /api/telegram/config": () => configResponse(true),
    "GET /api/telegram/broadcast-targets": () => jsonRes({ success: true, data: [] }),
    "GET /api/telegram/diagnose?dryRun=true": () => diagnoseResponse("ok"),
    "GET /api/admin/telegram/approvers": () => jsonRes({ success: true, data: [] }),
    ...overrides,
  }
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

function renderTelegram(routes: Record<string, () => Response>) {
  const calls = stubFetch(routes)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <AdminTelegramPage />
    </QueryClientProvider>,
  )
  return calls
}

beforeEach(() => {
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("D4-H2 — the masked token is never seeded, never sent", () => {
  it("seeds the token field EMPTY (with the saved-token placeholder) when botTokenMasked=true", async () => {
    renderTelegram(baseRoutes())

    await screen.findByRole("heading", { level: 2, name: "إعدادات تليجرام" })
    const tokenInput = screen.getByLabelText("رمز البوت (Bot Token)") as HTMLInputElement
    await waitFor(() => expect(tokenInput.value).toBe(""))
    expect(screen.queryByDisplayValue("••••••••")).toBeNull()
    expect(tokenInput).toHaveAttribute(
      "placeholder",
      "الرمز محفوظ — أدخل رمزاً جديداً لاستبداله",
    )
    // the Arabic helper line for the masked state
    expect(
      screen.getByText(/الرمز الحالي محفوظ ولا يُرسل مع الحفظ ما لم تدخل رمزاً جديداً/),
    ).toBeInTheDocument()
    // the test button stays USABLE with an untouched (saved) token
    expect(screen.getByRole("button", { name: /اختبار الإرسال/ })).toBeEnabled()
  })

  it("saving with an UNTOUCHED token OMITS botToken from the POST body (chatId-only save works)", async () => {
    const calls = renderTelegram(baseRoutes())

    await screen.findByRole("heading", { level: 2, name: "إعدادات تليجرام" })
    const chatId = await screen.findByLabelText("معرف المحادثة (Chat ID)")
    await waitFor(() => expect((chatId as HTMLInputElement).value).toBe("-1001234567890"))

    // change chatId only — the token field stays untouched (empty)
    fireEvent.change(chatId, { target: { value: "-1009876543210" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ الإعدادات" }))

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("تم حفظ إعدادات تليجرام")
    })
    const save = calls.find((c) => c.url === "/api/telegram/config" && c.method === "POST")
    expect(save).toBeDefined()
    const payload = JSON.parse(String(save?.body)) as Record<string, unknown>
    // THE D4-H2 pin: no botToken key at all — the mask/empty value never rides
    expect("botToken" in payload).toBe(false)
    expect("telegram_bot_token" in payload).toBe(false)
    expect(payload.chatId).toBe("-1009876543210")
  })

  it("a genuinely-typed NEW token rides the payload (replace flow)", async () => {
    const calls = renderTelegram(baseRoutes())

    await screen.findByRole("heading", { level: 2, name: "إعدادات تليجرام" })
    const tokenInput = await screen.findByLabelText("رمز البوت (Bot Token)")
    await waitFor(() => expect((tokenInput as HTMLInputElement).value).toBe(""))
    fireEvent.change(tokenInput, {
      target: { value: "123456789:AAHfAk-NEW-tOKEN-abcdefghijklmnopqrstuvwxyz" },
    })

    fireEvent.click(screen.getByRole("button", { name: "حفظ الإعدادات" }))

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("تم حفظ إعدادات تليجرام")
    })
    const save = calls.find((c) => c.url === "/api/telegram/config" && c.method === "POST")
    const payload = JSON.parse(String(save?.body)) as Record<string, unknown>
    expect(payload.botToken).toBe("123456789:AAHfAk-NEW-tOKEN-abcdefghijklmnopqrstuvwxyz")
  })

  it("an invalid typed token surfaces the backend's Arabic detail (no silent failure)", async () => {
    renderTelegram(
      baseRoutes({
        "POST /api/telegram/config": () =>
          jsonRes({ detail: "telegram_bot_token غير صالح — الصيغة: 123456789:AA... من BotFather" }, 400),
      }),
    )

    await screen.findByRole("heading", { level: 2, name: "إعدادات تليجرام" })
    const tokenInput = await screen.findByLabelText("رمز البوت (Bot Token)")
    await waitFor(() => expect((tokenInput as HTMLInputElement).value).toBe(""))
    fireEvent.change(tokenInput, { target: { value: "not-a-token" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ الإعدادات" }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "telegram_bot_token غير صالح — الصيغة: 123456789:AA... من BotFather",
      )
    })
  })
})

describe("D4-H4 — diagnostics use the REAL backend keys + honest dry-run verdict", () => {
  it("renders adminCount (the backend's real key — linkedAdmins read 0 forever)", async () => {
    renderTelegram(baseRoutes())

    await screen.findByRole("heading", { level: 2, name: "إعدادات تليجرام" })
    expect(await screen.findByTestId("diagnose-admin-count")).toHaveTextContent("3")
    // the broadcast-targets card shows the same count via the page's mapping
    expect(screen.getByText("عدد المشرفين المرتبطين: 3")).toBeInTheDocument()
  })

  it("dryRunResult 'ok' → the success card (a REAL test send happened)", async () => {
    renderTelegram(baseRoutes())

    await screen.findByRole("heading", { level: 2, name: "إعدادات تليجرام" })
    expect(
      await screen.findByText("تم إرسال رسالة تجريبية بنجاح — البوت يعمل بشكل صحيح"),
    ).toBeInTheDocument()
  })

  it("dryRunResult 'fail: …' → an HONEST failure card, never «يعمل بشكل صحيح»", async () => {
    renderTelegram(
      baseRoutes({
        "GET /api/telegram/diagnose?dryRun=true": () =>
          diagnoseResponse("fail: {\"ok\":false,\"error_code\":400,\"description\":\"Bad Request: chat not found\"}"),
      }),
    )

    await screen.findByRole("heading", { level: 2, name: "إعدادات تليجرام" })
    expect(
      await screen.findByText("فشل إرسال رسالة التجربة — البوت لا يعمل بشكل صحيح"),
    ).toBeInTheDocument()
    // the old dishonest success claim must be gone even though configExists=true
    // (anchor on the success-specific prefix — the FAILURE message legitimately
    // ends with the same «يعمل بشكل صحيح» suffix)
    expect(screen.queryByText(/^تم إرسال رسالة تجريبية بنجاح/)).toBeNull()
    // the raw reason is visible (dir=ltr) for the operator
    expect(screen.getByText(/chat not found/)).toBeInTheDocument()
  })

  it("no dryRunResult → explicit «not tested» row (never a silent success)", async () => {
    renderTelegram(
      baseRoutes({
        "GET /api/telegram/diagnose?dryRun=true": () => diagnoseResponse(undefined),
      }),
    )

    await screen.findByRole("heading", { level: 2, name: "إعدادات تليجرام" })
    expect(
      await screen.findByText(/لم يُجرَ اختبار إرسال بعد — اضغط «تشخيص»/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/يعمل بشكل صحيح/)).toBeNull()
  })

  it("the manual «تشخيص» button requests dryRun=true (the only path that produces a verdict)", async () => {
    const calls = renderTelegram(baseRoutes())

    await screen.findByRole("heading", { level: 2, name: "إعدادات تليجرام" })
    fireEvent.click(screen.getByRole("button", { name: /تشخيص/ }))

    await waitFor(() => {
      const manual = calls.filter(
        (c) => c.method === "GET" && c.url === "/api/telegram/diagnose?dryRun=true",
      )
      expect(manual.length).toBeGreaterThanOrEqual(2) // initial load + the manual click
    })
  })
})
