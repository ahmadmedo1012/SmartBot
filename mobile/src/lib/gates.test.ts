/**
 * P42-5a — عقود عائلة الـ403 الصادقة على الجوال (GAP-X1 + GAP-BOT-1).
 *
 * التوأم الجوّالي لعقدي الويب:
 *   - fb_dashboard/frontend/src/test/AnalyticsPlanLock.test.ts (P21-W5-C1)
 *   - fb_dashboard/frontend/src/test/TenantSuspended.test.ts (W2-BOT-4)
 *
 * نثبّت العقد من الجهتين:
 *   - كل رسائل عائلة بوابات الخطة (تنتهي حصرًا بـ«رقِّ خطتك») تُقرّ قفلًا
 *     → PremiumLock بنص الخادم الحرفي.
 *   - رسالة إيقاف المنظمة (auth.py:115) تُقرّ إيقافًا → الحالة الكاملة
 *     الصادقة عبر المعالج المركزي، وتُرفض كقفل خطة (وليس العكس).
 *   - كل 403 خارج العائلتين (صلاحيات، مسؤول منصة) وغير-403 يبقى خطأً
 *     حقيقيًا بإعادة محاولة صادقة.
 *
 * (الرسائل منسوخة حرفيًا من مصدر الحقيقة الخادمي — _plan_gates.py
 * GATE_MESSAGES + broadcast_engine.py BROADCAST_PLAN_REQUIRED_MSG بعد
 * انضمامه للحرف العائلي في W2-BOT-5 + sequences.py + rules.py + auth.py:115.
 * حدّث هذا الملف إذا تغيّرت العائلة.)
 *
 * عقود البث المركزي (توأم عقد 401 في api.test.ts): أول 403 إيقاف من أي
 * نداء يرفع المعالج؛ بوابة الخطة لا تمر عبره (قفلها عرضٌ لكل سطح في
 * شاشته)؛ 401 لا يمر عبره (رحلة الخروج العالمية).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, setAuthToken, setSuspendedHandler, setUnauthorizedHandler } from '@/services/api'
import { isPlanLocked, isTenantSuspended, planLockedMessage, GATE_FAMILY_SUFFIX } from '@/lib/gates'

/** GATE_MESSAGES — حرفيًا من fb_dashboard/_plan_gates.py (العائلة الخمس). */
const GATE_FAMILY = [
  'جدولة المنشورات متاحة في خطة مميز أو أعلى — رقِّ خطتك',
  'تقارير PDF متاحة في خطة أساسي أو أعلى — رقِّ خطتك',
  'العروض الترويجية متاحة في خطة مميز أو أعلى — رقِّ خطتك',
  'التحليلات المتقدمة متاحة في خطة مميز أو أعلى — رقِّ خطتك',
  'التدفقات متاحة في خطة مميز أو أعلى — رقِّ خطتك',
]

/** البوابتان اللتان ضربهما انتشار W2-BOT-5 (commit 3ce58c3) — حرفيًا. */
const ROLLOUT_GATES = [
  // broadcast_engine.py:50 (انضمت للعائلة في W2-BOT-5)
  'ميزة البث الجماعي متاحة في خطة مميز أو أعلى — رقِّ خطتك',
  // sequences.py:41 (سابقة v22-D4 للتسلسلات)
  'الحملات التسلسلية متاحة في خطة احترافي أو أعلى — رقِّ خطتك',
]

/** حد القواعد (rules.py:19) — نفس اللاحقة العائلية. */
const RULES_LIMIT_MSG = 'حد قواعد الرد لخطتك هو 25 — رقِّ خطتك'

/** auth.py:115 — رسالة الإيقاف الحرفية. */
const SUSPENDED_MSG = 'حساب المنظمة موقوف أو محذوف — تواصل مع الدعم'

describe('isPlanLocked — عائلة بوابات الخطة (GAP-X1 · توأم P21-W5-C1)', () => {
  it.each(GATE_FAMILY)('رسالة البوابة «%s» تُقرّ قفلًا', (message) => {
    expect(isPlanLocked(new ApiError(403, { detail: message }))).toBe(true)
  })

  it.each(ROLLOUT_GATES)('بوابة الانتشار «%s» تُقرّ قفلًا (عائلة 3ce58c3)', (message) => {
    expect(isPlanLocked(new ApiError(403, { detail: message }))).toBe(true)
  })

  it('حد القواعد (rules.py) ينتهي باللاحقة العائلية فيُقرّ قفلًا', () => {
    expect(isPlanLocked(new ApiError(403, { detail: RULES_LIMIT_MSG }))).toBe(true)
  })

  it('إيقاف المنظمة (auth.py:115) ليس قفل خطة — رسالة الإيقاف يجب أن تبقى رحلتها الخاصة', () => {
    expect(isPlanLocked(new ApiError(403, { detail: SUSPENDED_MSG }))).toBe(false)
  })

  it('«صلاحيات غير كافية» (auth.py) ليست قفل خطة', () => {
    expect(isPlanLocked(new ApiError(403, { detail: 'صلاحيات غير كافية' }))).toBe(false)
  })

  it('403 بلا detail عربي (fallback البنية) ليس قفل خطة', () => {
    expect(isPlanLocked(new ApiError(403, { error: 'forbidden' }))).toBe(false)
  })

  it('رسالة بوابة بلا اللاحقة العائلية لا تُقبل (حماية من التساهل)', () => {
    expect(isPlanLocked(new ApiError(403, { detail: 'متاحة في خطة أعلى' }))).toBe(false)
    // الصياغة القديمة قبل انضمامها للعائلة (W2-BOT-5) — كانت غير مرئية
    // للمصنّف بالتصميم؛ يجب أن تبقى كذلك حتى لا يُبتلع خطأ عام كقفل.
    expect(isPlanLocked(new ApiError(403, { detail: 'ميزة البث الجماعي غير متاحة في باقتك الحالية — قم بالترقية لاستخدامها' }))).toBe(false)
  })

  it('500 وخطأ الشبكة وأي قيمة غير ApiError ليست قفل خطة', () => {
    expect(isPlanLocked(new ApiError(500, { detail: 'خطأ خادم' }))).toBe(false)
    expect(isPlanLocked(new TypeError('fetch failed'))).toBe(false)
    expect(isPlanLocked(undefined)).toBe(false)
    expect(isPlanLocked(null)).toBe(false)
  })

  it('planLockedMessage يعيد نص الخادم الحرفي للبوابة وnull لغيرها', () => {
    expect(planLockedMessage(new ApiError(403, { detail: GATE_FAMILY[0] }))).toBe(GATE_FAMILY[0])
    expect(planLockedMessage(new ApiError(403, { detail: SUSPENDED_MSG }))).toBeNull()
    expect(planLockedMessage(new Error('x'))).toBeNull()
  })

  it('لاحقة العائلة نفسها لا تنحرف عن عقد «رقِّ خطتك»', () => {
    expect(GATE_FAMILY_SUFFIX).toBe('رقِّ خطتك')
  })
})

describe('isTenantSuspended — عائلة الـ403 تنفصل نظيفًا (GAP-BOT-1 · توأم W2-BOT-4)', () => {
  it('رسالة الإيقاف الحرفية (auth.py:115) → true', () => {
    expect(isTenantSuspended(new ApiError(403, { detail: SUSPENDED_MSG }))).toBe(true)
  })

  it('بوابة الخطة (تنتهي بـ«رقِّ خطتك») → false — لها رحلتها الخاصة', () => {
    expect(isTenantSuspended(new ApiError(403, { detail: GATE_FAMILY[0] }))).toBe(false)
    expect(isTenantSuspended(new ApiError(403, { detail: 'هذه الميزة تتطلب باقة أعلى — رقِّ خطتك' }))).toBe(false)
  })

  it('صلاحيات غير كافية → false', () => {
    expect(isTenantSuspended(new ApiError(403, { detail: 'صلاحيات غير كافية' }))).toBe(false)
  })

  it('مسؤول المنصة فقط → false', () => {
    expect(isTenantSuspended(new ApiError(403, { detail: 'هذه العملية تتطلب صلاحيات مسؤول المنصة' }))).toBe(false)
  })

  it('401 انتهاء الجلسة → false (رحلة الخروج العالمية، لا الإيقاف)', () => {
    expect(isTenantSuspended(new ApiError(401, { detail: 'انتهت الجلسة' }))).toBe(false)
  })

  it('رسالة الإيقاف بحالة غير 403 → false (لا نُخمّن الإيقاف من نص فقط)', () => {
    expect(isTenantSuspended(new ApiError(500, { detail: SUSPENDED_MSG }))).toBe(false)
  })

  it('خطأ شبكة/خادم عام → false', () => {
    expect(isTenantSuspended(new ApiError(503, { detail: 'تعذر الاتصال' }))).toBe(false)
    expect(isTenantSuspended(new Error('network'))).toBe(false)
    expect(isTenantSuspended(null)).toBe(false)
  })
})

/* ── عقود البث المركزي للإيقاف (services/api.ts) — توأم عقد الـ401 ────── */

function mockFetchOnce(status: number, body: unknown): typeof fetch {
  /* مصنع استجابة جديد لكل نداء — جسم Response يُستهلك مرة واحدة،
   * فإعادة الاستجابة ذاتها لنداءين متتاليين ترمي Body is unusable. */
  return vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch
}

describe('apiFetch — 403 الإيقاف يرفع المعالج المركزي (GAP-BOT-1)', () => {
  beforeEach(() => {
    setAuthToken(null)
    setUnauthorizedHandler(null)
    setSuspendedHandler(null)
  })

  afterEach(() => {
    setSuspendedHandler(null)
  })

  it('أول 403 برسالة الإيقاف الحرفية (auth.py:115) يستدعي المعالج', async () => {
    const handler = vi.fn()
    setSuspendedHandler(handler)
    globalThis.fetch = mockFetchOnce(403, { detail: SUSPENDED_MSG })
    await expect(apiFetch('/api/analytics/overview')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('النداءات المتزامنة المتعددة ترفع المعالج بلا رمي (الإعداد idempotent)', async () => {
    const handler = vi.fn()
    setSuspendedHandler(handler)
    globalThis.fetch = mockFetchOnce(403, { detail: SUSPENDED_MSG })
    await expect(apiFetch('/api/logs')).rejects.toBeInstanceOf(ApiError)
    await expect(apiFetch('/api/team/members')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('بوابة الخطة (تنتهي بـ«رقِّ خطتك») لا تمر عبر المعالج — قفلها عرضٌ لكل سطح', async () => {
    const handler = vi.fn()
    setSuspendedHandler(handler)
    globalThis.fetch = mockFetchOnce(403, { detail: GATE_FAMILY[0] })
    await expect(apiFetch('/api/scheduled-posts', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('بوابة البث (BROADCAST_PLAN_REQUIRED_MSG) لا تمر عبر المعالج', async () => {
    const handler = vi.fn()
    setSuspendedHandler(handler)
    globalThis.fetch = mockFetchOnce(403, { detail: ROLLOUT_GATES[0] })
    await expect(apiFetch('/api/broadcasts', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('401 انتهاء الجلسة لا يمر عبر معالج الإيقاف (رحلة الخروج العالمية)', async () => {
    const handler = vi.fn()
    setSuspendedHandler(handler)
    globalThis.fetch = mockFetchOnce(401, { detail: 'انتهت صلاحية الجلسة' })
    await expect(apiFetch('/api/me')).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('403 صلاحيات عادية لا يرفع الإيقاف', async () => {
    const handler = vi.fn()
    setSuspendedHandler(handler)
    globalThis.fetch = mockFetchOnce(403, { detail: 'صلاحيات غير كافية' })
    await expect(apiFetch('/api/team/members')).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('بلا معالج مسجّل لا يرمي البث شيئًا (شبكة أمان مثل الـ401)', async () => {
    globalThis.fetch = mockFetchOnce(403, { detail: SUSPENDED_MSG })
    await expect(apiFetch('/api/me')).rejects.toBeInstanceOf(ApiError)
  })
})
