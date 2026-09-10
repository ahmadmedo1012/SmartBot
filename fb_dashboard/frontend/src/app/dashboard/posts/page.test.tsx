/**
 * v21 (T4-b) — posts page sync-failure surfacing (GET /api/posts envelope).
 *
 * The page never consumed /api/posts at all (local drafts only) — a failing
 * FB posts sync rendered as a SILENT empty section (the #1 browser-verified
 * symptom, T2-a). v21 gives GET /api/posts a DB-first envelope with sync
 * triage; these tests pin the banner contract:
 *   - synced=false + sync_attempted=true → the amber «فشل التحديث من فيسبوك»
 *     banner (the v19 ads-page pattern verbatim — same classes/copy), shown
 *     with rows AND with an empty section; sync_error (English diagnostic)
 *     rides as the banner's title tooltip only, never as main text
 *   - synced=false + sync_attempted=false → throttled 30s sync skip — NOT a
 *     failure: rows serve with NO banner (a bare synced===false gate would
 *     false-positive here on every refetch inside the skip window)
 *   - synced=true → no banner, rows serve
 *   - HTTP-level failure of /api/posts itself → the section's honest Arabic
 *     error state + retry (not a silent anything)
 *
 * Mock bundle (house pattern — AdminSidebar.v19.test.tsx, where the ads-page
 * banner states are pinned): fresh QueryClient per render, @/lib/csrf-client
 * partially mocked (ApiError class kept — unwrapApi imports it), apiFetch
 * routed by URL (the page fires /api/posts + /api/scheduled-posts per
 * mount), premium-toast spy. Card/EmptyState/PageHeader/lucide/format real.
 */
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import PostsPage from "@/app/dashboard/posts/page"
import type { FbPost, PostsResponse, ScheduledPost } from "@/lib/types"

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
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

/* @/lib/api (unwrapApi, used by both queryFns) imports ApiError from
 * ./csrf-client — the partial mock keeps the class so that import binding
 * survives (AdminSidebar.v19.test.tsx recipe). */
vi.mock("@/lib/csrf-client", () => {
  class ApiError extends Error {
    constructor(public status: number, public body: unknown) {
      super(`فشل الطلب (${status})`)
    }
  }
  return { ApiError, apiFetch: mocks.apiFetch }
})

/* ---------- harnesses ---------- */

const BANNER_TEXT = "فشل التحديث من فيسبوك — يتم عرض آخر بيانات محفوظة."

const fbRow = (over: Partial<FbPost> = {}): FbPost => ({
  id: "p_101",
  message: "عرض الصيف على الأجهزة",
  created_time: "2026-09-10T12:00:00",
  likes: 5,
  shares: 1,
  comments: 3,
  ...over,
})

/** GET /api/posts success envelope as the page's queryFn consumes it. */
function postsEnvelope(over: Partial<PostsResponse> = {}): PostsResponse {
  return {
    items: [fbRow()],
    total: 1,
    page: 1,
    per_page: 10,
    has_next: false,
    source: "db",
    synced: true,
    sync_attempted: true,
    sync_error: "",
    ...over,
  }
}

/** The dashboard's own draft row (T2-a saw exactly one «هلا» مسودة). */
const draft: ScheduledPost = { id: 1, message: "هلا", status: "draft" }

function okRes(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ success: true, data }) }
}

/** Route the apiFetch mock by URL — the page mounts two queries. */
function routeApi(posts: PostsResponse, drafts: ScheduledPost[] = []) {
  mocks.apiFetch.mockImplementation(async (url: string) => {
    if (url === "/api/posts") return okRes(posts)
    if (url === "/api/scheduled-posts") return okRes(drafts)
    return okRes({})
  })
}

function renderPosts() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <PostsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.apiFetch.mockReset()
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/* ---------- v21 banner triage (synced / sync_attempted) ---------- */

describe("posts page v21 sync-failure banner states", () => {
  it("synced=false + sync_attempted=true + rows → amber banner + rows; sync_error is the tooltip only", async () => {
    routeApi(
      postsEnvelope({
        synced: false,
        sync_attempted: true,
        sync_error: "graph_failed: HTTP 400 (pages_read_engagement)",
      }),
      [draft],
    )
    renderPosts()

    // the stored row serves (with its formatted date)
    expect(await screen.findByText("عرض الصيف على الأجهزة")).toBeInTheDocument()
    expect(screen.getByText("10 سبتمبر 2026 12:00")).toBeInTheDocument()
    // the honest amber banner (ads-page copy verbatim)
    expect(screen.getByText(BANNER_TEXT)).toBeInTheDocument()
    // the English diagnostic rides as the banner's title tooltip…
    expect(
      screen.getByTitle("graph_failed: HTTP 400 (pages_read_engagement)"),
    ).toBeInTheDocument()
    // …never as rendered main text (users read Arabic)
    expect(screen.queryByText(/graph_failed/)).toBeNull()
    // the drafts section below is untouched by the sync failure
    expect(screen.getByText("هلا")).toBeInTheDocument()
    expect(screen.getByText("مسودة")).toBeInTheDocument()
  })

  it("synced=false + sync_attempted=true + EMPTY → still the banner — the silent-empty-state symptom is dead", async () => {
    // the exact production shape T2-a saw: sync ran, failed, nothing stored
    routeApi(
      postsEnvelope({
        items: [],
        total: 0,
        synced: false,
        sync_attempted: true,
        sync_error: "db_exc: connection pool exhausted",
      }),
      [],
    )
    renderPosts()

    expect(await screen.findByText(BANNER_TEXT)).toBeInTheDocument()
    // the section says it is empty — but no longer pretends everything is fine
    expect(screen.getByText("لا توجد منشورات على صفحتك بعد")).toBeInTheDocument()
  })

  it("synced=false + sync_attempted=false (throttled 30s skip) → rows serve with NO banner", async () => {
    routeApi(
      postsEnvelope({ synced: false, sync_attempted: false, sync_error: "" }),
      [draft],
    )
    renderPosts()

    expect(await screen.findByText("عرض الصيف على الأجهزة")).toBeInTheDocument()
    // a skipped sync window is not a failure — a bare synced===false gate
    // would false-positive here on every refetch inside the window
    expect(screen.queryByText(BANNER_TEXT)).toBeNull()
  })

  it("synced=true → rows serve with NO banner", async () => {
    routeApi(postsEnvelope({ synced: true, sync_attempted: true }), [draft])
    renderPosts()

    expect(await screen.findByText("عرض الصيف على الأجهزة")).toBeInTheDocument()
    expect(screen.queryByText(BANNER_TEXT)).toBeNull()
  })

  it("GET /api/posts itself fails → the section's honest Arabic error state + retry", async () => {
    mocks.apiFetch.mockImplementation(async (url: string) => {
      // the real apiFetch throws an ApiError carrying the backend Arabic
      // detail on !res.ok (e.g. 400 «اربط صفحتك…») — same rendering path
      if (url === "/api/posts") throw new Error("اربط صفحتك على فيسبوك أولاً")
      if (url === "/api/scheduled-posts") return okRes([draft])
      return okRes({})
    })
    renderPosts()

    /* the page query retries once (house `retry: 1`) with react-query's
     * ~1s backoff — allow the error state to land past findBy's 1s default */
    expect(
      await screen.findByText("فشل تحميل منشورات فيسبوك", {}, { timeout: 4000 }),
    ).toBeInTheDocument()
    expect(screen.getByText("اربط صفحتك على فيسبوك أولاً")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument()
    // and the local drafts section still renders independently
    expect(await screen.findByText("هلا")).toBeInTheDocument()
  })
})
