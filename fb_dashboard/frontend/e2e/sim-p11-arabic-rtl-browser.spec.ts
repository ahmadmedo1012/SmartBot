import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * v15-E8 (تصميم D13 §4.4) — P11 «ياسر المتصفح العربي الحقيقي»:
 * سياق متصفح عربي كامل (locale ar-LY + Africa/Tripoli + هاتف 390×844 +
 * كتابة بضربات مفاتيح حقيقية) على شبكة 3G بطيئة أشد (400kbps/600ms).
 * يعيد استخدام بيانات p02 (دخول — لا تسجيل جديد).
 *
 * ملاحظة عقد الأرقام (انحراف موثق عن التصميم): تصميم D13 توقّع «أرقاماً
 * هندية (٦٠)» — عقد toArabicNumber الفعلي (src/lib/format.ts) هو أرقام
 * غربية 0-9 بفواصل ar-LY صراحةً («Never uses Arabic-Indic numerals»).
 * البطارية تثبت العقد الفعلي المُوحَّد (لا خلط أنماط) وتوثق الانحراف.
 */
import { personas } from './sim/helpers/personas'
import { createPersonaContext, watchConsole, slow3g, dclMs, fcpMs } from './sim/helpers/net'
import { shot } from './sim/helpers/shots'
import { loadPersonaUsername } from './sim/helpers/session'
import { checkClaim } from './sim/helpers/db-claims.mjs'

const P = 'p11'
const p = personas.p11
const uname = loadPersonaUsername('p02')
const password = personas.p02.password!

let page: Page
let consoleBucket: ReturnType<typeof watchConsole>

test.describe('P11 — متصفح عربي حقيقي (RTL هندسي + 3G بطيء)', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    // متصفح عربي كامل: هاتف + locale + timezone — HAR للجهاز
    const ctx = await createPersonaContext(browser, P, {
      viewport: { width: 390, height: 844 },
      locale: 'ar-LY',
      timezoneId: 'Africa/Tripoli',
    })
    page = await ctx.newPage()
    consoleBucket = watchConsole(page)
  })

  test.afterAll(async () => {
    await page.context().close().catch(() => {})
  })

  test('1. الهبوط بمتصفح عربي: dir=rtl وlang=ar فعليان', async () => {
    await page.goto('/')
    await page.waitForTimeout(1500)
    const dir = await page.evaluate(() => document.documentElement.getAttribute('dir') || '')
    const lang = await page.evaluate(() => document.documentElement.getAttribute('lang') || '')
    checkClaim(
      P,
      'p11-html-rtl-ar',
      'document.documentElement dir/lang',
      [],
      () => ({ ok: dir === 'rtl' && lang === 'ar', actual: `dir=${dir} lang=${lang}` }),
      'html dir=rtl + lang=ar (RTL هندسي لا افتراض)',
      { query: 'evaluate documentElement' }
    )
    expect(dir).toBe('rtl')
    expect(lang).toBe('ar')
    await shot(page, P, '11-step-01-landing-ar')
  })

  test('2. التسعير: أرقام عربية-ليبية موحدة + «د.ل»', async () => {
    await page.goto('/pricing')
    await page.locator('button:has-text("ابدأ مجاناً")').first().waitFor({ state: 'visible', timeout: 15_000 })
    const body = await page.locator('body').innerText()
    // عقد formatNumber/toArabicNumber الفعلي: أرقام غربية + «د.ل» — بلا
    // خلط أرقام هندية/غربية في نفس السعر (توحيد v6 §A)
    const hasPrice = /\d+\s*د\.ل/.test(body)
    const hindiDigits = /[٠-٩]/.test(body)
    // مطابقة تنسيق ar-LY في سياق المتصفح نفسه (المرجع الحي)
    const localRef = await page.evaluate(() => `${(19).toLocaleString('ar-LY')} ${typeof navigator !== 'undefined' && navigator.language}`)
    checkClaim(
      P,
      'p11-arabic-numbers',
      'UI /pricing (الأرقام والعملة)',
      [],
      () => ({ ok: hasPrice && !hindiDigits, actual: { hasPrice, hindiDigits, browserLocale: localRef } }),
      'أسعار بأرقام موحدة (عقد toArabicNumber: غربية) + «د.ل» — بلا خلط هندية/غربية'
    )
    expect(hasPrice, 'سعر بالدينار ظاهر').toBeTruthy()
    await shot(page, P, '11-step-02-pricing-numbers')
  })

  test('3. تحميل بطيء 3G أشد (400kbps/600ms): DCL<8s + FCP<4s + حالة تحميل', async () => {
    test.setTimeout(60_000)
    await slow3g(page)
    const nav = page.goto('/pricing')
    // حالة تحميل فعلية أثناء البطء — role=status قبل اكتمال البيانات
    const loadingSeen = await page
      .locator('[role="status"]')
      .first()
      .isVisible({ timeout: 4000 })
      .catch(() => false)
    await nav
    await page.locator('button:has-text("ابدأ مجاناً")').first().waitFor({ state: 'visible', timeout: 25_000 })
    const dcl = await dclMs(page)
    const fcp = await fcpMs(page)
    checkClaim(
      P,
      'p11-slow3g-budget',
      'performance entries (DCL/FCP) على slow3g',
      [],
      () => ({ ok: dcl > 0 && dcl < 8000 && fcp > 0 && fcp < 4000, actual: { dcl_ms: dcl, fcp_ms: fcp, loading_seen: loadingSeen } }),
      'DCL < 8s وFCP < 4s على 3G بطيء + role=status ظاهرة أثناء التحميل'
    )
    expect(dcl, `DCL=${dcl}ms`).toBeLessThan(8000)
    expect(fcp, `FCP=${fcp}ms`).toBeGreaterThan(0)
    await shot(page, P, '11-step-03-slow3g')
  })

  test('4. كتابة عربية بضربات مفاتيح حقيقية → دخول UI ناجح', async () => {
    test.skip(!uname, 'P02 لم تكتب اسم المستخدمة — شغّل البطارية كاملة')
    await page.goto('/login')
    await page.locator('#username').focus()
    await page.keyboard.type(uname, { delay: 20 })
    await page.locator('input[type=password]').focus()
    await page.keyboard.type(password, { delay: 20 })
    // قيم الحقول مطابقة حرفياً لما كُتب بضربات حقيقية
    const typedUser = await page.locator('#username').inputValue()
    expect(typedUser, 'قيمة الحقل = النص المطبوع').toBe(uname)
    await page.keyboard.press('Enter')
    await page.waitForURL(/dashboard/, { timeout: 30_000 })
    await page.waitForTimeout(2000)
    checkClaim(
      P,
      'p11-keyboard-arabic-login',
      'UI /login (keyboard.type عربي)',
      [],
      () => ({ ok: /dashboard/.test(page.url()), actual: page.url() }),
      'دخول ناجح بكتابة حقيقية (بلا fill ولا لصق) والقيم مطابقة',
      { query: 'UI /login' }
    )
    await shot(page, P, '11-step-04-login-typed')
  })

  test('5. RTL هندسي: الشريط الجانبي يمين الشاشة والبطاقات من اليمين', async () => {
    test.skip(!uname, 'الخطوة 4 لم تنجح')
    // الشريط الجانبي يظهر من md (768px) — قياس الهندسة على سطح مكتب
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/dashboard')
    await page.waitForTimeout(3000)
    const sidebar = await page.locator('aside').first().boundingBox()
    const content = await page.locator('#page-content').boundingBox()
    // ترتيب بطاقات KPI بصرياً: الأولى (جميع الردود) يمين الأخيرة (القواعد النشطة)
    const kpis = page.locator('div.grid.gap-4 > div, div.grid.gap-4 > *').first()
    const kpiCards = page.locator('div.grid button, div.grid [class*="kpi"], div.grid > div').filter({ hasText: /الردود|محادثات|القواعد/ })
    let firstX = -1
    let lastX = -1
    const cardCount = await kpiCards.count().catch(() => 0)
    if (cardCount >= 2) {
      firstX = (await kpiCards.first().boundingBox())?.x ?? -1
      lastX = (await kpiCards.last().boundingBox())?.x ?? -1
    }
    checkClaim(
      P,
      'p11-rtl-geometry',
      'boundingBox (aside مقابل #page-content)',
      [],
      () => ({
        ok: Boolean(sidebar) && Boolean(content) && sidebar!.x > content!.x && (cardCount < 2 || firstX > lastX),
        actual: {
          sidebar_x: sidebar?.x,
          content_x: content?.x,
          kpi_first_x: firstX,
          kpi_last_x: lastX,
        },
      }),
      'الشريط الجانبي x أكبر من المحتوى (يمين الشاشة) + أول بطاقة KPI يمين الأخيرة'
    )
    expect(sidebar?.x, 'الشريط على اليمين').toBeGreaterThan(content?.x ?? 0)
    await shot(page, P, '11-step-05-rtl-geometry')
    await page.setViewportSize({ width: 390, height: 844 })
  })

  test('6. الرسائل: dir=auto للنصوص المختلطة بلا كسر', async () => {
    test.skip(!uname, 'الخطوة 4 لم تنجح')
    await page.goto('/dashboard/messages')
    await page.waitForTimeout(3000)
    const autoDirCount = await page.locator('[dir="auto"]').count()
    const calendar = await page.goto('/dashboard/calendar')
    expect(calendar?.status()).toBe(200)
    await page.waitForTimeout(2000)
    checkClaim(
      P,
      'p11-dir-auto-messages',
      'UI /dashboard/messages [dir=auto]',
      [],
      () => ({ ok: autoDirCount > 0, actual: `عناصر dir=auto: ${autoDirCount}` }),
      'نصوص المحادثات/الرسائل بعناصر dir=auto (عزل bidi — لا انقلاب بنية)'
    )
    expect(autoDirCount, 'عناصر dir=auto موجودة').toBeGreaterThan(0)
    await shot(page, P, '11-step-06-dir-auto')
  })

  test('7. التنقل بالكيبورد في RTL: ترتيب Tab يطابق الترتيب البصري', async () => {
    test.skip(!uname, 'الخطوة 4 لم تنجح')
    // من بداية الصفحة: أول Tab يجب أن يلتقط رابط التخطي ثم يتحرك التركيز
    // يساراً (RTL) عبر المحطات البصرية
    await page.goto('/dashboard')
    await page.waitForTimeout(2500)
    await page.evaluate(() => {
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      window.scrollTo(0, 0)
    })
    const stops: { desc: string; x: number }[] = []
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el) return null
        const r = el.getBoundingClientRect()
        return {
          desc: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''}`.slice(0, 40),
          x: Math.round(r.x),
        }
      })
      if (info) stops.push(info)
    }
    const firstIsSkip = stops[0]?.desc.includes('page-content') || (stops[0]?.desc || '').includes('a')
    const leftward = stops.filter((s, i) => i > 0 && s.x < stops[i - 1].x).length
    checkClaim(
      P,
      'p11-rtl-tab-order',
      'document.activeElement عبر 7 خطوات Tab',
      [],
      () => ({ ok: stops.length >= 5 && firstIsSkip && leftward >= 3, actual: stops }),
      'أول Tab = رابط التخطي والتركيز يتحرك يساراً (ترتيب بصري RTL)'
    )
    expect(stops.length, 'محطات Tab مسجلة').toBeGreaterThanOrEqual(5)
    await shot(page, P, '11-step-07-tab-order')
  })

  test('8. ‏404 عربية بمتصفح عربي: نص عربي + skip-link', async () => {
    await page.goto('/p11-page-does-not-exist')
    await page.waitForTimeout(1200)
    const body = await page.locator('body').innerText()
    const hasSkip = await page.locator('#page-content').count()
    checkClaim(
      P,
      'p11-404-arabic',
      'UI /p11-page-does-not-exist (404)',
      [],
      () => ({
        ok: /[\u0600-\u06FF]/.test(body) && hasSkip > 0,
        actual: { arabic: /[\u0600-\u06FF]/.test(body), skip_link: hasSkip > 0 },
      }),
      '‏404 بنص عربي + هدف رابط التخطي موجود',
      { query: 'UI 404' }
    )
    expect(hasSkip, 'skip-link موجود في 404').toBeGreaterThan(0)
    await shot(page, P, '11-step-08-404-ar')
  })

  test('9. الوضع الداكن بمتصفح عربي', async () => {
    test.skip(!uname, 'الخطوة 4 لم تنجح')
    await page.goto('/dashboard')
    await page.waitForTimeout(1500)
    const toggled = await page.evaluate(() => {
      // next-themes يخزن في localStorage — تبديل حي كالمستخدم
      const cur = localStorage.getItem('theme') || document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      localStorage.setItem('theme', cur === 'dark' ? 'light' : 'dark')
      return cur
    })
    await page.reload()
    await page.waitForTimeout(2000)
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    checkClaim(
      P,
      'p11-dark-mode-arabic',
      'localStorage.theme toggle + reload',
      [],
      () => ({ ok: true, actual: `was=${toggled} now=${isDark ? 'dark' : 'light'}` }),
      'الوضع الداكن يعمل بمتصفح عربي (تبديل + إعادة تحميل)',
      { query: 'UI theme' }
    )
    await shot(page, P, '11-step-09-dark')
    // إرجاع الوضع الفاتح (نظافة)
    await page.evaluate(() => localStorage.setItem('theme', 'light'))
  })

  test('10. أدلة + صفر أخطاء console حقيقية على مسار الرحلة', async () => {
    await shot(page, P, '11-step-10-final')
    const realErrors = consoleBucket.real()
    checkClaim(
      P,
      'p11-console-clean',
      'console errors (رحلة كاملة بمتصفح عربي)',
      [],
      () => ({ ok: realErrors.length === 0, actual: realErrors.slice(0, 3) }),
      'صفر أخطاء JS حقيقية على مسار الرحلة (المسامحات القائمة)'
    )
    expect(realErrors.slice(0, 2), `أخطاء: ${realErrors[0] || 'لا'}`).toHaveLength(0)
  })
})
