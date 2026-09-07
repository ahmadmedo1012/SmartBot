/**
 * v14-E7 (تصميم D13 §6.2 api) — عميل طلبات يعرف عقد CSRF.
 *
 * حقيقتان من قراءة app/middleware.py تحكمان هذا الملف:
 *  1) التحقق double-submit يسري فقط إذا كان الطلب يحمل كوكي csrf_token —
 *     والقارن hmac.compare_digest(header, cookie) بلا أي حالة على الخادم،
 *     لذا «سكك» العقد خارج المتصفح = توليد القيمة مرتين (كوكي + ترويسة)
 *     بنفس القيمة — نفس فكرة conftest.py _attach_csrf لكن دون جلسة متصفح.
 *  2) حارس origin يرفض POST بـ Origin أجنبي؛ نداءات APIRequestContext بلا
 *     Origin/Referer تمر (نمط journey.spec.ts L112-115 المُثبت عملياً).
 */
import type { APIRequestContext, Page } from '@playwright/test'

/** الواجهة الأمامية (عبر وكيل next) — يضبطها السكربت/البيئة. */
export const FRONT_BASE =
  process.env.V14_SIM_BASE_URL || process.env.SIM_BASE_URL || process.env.SIM_FRONT || 'http://localhost:3200'

/** الخلفية المباشرة (uvicorn) — لأندية webhook/origin التي تتجاوز الوكيل. */
export const API_BASE = process.env.SIM_API || 'http://127.0.0.1:8000'

const ADMIN_USER = process.env.SIM_ADMIN_USER || process.env.E2E_ADMIN_USER || 'v14admin'
const ADMIN_PASS = process.env.SIM_ADMIN_PASS || process.env.E2E_ADMIN_PASS || 'V14Admin#2026'
export { ADMIN_USER, ADMIN_PASS }

/** سر توقيع الجلسة المحلي — يعرفه السكربت فقط في الطبقة المحلية (R9). */
export const SECRET_KEY = process.env.SIM_SECRET_KEY || ''

import crypto from 'node:crypto'

/** توليد قيمة csrf (كوكي + ترويسة بنفس القيمة = double-submit صحيح). */
function mintCsrf(): string {
  return crypto.randomBytes(24).toString('hex')
}

/** استخراج قيمة كوكي من ترويسة set-cookie خام. */
export function cookieFromSetCookie(setCookie: string | string[] | undefined, name: string): string {
  if (!setCookie) return ''
  const lines = Array.isArray(setCookie) ? setCookie : [setCookie]
  for (const line of lines) {
    const m = new RegExp(`${name}=([^;]+)`).exec(line)
    if (m) return m[1]
  }
  return ''
}

/** استخراج توكن الجلسة من استجابة دخول. */
export function tokenFromSetCookie(setCookie: string | string[] | undefined): string {
  return cookieFromSetCookie(setCookie, 'token')
}

export interface ApiResponse<T = unknown> {
  status: number
  ok: boolean
  body: T
  headers: Record<string, string>
}

/** GET عبر APIRequestContext (يحمل jar الخاص به — لا CSRF مطلوب للقراءة). */
export async function apiGet<T = any>(
  request: APIRequestContext,
  path: string,
  opts: { base?: string; headers?: Record<string, string> } = {}
): Promise<ApiResponse<T>> {
  const r = await request.get(`${opts.base || FRONT_BASE}${path}`, { headers: opts.headers })
  return {
    status: r.status(),
    ok: r.ok(),
    body: (await r.json().catch(() => ({}))) as T,
    headers: (r.headers() as unknown as Record<string, string>) || {},
  }
}

export interface PostOpts {
  base?: string
  token?: string
  csrf?: string
  headers?: Record<string, string>
  multipart?: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>
}

/**
 * POST/PUT/DELETE عبر APIRequestContext بعقد CSRF المصكوك:
 * يرفق كوكي token (إن وُجد) + csrf_token المولّد + ترويسة X-CSRF-Token
 * المطابقة — بلا Origin (حارس الorigin يعبر بلا ترويسة).
 */
export async function apiPost<T = any>(
  request: APIRequestContext,
  path: string,
  data?: Record<string, unknown>,
  opts: PostOpts = {},
  method: 'POST' | 'PUT' | 'DELETE' = 'POST'
): Promise<ApiResponse<T>> {
  const csrf = opts.csrf || mintCsrf()
  const cookieParts = [`csrf_token=${csrf}`]
  if (opts.token) cookieParts.push(`token=${opts.token}`)
  const headers: Record<string, string> = {
    cookie: cookieParts.join('; '),
    'x-csrf-token': csrf,
    ...(data !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(opts.headers || {}),
  }
  const payload = opts.multipart
    ? { multipart: opts.multipart }
    : data !== undefined
      ? { data }
      : {}
  const r = await request.fetch(`${opts.base || FRONT_BASE}${path}`, {
    method,
    headers,
    ...payload,
  })
  return {
    status: r.status(),
    ok: r.ok(),
    body: (await r.json().catch(() => ({}))) as T,
    headers: (r.headers() as unknown as Record<string, string>) || {},
  }
}

/**
 * POST من داخل صفحة المتصفح نفسها (raw fetch) — العقد الكامل كما يرسله
 * التطبيق فعلاً: كوكيز المتصفح (token + csrf_token) + Origin حقيقي +
 * ترويسة X-CSRF-Token مُصدّاة من document.cookie (نفس apiFetch).
 * استخدمها لفحوص CSRF (بلا/بترويسة زائفة عبر opts.csrfOverride) ولنداءات
 * الموجودات التي يجب أن تمر بالبروكسي مثل الإنتاج.
 */
export async function browserFetch<T = any>(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown; csrfOverride?: string; headers?: Record<string, string> } = {}
): Promise<{ status: number; ok: boolean; body: T }> {
  const res = await page.evaluate(
    async ({ path, init }) => {
      const csrf =
        init.csrfOverride !== undefined
          ? init.csrfOverride
          : (document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/) || [])[1] || ''
      const headers: Record<string, string> = { ...(init.headers || {}) }
      if (csrf) headers['X-CSRF-Token'] = csrf
      if (init.body !== undefined && !(init.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json'
      }
      const r = await fetch(path, {
        method: init.method || 'GET',
        headers,
        credentials: 'same-origin',
        body:
          init.body === undefined
            ? undefined
            : init.body instanceof FormData
              ? init.body
              : JSON.stringify(init.body),
      })
      let body: unknown = null
      const text = await r.text()
      try {
        body = JSON.parse(text)
      } catch {
        body = { raw: text.slice(0, 400) }
      }
      return { status: r.status, ok: r.ok, body: body as T }
    },
    { path, init: init as any }
  )
  return res
}

/** عقد ok(): success:true + data — يؤكد شكل المظروف لا قيمته. */
export function expectEnvelope(body: any): void {
  if (!body || body.success !== true || !('data' in body)) {
    throw new Error(`المظروف ليس ok(): ${JSON.stringify(body).slice(0, 220)}`)
  }
}

/**
 * حارس حدود المعدل (§4.5): أي 429 غير متوقع يُعاد المحاولة مرة واحدة
 * بعد 61 ثانية مع تحذير مسجل (وليس فشلاً).
 */
export async function withRateGuard<T>(
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn()
  } catch (e: any) {
    const is429 = typeof e?.status === 'number' ? e.status === 429 : String(e?.message || e).includes('429')
    if (!is429) throw e
    console.warn('  [rate-guard] 429 — إعادة محاولة واحدة بعد 61 ثانية (§4.5)')
    await new Promise((r) => setTimeout(r, 61_000))
    return await fn()
  }
}
