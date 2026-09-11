/**
 * SmartBot Mobile — عميل API الموحد.
 *
 * نفس عقد الويب (src/lib/api.ts + csrf-client.ts) منقولًا إلى React Native:
 *  - كل الردود داخل envelope {success, data, error?} — فك مركزي واحد.
 *  - Bearer JWT في Authorization (طبقة CSRF تتجاوز حاملي Authorization
 *    بتصميمها — v12-E3.3).
 *  - 401 مركزي: حدث واحد → AuthProvider يسجل الخروج ويعيد إلى login
 *    (نفس دلالات الويب: لا redirect loops — إزالة ازدواج 10 ثوانٍ).
 *  - مهلة 20 ثانية + إعادة محاولة GET فقط (آمنة).
 */
import { API_BASE_URL, REQUEST_TIMEOUT_MS, GET_RETRIES } from '@/constants/config'

/** خطأ API موحد — يحمل رسالة الباكند العربية أولًا (نفس csrf-client.ts). */
export class ApiError extends Error {
  status: number
  body: unknown
  isAuthError: boolean

  constructor(status: number, body: unknown) {
    const b = body as Record<string, unknown> | null
    const detail = b?.detail ?? b?.error
    super(typeof detail === 'string' && detail ? detail : `فشل الطلب (${status})`)
    this.status = status
    this.body = body
    this.isAuthError = status === 401
  }
}

/** خطأ شبكة (انقطاع/مهلة) — قابل للإعادة. */
export class NetworkError extends Error {
  constructor(message = 'تعذر الاتصال بالخادم — تحقق من الإنترنت') {
    super(message)
  }
}

// ── 401 المركزي: مستمع واحد لا حلقات ────────────────────────────────────
type UnauthHandler = () => void
let _unauthHandler: UnauthHandler | null = null
let _lastUnauthAt = 0
const UNAUTH_DEDUPE_MS = 10_000

/** يستدعيه AuthProvider — مرة واحدة عند الإقلاع. */
export function setUnauthorizedHandler(handler: UnauthHandler | null) {
  _unauthHandler = handler
}

/** Endpoints الـ401 فيها معنى محلي (بيانات دخول خاطئة) — ليست انتهاء جلسة. */
const LOCAL_401_PREFIXES = ['/api/auth/token', '/api/login', '/api/register', '/api/auth/change-password']

function isLocal401(path: string): boolean {
  return LOCAL_401_PREFIXES.some((p) => path.startsWith(p))
}

function emitUnauthorized(path: string) {
  if (isLocal401(path)) return
  const now = Date.now()
  if (now - _lastUnauthAt < UNAUTH_DEDUPE_MS) return
  _lastUnauthAt = now
  _unauthHandler?.()
}

// ── حامل التوكن (يضبطه AuthProvider — SecureStore) ─────────────────────
let _token: string | null = null
export function setAuthToken(token: string | null) {
  _token = token
}
export function getAuthToken(): string | null {
  return _token
}

// ── فك الـ envelope (نفس unwrapBody في الويب) ──────────────────────────
function unwrapBody<T>(body: unknown): T {
  if (body !== null && typeof body === 'object' && 'success' in (body as Record<string, unknown>)) {
    const envelope = body as { success: boolean; data?: unknown; error?: string }
    if (!envelope.success) {
      throw new ApiError(200, envelope)
    }
    return envelope.data as T
  }
  return body as T
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** جسم form-urlencoded (endpoints تعلن Form(...) — مثل ردود inbox/comments) */
  form?: Record<string, string>
  /** تجاهل منطق 401 المركزي (شاشة login تستخدمه) */
  skipAuthRedirect?: boolean
  /** إرسال بدون توكن حتى لو كان موجودًا (طلبات عامة) */
  anonymous?: boolean
  timeoutMs?: number
}

async function requestOnce(path: string, opts: ApiOptions): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? REQUEST_TIMEOUT_MS)
  try {
    const headers: Record<string, string> = {}
    if (opts.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
    } else {
      headers['Content-Type'] = 'application/json'
    }
    if (!opts.anonymous && _token) headers.Authorization = `Bearer ${_token}`
    let body: string | undefined
    if (opts.form) {
      body = Object.entries(opts.form)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    } else if (opts.body !== undefined) {
      body = JSON.stringify(opts.body)
    }
    return await fetch(`${API_BASE_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

/** الطلب الموحد — يفك الـ envelope ويرمي ApiError/NetworkError. */
export async function apiFetch<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const isGet = (opts.method ?? 'GET') === 'GET'
  const attempts = isGet ? GET_RETRIES + 1 : 1
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt++) {
    let res: Response
    try {
      res = await requestOnce(path, opts)
    } catch (e) {
      lastError = e
      // مهلة/انقطاع — أعد المحاولة على GET فقط مع تراجع متدرج
      if (isGet && attempt < attempts - 1) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
        continue
      }
      throw new NetworkError()
    }

    if (res.status === 401) {
      if (!opts.skipAuthRedirect) emitUnauthorized(path)
      let body: unknown = null
      try {
        body = await res.json()
      } catch {
        /* body غير JSON */
      }
      throw new ApiError(401, body)
    }

    const text = await res.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      /* رد غير JSON (نادر — byte-stream) */
    }

    if (!res.ok) {
      throw new ApiError(res.status, body ?? text)
    }
    return unwrapBody<T>(body)
  }
  throw lastError instanceof Error ? lastError : new NetworkError()
}

/** Sugar للقراءة. */
export function apiGet<T = unknown>(path: string, opts: Omit<ApiOptions, 'method' | 'body'> = {}) {
  return apiFetch<T>(path, { ...opts, method: 'GET' })
}

/** Sugar للكتابة. */
export function apiPost<T = unknown>(path: string, body?: unknown, opts: Omit<ApiOptions, 'method' | 'body'> = {}) {
  return apiFetch<T>(path, { ...opts, method: 'POST', body })
}

export function apiPut<T = unknown>(path: string, body?: unknown, opts: Omit<ApiOptions, 'method' | 'body'> = {}) {
  return apiFetch<T>(path, { ...opts, method: 'PUT', body })
}

export function apiPatch<T = unknown>(path: string, body?: unknown, opts: Omit<ApiOptions, 'method' | 'body'> = {}) {
  return apiFetch<T>(path, { ...opts, method: 'PATCH', body })
}

export function apiDelete<T = unknown>(path: string, opts: Omit<ApiOptions, 'method' | 'body'> = {}) {
  return apiFetch<T>(path, { ...opts, method: 'DELETE' })
}

/** كتابة بجسم form-urlencoded (endpoints بـ Form(...)). */
export function apiPostForm<T = unknown>(path: string, form: Record<string, string>, opts: Omit<ApiOptions, 'method' | 'body' | 'form'> = {}) {
  return apiFetch<T>(path, { ...opts, method: 'POST', form })
}
