/**
 * v14-E7 (تصميم D13 §6.2 net) — سياق الشخصية (HAR لكل شخصية) + مراقبة
 * console بنفس مسامحات smartbot-e2e.spec.ts + محاكاة 3G عبر CDP.
 * v15-E8 (تصميم D13 §5) — offline/online + slow3g أشد (400kbps/600ms).
 */
import type { Browser, BrowserContext, Page } from '@playwright/test'

import { harPath } from './shots'

export interface PersonaContextOpts {
  viewport?: { width: number; height: number }
  locale?: string
  timezoneId?: string
  recordHar?: boolean
}

/**
 * سياق جديد لكل شخصية مع أثر شبكة كامل (HAR minimal) في
 * e2e_artifacts/sim/<RUN>/<persona>/<persona>.har — يُكتب عند إغلاق السياق.
 */
export async function createPersonaContext(
  browser: Browser,
  persona: string,
  opts: PersonaContextOpts = {}
): Promise<BrowserContext> {
  return browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 800 },
    locale: opts.locale || 'ar-LY',
    timezoneId: opts.timezoneId || 'Africa/Tripoli',
    ...(opts.recordHar === false ? {} : { recordHar: { path: harPath(persona), mode: 'minimal' } }),
  })
}

/** حاوية أخطاء console الحقيقية (المسامحات نفسها القائمة — عقود مصممة). */
export interface ConsoleBucket {
  errors: string[]
  pageErrors: string[]
  add(page: Page): void
  /** الأخطاء الحقيقية بعد فلترة المسامحات (401/400/404/favicon/ML-). */
  real(): string[]
}

export function watchConsole(page: Page): ConsoleBucket {
  const bucket: ConsoleBucket = {
    errors: [],
    pageErrors: [],
    add(p: Page) {
      p.on('console', (msg) => {
        if (msg.type() === 'error') bucket.errors.push(msg.text())
      })
      p.on('pageerror', (err) => bucket.pageErrors.push(`PAGE ERROR: ${err.message}`))
    },
    real() {
      // المسامحات — كل واحدة عقد مصمم لا انهيار (شرح smartbot-e2e.spec.ts):
      // 401/400/404: مسارات محروسة/إعداد ناقص تُستهلك بحالة designed
      // favicon/ML-: ضجيج بارد
      const tolerated = (e: string) =>
        e.includes('401') || e.includes('404') || e.includes('400') || e.includes('favicon') || e.includes('ML-') ||
        // v14: @vercel/speed-insights محلياً يُخدم بنوع text/plain (404→SPA catch) — ضجيج بارد محلي فقط
        e.includes('_vercel/speed-insights')
      return [...bucket.errors, ...bucket.pageErrors].filter((e) => !tolerated(e))
    },
  }
  bucket.add(page)
  return bucket
}

/**
 * خنق الشبكة 3G (تصميم P01): CDP Network.emulateNetworkConditions —
 * latency 400ms، تنزيل 400Kbps، رفع 120Kbps (مقابل CDP يُطبَّق على
 * الصفحة داخل سياق Chrome).
 */
export async function emulate3g(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable').catch(() => {})
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: 400 * 1024,
    uploadThroughput: 120 * 1024,
  })
}

/** قياس domContentLoadedEventEnd لآخر تنقل (ميزان P01-15). */
export async function dclMs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return nav ? Math.round(nav.domContentLoadedEventEnd) : -1
  })
}

// ── v15-E8 (تصميم D13 §5): خطوات النوع الجديد ──────────────────────────

/**
 * انقطاع/عودة الشبكة لجهاز (سياق) — خطوة offline→online (p09-t7/8):
 * context.setOffline يعمل عبر CDP على كل صفحات السياق؛ القناة التي
 * التقطت الرسالة الجديدة بعد العودة (poll 5s للواجهة أو تنقل جديد)
 * تُوثَّق كادعاء وصفي عند المستدعي.
 */
export async function setOfflineOnline(context: BrowserContext, offline: boolean): Promise<void> {
  await context.setOffline(offline)
}

/**
 * v15-E8 (§5): 3G أشد لمتصفح عربي حقيقي (p11-t3) — 600ms مهلة كل اتجاه
 * و400kbps تنزيلاً (مقابل 400ms الأصلية) + FCP عبر performance entries.
 */
export async function slow3g(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable').catch(() => {})
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 600,
    downloadThroughput: 400 * 1024,
    uploadThroughput: 120 * 1024,
  })
}

/** أول paint محتوى (FCP) بالميلي ثانية لآخر تنقل — ميزان p11-t3. */
export async function fcpMs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const paints = performance.getEntriesByType('paint')
    const fcp = paints.find((p) => p.name === 'first-contentful-paint') as
      | PerformancePaintTiming
      | undefined
    return fcp ? Math.round(fcp.startTime) : -1
  })
}
