/**
 * اختبارات عميل API الموحد — عقد الـ envelope نفسه المعتمد في الويب.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, NetworkError, apiFetch, setAuthToken, setUnauthorizedHandler } from './api'

const BASE = 'https://api.smart-link.ly'

function mockFetchOnce(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn().mockResolvedValue(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    }),
  )
}

let calls: unknown[][] = []

beforeEach(() => {
  setAuthToken(null)
  setUnauthorizedHandler(null)
  globalThis.fetch = vi.fn((...args: unknown[]) => {
    calls.push(args)
    return Promise.resolve(
      new Response(JSON.stringify({ success: true, data: { ok: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  }) as unknown as typeof fetch
})

afterEach(() => {
  calls = []
})

describe('envelope unwrapping (عقد الويب)', () => {
  it('يفك {success:true,data} ويعيد data', async () => {
    globalThis.fetch = mockFetchOnce(200, { success: true, data: { items: [1, 2] } }) as unknown as typeof fetch
    const data = await apiFetch<{ items: number[] }>('/api/x')
    expect(data).toEqual({ items: [1, 2] })
  })

  it('يرمي ApiError عند success:false (رسالة error العربية أولًا)', async () => {
    globalThis.fetch = mockFetchOnce(200, { success: false, error: 'رسالة خطأ عربية' }) as unknown as typeof fetch
    await expect(apiFetch('/api/x')).rejects.toSatisfy((e: unknown) => {
      const err = e as ApiError
      return err instanceof ApiError && err.message === 'رسالة خطأ عربية'
    })
  })

  it('يرمي ApiError مع detail عند HTTP error (نمط FastAPI)', async () => {
    globalThis.fetch = mockFetchOnce(409, { detail: 'البريد الإلكتروني مسجل مسبقاً' }) as unknown as typeof fetch
    await expect(apiFetch('/api/x')).rejects.toSatisfy((e: unknown) => {
      const err = e as ApiError
      return err.status === 409 && err.message === 'البريد الإلكتروني مسجل مسبقاً'
    })
  })

  it('يبقى الجسم غير المغلف كما هو (byte-stream نادر)', async () => {
    globalThis.fetch = mockFetchOnce(200, { plain: 'x' }) as unknown as typeof fetch
    const data = await apiFetch<{ plain: string }>('/api/x')
    expect(data).toEqual({ plain: 'x' })
  })
})

describe('auth transport', () => {
  it('يرسل Authorization: Bearer عند وجود التوكن', async () => {
    setAuthToken('jwt-token-123')
    await apiFetch('/api/me')
    const [url, init] = calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/me`)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-token-123')
  })

  it('لا يرسل Authorization بدون توكن', async () => {
    await apiFetch('/api/plans')
    const [, init] = calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })
})

describe('401 مركزي', () => {
  it('يستدعي معالج الخروج عند 401 (مرة واحدة خلال نافذة الإزالة)', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    globalThis.fetch = mockFetchOnce(401, { detail: 'انتهت صلاحية الجلسة' }) as unknown as typeof fetch
    await expect(apiFetch('/api/dashboard/bundle')).rejects.toBeInstanceOf(ApiError)
    await expect(apiFetch('/api/logs')).rejects.toBeInstanceOf(ApiError)
    // طلبان 401 خلال <10s → معالج واحد فقط (نفس إزالة ازدواج الويب)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('401 على /api/auth/token محلي — لا يستدعي المعالج (بيانات خاطئة ليست انتهاء جلسة)', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    globalThis.fetch = mockFetchOnce(401, { detail: 'بيانات تسجيل الدخول غير صحيحة' }) as unknown as typeof fetch
    await expect(apiFetch('/api/auth/token', { method: 'POST', skipAuthRedirect: true })).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('form transport (endpoints بـ Form(...))', () => {
  it('يرسل application/x-www-form-urlencoded مع ترميز صحيح', async () => {
    await apiFetch('/api/inbox/conversations/123/reply', {
      method: 'POST',
      form: { message: 'مرحبا بالعالم 100%' },
    })
    const [url, init] = calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/inbox/conversations/123/reply`)
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(init.body).toBe(`message=${encodeURIComponent('مرحبا بالعالم 100%')}`)
  })
})

describe('network failures', () => {
  it('يرمي NetworkError عند انقطاع الشبكة', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch
    await expect(apiFetch('/api/x', { timeoutMs: 1000 })).rejects.toBeInstanceOf(NetworkError)
  })

  it('يعيد المحاولة على GET (محاولتان + فشل)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    await expect(apiFetch('/api/x', { timeoutMs: 500 })).rejects.toBeInstanceOf(NetworkError)
    expect(fetchMock).toHaveBeenCalledTimes(3) // GET_RETRIES=2 → 3 محاولات
  })
})

describe('JSON body', () => {
  it('يرسل JSON مع Content-Type الصحيح', async () => {
    await apiFetch('/api/login', { method: 'POST', body: { username: 'a', password: 'b' }, skipAuthRedirect: true })
    const [, init] = calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ username: 'a', password: 'b' }))
  })
})
