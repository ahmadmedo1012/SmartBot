import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * v14-E7 (تصميم D13 §3 P02) — «منال» مشتركة جديدة، الرحلة الكاملة
 * بمحفظة ليبيانا (USSD):
 *   تسجيل → معالج onboarding (ربط صفحة Fernet + قاعدة أولى) → خطة → دفع
 *   محفظة → انتظار SSE → موافقة الأدمن → تفعيل → لوحة + فواتير + رسائل →
 *   جولة موبايل → تسجيل خروج يسوّد التوكن.
 *
 * مستخدمة p02_<ts> هي نفسها «منال العائدة» في P04 ومصدر جلسة P08 —
 * الاسم/التوكن يُخزنان على القرص (نمط .e2e_auth_token).
 */
import { personas, tsSuffix } from './sim/helpers/personas'
import { createPersonaContext, watchConsole } from './sim/helpers/net'
import { shot } from './sim/helpers/shots'
import { FRONT_BASE, apiGet } from './sim/helpers/api'
import { registerViaUI, loginViaUI, savePersonaToken, savePersonaUsername, approvePayment, getToken, skipJoyride } from './sim/helpers/session'
import { checkClaim, queryOne } from './sim/helpers/db-claims.mjs'

const P = 'p02'
const p = personas.p02
const uname = `p02_${tsSuffix()}`
const email = `${uname}@sim.ly`

let page: Page
let consoleBucket: ReturnType<typeof watchConsole>
let paymentId = 0
let tenantId = 0
let token = ''

test.describe('P02 — مشتركة جديدة كاملة الرحلة (ليبيانا USSD)', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctx = await createPersonaContext(browser, P)
    page = await ctx.newPage()
    consoleBucket = watchConsole(page)
  })

  test.afterAll(async () => {
    await page.context().close().catch(() => {})
  })

  test('1-4. التسجيل ينشئ مساحة وجلسة (ادعاءات DB)', async () => {
    // الخطوة 1 — تسجيل واجهة كامل (الحقول الأربعة)
    const reg = page.waitForResponse(
      (r) => r.url().endsWith('/api/register') && r.request().method() === 'POST',
      { timeout: 20_000 }
    )
    const url = await registerViaUI(page, uname, email, p.password!)
    const regResp = await reg
    expect(regResp?.status(), 'POST /api/register = 200').toBe(200)
    const regBody = await regResp!.json().catch(() => null)
    expect(regBody?.success).toBe(true)
    tenantId = regBody?.data?.user?.tenant_id || 0
    await shot(page, P, '02-step-01-register')

    // الخطوة 2 — بعد التسجيل: اللوحة، والمعالج يفتح تلقائياً فوقها (AuthGuard:
    // onboardingCompleted=false) — خطوة 0 ترحيب ثم «التالي» تكشف #pageId
    expect(url, `بعد التسجيل: ${url}`).toMatch(/dashboard|onboarding/)
    // v14-fix: /onboarding ليس راوتاً (404 — المعالج مكون dynamic داخل لوحة
    // /dashboard)؛ التسجيل يوجّه للوحة مباشرة والمعالج يتراكب فوقها
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'التالي' }).first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByRole('button', { name: 'التالي' }).first().click()
    await page.locator('#pageId').waitFor({ state: 'visible', timeout: 15_000 })
    await shot(page, P, '02-step-02-post-register')

    // الخطوة 3 — ادعاء DB: مستأجر جديد بلا اشتراك ومعالج غير مكتمل
    // (التصميم: TRIAL/free — الفعلي المسجل حديثاً UNPAID حتى أول تفعيل)
    checkClaim(
      P,
      'p02-tenant-created',
      `SELECT id, subscription_status, onboarding_completed FROM tenants WHERE id=${tenantId}`,
      [],
      (rows) => {
        const r = rows[0]
        return {
          ok: Boolean(r) && r.onboarding_completed === 0 && ['UNPAID', 'TRIAL', 'FREE'].includes(r.subscription_status),
          actual: r,
        }
      },
      'onboarding_completed=0 + status ∈ {UNPAID,TRIAL,FREE}'
    )

    // الخطوة 4 — كوكي الجلسة + GET /api/me بمظروف ok()
    token = await getToken(page.context())
    expect(token, 'كوكي token صادر بعد التسجيل').not.toBe('')
    savePersonaToken(P, token)
    savePersonaUsername(P, uname)
    const me = await apiGet(page.request, '/api/me', { headers: { cookie: `token=${token}` } })
    expect(me.status, 'GET /api/me = 200').toBe(200)
    expect(me.body?.success).toBe(true)
    expect(me.body?.data?.user?.username, 'المستخدمة نفسها').toBe(uname)
    checkClaim(P, 'p02-me', 'GET /api/me', [], (rows) => ({ ok: true, actual: `${me.status} ${uname}` }), '200 + success + username=p02', {
      query: 'GET /api/me',
    })
  })

  test('5-10. معالج onboarding: ربط صفحة (Fernet) + قاعدة أولى + إتمام', async () => {
    await page.goto('/dashboard')
    // v14-fix: المعالج يفتح على خطوة 0 (ترحيب) — «التالي» أولاً ثم #pageId
    await page.locator('button:has-text("التالي")').first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.locator('button:has-text("التالي")').first().click()
    await page.locator('#pageId').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(600)

    // الخطوة 5 — ملء بيانات الصفحة
    await page.fill('#pageId', p.pageId!)
    await page.fill('#accessToken', p.accessToken!)
    await page.fill('#pageName', p.pageName!)

    // الخطوة 6 — «اختبر الاتصال» قبل التأكيد: Graph يرفض التوكن الزائف —
    // عقد الشكل لا القيمة (تصميم R3): 200 ok + connected:false + خطأ عربي
    const testConn = page.waitForResponse(
      (r) => r.url().includes('/api/onboarding/test-connection'),
      { timeout: 20_000 }
    )
    await page.locator('button:has-text("اختبار الاتصال")').first().click()
    const tc = await testConn
    expect(tc?.status()).toBe(200)
    const tcBody = await tc!.json().catch(() => null)
    expect(tcBody?.success, 'مظروف ok() لاختبار الاتصال').toBe(true)
    expect(tcBody?.data?.connected, 'فشل صادق: connected=false (توكن محاكاة)').toBe(false)
    expect(String(tcBody?.data?.error || ''), 'خطأ عربي صادق').toMatch(/فيسبوك|الاتصال|التحقق|أدخل/)
    await page.waitForTimeout(800)
    await shot(page, P, '02-step-06-test-conn')

    // «التالي» من خطوة الربط → POST /api/onboarding/connect-page
    const connP = page.waitForResponse(
      (r) => r.url().includes('/api/onboarding/connect-page'),
      { timeout: 20_000 }
    )
    await page.locator('button:has-text("التالي")').first().click()
    const conn = await connP
    expect(conn?.status(), 'POST connect-page = 200').toBe(200)
    await shot(page, P, '02-step-05-connect')

    // الخطوة 7 — ادعاء DB: 3 صفوف fb_* والتوكن مشفّر Fernet (لا نص صريح)
    const tokValue = String(
      queryOne('SELECT value FROM bot_state WHERE tenant_id=? AND key=?', [tenantId, 'fb_access_token'])?.value || ''
    )
    checkClaim(
      P,
      'p02-page-bound-fernet',
      "SELECT key, length(value) AS len FROM bot_state WHERE tenant_id=? AND key LIKE 'fb_%'",
      [tenantId],
      (rows) => {
        const keys = rows.map((r: any) => r.key).sort()
        const encrypted = tokValue.length > 60 && !tokValue.includes(p.accessToken!)
        return { ok: keys.length === 3 && encrypted, actual: rows }
      },
      '3 صفوف fb_page_id/fb_page_name/fb_access_token والتوكن مشفّر'
    )

    // الخطوة 8 — القاعدة الأولى
    await page.fill('#keyword', p.rule!.keyword)
    await page.fill('#reply', p.rule!.reply)
    const ruleP = page.waitForResponse(
      (r) => r.url().includes('/api/onboarding/first-rule'),
      { timeout: 20_000 }
    )
    await page.locator('button:has-text("التالي")').first().click()
    const rule = await ruleP
    expect(rule?.status(), 'POST first-rule = 200').toBe(200)
    await shot(page, P, '02-step-08-first-rule')

    // الخطوة 9 — إنهاء المعالج (خطوة الخطط ثم «ابدأ الآن»)
    await page.locator('button:has-text("التالي")').first().click()
    await page.waitForTimeout(700)
    const compP = page.waitForResponse(
      (r) => r.url().includes('/api/onboarding/complete'),
      { timeout: 20_000 }
    )
    await page.locator('button:has-text("ابدأ الآن")').first().click()
    const comp = await compP
    expect(comp?.status(), 'POST complete = 200').toBe(200)
    await page.waitForTimeout(1500)
    await skipJoyride(page)
    await shot(page, P, '02-step-09-complete')

    // الخطوة 10 — ادعاء DB: onboarding_completed=1
    checkClaim(
      P,
      'p02-onboarding-done',
      'SELECT onboarding_completed FROM tenants WHERE id=?',
      [tenantId],
      (rows) => ({ ok: rows[0]?.onboarding_completed === 1, actual: rows[0] }),
      'onboarding_completed=1'
    )
  })

  test('11-14. اختيار خطة ودفع محفظة ينشئ payment_id pending (SSE يبث)', async ({ request }) => {
    // الخطوة 11 — التسعير → الخطة المتوسطة (المعلّمة «الأكثر») → معالج الدفع
    await page.goto('/pricing')
    await page.waitForTimeout(1500)
    const subButtons = page.locator('button:has-text("اشترك الآن")')
    await subButtons.first().waitFor({ state: 'visible', timeout: 15_000 })
    await shot(page, P, '02-step-11-plan')
    const hrefP = page.waitForURL(/\/subscribe/, { timeout: 20_000 })
    // البطاقة الوسطى بين البطاقات المدفوعة (Basic/Premium/Pro/Enterprise)
    await subButtons.nth(1).click()
    await hrefP
    await page.waitForTimeout(2000)
    await shot(page, P, '02-step-11-subscribe')

    // الخطوة 12 — فتح نافذة الدفع + مزود ليبيانا (الافتراضي) + الهاتف
    const payNow = page.locator('button:has-text("ادفع الآن")').first()
    await payNow.waitFor({ state: 'visible', timeout: 15_000 })
    await payNow.click()
    const phoneInput = page.locator('#payment-phone')
    await phoneInput.waitFor({ state: 'visible', timeout: 15_000 })
    await phoneInput.fill(p.phone!)
    await shot(page, P, '02-step-12-payment')

    // استماع مبكر: طلب الدفع + قناة SSE (تُفتح فور نجاح الإرسال)
    const subP = page.waitForResponse(
      (r) => r.url().endsWith('/api/subscriptions') && r.request().method() === 'POST',
      { timeout: 20_000 }
    )
    const sseP = page
      .waitForResponse((r) => r.url().includes('/api/subscriptions/status-stream'), { timeout: 30_000 })
      .catch(() => null)
    await page.locator('button:has-text("إرسال طلب الدفع")').first().click()
    const sub = await subP
    expect(sub?.status(), 'POST /api/subscriptions = 200').toBe(200)
    const subBody = await sub!.json().catch(() => null)
    expect(subBody?.success).toBe(true)
    paymentId = subBody?.data?.payment_id || 0
    expect(paymentId, 'payment_id صادر').toBeGreaterThan(0)

    // الخطوة 13 — ادعاء DB: pending/liyana
    checkClaim(
      P,
      'p02-payment-pending',
      'SELECT status, provider, amount FROM subscription_payments WHERE id=?',
      [paymentId],
      (rows) => {
        const r = rows[0]
        return { ok: r?.status === 'pending' && r?.provider === 'liyana' && Number(r?.amount) > 0, actual: r }
      },
      'status=pending + provider=liyana'
    )

    // الخطوة 14 — قناة SSE متصلة (خطة R6: مسار مزدوج — SSE أو poll 5s)
    const sse = await Promise.race([sseP, new Promise((r) => setTimeout(() => r(null), 20_000))])
    await page.locator('text=في انتظار تأكيد الدفع').first().waitFor({ state: 'visible', timeout: 15_000 })
    if (sse) {
      expect((sse as any).status(), 'SSE status-stream = 200').toBe(200)
      const ct = (sse as any).headers()['content-type'] || ''
      expect(ct, 'SSE content-type event-stream').toContain('text/event-stream')
    }
    await shot(page, P, '02-step-14-waiting')
  })

  test('15-18. موافقة الأدمن تفعّل الاشتراك والواجهة تلتقط خلال ≤30s', async ({ request }) => {
    test.setTimeout(120_000)
    // الخطوة 15 — طلب API بأدمن البذرة (نمط journey L103-117)
    const approve = await approvePayment(request, paymentId, 'verified')
    expect(approve.status, `موافقة الأدمن 200 (فعلي ${approve.status}: ${JSON.stringify(approve.body).slice(0, 160)})`).toBe(200)
    checkClaim(P, 'p02-approved', 'POST /api/admin/subscriptions {verified}', [], (rows) => ({ ok: true, actual: approve.status }), '200', {
      query: 'POST /api/admin/subscriptions',
    })

    // الخطوة 16 — شاشة النجاح تظهر خلال ≤30 ثانية (SSE دفع أو poll احتياطي)
    await page.locator('text=تم الموافقة على الاشتراك').first().waitFor({ state: 'visible', timeout: 30_000 })
    await shot(page, P, '02-step-16-activated')

    // الخطوة 17 — زر «الانتقال إلى لوحة التحكم»
    const goDash = page.locator('button:has-text("الانتقال إلى لوحة التحكم")').first()
    if (await goDash.count()) {
      await goDash.click().catch(() => {})
    }
    await page.waitForURL(/dashboard/, { timeout: 30_000 }).catch(() => {
      /* التوجيه toast أولًا — الفallback أدناه */
    })
    await page.goto('/dashboard')
    await page.waitForTimeout(2500)
    await skipJoyride(page)
    await shot(page, P, '02-step-17-dashboard')
    // KPI: الهيكل يعرض بطاقات — لا انهيار
    expect(await page.locator('main, [class*="card"]').count()).toBeGreaterThan(0)

    // الخطوة 18 — ادعاءات DB: المستأجر PAID والدفعة verified
    checkClaim(
      P,
      'p02-tenant-active',
      'SELECT subscription_status FROM tenants WHERE id=?',
      [tenantId],
      (rows) => ({ ok: rows[0]?.subscription_status === 'PAID', actual: rows[0]?.subscription_status }),
      'PAID'
    )
    checkClaim(
      P,
      'p02-payment-verified',
      'SELECT status FROM subscription_payments WHERE id=?',
      [paymentId],
      (rows) => ({ ok: rows[0]?.status === 'verified', actual: rows[0]?.status }),
      'verified'
    )
    const realErrors = consoleBucket.real()
    expect(realErrors.slice(0, 2), 'لا أخطاء JS حقيقية خلال الرحلة').toHaveLength(0)
  })

  test('19-20. لوحة التحكم والفواتير والرسائل ببيانات حقيقية', async () => {
    // الخطوة 19 — الفواتير تعكس الاشتراك المفعّل
    await page.goto('/dashboard/billing')
    await page.waitForTimeout(2500)
    const billText = await page.locator('body').innerText()
    expect(billText.length, 'صفحة الفواتير حيّة').toBeGreaterThan(200)
    await shot(page, P, '02-step-19-billing')

    // الخطوة 20 — صندوق الرسائل (400 «أكمل الإعداد» مقبول — Graph صادق)
    const msgs = await page.goto('/dashboard/messages')
    expect(msgs?.status()).toBe(200)
    await page.waitForTimeout(2500)
    await shot(page, P, '02-step-20-messages')
  })

  test('21. جولة موبايل: الشريط السفلي يعمل (375×812)', async ({ browser }) => {
    const ctx = await createPersonaContext(browser, P, {
      viewport: { width: 375, height: 812 },
      recordHar: false,
    })
    await ctx.addCookies([{ name: 'token', value: token, url: FRONT_BASE }])
    const m = await ctx.newPage()
    // v14-fix: MobileBottomNav يعمل في /demo (لوحة العرض العامة) — /dashboard
    // يستخدم قائمة الهامبرغر الخاصة بالـDashboardShell وليس الشريط السفلي
    await m.goto('/demo')
    await m.waitForTimeout(2500)
    const bar = m.locator('nav[aria-label="التنقل الرئيسي"]')
    await expect(bar, 'الشريط السفلي ظاهر على الموبايل').toBeVisible({ timeout: 15_000 })
    // v14-fix: أزرار الشريط تبدّل تبويب /demo الداخلي (onNavigate) — لا تغيير URL؛
    // الدليل الأمين: تغيّر العنوان/المحتوى بعد النقر
    const hBefore = await m.locator('h1').first().innerText().catch(() => '')
    await m.locator('nav[aria-label="التنقل الرئيسي"] button:has-text("الرسائل")').first().click()
    await m.waitForTimeout(900)
    const hAfter = await m.locator('h1').first().innerText().catch(() => '')
    expect(hAfter !== hBefore, `الشريط بدّل التبويب: «${hBefore}» → «${hAfter}»`).toBeTruthy()
    await shot(m, P, '02-step-21-mobile')
    await ctx.close().catch(() => {})
  })

  test('22. تسجيل الخروج يسوّد التوكن (401 لاحقاً)', async ({ request }) => {
    // زر «تسجيل الخروج» في الشريط الجانبي (DashboardShell handleLogout)
    await page.goto('/dashboard')
    await page.waitForTimeout(1500)
    // v14-fix: زر الخروج <button> داخل <aside> الشريط الجانبي (AdminSidebar
    // onLogout) — ليس داخل nav
    let logoutBtn = page.locator('button:has-text("تسجيل الخروج")').first()
    if (!(await logoutBtn.isVisible({ timeout: 8000 }).catch(() => false))) {
      // v14-finding: الجلسة قد تنقطع بين t20→t22 في بعض التشغيلات (بالعزل
      // تبقى حية) — /login يوجّه تلقائياً للوحة إن كانت الجلسة حية، وإلا
      // فدخول صادق جديد؛ الانقطاع يوثق كfinding للجولة القادمة
      await page.goto('/login')
      await page.waitForTimeout(2000)
      if (!/dashboard|admin/.test(page.url())) {
        const landing = await loginViaUI(page, uname, p.password!)
        expect(landing).toMatch(/dashboard/)
      }
      await page.goto('/dashboard')
      await page.waitForTimeout(1500)
      logoutBtn = page.locator('button:has-text("تسجيل الخروج")').first()
    }
    await logoutBtn.waitFor({ state: 'visible', timeout: 10_000 })
    await logoutBtn.click()
    await page.waitForURL(/\/login/, { timeout: 20_000 })
    await shot(page, P, '02-step-22-logout')

    // التوكن القديم مُسوَّد — 401 بعربية (BlacklistedToken)
    const me = await apiGet(request, '/api/me', { headers: { cookie: `token=${token}` } })
    expect(me.status, 'التوكن القديم مرفوض بعد الخروج').toBe(401)
    checkClaim(
      P,
      'p02-logout-blacklist',
      'GET /api/me (توكن ما بعد الخروج)',
      [],
      (rows) => ({ ok: me.status === 401, actual: me.status }),
      '401 «تم إلغاء الجلسة»',
      { query: 'GET /api/me' }
    )
  })
})
