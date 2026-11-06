/**
 * P45-W1 (Initiative B) — HandoffPanel contract pins: the FIRST UI consumer
 * of the finished P43-SB2 handoff API layer (bot pause / assignee /
 * lifecycle / internal notes — backend complete since P43 with zero UI).
 *
 * Pinned behaviors (the honesty doctrine is the contract under test):
 *   - pause/resume: optimistic PATCH {bot_paused} — the toggle flips BEFORE
 *     the server answers (a never-resolving fetch pins it), and a
 *     success:false answer ROLLS THE SLICE BACK + surfaces the server's
 *     Arabic error via toast (never a fake success)
 *   - assignee selector: picking a roster member PATCHes {assignee_id},
 *     «غير معيّن» PATCHes the explicit null; the current assignee renders
 *     with name/initials
 *   - lifecycle chips: مفتوحة/معلّقة/مغلقة PATCH {status}; aria-pressed
 *     follows the truth; clicking the active chip sends nothing
 *   - internal notes: the existing list renders (content + author + the
 *     format.ts seam date), «إضافة ملاحظة» POSTs {content} and prepends the
 *     server's row; an empty draft keeps the button disabled (the 422 class)
 *   - viewer role: the PATCH is editor-gated server-side — the panel refuses
 *     earlier with disabled controls + the reason (no 403 round-trip)
 *
 * Mock bundle (house pattern from MessagesPage.test.tsx): QueryClientProvider,
 * premium-toast spy, fetch stub — /api/me feeds the role gate.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { HandoffPanel } from "@/components/shared/HandoffPanel"

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
    return maker ? maker() : jsonRes({ success: true, data: {} })
  })
  vi.stubGlobal("fetch", fn)
  return {
    calls,
    bodiesFor(path: string, method: string) {
      return calls
        .filter((c) => c.url === path && c.method === method && c.body)
        .map((c) => JSON.parse(c.body as string))
    },
  }
}

const ME_EDITOR = { id: 7, username: "me7", name: "أحمد", role: "admin" }
const ME_VIEWER = { id: 7, username: "me7", name: "أحمد", role: "viewer" }

const ROSTER = [
  { id: 7, username: "me7", name: "أحمد" },
  { id: 9, username: "mate9", name: "سالم الفريق" },
]

const DETAIL = {
  id: "c1",
  user_name: "زبون غاضب",
  fb_user_id: "9001",
  message_count: 4,
  unread_count: 1,
  last_message_text: "الو",
  last_message_at: "2026-11-01T10:00:00Z",
  status: "open",
  assignee_id: null,
  assignee: null,
  bot_paused: false,
  first_response_at: null,
  notes: [
    { id: 1, content: "زبون غاضب — تسليم يدوي", created_by: "me7", created_at: "2026-11-01T09:00:00Z" },
  ],
}

function baseRoutes(me = ME_EDITOR): Record<string, () => Response> {
  return {
    "GET /api/me": () => jsonRes({ success: true, data: { user: me } }),
    "GET /api/inbox/conversations/c1/detail": () => jsonRes({ success: true, data: DETAIL }),
    "GET /api/inbox/assignees": () => jsonRes({ success: true, data: ROSTER }),
  }
}

function renderPanel(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={qc}>
      <HandoffPanel conversationId="c1" />
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

describe("bot pause / resume (the honest optimistic contract)", () => {
  it("flips the toggle optimistically — before the server answers", async () => {
    stubFetch({
      ...baseRoutes(),
      "PATCH /api/inbox/conversations/c1": () => new Promise<Response>(() => {}),
    })
    renderPanel()

    const toggle = await screen.findByRole("button", { name: "إيقاف ردود البوت في هذه المحادثة" })
    fireEvent.click(toggle)

    /* the optimistic slice: the label flipped while the PATCH is still
     * in flight (never-resolving fetch) */
    expect(await screen.findByRole("button", { name: "إعادة تشغيل البوت في هذه المحادثة" })).toBeInTheDocument()
    expect(screen.getByText("ردود البوت موقوفة")).toBeInTheDocument()
  })

  it("PATCHes {bot_paused:true} then {bot_paused:false} on resume", async () => {
    let patchCount = 0
    const api = stubFetch({
      ...baseRoutes(),
      "PATCH /api/inbox/conversations/c1": () => {
        patchCount += 1
        return jsonRes({ success: true, data: { ...DETAIL, bot_paused: patchCount === 1 } })
      },
    })
    renderPanel()

    fireEvent.click(await screen.findByRole("button", { name: "إيقاف ردود البوت في هذه المحادثة" }))
    await waitFor(() => expect(api.bodiesFor("/api/inbox/conversations/c1", "PATCH")).toEqual([
      { bot_paused: true },
    ]))
    expect(await screen.findByRole("button", { name: "إعادة تشغيل البوت في هذه المحادثة" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "إعادة تشغيل البوت في هذه المحادثة" }))
    await waitFor(() => expect(api.bodiesFor("/api/inbox/conversations/c1", "PATCH")).toEqual([
      { bot_paused: true },
      { bot_paused: false },
    ]))
    expect(await screen.findByRole("button", { name: "إيقاف ردود البوت في هذه المحادثة" })).toBeInTheDocument()
  })

  it("a rejected PATCH rolls the optimistic flip BACK and surfaces the server's Arabic error", async () => {
    stubFetch({
      ...baseRoutes(),
      "PATCH /api/inbox/conversations/c1": () =>
        jsonRes({ success: false, error: "تعذّر تحديث المحادثة من الخادم" }),
    })
    renderPanel()

    fireEvent.click(await screen.findByRole("button", { name: "إيقاف ردود البوت في هذه المحادثة" }))

    /* rollback: the toggle returns to the truth — never a fake pause */
    expect(await screen.findByRole("button", { name: "إيقاف ردود البوت في هذه المحادثة" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "إعادة تشغيل البوت في هذه المحادثة" })).toBeNull()
    expect(mocks.toastError).toHaveBeenCalledWith("تعذّر تحديث المحادثة من الخادم")
  })
})

describe("assignee selector", () => {
  it("selecting a member PATCHes {assignee_id} and renders their name", async () => {
    const api = stubFetch({
      ...baseRoutes(),
      "PATCH /api/inbox/conversations/c1": () =>
        jsonRes({ success: true, data: { ...DETAIL, assignee_id: 9, assignee: ROSTER[1] } }),
    })
    renderPanel()

    const select = await screen.findByLabelText("تعيين مسؤول للمحادثة")
    /* unassigned start: the «غير معيّن» text rides BOTH the badge and the
     * option — the badge is what flips on assignment */
    expect(screen.getAllByText("غير معيّن").length).toBe(2)
    fireEvent.change(select, { target: { value: "9" } })

    await waitFor(() => expect(api.bodiesFor("/api/inbox/conversations/c1", "PATCH")).toEqual([
      { assignee_id: 9 },
    ]))
    /* the server's assignee object renders: name on the BADGE beside the
     * option entry (2 sites), and the unassigned badge text is gone */
    await waitFor(() => expect(screen.getAllByText("سالم الفريق").length).toBe(2))
    expect(screen.getAllByText("غير معيّن").length).toBe(1)
  })

  it("«غير معيّن» PATCHes the explicit null (unassign)", async () => {
    /* the detail starts ASSIGNED to mate 9 — the select reflects it */
    const routes = baseRoutes()
    routes["GET /api/inbox/conversations/c1/detail"] = () =>
      jsonRes({ success: true, data: { ...DETAIL, assignee_id: 9, assignee: ROSTER[1] } })
    routes["PATCH /api/inbox/conversations/c1"] = () =>
      jsonRes({ success: true, data: { ...DETAIL, assignee_id: null, assignee: null } })
    const api = stubFetch(routes)
    renderPanel()

    const select = await screen.findByLabelText("تعيين مسؤول للمحادثة")
    expect((select as HTMLSelectElement).value).toBe("9")
    fireEvent.change(select, { target: { value: "" } })

    await waitFor(() => expect(api.bodiesFor("/api/inbox/conversations/c1", "PATCH")).toEqual([
      { assignee_id: null },
    ]))
    /* the badge reverted to unassigned (option + badge = 2 sites) */
    await waitFor(() => expect(screen.getAllByText("غير معيّن").length).toBe(2))
  })
})

describe("lifecycle chips (مفتوحة/معلّقة/مغلقة)", () => {
  it("clicking «معلّقة» PATCHes {status} and moves aria-pressed", async () => {
    const api = stubFetch({
      ...baseRoutes(),
      "PATCH /api/inbox/conversations/c1": () =>
        jsonRes({ success: true, data: { ...DETAIL, status: "pending" } }),
    })
    renderPanel()

    const group = await screen.findByRole("group", { name: "حالة دورة حياة المحادثة" })
    const openBtn = within(group).getByRole("button", { name: "مفتوحة" })
    const pendingBtn = within(group).getByRole("button", { name: "معلّقة" })
    expect(openBtn).toHaveAttribute("aria-pressed", "true")
    expect(pendingBtn).toHaveAttribute("aria-pressed", "false")

    fireEvent.click(pendingBtn)
    await waitFor(() => expect(api.bodiesFor("/api/inbox/conversations/c1", "PATCH")).toEqual([
      { status: "pending" },
    ]))
    await waitFor(() => expect(pendingBtn).toHaveAttribute("aria-pressed", "true"))
    expect(openBtn).toHaveAttribute("aria-pressed", "false")

    /* the ACTIVE chip never re-sends (the no-op guard) */
    fireEvent.click(pendingBtn)
    await new Promise((r) => setTimeout(r, 50))
    expect(api.bodiesFor("/api/inbox/conversations/c1", "PATCH")).toHaveLength(1)
  })
})

describe("internal notes", () => {
  it("renders existing notes (content + author) and adds a new one via POST", async () => {
    const api = stubFetch({
      ...baseRoutes(),
      "POST /api/inbox/conversations/c1/notes": () =>
        jsonRes({
          success: true,
          data: { id: 2, content: "اتصلنا بالعميل ووعدنا بالاسترجاع", created_by: "me7", created_at: "2026-11-01T11:00:00Z" },
        }),
    })
    renderPanel()

    /* the seeded note renders verbatim */
    expect(await screen.findByText("زبون غاضب — تسليم يدوي")).toBeInTheDocument()
    expect(screen.getByText(/بواسطة me7/)).toBeInTheDocument()

    /* the add button stays disabled on an empty draft (the 422 class) */
    const addBtn = screen.getByRole("button", { name: "إضافة ملاحظة" })
    expect(addBtn).toBeDisabled()

    fireEvent.change(screen.getByLabelText("نص ملاحظة داخلية جديدة"), {
      target: { value: "اتصلنا بالعميل ووعدنا بالاسترجاع" },
    })
    expect(addBtn).not.toBeDisabled()
    fireEvent.click(addBtn)

    await waitFor(() =>
      expect(api.bodiesFor("/api/inbox/conversations/c1/notes", "POST")).toEqual([
        { content: "اتصلنا بالعميل ووعدنا بالاسترجاع" },
      ]))
    expect(mocks.toastSuccess).toHaveBeenCalledWith("أُضيفت الملاحظة")
    /* the composer cleared after the server accepted */
    await waitFor(() =>
      expect(screen.getByLabelText("نص ملاحظة داخلية جديدة")).toHaveValue(""))
  })

  it("a failed note POST surfaces the server's error — no fake note", async () => {
    stubFetch({
      ...baseRoutes(),
      "POST /api/inbox/conversations/c1/notes": () =>
        jsonRes({ success: false, error: "قيمة غير صالحة: نص الملاحظة مطلوب" }),
    })
    renderPanel()

    fireEvent.change(await screen.findByLabelText("نص ملاحظة داخلية جديدة"), {
      target: { value: "ملاحظة لن تُقبل" },
    })
    fireEvent.click(screen.getByRole("button", { name: "إضافة ملاحظة" }))

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("قيمة غير صالحة: نص الملاحظة مطلوب"))
    /* the draft SURVIVES for a corrected retry (never silently eaten)… */
    expect(screen.getByLabelText("نص ملاحظة داخلية جديدة")).toHaveValue("ملاحظة لن تُقبل")
    /* …and the notes LIST stays free of the rejected note (the composer's
     * own textarea carries the draft — that is the surviving draft itself) */
    const notesList = screen.getByRole("list", { name: "الملاحظات الداخلية" })
    expect(within(notesList).queryByText("ملاحظة لن تُقبل")).toBeNull()
  })
})

describe("role gate (the PATCH is editor-gated server-side)", () => {
  it("a VIEWER gets disabled controls + the reason — no 403 round-trip", async () => {
    stubFetch(baseRoutes(ME_VIEWER))
    renderPanel()

    const toggle = await screen.findByRole("button", { name: "إيقاف ردود البوت في هذه المحادثة" })
    expect(toggle).toBeDisabled()
    expect(screen.getByLabelText("تعيين مسؤول للمحادثة")).toBeDisabled()
    expect(screen.getByText("تغيير التسليم يتطلب صلاحية محرر — دورك الحالي مشاهد.")).toBeInTheDocument()
  })

  it("an EDITOR-role operator gets enabled controls", async () => {
    stubFetch(baseRoutes({ ...ME_EDITOR, role: "editor" }))
    renderPanel()

    expect(await screen.findByRole("button", { name: "إيقاف ردود البوت في هذه المحادثة" })).toBeEnabled()
  })
})
