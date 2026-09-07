/**
 * v13-E6 — usePublicStats + trustCopy contract (v10-C2 / plan §3.1).
 *
 * Pins two things:
 *   1. trustCopy — honest social proof: qualitative copy until the numbers
 *      land, real tenant count (ar-LY grouped) once they do.
 *   2. the hook's module-level single-fetch cache (v10-C2): N mounting
 *      consumers → ONE /api/public/stats request; a failure is not cached
 *      and still flips `ready` so qualitative copy renders.
 *
 * The module holds state at module scope (settledStats / statsInFlight), so
 * every hook test resets the registry (vi.resetModules) and imports the
 * module DYNAMICALLY — otherwise the 60s freshness window would leak the
 * previous test's settled value. Fetch is stubbed with the house pattern
 * (vi.stubGlobal + real Response objects).
 */
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { trustCopy } from "./usePublicStats"

/** Build a real Response with a JSON body. */
function jsonRes(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

/** Fresh module registry → fresh settledStats / statsInFlight cache. */
async function importFreshHook() {
  vi.resetModules()
  return import("./usePublicStats")
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("trustCopy (pure)", () => {
  it("shows the qualitative hero copy while not ready (or with no tenants)", () => {
    expect(trustCopy(null, false)).toBe("أتمتة ذكية لصفحات فيسبوك")
    expect(trustCopy(null, true)).toBe("أتمتة ذكية لصفحات فيسبوك")
    expect(trustCopy({ activeTenants: 0 }, true)).toBe("أتمتة ذكية لصفحات فيسبوك")
  })

  it("shows the real count once at least one tenant is active", () => {
    expect(trustCopy({ activeTenants: 1 }, true)).toBe("أكثر من 1 صفحة تثق بنا")
  })

  it("groups larger counts with the ar-LY dot separator", () => {
    expect(trustCopy({ activeTenants: 1234 }, true)).toBe("أكثر من 1.234 صفحة تثق بنا")
  })
})

describe("usePublicStats (hook)", () => {
  it("serves multiple mounting consumers from ONE shared fetch", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        jsonRes({ success: true, data: { activeTenants: 9, totalReplies: 4100 } }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const mod = await importFreshHook()
    const first = renderHook(() => mod.usePublicStats())
    const second = renderHook(() => mod.usePublicStats())

    await waitFor(() => {
      expect(first.result.current.ready).toBe(true)
      expect(second.result.current.ready).toBe(true)
    })

    // v10-C2: three consumers on the landing page fired three requests before
    // the fix — the module-level in-flight promise must collapse them to one
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith("/api/public/stats")
    expect(first.result.current.stats).toEqual({ activeTenants: 9, totalReplies: 4100 })
    expect(second.result.current.stats).toEqual(first.result.current.stats)
  })

  it("flips ready (with stats null) when the fetch fails — qualitative copy renders", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => {
        throw new Error("network down")
      },
    )
    vi.stubGlobal("fetch", fetchMock)

    const mod = await importFreshHook()
    const { result } = renderHook(() => mod.usePublicStats())

    await waitFor(() => expect(result.current.ready).toBe(true))

    expect(result.current.stats).toBeNull()
    // and the failure is NOT cached: the settled value must still be absent
    // so the next page load retries (asserted by the next test's fresh fetch)
  })

  it("does not serve a failed attempt from cache — a fresh mount refetches", async () => {
    const failing = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => {
        throw new Error("network down")
      },
    )
    vi.stubGlobal("fetch", failing)
    const mod = await importFreshHook()
    const failed = renderHook(() => mod.usePublicStats())
    await waitFor(() => expect(failed.result.current.ready).toBe(true))
    failed.unmount()

    // failure is not cached → within the same module instance a new mount
    // must fire a NEW request (which now succeeds)
    const succeeding = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        jsonRes({ success: true, data: { activeTenants: 2 } }),
    )
    vi.stubGlobal("fetch", succeeding)
    const retry = renderHook(() => mod.usePublicStats())

    await waitFor(() => expect(retry.result.current.ready).toBe(true))

    expect(retry.result.current.stats).toEqual({ activeTenants: 2 })
  })
})
