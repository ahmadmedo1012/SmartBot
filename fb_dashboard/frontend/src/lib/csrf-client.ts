export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    // v4 §2.1 — surface the backend's Arabic detail first, English fallback last
    const detail =
      (body as Record<string, unknown> | null)?.detail ??
      (body as Record<string, unknown> | null)?.error
    super(typeof detail === "string" && detail ? detail : `فشل الطلب (${status})`)
  }
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers)
  // v4 §2.1 — let the browser set application/x-www-form-urlencoded for URLSearchParams
  // (FastAPI Form(...) endpoints 422 on a forced JSON content-type)
  const isForm =
    options.body instanceof FormData || options.body instanceof URLSearchParams
  if (!headers.has("Content-Type") && !isForm) {
    headers.set("Content-Type", "application/json")
  }
  // v12-E4 (CSRF double-submit, pairs with app/middleware.py): every GET /api/*
  // response plants a non-HttpOnly `csrf_token` cookie (SameSite=Strict); the
  // mutating methods must echo it in X-CSRF-Token. If the cookie is absent
  // (first cold visit, or a backend that has not issued one yet) we simply
  // send nothing — the server only validates when it set the cookie.
  const method = (options.method ?? "GET").toUpperCase()
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
    !headers.has("X-CSRF-Token") &&
    typeof document !== "undefined"
  ) {
    const csrf = document.cookie
      .split("; ")
      .find((row) => row.startsWith("csrf_token="))
      ?.split("=")
      .slice(1)
      .join("=")
    if (csrf) headers.set("X-CSRF-Token", csrf)
  }
  const res = await fetch(url, { ...options, headers, credentials: "include" })
  if (!res.ok) {
    const body = await res.json().catch((): null => null)
    throw new ApiError(res.status, body)
  }
  return res
}
