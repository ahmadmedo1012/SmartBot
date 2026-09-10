/**
 * v24-C3 (A2 #3 — persist the react-query cache): a MINIMAL, dependency-free
 * sessionStorage persister for the QueryClient created in
 * components/shared/QueryProvider.tsx.
 *
 * Why sessionStorage and not localStorage: this cache is user-scoped API
 * data for the CURRENT tab session — per-tab isolation avoids leaking one
 * session's dashboard payloads into another tab, and the store dies with
 * the tab (no long-lived stale copies). A hard refresh or back-navigation
 * inside the same tab rehydrates and renders instantly, then revalidates.
 *
 * Manual implementation on purpose (task constraint: NO new deps — no
 * @tanstack/query-sync-storage-persister / persist-query-client):
 *   - SAVE: queryCache.subscribe → debounced (800ms) serialize → write.
 *     Only queries are persisted (mutations have no cache), newest-first
 *     until a ~500KB JSON cap, infinite queries skipped, and the auth/user
 *     entry ["me"] deliberately NEVER persisted (a same-tab
 *     logout→login-as-someone-else must not hydrate the previous account's
 *     profile into the next session — A2 #3's "never persist ['me']").
 *   - RESTORE: on attach, guarded JSON.parse; entries are applied with
 *     setQueryData(queryKey, data, { updatedAt }) so each entry's original
 *     dataUpdatedAt survives and staleness math stays honest (stale data
 *     refetches on mount = stale-while-revalidate, not fake-fresh). An
 *     entry only lands when it is NEWER than whatever is already in the
 *     cache (a fast in-flight refetch must not be overwritten by older
 *     persisted bytes).
 *   - Cross-user hygiene: clearQueryPersistedCache() wipes the store —
 *     DashboardShell's logout calls it before leaving.
 *   - EVERY storage/JSON/quota error is swallowed silently (a cache layer
 *     must never break the app); SSR is guarded (typeof window).
 *   - Version key "rq-cache-v1": a payload with any other version (or a
 *     corrupt shape) is ignored whole, and a 24h maxAge drops ancient
 *     payloads.
 */
import type { QueryClient, Query } from "@tanstack/react-query"

const STORAGE_KEY = "rq-cache-v1"
const VERSION = "rq-cache-v1"
const MAX_BYTES = 500 * 1024
const SAVE_DEBOUNCE_MS = 800
/** Drop the whole payload if it was saved more than a day ago (A2: maxAge 24h). */
const MAX_AGE_MS = 24 * 60 * 60_000
/** ~64 bytes of envelope allowance per entry inside the byte budget. */
const ENTRY_OVERHEAD_BYTES = 64
/** Query-key roots that must never be persisted (auth/user identity). */
const EXCLUDED_KEY_ROOTS = new Set(["me"])

interface PersistedQueryEntry {
  queryKey: readonly unknown[]
  data: unknown
  dataUpdatedAt: number
}

interface PersistedCache {
  version: string
  savedAt: number
  queries: PersistedQueryEntry[]
}

/** v24-R4 F2: bumped by every clear — a scheduled/straggler flush captured
 * an older epoch and must NOT re-write the wiped store after logout
 * (the 800ms debounce could beat the navigation to /login and resurrect
 * the previous user's cache). */
let clearEpoch = 0

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
}

function isExcluded(query: Query): boolean {
  // v24-C3: infinite queries hold paged cursors — replaying them from
  // storage deserves the official persister, not this minimal twin.
  if (query.queryType === "infinite") return true
  const root = query.queryKey?.[0]
  return typeof root === "string" && EXCLUDED_KEY_ROOTS.has(root)
}

/** Serialize the persistable slice of the cache under the byte cap. */
function serializeCache(queryClient: QueryClient): string | null {
  const candidates = queryClient
    .getQueryCache()
    .getAll()
    .filter((q) => q.state.data !== undefined && !isExcluded(q))
    // newest data first — when the cap bites, the freshest entries survive
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)

  const queries: PersistedQueryEntry[] = []
  let budget = MAX_BYTES
  for (const q of candidates) {
    const entry: PersistedQueryEntry = {
      queryKey: q.queryKey,
      data: q.state.data,
      dataUpdatedAt: q.state.dataUpdatedAt,
    }
    let json: string
    try {
      json = JSON.stringify(entry)
    } catch {
      continue // non-serializable payload — skip the entry, keep the rest
    }
    const cost = json.length + ENTRY_OVERHEAD_BYTES
    if (cost > budget) break // cap reached (entries are sorted newest-first)
    budget -= cost
    queries.push(entry)
  }
  if (queries.length === 0) return null
  try {
    return JSON.stringify({ version: VERSION, savedAt: Date.now(), queries })
  } catch {
    return null
  }
}

/** Structurally validate a parsed payload before trusting it. */
function isPersistedCache(value: unknown): value is PersistedCache {
  if (value === null || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (v.version !== VERSION) return false
  if (typeof v.savedAt !== "number" || !Number.isFinite(v.savedAt)) return false
  if (Date.now() - v.savedAt > MAX_AGE_MS) return false
  if (!Array.isArray(v.queries)) return false
  return v.queries.every((q) => {
    if (q === null || typeof q !== "object") return false
    const e = q as Record<string, unknown>
    return (
      Array.isArray(e.queryKey) &&
      e.queryKey.length > 0 &&
      typeof e.queryKey[0] === "string" &&
      "data" in e &&
      typeof e.dataUpdatedAt === "number" &&
      Number.isFinite(e.dataUpdatedAt)
    )
  })
}

/** Restore persisted entries into a fresh client (see header for the rules). */
function hydrateCache(queryClient: QueryClient): void {
  let parsed: unknown
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    parsed = JSON.parse(raw)
  } catch {
    return // corrupt JSON — silently drop the cache
  }
  if (!isPersistedCache(parsed)) return
  for (const entry of parsed.queries) {
    try {
      const existingState = queryClient.getQueryState(entry.queryKey)
      // never clobber newer data that already landed (in-flight refetch)
      if (existingState && existingState.dataUpdatedAt >= entry.dataUpdatedAt) continue
      // updatedAt is preserved so staleTime math stays honest → SWR refetch
      queryClient.setQueryData(entry.queryKey, entry.data, { updatedAt: entry.dataUpdatedAt })
    } catch {
      // a single bad entry must not abort the rest
    }
  }
}

/**
 * Attach the persister to a client: hydrates once, then persists cache
 * changes (debounced). Returns a detach function (unsubscribe + drop the
 * pending save timer). No-op outside the browser.
 */
export function attachQueryPersister(queryClient: QueryClient): () => void {
  if (!isBrowser()) return () => {}
  hydrateCache(queryClient)

  let timer: ReturnType<typeof setTimeout> | null = null
  let lastWritten: string | null = null
  let epochAtSchedule = clearEpoch
  const flush = (): void => {
    timer = null
    // v24-R4 F2: a clear() happened after this flush was scheduled — the
    // store was wiped on purpose (logout / 401 expiry); a straggler write
    // would resurrect the previous account's data into the next login.
    if (epochAtSchedule !== clearEpoch) return
    try {
      const payload = serializeCache(queryClient)
      if (payload === null || payload === lastWritten) return
      window.sessionStorage.setItem(STORAGE_KEY, payload)
      lastWritten = payload
    } catch {
      // quota exceeded / storage unavailable — silent by design
    }
  }

  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    if (timer !== null) return // debounce: one write per burst of updates
    epochAtSchedule = clearEpoch
    timer = setTimeout(flush, SAVE_DEBOUNCE_MS)
  })

  return () => {
    if (timer !== null) clearTimeout(timer)
    unsubscribe()
  }
}

/** v24-C3: wipe the persisted cache — called on logout so a same-tab
 * login-as-a-different-user can never hydrate the previous account's data.
 * v24-R4 F2: also bumps the epoch so an in-flight debounced flush is
 * cancelled (straggler-write guard) — and is now called from THREE exits:
 * manual logout (DashboardShell), the 401 session-expiry redirect
 * (csrf-client), and login page mount (belt-and-braces for any other
 * forced exit — the storage is user-scoped and must never outlive its
 * session in the same tab). */
export function clearQueryPersistedCache(): void {
  if (!isBrowser()) return
  clearEpoch++
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // silent
  }
}
