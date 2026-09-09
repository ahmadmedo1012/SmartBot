/**
 * v17-E-F1 — messages page contract pins (the 7-fix surgical round).
 *
 * Pinned behaviors (the testable half of the fixes):
 *   - thread load failure surfaces a REAL error card with retry
 *     (D1 §5.1: it used to render the "no messages" empty state)
 *   - opening a conversation fires the mark-read POST (E-B1 contract)
 *     and optimistically zeroes the unread badge in the cached list
 *     (D10-M3)
 *   - reply drafts are isolated per conversation — no draft leaking
 *     between customers, and a successful reply clears ONLY that
 *     thread's draft; a failed reply keeps it (D10-M2, financial hazard)
 *   - programmatic scrolling never uses behavior:"smooth" under
 *     prefers-reduced-motion (D2-P1: JS scrollIntoView bypasses the
 *     global CSS override)
 *
 * Mock bundle (house pattern from SettingsChangePassword/OnboardingWizard
 * tests): QueryClientProvider, premium-toast spy, URL-router fetch stub,
 * next/link + next/image anchors, matchMedia stub (jsdom implements none —
 * D8-verified recipe from KpiCard.test.tsx) and a scrollIntoView stub
 * (same jsdom gap).
 */
import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import MessagesPage from "@/app/dashboard/messages/page"
import type { Conversation, Message } from "@/lib/types"

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

/* The page imports next/link (needsSetup CTA) and next/image (attachments) —
 * neither renders in these scenarios, but the anchors keep the module graph
 * free of app-router context requirements in jsdom. */
vi.mock("next/link", () => ({
  default: function MockLink({ href, children }: { href: string; children: ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))
vi.mock("next/image", () => ({
  default: function MockImage({ alt, src }: { alt: string; src: string }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} />
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
  }
}

/** jsdom matchMedia stub — D8-verified recipe (KpiCard.test.tsx). */
function installMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList => ({
      matches,
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

const LIST_ROUTE = "GET /api/inbox/conversations?status=all&search="

function conv(id: string, name: string, unread = 0, count = 8): Conversation {
  return {
    id,
    subject: name,
    senders: [{ id, name }],
    message_count: count,
    unread_count: unread,
    updated_time: null,
  }
}

function threadOf(id: string): Message[] {
  return [
    { id: `${id}-m1`, message: "السلام عليكم", is_from_page: false, created_time: null },
    { id: `${id}-m2`, message: "أهلاً بك!", is_from_page: true, created_time: null },
  ]
}

function renderMessages() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MessagesPage />
    </QueryClientProvider>,
  )
}

/* jsdom implements no scrollIntoView either — the page's scroll contract
 * calls it on every thread load. Stashed so assertions can inspect calls. */
const originalScrollIntoView = Element.prototype.scrollIntoView
let scrollIntoView: ReturnType<typeof vi.fn>

beforeEach(() => {
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
  installMatchMedia(false) // motion allowed by default, like most visitors
  scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView =
    scrollIntoView as unknown as typeof Element.prototype.scrollIntoView
})

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("thread error branch (D1 §5.1)", () => {
  it("a failed thread fetch shows a retryable error card — NOT the 'no messages' empty state", async () => {
    const api = stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد")], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ detail: "تعذر الوصول إلى فيسبوك" }, 502),
    })
    renderMessages()

    fireEvent.click(await screen.findByRole("listitem"))

    // the backend's Arabic detail surfaces verbatim (support:449-455 mirror)
    expect(await screen.findByText("تعذر الوصول إلى فيسبوك")).toBeInTheDocument()
    // the regression pin: the error must NOT masquerade as an empty thread
    expect(screen.queryByText("لا توجد رسائل في هذه المحادثة")).toBeNull()

    // retry actually refetches the thread
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))
    await waitFor(() =>
      expect(api.callsFor("/api/inbox/conversations/c1").length).toBeGreaterThanOrEqual(2),
    )
    expect(screen.getByText("تعذر الوصول إلى فيسبوك")).toBeInTheDocument()
  })
})

describe("mark-read on open (D10-M3, E-B1 contract)", () => {
  it("opening an unread conversation POSTs /read once and zeroes the badge optimistically", async () => {
    const api = stubFetch({
      [LIST_ROUTE]: () =>
        jsonRes({
          success: true,
          data: { items: [conv("c1", "أحمد", 4, 12), conv("c2", "سارة", 0, 5)], total: 2 },
        }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: threadOf("c1") }),
      "GET /api/inbox/conversations/c2": () => jsonRes({ success: true, data: threadOf("c2") }),
      "POST /api/inbox/conversations/c1/read": () => jsonRes({ success: true, data: { unread: 0 } }),
    })
    renderMessages()

    await screen.findAllByRole("listitem")
    expect(screen.getByText("4")).toBeInTheDocument() // unread badge before open

    fireEvent.click(screen.getAllByRole("listitem")[0]) // أحمد
    await screen.findByText("السلام عليكم")

    // fire-and-forget POST fired exactly once for the opened thread
    expect(api.callsFor("/api/inbox/conversations/c1/read")).toHaveLength(1)
    // optimistic: the unread badge is gone without waiting for a refetch
    await waitFor(() => expect(screen.queryByText("4")).toBeNull())
    // and the read thread never fired for the still-unopened سارة
    expect(api.callsFor("/api/inbox/conversations/c2/read")).toHaveLength(0)
  })
})

describe("reply draft isolation (D10-M2 — financial hazard)", () => {
  it("drafts do not leak between conversations and are restored on return", async () => {
    stubFetch({
      [LIST_ROUTE]: () =>
        jsonRes({
          success: true,
          data: { items: [conv("c1", "أحمد", 4, 12), conv("c2", "سارة", 0, 5)], total: 2 },
        }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: threadOf("c1") }),
      "GET /api/inbox/conversations/c2": () => jsonRes({ success: true, data: threadOf("c2") }),
    })
    renderMessages()

    fireEvent.click((await screen.findAllByRole("listitem"))[0]) // أحمد
    await screen.findByText("السلام عليكم")
    const replyA = screen.getByLabelText("نص الرد") as HTMLTextAreaElement
    fireEvent.change(replyA, { target: { value: "رد مخصص للعميل أحمد" } })
    expect(replyA.value).toBe("رد مخصص للعميل أحمد")

    // switch to سارة — her reply box must NOT carry أحمد's draft
    fireEvent.click(screen.getAllByRole("listitem")[1])
    await waitFor(() => {
      expect((screen.getByLabelText("نص الرد") as HTMLTextAreaElement).value).toBe("")
    })

    // back to أحمد — the draft is restored, not lost
    fireEvent.click(screen.getAllByRole("listitem")[0])
    await waitFor(() => {
      expect((screen.getByLabelText("نص الرد") as HTMLTextAreaElement).value).toBe(
        "رد مخصص للعميل أحمد",
      )
    })
  })

  it("a successful reply clears only that thread's draft and posts the exact body", async () => {
    const api = stubFetch({
      [LIST_ROUTE]: () =>
        jsonRes({
          success: true,
          data: { items: [conv("c1", "أحمد", 4, 12), conv("c2", "سارة", 0, 5)], total: 2 },
        }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: threadOf("c1") }),
      "GET /api/inbox/conversations/c2": () => jsonRes({ success: true, data: threadOf("c2") }),
      "POST /api/inbox/conversations/c1/reply": () => jsonRes({ success: true, data: { message_id: "m3" } }),
    })
    renderMessages()

    fireEvent.click((await screen.findAllByRole("listitem"))[0])
    await screen.findByText("السلام عليكم")
    fireEvent.change(screen.getByLabelText("نص الرد"), { target: { value: "مرحباً بك" } })
    fireEvent.click(screen.getByRole("button", { name: "إرسال الرد" }))

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إرسال الرد")
    })
    const sent = api.callsFor("/api/inbox/conversations/c1/reply")
    expect(sent).toHaveLength(1)
    expect(sent[0].body).toBe(new URLSearchParams({ message: "مرحباً بك" }).toString())

    // the replied thread's draft is cleared…
    await waitFor(() => {
      expect((screen.getByLabelText("نص الرد") as HTMLTextAreaElement).value).toBe("")
    })
    // …and nothing was sent to the other thread
    expect(api.callsFor("/api/inbox/conversations/c2/reply")).toHaveLength(0)
  })

  it("a FAILED reply keeps the draft (cleared only on success)", async () => {
    stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد")], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: threadOf("c1") }),
      "POST /api/inbox/conversations/c1/reply": () => jsonRes({ detail: "تعذر الإرسال إلى فيسبوك" }, 502),
    })
    renderMessages()

    fireEvent.click(await screen.findByRole("listitem"))
    await screen.findByText("السلام عليكم")
    fireEvent.change(screen.getByLabelText("نص الرد"), { target: { value: "محاولة رد" } })
    fireEvent.click(screen.getByRole("button", { name: "إرسال الرد" }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    expect(mocks.toastError).toHaveBeenCalledWith("تعذر الإرسال إلى فيسبوك")
    // the draft survives the failure (v9-B5 semantics)
    expect((screen.getByLabelText("نص الرد") as HTMLTextAreaElement).value).toBe("محاولة رد")
  })
})

describe("programmatic scroll under reduced motion (D2-P1)", () => {
  it("scrollIntoView is never called with behavior:'smooth' when prefers-reduced-motion is set", async () => {
    installMatchMedia(true) // prefers-reduced-motion: reduce
    const api = stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد")], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: threadOf("c1") }),
      "POST /api/inbox/conversations/c1/read": () => jsonRes({ success: true, data: { unread: 0 } }),
      "POST /api/inbox/conversations/c1/reply": () => jsonRes({ success: true, data: { message_id: "m3" } }),
    })
    renderMessages()

    fireEvent.click(await screen.findByRole("listitem"))
    await screen.findByText("السلام عليكم")

    // (أ) first load of the thread lands instantly — "auto", never a crawl
    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" })),
    )

    // (ب) a successful reply requests a smooth jump — the JS guard clamps it
    fireEvent.change(screen.getByLabelText("نص الرد"), { target: { value: "تمام" } })
    fireEvent.click(screen.getByRole("button", { name: "إرسال الرد" }))
    await waitFor(() =>
      expect(api.callsFor("/api/inbox/conversations/c1/reply")).toHaveLength(1),
    )
    await waitFor(() => expect(scrollIntoView.mock.calls.length).toBeGreaterThanOrEqual(2))

    // the D2 regression pin: the JS-API smooth scroll leaked past the CSS
    // guard before this fix
    expect(scrollIntoView).not.toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }))
  })
})
