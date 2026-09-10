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
 * v23 — instant inbox pins (the messages page "instant" round):
 *   - optimistic send: the reply bubble is stamped into the thread cache
 *     BEFORE the POST resolves (onMutate) — a never-resolving fetch mock
 *     pins that the text is on screen while the request is still in flight
 *   - failed send rollback: the optimistic bubble is pulled back out
 *     (snapshot restore) and the draft survives for a corrected retry
 *   - instant cache: returning to a recently-opened thread serves it from
 *     cache with ZERO refetch (staleTime 20s + gcTime 300s) — pinned via
 *     the GET call count staying at 1 across a switch away and back
 *
 * v24-C2 — mobile flows pins (thread↔URL, windowing, drafts, a11y):
 *   - opening a thread pushes ?c=<id> into the URL; browser back pops it
 *     and returns to the list; mounting with ?c= opens the thread (refresh
 *     keeps the place); the in-thread back row lands on the list too
 *   - body[data-chat-focus] marks the open thread (bottom-nav hide hook)
 *     and is removed again when it closes
 *   - the thread scroller is a role="log" aria-live=polite region (B4-P1)
 *   - only the newest 60 bubbles render; «تحميل الرسائل الأقدم» prepends
 *     the hidden batch (A3-M1 windowing)
 *   - per-conversation drafts persist to localStorage (draft:<id>),
 *     restore across a full remount, and are removed on successful send
 *     (v24-R1 task 5 re-verified: failed sends keep the draft — the pins
 *     above and in "reply draft isolation" are the contract)
 *   - the conversation control is a real button inside an <li> (role
 *     "listitem" no longer suppresses button semantics — B4)
 *
 * v24-R1 — thread hardening pins (mobile chat UX round 2):
 *   - scroll-to-bottom FAB: hidden at the bottom, appears only >300px up
 *     (mock scrollTop/scrollHeight/clientHeight — jsdom lays out nothing),
 *     clicking it smooth-scrolls to the newest message, and it anchors to
 *     the scroller's wrapper (the scroll viewport, never the content — an
 *     absolute child of the scroller itself would scroll away)
 *   - new-messages pill: a poll that grows the thread while the user reads
 *     history surfaces «رسائل جديدة (N)» in a persistent polite live
 *     region WITHOUT yanking the scroll position (scrollIntoView call
 *     count frozen); returning to the tail resets N; growth near the
 *     bottom still auto-follows (no pill); clicking the pill jumps + resets
 *   - thread identity header: the mobile back row carries the subscriber
 *     name (+ count, + decorative initials) — from the loaded conversation
 *     row, with the first customer message's sender as deep-link fallback
 *   - offline banner: the `offline` event mounts a role="status" strip,
 *     `online` dismisses it
 *
 * Mock bundle (house pattern from SettingsChangePassword/OnboardingWizard
 * tests): QueryClientProvider, premium-toast spy, URL-router fetch stub,
 * next/link + next/image anchors, matchMedia stub (jsdom implements none —
 * D8-verified recipe from KpiCard.test.tsx) and a scrollIntoView stub
 * (same jsdom gap).
 */
import type { ReactNode } from "react"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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

/* v24-C2 (task 1): the page now reads the open thread from useSearchParams.
 * The mock reflects jsdom's REAL URL — the component pushes ?c= entries via
 * window.history.pushState (jsdom updates location), and the popstate
 * listener re-reads location on traversal, so the whole URL↔thread contract
 * is exercisable without Next's router. */
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

/** Build a real Response with a JSON body (house helper). */
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/* v23: makers may also return a PROMISE that the test resolves later —
 * that's how the optimistic-send tests pin "the UI moved before the
 * network answered". The async stub below flattens it back to a
 * Promise<Response>, so fetch's signature still holds. */
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

function renderMessages(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <MessagesPage />
      </QueryClientProvider>,
    ),
  }
}

/* v24-R1: jsdom performs no layout — scrollHeight/clientHeight/scrollTop
 * are all 0. Redefine them on the scroller instance so the page's distance
 * math (FAB threshold, near-bottom window) is drivable from the test. */
function mockScrollMetrics(el: HTMLElement, distance: number, total = 2000, view = 500) {
  const top = total - view - distance
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => total })
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => view })
  Object.defineProperty(el, "scrollTop", { configurable: true, get: () => top, set: () => {} })
}

/** v24-R1: the scroll listener throttles via requestAnimationFrame — run
 * the frame synchronously so fireEvent.scroll's state update lands before
 * the assertion (jsdom's own rAF is async). */
function installSyncRaf() {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
}

/* v24-C2 (task 10): list semantics moved to the <li> wrappers — the
 * conversation control itself is the plain button INSIDE the listitem. */
function clickConversation(item: HTMLElement) {
  fireEvent.click(within(item).getByRole("button"))
}

async function openConversationAt(index: number) {
  const items = await screen.findAllByRole("listitem")
  clickConversation(items[index])
  return items[index]
}

/* jsdom implements no scrollIntoView either — the page's scroll contract
 * calls it on every thread load. Stashed so assertions can inspect calls. */
const originalScrollIntoView = Element.prototype.scrollIntoView
let scrollIntoView: ReturnType<typeof vi.fn>

beforeEach(() => {
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
  installMatchMedia(false) // motion allowed by default, like most visitors
  /* v24-C2: reset the URL (tests below push ?c= entries — jsdom's history is
     shared across cases in a file) and the persisted per-conversation drafts
     (task 8: localStorage survives across tests in the same jsdom). */
  window.history.replaceState(null, "", "/dashboard/messages")
  window.localStorage.clear()
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

    clickConversation(await screen.findByRole("listitem"))

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

    await openConversationAt(0) // أحمد
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

    await openConversationAt(0) // أحمد
    await screen.findByText("السلام عليكم")
    const replyA = screen.getByLabelText("نص الرد") as HTMLTextAreaElement
    fireEvent.change(replyA, { target: { value: "رد مخصص للعميل أحمد" } })
    expect(replyA.value).toBe("رد مخصص للعميل أحمد")

    // switch to سارة — her reply box must NOT carry أحمد's draft
    clickConversation(screen.getAllByRole("listitem")[1])
    await waitFor(() => {
      expect((screen.getByLabelText("نص الرد") as HTMLTextAreaElement).value).toBe("")
    })

    // back to أحمد — the draft is restored, not lost
    clickConversation(screen.getAllByRole("listitem")[0])
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

    clickConversation((await screen.findAllByRole("listitem"))[0])
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

    clickConversation(await screen.findByRole("listitem"))
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

    clickConversation(await screen.findByRole("listitem"))
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

describe("instant inbox (v23 — optimistic send + instant cache)", () => {
  it("optimistic send: the reply bubble is on screen BEFORE the server answers", async () => {
    // a POST that stays in flight until the test releases it — the only way
    // to pin "the UI moved first, the network is still pending"
    let releaseReply!: (res: Response) => void
    const api = stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد")], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: threadOf("c1") }),
      "POST /api/inbox/conversations/c1/reply": () =>
        new Promise<Response>((resolve) => {
          releaseReply = resolve
        }),
    })
    renderMessages()

    clickConversation(await screen.findByRole("listitem"))
    await screen.findByText("السلام عليكم")
    fireEvent.change(screen.getByLabelText("نص الرد"), { target: { value: "رد لحظي قبل الخادم" } })
    fireEvent.click(screen.getByRole("button", { name: "إرسال الرد" }))

    // the optimistic bubble is in the thread while the POST is still in
    // flight: exactly one reply call, and no success toast yet. selector:"p"
    // pins the BUBBLE itself — the composer textarea also carries the text
    // as a controlled value, which would make the query a false positive.
    expect(
      await screen.findByText("رد لحظي قبل الخادم", { selector: "p" }),
    ).toBeInTheDocument()
    expect(api.callsFor("/api/inbox/conversations/c1/reply")).toHaveLength(1)
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    // release the server — the onSuccess invalidate swaps the temp bubble
    // for the persisted copy
    releaseReply(jsonRes({ success: true, data: { message_id: "m3" } }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إرسال الرد"))
  })

  it("a failed send rolls the optimistic bubble back and keeps the draft", async () => {
    let failReply!: (res: Response) => void
    stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد")], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: threadOf("c1") }),
      "POST /api/inbox/conversations/c1/reply": () =>
        new Promise<Response>((resolve) => {
          failReply = resolve
        }),
    })
    renderMessages()

    clickConversation(await screen.findByRole("listitem"))
    await screen.findByText("السلام عليكم")
    fireEvent.change(screen.getByLabelText("نص الرد"), { target: { value: "محاولة تفاؤلية" } })
    fireEvent.click(screen.getByRole("button", { name: "إرسال الرد" }))

    // the optimistic bubble flashes in… (selector:"p" — the composer keeps
    // the same text as its controlled value, see the test above)
    expect(
      await screen.findByText("محاولة تفاؤلية", { selector: "p" }),
    ).toBeInTheDocument()

    // …then the 502 rolls it back out of the thread (snapshot restore)
    failReply(jsonRes({ detail: "تعذر الإرسال إلى فيسبوك" }, 502))
    await waitFor(() =>
      expect(screen.queryByText("محاولة تفاؤلية", { selector: "p" })).toBeNull(),
    )
    // the thread is back to its exact server state
    expect(screen.getByText("السلام عليكم")).toBeInTheDocument()
    expect(screen.getByText("أهلاً بك!")).toBeInTheDocument()
    // the draft survives the rollback for a corrected retry (v17 D10-M2)
    expect((screen.getByLabelText("نص الرد") as HTMLTextAreaElement).value).toBe("محاولة تفاؤلية")
    expect(mocks.toastError).toHaveBeenCalledWith("تعذر الإرسال إلى فيسبوك")
  })

  it("returning to a recently-opened conversation serves its thread from cache — zero refetch", async () => {
    const api = stubFetch({
      [LIST_ROUTE]: () =>
        jsonRes({ success: true, data: { items: [conv("c1", "أحمد"), conv("c2", "سارة")], total: 2 } }),
      // distinct bodies per thread — "in cache" vs "placeholder" must be
      // distinguishable in the DOM, not just in the call log
      "GET /api/inbox/conversations/c1": () =>
        jsonRes({ success: true, data: [{ id: "c1-m1", message: "سؤال أحمد عن السعر", is_from_page: false, created_time: null }] }),
      "GET /api/inbox/conversations/c2": () =>
        jsonRes({ success: true, data: [{ id: "c2-m1", message: "استفسار سارة عن التوصيل", is_from_page: false, created_time: null }] }),
    })
    renderMessages()

    // the live badge announces the polling cadence (v23 instant inbox)
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "تحديث لحظي كل ثوانٍ")

    // open أحمد — his thread is fetched live (first sighting)
    clickConversation((await screen.findAllByRole("listitem"))[0])
    expect(await screen.findByText("سؤال أحمد عن السعر")).toBeInTheDocument()

    // switch to سارة — her thread loads
    clickConversation(screen.getAllByRole("listitem")[1])
    expect(await screen.findByText("استفسار سارة عن التوصيل")).toBeInTheDocument()

    // GET-only count (callsFor matches the mark-read POST url too)
    const c1ThreadGets = () =>
      api.calls.filter((c) => c.method === "GET" && c.url === "/api/inbox/conversations/c1").length
    expect(c1ThreadGets()).toBe(1)

    // back to أحمد — the cached thread paints INSTANTLY (staleTime 20s):
    // his messages are on screen and NOT a single refetch was fired
    clickConversation(screen.getAllByRole("listitem")[0])
    expect(await screen.findByText("سؤال أحمد عن السعر")).toBeInTheDocument()
    expect(screen.queryByText("استفسار سارة عن التوصيل")).toBeNull()
    expect(c1ThreadGets()).toBe(1) // ← the staleTime pin: cache-served, zero refetch
  })
})

// ═══════════════════════════════════════════════════════════════════════
// v24-C2 — thread ↔ URL (?c= deep link + back-to-list + immersive marker)
// ═════════════════════════════════════════════════════════════════════

describe("v24-C2 — thread ↔ URL (?c=)", () => {
  it("opening a thread pushes ?c= into the URL; browser back returns to the list and clears chat-focus", async () => {
    stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد")], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: threadOf("c1") }),
      "POST /api/inbox/conversations/c1/read": () => jsonRes({ success: true, data: { unread: 0 } }),
    })
    renderMessages()

    clickConversation(await screen.findByRole("listitem"))
    await screen.findByText("السلام عليكم")

    // the thread is now URL state — refresh/share/deep-link all keep it
    expect(window.location.search).toBe("?c=c1")
    // immersive-thread marker on <body> (the bottom-nav hide hook, task 6)
    expect(document.body.dataset.chatFocus).toBe("1")
    // the thread scroller announces incoming messages (B4-P1, task 9)
    expect(screen.getByRole("log")).toHaveAttribute("aria-live", "polite")

    // browser/Android back pops the pushed entry — back to the list, not
    // out of the page (jsdom implements history traversal + popstate)
    window.history.back()
    await waitFor(() => expect(screen.queryByText("السلام عليكم")).toBeNull())
    expect(window.location.search).toBe("")
    expect(document.body.dataset.chatFocus).toBeUndefined()
  })

  it("mounting with ?c= already in the URL opens the thread directly (refresh keeps the place)", async () => {
    // the deep link: only the mark-read POST may fire — the thread GET is
    // the same endpoint, so pin both, plus the thread's presence
    window.history.replaceState(null, "", "/dashboard/messages?c=c1")
    stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد")], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: threadOf("c1") }),
      "POST /api/inbox/conversations/c1/read": () => jsonRes({ success: true, data: { unread: 0 } }),
    })
    renderMessages()

    expect(await screen.findByText("السلام عليكم")).toBeInTheDocument()
    expect(document.body.dataset.chatFocus).toBe("1")
  })

  it("the in-thread back row returns to the list without leaving the page", async () => {
    stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد")], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: threadOf("c1") }),
    })
    renderMessages()

    clickConversation(await screen.findByRole("listitem"))
    await screen.findByText("السلام عليكم")

    // the pushed entry unwinds (history.go(-1)) — URL back to the bare list
    // (jsdom's traversal is async: the view flips synchronously via state,
    //  the history entry lands a task later)
    fireEvent.click(screen.getByRole("button", { name: /كل المحادثات/ }))
    await waitFor(() => expect(screen.queryByText("السلام عليكم")).toBeNull())
    await waitFor(() =>
      expect(window.location.pathname + window.location.search).toBe("/dashboard/messages"),
    )
    expect(document.body.dataset.chatFocus).toBeUndefined()
  })
})

// ═════════════════════════════════════════════════════════════════════
// v24-C2 — message windowing (newest 60 + «تحميل الرسائل الأقدم»)
// ═════════════════════════════════════════════════════════════════════

describe("v24-C2 — message windowing", () => {
  it("renders only the newest 60 bubbles; the load-earlier button prepends the rest", async () => {
    const bigThread: Message[] = Array.from({ length: 80 }, (_, i): Message => ({
      id: `m${i}`,
      message: `رسالة رقم ${i}`,
      is_from_page: i % 2 === 0,
      created_time: null,
    }))
    stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد")], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: bigThread }),
    })
    renderMessages()

    clickConversation(await screen.findByRole("listitem"))

    // newest 60 of 80: m20..m79 on screen, m0..m19 held back
    expect(await screen.findByText("رسالة رقم 79")).toBeInTheDocument()
    expect(screen.getByText("رسالة رقم 20")).toBeInTheDocument()
    expect(screen.queryByText("رسالة رقم 19")).toBeNull()
    expect(screen.queryByText("رسالة رقم 0")).toBeNull()

    // the affordance names what's hidden, and prepends one batch
    const loadBtn = screen.getByRole("button", { name: /تحميل الرسائل الأقدم/ })
    expect(loadBtn).toHaveTextContent("(20)")
    fireEvent.click(loadBtn)

    expect(await screen.findByText("رسالة رقم 0")).toBeInTheDocument()
    expect(screen.getByText("رسالة رقم 19")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /تحميل الرسائل الأقدم/ })).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════
// v24-C2 — draft persistence (localStorage draft:<id>, task 8 / A3-M6)
// ═════════════════════════════════════════════════════════════════════

describe("v24-C2 — draft persistence", () => {
  it("a draft survives blur + full remount (refresh) and is cleared on send", async () => {
    stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد")], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: threadOf("c1") }),
      "POST /api/inbox/conversations/c1/reply": () => jsonRes({ success: true, data: { message_id: "m3" } }),
    })
    const first = renderMessages()

    clickConversation(await screen.findByRole("listitem"))
    await screen.findByText("السلام عليكم")
    fireEvent.change(screen.getByLabelText("نص الرد"), { target: { value: "مسودة مهمة" } })
    fireEvent.blur(screen.getByLabelText("نص الرد")) // blur flushes the debounce
    expect(window.localStorage.getItem("draft:c1")).toBe("مسودة مهمة")

    // full unmount + remount (a refresh): the stored draft hydrates the
    // thread's composer on open — the mid-compose refresh no longer loses it
    first.unmount()
    const second = renderMessages()
    clickConversation(await screen.findByRole("listitem"))
    await waitFor(() => {
      expect((screen.getByLabelText("نص الرد") as HTMLTextAreaElement).value).toBe("مسودة مهمة")
    })

    // a successful send clears the draft in state AND storage
    fireEvent.click(screen.getByRole("button", { name: "إرسال الرد" }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("تم إرسال الرد"))
    await waitFor(() => {
      expect((screen.getByLabelText("نص الرد") as HTMLTextAreaElement).value).toBe("")
    })
    expect(window.localStorage.getItem("draft:c1")).toBeNull()
    second.unmount()
  })

  it("a FAILED send keeps the stored draft too (retry after refresh still has the text)", async () => {
    stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد")], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: threadOf("c1") }),
      "POST /api/inbox/conversations/c1/reply": () => jsonRes({ detail: "تعذر الإرسال إلى فيسبوك" }, 502),
    })
    renderMessages()

    clickConversation(await screen.findByRole("listitem"))
    await screen.findByText("السلام عليكم")
    fireEvent.change(screen.getByLabelText("نص الرد"), { target: { value: "محاولة رد" } })
    fireEvent.blur(screen.getByLabelText("نص الرد"))
    fireEvent.click(screen.getByRole("button", { name: "إرسال الرد" }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    // the draft survives in both places for a corrected retry
    expect((screen.getByLabelText("نص الرد") as HTMLTextAreaElement).value).toBe("محاولة رد")
    expect(window.localStorage.getItem("draft:c1")).toBe("محاولة رد")
  })
})

// ═══════════════════════════════════════════════════════════════════════
// v24-R1 — scroll-to-bottom FAB (task 1 / A3 §8-6)
// ═══════════════════════════════════════════════════════════════════════

describe("v24-R1 — scroll-to-bottom FAB (task 1)", () => {
  it("hidden at the bottom and for a small 200px peek; appears >300px up; click jumps to the newest message", async () => {
    installSyncRaf()
    stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد")], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: threadOf("c1") }),
    })
    renderMessages()

    clickConversation(await screen.findByRole("listitem"))
    await screen.findByText("السلام عليكم")

    const scroller = screen.getByRole("log")
    // fresh thread = at the bottom → no FAB
    expect(screen.queryByRole("button", { name: "الانتقال لآخر رسالة" })).toBeNull()

    // 200px up (inside the auto-follow window) — still no FAB
    mockScrollMetrics(scroller, 200)
    fireEvent.scroll(scroller)
    expect(screen.queryByRole("button", { name: "الانتقال لآخر رسالة" })).toBeNull()

    // 400px up → the FAB appears
    mockScrollMetrics(scroller, 400)
    fireEvent.scroll(scroller)
    const fab = screen.getByRole("button", { name: "الانتقال لآخر رسالة" })
    expect(fab).toBeInTheDocument()
    // the FAB anchors to the scroller's WRAPPER (the scroll viewport), never
    // to the scrolling content — an absolute child of the scroller itself
    // would scroll away with the messages
    expect(fab.parentElement).toBe(scroller.parentElement)

    // clicking it jumps to the newest message (smooth — motion allowed)
    fireEvent.click(fab)
    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" })),
    )

    // scrolling back to the bottom hides it again
    mockScrollMetrics(scroller, 0)
    fireEvent.scroll(scroller)
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "الانتقال لآخر رسالة" })).toBeNull(),
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════
// v24-R1 — new-messages pill (task 2 — the honest 5s poll)
// ═══════════════════════════════════════════════════════════════════════

describe("v24-R1 — new-messages pill (task 2)", () => {
  it("a poll that grows the thread while the user reads history surfaces the pill, NOT a scroll yank", async () => {
    installSyncRaf()
    let thread = threadOf("c1")
    stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد")], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: thread }),
      "POST /api/inbox/conversations/c1/read": () => jsonRes({ success: true, data: { unread: 0 } }),
    })
    const { qc } = renderMessages()

    clickConversation(await screen.findByRole("listitem"))
    await screen.findByText("السلام عليكم")
    // let the (أ) fresh-thread landing fire BEFORE freezing the scroll count
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    const initialScrolls = scrollIntoView.mock.calls.length

    // the user scrolls up into history
    const scroller = screen.getByRole("log")
    mockScrollMetrics(scroller, 1400)
    fireEvent.scroll(scroller)

    // the 5s poll lands new messages server-side — driven deterministically
    // here via the query cache (the poll calls the same queryFn/path); the
    // observer's re-render is async, so wait for the pill instead of
    // asserting it synchronously
    thread = [
      ...threadOf("c1"),
      { id: "c1-m3", message: "رسالة وصلت أثناء قراءة السجل", is_from_page: false, created_time: null },
    ]
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["inbox-messages", "c1"] })
    })

    // the pill — not a yank — is the poll's honest result
    const pill = await screen.findByRole("button", { name: "رسائل جديدة (1)" })
    expect(pill).toBeInTheDocument()
    // its count changes are announced politely (persistent live region)
    expect(pill.closest("[aria-live='polite']")).not.toBeNull()
    // the viewport was NEVER yanked: no scroll beyond the initial landing
    expect(scrollIntoView.mock.calls.length).toBe(initialScrolls)

    // manual return to the tail clears N without any click
    mockScrollMetrics(scroller, 100)
    fireEvent.scroll(scroller)
    await waitFor(() => expect(screen.queryByRole("button", { name: /رسائل جديدة/ })).toBeNull())

    // …and growth NEAR the bottom still auto-follows (the v24-C2 scroll
    // contract is intact): smooth follow, no pill
    thread = [
      ...thread,
      { id: "c1-m4", message: "رسالة رابعة", is_from_page: false, created_time: null },
    ]
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["inbox-messages", "c1"] })
    })
    await waitFor(() => expect(screen.getByText("رسالة رابعة")).toBeInTheDocument())
    expect(screen.queryByRole("button", { name: /رسائل جديدة/ })).toBeNull()
    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" })),
    )
  })

  it("clicking the pill jumps to the newest message and resets the count", async () => {
    installSyncRaf()
    let thread = threadOf("c1")
    stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد")], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: thread }),
      "POST /api/inbox/conversations/c1/read": () => jsonRes({ success: true, data: { unread: 0 } }),
    })
    const { qc } = renderMessages()

    clickConversation(await screen.findByRole("listitem"))
    await screen.findByText("السلام عليكم")

    const scroller = screen.getByRole("log")
    mockScrollMetrics(scroller, 1400)
    fireEvent.scroll(scroller)

    thread = [
      ...threadOf("c1"),
      { id: "c1-m3", message: "رسالة جديدة", is_from_page: false, created_time: null },
    ]
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["inbox-messages", "c1"] })
    })
    await screen.findByRole("button", { name: "رسائل جديدة (1)" })

    fireEvent.click(screen.getByRole("button", { name: "رسائل جديدة (1)" }))
    // the jump is smooth and the count is gone the moment the pill delivers
    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" })),
    )
    await waitFor(() => expect(screen.queryByRole("button", { name: /رسائل جديدة/ })).toBeNull())
  })
})

// ═══════════════════════════════════════════════════════════════════════
// v24-R1 — thread identity header (task 3 / A3-M5)
// ═══════════════════════════════════════════════════════════════════════

describe("v24-R1 — thread identity header (task 3)", () => {
  it("the mobile back row names the subscriber (name + count + decorative initials)", async () => {
    stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد", 0, 12)], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: threadOf("c1") }),
    })
    renderMessages()

    clickConversation(await screen.findByRole("listitem"))
    await screen.findByText("السلام عليكم")

    // the back control kept its accessible name (icon-only now, 44px)
    const back = screen.getByRole("button", { name: "كل المحادثات" })
    const header = back.parentElement as HTMLElement
    // WHO you're replying to is in the header row
    expect(within(header).getByText("أحمد")).toBeInTheDocument()
    expect(within(header).getByText(/رسالة|رسالتين|رسائل/)).toBeInTheDocument()
    // the initials tile is decorative (the name sits right beside it)
    expect(within(header).getByText("أ")).toHaveAttribute("aria-hidden", "true")
  })

  it("deep link with the thread missing from the filtered list falls back to the first customer sender", async () => {
    window.history.replaceState(null, "", "/dashboard/messages?c=c9")
    stubFetch({
      // the filtered/searched list does not contain the open thread
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [], total: 0 } }),
      "GET /api/inbox/conversations/c9": () =>
        jsonRes({
          success: true,
          data: [
            {
              id: "c9-m1",
              message: "مرحبا",
              is_from_page: false,
              from: { id: "s9", name: "خالد العميل" },
              created_time: null,
            },
            { id: "c9-m2", message: "أهلاً", is_from_page: true, created_time: null },
          ],
        }),
      "POST /api/inbox/conversations/c9/read": () => jsonRes({ success: true, data: { unread: 0 } }),
    })
    renderMessages()

    expect(await screen.findByText("مرحبا")).toBeInTheDocument()
    const header = screen.getByRole("button", { name: "كل المحادثات" }).parentElement as HTMLElement
    expect(within(header).getByText("خالد العميل")).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// v24-R1 — offline banner (task 4, messages-scoped)
// ═══════════════════════════════════════════════════════════════════════

describe("v24-R1 — offline banner (task 4)", () => {
  it("the offline event mounts a role=status strip; the online event dismisses it", async () => {
    stubFetch({
      [LIST_ROUTE]: () => jsonRes({ success: true, data: { items: [conv("c1", "أحمد")], total: 1 } }),
      "GET /api/inbox/conversations/c1": () => jsonRes({ success: true, data: threadOf("c1") }),
    })
    renderMessages()
    await screen.findAllByRole("listitem")

    // online (jsdom default) → no banner
    expect(screen.queryByText(/انقطع الاتصال بالإنترنت/)).toBeNull()

    // the browser reports connectivity loss
    fireEvent(window, new Event("offline"))
    const banner = screen.getByText("انقطع الاتصال بالإنترنت — سيتم إعادة المحاولة تلقائياً")
    expect(banner.closest('[role="status"]')).not.toBeNull()

    // connectivity returns → auto-dismiss
    fireEvent(window, new Event("online"))
    await waitFor(() => expect(screen.queryByText(/انقطع الاتصال بالإنترنت/)).toBeNull())
  })
})
