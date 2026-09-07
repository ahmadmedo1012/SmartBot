import { test, expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

/**
 * v14-E7 (تصميم D13 §3 P01) — «سالم» زائر ليبي موبايل 3G.
 *
 * موبايل Android 375×812، locale ar-LY، timezone Africa/Tripoli، شبكة 3G
 * محاكاة (CDP Network.emulateNetworkConditions: latency 400ms / تنزيل
 * 400Kbps). غير مسجل الدخول إطلاقاً — «يُعجن» الهبوط والتسعير فقط.
 *
 * أدلة: e2e_artifacts/sim/<RUN>/p01/01-step-*.png + HAR + سطور في
 * sim-claims.json (ميزان DCL).
 */
import { createPersonaContext, watchConsole, emulate3g, dclMs } from './sim/helpers/net'
import { shot } from './sim/helpers/shots'
import { recordClaim } from './sim/helpers/db-claims.mjs'

const P = 'p01'
const MOBILE = { width: 375, height: 812 }

let page: Page
let consoleBucket: ReturnType<typeof watchConsole>

test.describe('P01 — زائر ليبي موبايل 3G', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctx = await createPersonaContext(browser, P, { viewport: MOBILE })
    page = await ctx.newPage()
    consoleBucket = watchConsole(page)
  })

  test.afterAll(async () => {
    await page.context().close().catch(() => {})
  })

  test('1-4. الهبوط يُحمَّل على 3G بلا أخطاء، RTL، وخط عربي، والعجن يمر', async () => {
    await emulate3g(page)
    const resp = await page.goto('/', { waitUntil: 'load', timeout: 60_000 })
    expect(resp?.status(), 'صفحة الهبوط 200 على 3G').toBe(200)
    await shot(page, P, '01-step-01-landing-3g')

    // الخطوة 2 — RTL (layout.tsx:57 lang="ar" dir="rtl")
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')

    // الخطوة 3 — خط عربي محمّل (Readex Pro عناوين / Cairo متن — fonts.css)
    await page.evaluate(() => document.fonts.ready)
    const fonts = await page.evaluate(() => ({
      readex: document.fonts.check('16px "Readex Pro"', 'أ'),
      readexLatin: document.fonts.check('16px "Readex Pro"'),
      cairo: document.fonts.check('16px "Cairo"', 'أ'),
    }))
    expect(
      fonts.readex || fonts.cairo,
      `خط عربي محمّل فعلياً: ${JSON.stringify(fonts)}`
    ).toBeTruthy()
    await shot(page, P, '01-step-03-fonts')

    // الخطوة 4 — عجن: تمرير بطيء 5×600px ثم فحص أخطاء console الحقيقية
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 600)
      await page.waitForTimeout(350)
    }
    await page.waitForTimeout(600)
    const realErrors = consoleBucket.real()
    expect(
      realErrors,
      `أخطاء console حقيقية (بعد المسامحات 401/400/404/favicon/ML-): ${JSON.stringify(realErrors.slice(0, 3))}`
    ).toHaveLength(0)
  })

  test('5. الإحصاءات العامة حية على الهبوط', async () => {
    // StatsSection (dynamic) يطلق /api/public/stats — نستمع قبل التنقل
    const statsP = page
      .waitForResponse((r) => r.url().includes('/api/public/stats'), { timeout: 25_000 })
      .catch(() => null)
    await page.goto('/', { waitUntil: 'load', timeout: 60_000 })
    const stats = await statsP
    expect(stats, 'طلب الإحصاءات العامة وصل').toBeTruthy()
    expect(stats!.status(), 'إحصاءات عامة 200').toBe(200)
    const body = await stats!.json().catch(() => null)
    expect(body?.success, 'مظروف ok() للإحصاءات').toBe(true)
    await page.mouse.wheel(0, 1200)
    await page.waitForTimeout(800)
    await shot(page, P, '01-step-05-stats')
  })

  test('6-8. CTA البطل → التسعير → العملة الليبية', async () => {
    // الخطوة 6 — CTA «ابدأ الآن» (page.tsx:154 → /subscribe)
    await page.goto('/', { waitUntil: 'load', timeout: 60_000 })
    const cta = page.locator('main a[href="/subscribe"]').first()  // v14: CTA البطل — مرئي على الموبايل
    await expect(cta).toBeVisible()
    const href = (await cta.getAttribute('href')) || ''
    await shot(page, P, '01-step-06-cta')
    expect(href, `CTA يقود للقمع: ${href}`).toMatch(/\/(subscribe|register|pricing)/)

    // الخطوة 7 — صفحة التسعير + 3 بطاقات + علامة الأكثر شعبية
    const pricingResp = await page.goto('/pricing', { waitUntil: 'load', timeout: 60_000 })
    expect(pricingResp?.status()).toBe(200)
    await page.waitForTimeout(1500)
    const planCards = page.locator('[class*="rounded"][class*="border"], article, [data-plan]')
    const bodyText = await page.locator('body').innerText()
    expect(
      (bodyText.match(/د\.ل|دينار/g) || []).length,
      'أسعار بالدينار الليبي على التسعير'
    ).toBeGreaterThan(2)
    expect(bodyText, 'علامة الخطة الأكثر شعبية').toContain('الأكثر')
    expect(await planCards.count(), 'بطاقات خطط معروضة').toBeGreaterThan(2)
    await shot(page, P, '01-step-07-pricing')

    // الخطوة 8 — عملة/لغة مؤكدة ضمن الأدلة أعلاه (د.ل موجودة)
    expect((await page.locator('body').innerText()).includes('د.ل')).toBeTruthy()
  })

  test('9. الوضع الداكن يعمل', async () => {
    // v14-fix: /pricing بلا Header (لا ThemeToggle) — المفتاح موجود في /login
    await page.goto('/login', { waitUntil: 'load', timeout: 60_000 })
    await page.waitForTimeout(800)
    // مفتاح السمة في الرأس (ThemeToggle.tsx — aria-label عربي)
    const toggle = page.locator('button[aria-label="الوضع الليلي"], button[aria-label="الوضع النهاري"]').first()
    await expect(toggle, 'زر تبديل السمة موجود').toBeVisible({ timeout: 10_000 })
    // v14-fix: defaultTheme="dark" — التطبيق يبدأ داكناً؛ العقد الأمين: القلب
    // فعلي بين الحالتين ثم العودة (لا افتراض حالة بداية)
    const before = await page.evaluate(() => document.documentElement.className)
    await toggle.click()
    await page.waitForTimeout(700)
    const after = await page.evaluate(() => document.documentElement.className)
    expect(after !== before, `السمة انقلبت: «${before}» → «${after}»`).toBeTruthy()
    expect([before, after].sort().join('')).toContain('dark')
    await shot(page, P, '01-step-09-dark')
    // العودة للحالة الأصلية (نظافة الأدلة للشخصيات التالية)
    await toggle.click().catch(() => {})
    await page.waitForTimeout(400)
  })

  test('10-11. CTA الاشتراك يقود للمعالج، وحارس الجلسة يردّ الزائر إلى الدخول', async () => {
    // الخطوة 10 — زر الاشتراك في بطاقة خطة يحوي /subscribe
    await page.goto('/pricing', { waitUntil: 'load', timeout: 60_000 })
    await page.waitForTimeout(1200)
    // v14-fix: أزرار البطاقات onClick router.push (بلا href) — النقر يقود للقمع
    const subCta = page.locator('button:has-text("اشترك الآن"), button:has-text("ابدأ مجاناً")').first()
    await expect(subCta).toBeVisible()
    await subCta.click()
    await page.waitForURL(/\/subscribe/, { timeout: 20_000 })
    await page.waitForTimeout(1500)
    await shot(page, P, '01-step-10-subscribe-cta')

    // الخطوة 11 — حارس الجلسة: /dashboard بلا جلسة يرد إلى /login.
    // ملاحظة صادقة عن انحراف التصميم: /subscribe نفسها لم تعد تُعيد التوجيه
    // منذ v6 §D (SubscribeContent.tsx:98-100 — التسعير عام والدفع 401 عند
    // الإرسال)، لذا حارس الجلسة الفعلي للزائر يُختبر على /dashboard:
    // v15-fix: إعادة التوجيه 401 العالمية (E5/D4-H3) تُطلق أثناء التنقل
    // نفسه → goto يُجهض (ERR_ABORTED) لأن تنقلاً جديداً (location.replace)
    // حل محله — الإجهاض هنا هو السلوك الصحيح؛ نتحمل النتيجة وننتظر الهدف
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {})
    await page.waitForURL(/\/login/, { timeout: 20_000 })
    expect(page.url(), 'AuthGuard يردّ الزائر إلى الدخول').toContain('/login')
    await shot(page, P, '01-step-11-login-redirect')
  })

  test('12. /demo tabs تتبدل فعلياً (نمط demo-tabs)', async ({ browser }) => {
    // التبويبات تحتاج الشريط الجانبي المرئي — سياق سطح مكتب ثانٍ (HAR مسجّل
    // من سياق الموبايل الأساسي)
    const ctx = await createPersonaContext(browser, P, {
      viewport: { width: 1440, height: 900 },
      recordHar: false,
    })
    const dpage = await ctx.newPage()
    await dpage.goto('/demo', { waitUntil: 'load', timeout: 60_000 })
    await dpage.waitForTimeout(1000)
    const headerSel = 'header h1'
    const h0 = (await dpage.locator(headerSel).first().innerText()).trim()
    const clicks = [
      { label: 'الرسائل', expect: 'الرسائل' },
      { label: 'الجمهور', expect: 'الجمهور' },
      { label: 'التحليلات', expect: 'التحليلات' },
      { label: 'لوحة التحكم', expect: 'لوحة' },  // v14-fix: التسمية الفعلية في AdminSidebar
    ]
    let switched = 0
    for (const c of clicks) {
      await dpage.getByRole('link', { name: c.label, exact: true }).first().click()
      await dpage.waitForTimeout(450)
      const h = (await dpage.locator(headerSel).first().innerText()).trim()
      if (h.includes(c.expect) && h !== h0) switched++
      else if (h.includes(c.expect)) switched++
    }
    expect(switched, `التبويبات المبدّلة: ${switched}/4`).toBe(4)
    await shot(dpage, P, '01-step-12-demo')
    await ctx.close().catch(() => {})
  })

  test('13-14. الصفحات القانونية + 404 المهذبة مع skip-link', async () => {
    for (const [route, name] of [
      ['/terms', 'terms'],
      ['/privacy', 'privacy'],
    ] as const) {
      const r = await page.goto(route, { waitUntil: 'load', timeout: 60_000 })
      expect(r?.status(), `${route} 200`).toBe(200)
      const txt = await page.locator('body').innerText()
      expect(txt.length, `نص قانوني حقيقي في ${route}`).toBeGreaterThan(400)
    }
    await shot(page, P, '01-step-13-legal')

    const nf = await page.goto('/p01-nothing', { waitUntil: 'domcontentloaded', timeout: 60_000 })
    expect(nf?.status(), '404 متعمد').toBe(404)
    // K4 — هدف رابط التخطي موجود في صفحة 404
    await expect(page.locator('#page-content')).toHaveCount(1)
    await shot(page, P, '01-step-14-404')
  })

  test('15. ميزان الأداء على 3G: DCL < 8 ثوانٍ', async () => {
    await emulate3g(page)
    await page.goto('/', { waitUntil: 'load', timeout: 90_000 })
    const dcl = await dclMs(page)
    recordClaim(
      P,
      'p01-dcl-3g',
      'domContentLoadedEventEnd < 8000ms',
      `${dcl}ms`,
      dcl > 0 && dcl < 8000,
      { metric: 'domContentLoadedEventEnd', unit: 'ms' }
    )
    expect(dcl, `DCL على 3G = ${dcl}ms (عتبة التصميم 8000ms)`).toBeLessThan(8000)
  })
})
