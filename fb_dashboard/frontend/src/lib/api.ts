/**
 * Unified API response unwrapping — latest_plan.md Track A.4.
 *
 * Backend contract: every /api endpoint returns
 *   {"success": boolean, "data": ..., "error"?: string}
 *
 * `unwrapApi` accepts the fetch Response (or an already-parsed body) and
 * returns the `data` payload directly. During the migration window it also
 * accepts raw (un-enveloped) bodies and returns them as-is, so call sites
 * can be converted before every router is wrapped — but the end state is:
 * ALL call sites go through unwrapApi, ALL routers return the envelope.
 *
 * Business failures (`success: false`) throw ApiError so react-query /
 * handlers treat them like failures.
 */
import { ApiError } from "./csrf-client"

/** Unwrap an already-parsed body (dual-shape, migration-safe). */
export function unwrapBody<T = any>(body: unknown): T {
  if (
    body !== null &&
    typeof body === "object" &&
    "success" in (body as Record<string, unknown>)
  ) {
    const envelope = body as { success: boolean; data?: unknown; error?: string }
    if (!envelope.success) {
      throw new ApiError(200, envelope)
    }
    return envelope.data as T
  }
  return body as T
}

/** Parse a Response then unwrap the envelope (throws on success:false). */
export async function unwrapApi<T = any>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null)
  return unwrapBody<T>(body)
}

/** fetch + unwrap in one call (adds Content-Type + credentials like apiFetch). */
export async function apiJson<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const { apiFetch } = await import("./csrf-client")
  const res = await apiFetch(url, options)
  return unwrapApi<T>(res)
}
