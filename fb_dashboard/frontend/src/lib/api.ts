/**
 * Unified API response unwrapping — latest_plan.md Track A.4.
 *
 * Backend contract: every /api endpoint returns
 *   {"success": boolean, "data": ..., "error"?: string}
 *
 * v10-W4: apiJson (fetch+unwrap sugar, zero importers) deleted and
 * unwrapBody un-exported (internal helper of unwrapApi only).
 */
import { ApiError } from "./csrf-client"

/** Unwrap an already-parsed body (dual-shape, migration-safe). */
function unwrapBody<T = any>(body: unknown): T {
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
  const body = await res.json().catch((): null => null)
  return unwrapBody<T>(body)
}
