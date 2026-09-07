/**
 * v15-E8 (تصميم D13 §5 + §4.6) — أدوات السباقات:
 *  - doubleClickSubmit: نقر مزدوج حقيقي (dispatch ×2 في نفس التكة) على زر
 *    التقديم مع رصد استجابات POST (عدّ واحد + payment_id واحد) وحالة
 *    الزر (disabled/aria-disabled/«جارٍ الإرسال…») لحظة التقديم.
 *  - concurrentPosts: نداءات POST متزامنة من نفس الصفحة (نفس الجلسة/CSRF)
 *    بـ Promise.all داخل evaluate — سباق API صادق.
 *
 * العقد المقاس (p02/p10/p13): حارس sentRef في الواجهة + _pending_lock
 * في الخلفية → POST واحد + payment_id واحد + لا 500.
 */
import type { Page, Response } from '@playwright/test'

export interface DoubleClickResult {
  /** عدد استجابات POST المطابقة خلال نافذة الرصد */
  posts: number
  /** معرفات الدفعات الفريدة الظاهرة في الاستجابات */
  paymentIds: number[]
  /** الزر disabled/aria-disabled بعد أول نقرة (لحظة التقديم) */
  disabledDuring: boolean
  /** نص الزر لحظة التقديم («جارٍ الإرسال…») */
  labelDuring: string
  statuses: number[]
}

/**
 * نقر مزدوج حقيقي: dispatch click ×2 في نفس التكة (سباق المستخدم
 * العصبي/المهاجم) مع عدّ استجابات urlMatcher خلال settleMs.
 * v15-fix: الزر يُحدَّد بنصه الظاهر (buttonText) — لا بمحدد CSS.
 */
export async function doubleClickSubmit(
  page: Page,
  buttonText: string,
  urlMatcher: (r: Response) => boolean,
  settleMs = 3500
): Promise<DoubleClickResult> {
  const responses: Response[] = []
  const onResp = (r: Response) => {
    if (urlMatcher(r)) responses.push(r)
  }
  page.on('response', onResp)
  try {
    // v15-fix (بطارية 21:47): الاستدعاءات كانت تمرر محددات Playwright
    // ('button:has-text("…")') إلى document.querySelector — ليست CSS صالحة.
    // العقد الجديد: البحث بالنص الظاهر داخل الأزرار (نفس دلالة has-text)
    const probe = await page.evaluate((text: string) => {
      const el = Array.from(document.querySelectorAll('button')).find(
        (b) => (b.textContent || '').trim().includes(text)
      ) as HTMLButtonElement | undefined
      if (!el) throw new Error(`زر غير موجود بنص: ${text}`)
      el.click()
      const during = {
        disabled: Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true',
        label: (el.textContent || '').trim(),
      }
      // النقرة الثانية في نفس التكة — الحارس (sentRef/disabled) يجب أن يبتلعها
      el.click()
      return during
    }, buttonText)
    await page.waitForTimeout(settleMs)
    const bodies = await Promise.all(
      responses.map((r) => r.json().catch(() => null))
    )
    const paymentIds: number[] = []
    for (const b of bodies) {
      const pid = Number((b as any)?.data?.payment_id || 0)
      if (pid > 0) paymentIds.push(pid)
    }
    return {
      posts: responses.length,
      paymentIds,
      disabledDuring: probe.disabled,
      labelDuring: probe.label,
      statuses: responses.map((r) => r.status()),
    }
  } finally {
    page.off('response', onResp)
  }
}

/**
 * نداءات POST متزامنة من داخل الصفحة (نفس الجلسة + CSRF من document.cookie)
 * — سباق API صادق: Promise.all يرسل الطلبات في نفس التكة.
 */
export async function concurrentPosts(
  page: Page,
  path: string,
  payloads: Record<string, unknown>[]
): Promise<{ status: number; body: any }[]> {
  // v15-fix: كوكيز من السياق + URL مطلق (مستند فارغ بعد فشل اختبار سابق
  // كان يمنع document.cookie بـSecurityError — بطارية 21:47)
  const FRONT =
    process.env.V14_SIM_BASE_URL || process.env.SIM_BASE_URL || process.env.SIM_FRONT || 'http://localhost:3200'
  // v15-fix2: ترويسة Cookie محظورة (تُسقط صمتاً) — نؤكد أصل الصفحة
  // ثم credentials:'same-origin' تلحق الكوكيز تلقائيا
  if (!page.url().startsWith(FRONT)) {
    await page.goto(`${FRONT}/`, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {})
  }
  const cookies = await page.context().cookies(FRONT)
  const csrf = (cookies.find((c) => c.name === 'csrf_token') || {}).value || ''
  const url = path.startsWith('http') ? path : `${FRONT}${path}`
  return page.evaluate(
    async ({ url, csrf, payloads }: { url: string; csrf: string; payloads: Record<string, unknown>[] }) => {
      return Promise.all(
        payloads.map((body) =>
          fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
            },
            credentials: 'same-origin',
            body: JSON.stringify(body),
          }).then(async (r) => ({
            status: r.status,
            body: await r.json().catch(() => null),
          }))
        )
      )
    },
    { url, csrf, payloads }
  )
}
