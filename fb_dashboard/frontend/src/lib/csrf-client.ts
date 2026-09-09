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

/* v15-E5 (D4-H3 — 401 عالمية): the ONE structural fix that covers all 22
 * react-query dashboard pages. Any apiFetch 401 (session expired mid-use —
 * e.g. a 60s refetchInterval on /dashboard/analytics) used to leave the page
 * spinning in a local error state with no way back in; now the central
 * wrapper announces the expiry in Arabic and sends the user to
 * /login?redirect=<current path> (login's safeRedirect lands them back here
 * after re-authenticating — the same contract AuthGuard already relies on).
 *
 * Guard rails against redirect loops and semantic false-positives:
 *  - pre-session / wrong-password endpoints never trigger it: /api/login
 *    (its 401 = wrong credentials, handled by the login page itself),
 *    /api/register, and /api/auth/change-password (its 401 = wrong CURRENT
 *    password while fully logged in — the Arabic detail must surface, not a
 *    bogus session kick);
 *  - a 401 while already ON /login|/register never re-redirects (loop);
 *  - a 10s dedupe window collapses the parallel-query 401 burst (5 stale
 *    refetches → ONE toast, ONE redirect timer);
 *  - SSR-safe (typeof window) — the server just gets the ApiError;
 *  - callers with their own tailored 401 journey (PaymentDialog's
 *    «سجّل الدخول أولاً لإتمام الاشتراك») pass skipAuthRedirect.
 * The redirect is deliberately delayed ~1.2s so the toast is actually read
 * before the unload; apiFetch STILL throws the ApiError so every caller's
 * catch sees the same object it always did. */
const SESSION_EXPIRED_TOAST_TITLE = "انتهت الجلسة"
const SESSION_EXPIRED_TOAST_DESC = "أعد تسجيل الدخول — سيتم تحويلك إلى صفحة الدخول الآن"
const SESSION_REDIRECT_DELAY_MS = 1200
const SESSION_401_DEDUPE_MS = 10_000

/** Endpoints whose 401 has a caller-local meaning (never a session kick). */
const PRE_SESSION_OR_LOCAL_401_PREFIXES = [
  "/api/login",
  "/api/register",
  "/api/auth/change-password",
]

let _lastSession401At = 0
let _sessionRedirectTimer: ReturnType<typeof setTimeout> | null = null

function isLocal401(url: string): boolean {
  return PRE_SESSION_OR_LOCAL_401_PREFIXES.some((p) => url.startsWith(p))
}

function onLoginPage(): boolean {
  const p = window.location.pathname
  return p === "/login" || p.startsWith("/login/") || p === "/register" || p.startsWith("/register/")
}

function handleSessionExpired(): void {
  if (typeof window === "undefined") return
  const now = Date.now()
  if (now - _lastSession401At < SESSION_401_DEDUPE_MS) return
  _lastSession401At = now
  /* v16 (D5 bundle / E4 follow-up): sonner + premium-toast (43.2KB chunk)
   * is imported DYNAMICALLY here — a static import dragged the toaster into
   * every route that calls apiFetch (landing islands, pricing) even though
   * public endpoints never 401. The chunk now loads only when a session
   * actually expires mid-use, always inside a layout that mounts the
   * AppToaster (dashboard/admin/login/register/connect/subscribe). */
  import("@/lib/premium-toast")
    .then(({ premiumToast }) =>
      premiumToast("error", SESSION_EXPIRED_TOAST_TITLE, SESSION_EXPIRED_TOAST_DESC),
    )
    .catch(() => {
      /* the toast must never block the redirect */
    })
  if (_sessionRedirectTimer) return
  const current = window.location.pathname + window.location.search
  _sessionRedirectTimer = setTimeout(() => {
    _sessionRedirectTimer = null
    window.location.replace("/login?redirect=" + encodeURIComponent(current))
  }, SESSION_REDIRECT_DELAY_MS)
}

/** Test-only: reset the 401 dedupe/timer state between cases (the 10s window
 * would otherwise swallow the second 401 scenario in the same file). */
export function __resetSession401ForTests(): void {
  _lastSession401At = 0
  if (_sessionRedirectTimer) {
    clearTimeout(_sessionRedirectTimer)
    _sessionRedirectTimer = null
  }
}

/** apiFetch options: RequestInit + the 401-redirect opt-out (see D4-H3). */
export interface ApiFetchOptions extends RequestInit {
  /** Caller owns the 401 journey (e.g. PaymentDialog's tailored redirect). */
  skipAuthRedirect?: boolean
}

export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { skipAuthRedirect, ...requestInit } = options
  const headers = new Headers(requestInit.headers)
  // v4 §2.1 — let the browser set application/x-www-form-urlencoded for URLSearchParams
  // (FastAPI Form(...) endpoints 422 on a forced JSON content-type)
  const isForm =
    requestInit.body instanceof FormData || requestInit.body instanceof URLSearchParams
  if (!headers.has("Content-Type") && !isForm) {
    headers.set("Content-Type", "application/json")
  }
  // v12-E4 (CSRF double-submit, pairs with app/middleware.py): every GET /api/*
  // response plants a non-HttpOnly `csrf_token` cookie (SameSite=Strict); the
  // mutating methods must echo it in X-CSRF-Token. If the cookie is absent
  // (first cold visit, or a backend that has not issued one yet) we simply
  // send nothing — the server only validates when it set the cookie.
  const method = (requestInit.method ?? "GET").toUpperCase()
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
  /* v17-S2 (D9 §5-ج مسار 1 — «أخطر 10» #2): a network-level rejection
   * (offline / DNS / connection refused) used to bubble the browser's
   * English TypeError («Failed to fetch») straight into ~20 mutation
   * handlers' onError → brandedToast.error(e.message) — the `|| Arabic`
   * fallbacks never ran because the English text is truthy. The wrap
   * converts the rejection into the same Arabic ApiError contract the
   * HTTP-error path already serves, so every caller renders Arabic. */
  let res: Response
  try {
    res = await fetch(url, { ...requestInit, headers, credentials: "include" })
  } catch {
    throw new ApiError(0, { detail: "تعذر الوصول إلى الخادم — تحقق من اتصالك بالإنترنت" })
  }
  // v15-E5 (D4-H3) — see the block comment above for the full contract.
  if (
    res.status === 401 &&
    !skipAuthRedirect &&
    !isLocal401(url) &&
    typeof window !== "undefined" &&
    !onLoginPage()
  ) {
    handleSessionExpired()
  }
  if (!res.ok) {
    const body = await res.json().catch((): null => null)
    throw new ApiError(res.status, body)
  }
  return res
}
