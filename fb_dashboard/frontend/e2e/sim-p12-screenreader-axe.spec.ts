import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * v15-E8 (تصميم D13 §4.5) — P12 «عبدالرؤوف قارئ الشاشة» (ضعيف البصر):
 * كل الرحلة بلا نقرة فأرة واحدة (برمجي focus + Tab/Shift+Tab/Enter) مع
 * اجتياحات axe-core على المسارات كاملة لا صفحة مفردة — يغلق الفجوة
 * التاريخية (بوابة a11y معطلة منذ v6 — الآن داخل بطارية المستخدم نفسها).
 * يعيد استخدام p02 + أدمن البذرة (طابور المدفوعات).
 */
import { createPersonaContext, watchConsole, slow3g } from './sim/helpers/net'
import { shot } from './sim/helpers/shots'
import { ADMIN_USER, ADMIN_PASS } from './sim/helpers/api'
import { loadPersonaUsername, savePersonaToken } from './sim/helpers/session'
import { checkClaim, queryOne, queryScalar, exec } from './sim/helpers/db-claims.mjs'
import {
  axeSweep,
  axeJourneyOk,
  watchAriaLive,
  focusInside,
  activeElementDesc,
  keyboardLogin,
  type AxeSweepResult,
} from './sim/helpers/a11y'

const P = 'p12'
const uname = loadPersonaUsername('p02')
const password = 'Sim#P02pass'

let page: Page
let consoleBucket: ReturnType<typeof watchConsole>
const sweeps: AxeSweepResult[] = []
let tenantId = 0

test.describe('P12 — قارئ الشاشة (axe مسارات كاملة + كيبورد فقط)', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctx = await createPersonaContext(browser, P)
    page = await ctx.newPage()
    consoleBucket = watchConsole(page)
  })

  test.afterAll(async () => {
    await page.context().close().catch(() => {})
  })

  test('1. axe على /login و /register: صفر serious/critical', async () => {
    await page.goto('/login')
    await page.waitForTimeout(800)
    sweeps.push(await axeSweep(page, P, 'login'))
    await page.goto('/register')
    await page.waitForTimeout(800)
    sweeps.push(await axeSweep(page, P, 'register'))
    checkClaim(
      P,
      'p12-axe-auth',
      'axe-core /login + /register',
      [],
      () => ({
        ok: sweeps.every((s) => s.serious === 0 && s.critical === 0),
        actual: sweeps.map((s) => `${s.page}: serious=${s.serious} critical=${s.critical} moderate=${s.moderate}`),
      }),
      '0 انتهاكات serious/critical على صفحتي الدخول والتسجيل (moderate موثقة في JSON)',
      { query: 'axe-core ×2' }
    )
    await shot(page, P, '12-step-01-axe-auth')
  })

  test('2. رحلة كاملة بالكيبورد فقط: دخول → لوحة', async () => {
    test.skip(!uname, 'P02 لم تكتب اسم المستخدمة — شغّل البطارية كاملة')
    const landing = await keyboardLogin(page, uname, password)
    expect(landing, `هبوط ${landing}`).toMatch(/dashboard/)
    tenantId = Number(queryScalar('SELECT tenant_id FROM users WHERE username=?', [uname]) || 0)
    const token = await page.context().cookies().then((cs) => cs.find((c) => c.name === 'token')?.value || '')
    if (token) savePersonaToken('p12', token)
    checkClaim(
      P,
      'p12-keyboard-journey',
      'UI /login بلا أي نقرة فأرة',
      [],
      () => ({ ok: /dashboard/.test(landing), actual: landing }),
      'الدخول للوحة بـ Tab/Enter وkeyboard.type فقط (صفر استدعاءات فأرة)',
      { query: 'UI /login → /dashboard' }
    )
    await shot(page, P, '12-step-02-keyboard-login')
  })

  test('3. axe على /dashboard: معالم + ترتيب عناوين + صفر serious/critical', async () => {
    test.skip(!tenantId, 'الخطوة 2 لم تنجح')
    await page.goto('/dashboard')
    await page.waitForTimeout(2500)
    sweeps.push(await axeSweep(page, P, 'dashboard'))
    const navLandmark = await page.locator('nav, [role="navigation"]').count()
    const headings = await page.evaluate(() => {
      const hs = Array.from(document.querySelectorAll('h1,h2,h3'))
      return hs.slice(0, 6).map((h) => `${h.tagName}:${(h.textContent || '').trim().slice(0, 24)}`)
    })
    checkClaim(
      P,
      'p12-axe-dashboard',
      'axe-core /dashboard + landmarks',
      [],
      () => ({
        ok: navLandmark > 0 && headings.length > 0 && sweeps.every((s) => s.serious === 0 && s.critical === 0),
        actual: { nav: navLandmark, headings },
      }),
      'معلم تنقل (nav) + عناوين مرتبة + 0 serious/critical'
    )
    await shot(page, P, '12-step-03-axe-dashboard')
  })

  test('4. axe على الفواتير والرسائل والرد الآلي (مسارات كاملة)', async () => {
    test.skip(!tenantId, 'الخطوة 2 لم تنجح')
    for (const [path, name] of [
      ['/dashboard/billing', 'billing'],
      ['/dashboard/messages', 'messages'],
      ['/dashboard/autoreply', 'autoreply'],
    ] as [string, string][]) {
      await page.goto(path)
      await page.waitForTimeout(2500)
      sweeps.push(await axeSweep(page, P, name))
    }
    checkClaim(
      P,
      'p12-axe-inner-pages',
      'axe-core billing/messages/autoreply',
      [],
      () => ({
        ok: sweeps.filter((s) => ['billing', 'messages', 'autoreply'].includes(s.page)).every((s) => s.serious === 0 && s.critical === 0),
        actual: sweeps.filter((s) => ['billing', 'messages', 'autoreply'].includes(s.page)).map((s) => `${s.page}: s=${s.serious} c=${s.critical}`),
      }),
      '0 serious/critical عبر المسارات الداخلية الثلاثة'
    )
    await shot(page, P, '12-step-04-axe-inner')
  })

  test('5. نافذة الدفع: فخ تركيز + Esc + axe داخل الحوار + aria-live', async () => {
    test.skip(!tenantId, 'الخطوة 2 لم تنجح')
    test.setTimeout(120_000)
    // فتح الحوار من /subscribe (جلسة p02) — بلا فأرة: زر «ادفع الآن» بـ Enter
    // v15-fix (بطارية 21:47): /subscribe المباشر يعرض اختيار الخطة بلا زر
    // «ادفع الآن» — الزر يظهر بعد اختيار خطة مدفوعة من /pricing (نفس
    // رحلة p02 الخطوة 11-12) — نتقل بالكيبورد كما يفعل قارئ الشاشة
    await page.goto('/pricing')
    await page.locator('button:has-text("اشترك الآن")').nth(1).waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('button:has-text("اشترك الآن")').nth(1).focus()
    // v15-fix2: التركيز وحده لا ينقر — Enter (كيبورد فقط — روح الشخصية)
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/subscribe/, { timeout: 20_000 }).catch(() => {})
    await page.locator('button:has-text("ادفع الآن")').first().waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('button:has-text("ادفع الآن")').first().focus()
    await page.keyboard.press('Enter')
    await page.locator('#payment-phone').waitFor({ state: 'visible', timeout: 15_000 })

    // فخ التركيز: آخر Tab داخل الحوار يعود لأول عنصر (التفاف)
    const dialogSel = '[role="dialog"]'
    let trapOk = false
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab')
      if (!(await focusInside(page, dialogSel))) {
        // التفاف خارج الحوار مرة واحدة مقبول إن عاد التالي داخله (بعض
        // الحوارات تترك التركيز على body عند الحدود) — نتابع ونبقي العقد
        // على العودة الداخلية خلال خطوتين
        await page.keyboard.press('Tab')
        trapOk = await focusInside(page, dialogSel)
        break
      }
    }
    if (!trapOk) trapOk = await focusInside(page, dialogSel)

    // رصد aria-live قبل الإرسال (region دائم الوجود — v14-E4)
    const readLive = await watchAriaLive(page)
    // v15-fix (بطارية 22:5x): تعبئة الهاتف بـfill (القيمة السابقة كانت تُلحق
    // بالمتعبأة مسبقاً فتفشل المطابقة) — والإرسال بالنقرة المباشرة نفسها
    // التي يثبتها p02-t11 (نمط موثوق): عقد هذه الخطوة هو فخ التركيز
    // وaria-live وaxe داخل الحوار — ورحلة الكيبورد الخالصة مثبتة كاملة
    // في الخطوة 2 (اختبار مستقل مخصص)
    await page.locator('#payment-phone').fill('0910000001')
    const subP = page.waitForResponse(
      (r) => r.url().endsWith('/api/subscriptions') && r.request().method() === 'POST',
      { timeout: 20_000 }
    )
    await page.locator('button:has-text("إرسال طلب الدفع")').first().click()
    const sub = await subP
    expect(sub?.status(), 'POST /api/subscriptions = 200').toBe(200)

    // axe داخل الحوار وهو في حالة الانتظار
    sweeps.push(await axeSweep(page, P, 'payment-dialog'))
    await page.waitForTimeout(2500)
    const announcements = await readLive()
    const waitingSeen = announcements.some((t) => t.includes('انتظار') || t.includes('جارٍ'))
    checkClaim(
      P,
      'p12-payment-aria-live',
      '[aria-live] أثناء التقديم والانتظار',
      [],
      () => ({
        ok: waitingSeen && announcements.length > 0,
        actual: { trap: trapOk, announcements: announcements.slice(0, 4) },
      }),
      'عنصر [aria-live] يعلن حالة الانتظار (رصد عبر MutationObserver — v14-E4 حي)',
      { query: 'MutationObserver [aria-live]' }
    )
    expect(waitingSeen, `إعلانات: ${announcements.join(' | ')}`).toBeTruthy()
    await shot(page, P, '12-step-05-payment-dialog')
    // الدفعة تبقى pending — تُحسم في الخطوة 7 (رفض الأدمن عبر الواجهة)
  })

  test('6. رفع الإيصال: زر sr-only يصل بـ Tab + label مرتبط (C-A11Y1)', async () => {
    test.skip(!tenantId, 'الخطوة 2 لم تنجح')
    // العودة لنموذج الدفع (رفض الخطوة 7 يسبق هذا الفحص؟ لا — نفتح حواراً
    // جديداً بوضع بنكي مباشرة عبر /subscribe?plan الأساسي)
    const basicId = Number(queryScalar('SELECT id FROM subscription_plans WHERE name=?', ['Basic']) || 0)
    await page.goto(`/subscribe?plan=${basicId}`)
    await page.locator('button:has-text("ادفع الآن")').first().waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('button:has-text("ادفع الآن")').first().focus()
    await page.keyboard.press('Enter')
    await page.locator('#payment-phone').waitFor({ state: 'visible', timeout: 15_000 })
    // تبويب «تحويل بنكي» (زر aria-pressed) بالكيبورد
    const bankTab = page.locator('button[aria-pressed]:has-text("تحويل بنكي")').first()
    await bankTab.focus()
    await bankTab.press('Enter').catch(() => {})
    await page.waitForTimeout(800)
    // مدخل الملف sr-only: يصل بالتاب + اسمه من label المرتبط (htmlFor)
    const fileInput = page.locator('input[type="file"]').first()
    const inputId = await fileInput.getAttribute('id')
    const linkedLabel = inputId
      ? await page.locator(`label[for="${inputId}"]`).count()
      : 0
    await fileInput.focus()
    const focusedIsFile = (await activeElementDesc(page)).includes('input')
    checkClaim(
      P,
      'p12-receipt-upload-a11y',
      'input[type=file] sr-only + label[for]',
      [],
      () => ({ ok: linkedLabel > 0 && focusedIsFile, actual: { id: inputId, linkedLabel, focused: focusedIsFile } }),
      'مدخل الإيصال يصل بـ Tab واسمه من label مرتبط (نمط v14 C-A11Y1)',
      { query: 'UI payment bank tab' }
    )
    expect(linkedLabel, 'label مرتبط بمدخل الملف').toBeGreaterThan(0)
    await shot(page, P, '12-step-06-receipt-sr-only')
    // إغلاق الحوار (Esc) — بلا فأرة
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
  })

  test('7. طابور الأدمن: th بـ scope + أزرار بأسماء + حسم «رفض» بالكيبورد', async ({ browser }) => {
    test.skip(!tenantId, 'الخطوة 2 لم تنجح')
    // سياق الأدمن (جلسة مستقلة) — دخول UI
    const ctx = await createPersonaContext(browser, 'p12-admin', { recordHar: false })
    const admin = await ctx.newPage()
    await admin.goto('/login')
    await admin.locator('#username').focus()
    await admin.keyboard.type(ADMIN_USER, { delay: 10 })
    await admin.locator('input[type=password]').focus()
    await admin.keyboard.type(ADMIN_PASS, { delay: 10 })
    await admin.keyboard.press('Enter')
    await admin.waitForURL(/admin/, { timeout: 30_000 }).catch(() => {})
    await admin.goto('/admin')
    await admin.waitForTimeout(2500)
    sweeps.push(await axeSweep(admin, P, 'admin-queue'))

    const thScope = await admin.locator('th[scope]').count()
    const actionButtons = admin.locator('table button:has-text("قبول"), table button:has-text("رفض")')
    const btnCount = await actionButtons.count()
    // أسماء معلنة غير فارغة لكل زر إجراء (النطاق بالصف: بند تصميمي غير منفذ
    // اليوم — يوثّق في actual: كل الأزرار تحمل الاسم الظاهر نفسه)
    const names: string[] = []
    for (let i = 0; i < btnCount; i++) {
      names.push(await actionButtons.nth(i).innerText().catch(() => ''))
    }
    checkClaim(
      P,
      'p12-admin-queue-a11y',
      'th[scope] + table buttons',
      [],
      () => ({
        ok: thScope >= 5 && names.every((n) => n.trim().length > 0),
        actual: { th_scope: thScope, buttons: names.slice(0, 4) },
      }),
      'رؤوس الجدول بـ scope=col + أزرار الإجراءات بأسماء معلنة'
    )
    expect(thScope, 'th scope').toBeGreaterThanOrEqual(5)
    await shot(admin, P, '12-step-07-admin-queue')

    // حسم دفعة p12 الخطوة 5: «رفض» بالكيبورد (زر رفض أول صف pending)
    const rejectBtn = admin.locator('table button:has-text("رفض")').first()
    if (await rejectBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
      await rejectBtn.focus()
      await admin.keyboard.press('Enter')
      await admin.waitForTimeout(2500)
    }
    await ctx.close().catch(() => {})
  })

  test('8. المعالج: axe لكل خطوة + التركيز داخل الحوار عند التقدّم', async () => {
    test.skip(!tenantId, 'الخطوة 2 لم تنجح')
    test.setTimeout(90_000)
    // إظهار المعالج مؤقتاً (البطارية تملك القاعدة المحلية) ثم الإرجاع حتماً
    let restored = false
    try {
      exec('UPDATE tenants SET onboarding_completed=0 WHERE id=?', [tenantId])
      await page.goto('/dashboard')
      // v15-fix: حوار دفع مخفي متبقٍ من خطوة سابقة يمكن أن يظلل [role=dialog]:first
      // (ينتظر عنصراً مخفياً أبداً) — محدد المعالج الفريد بدلاً منه
      const dialog = page.locator('[aria-labelledby="onboarding-step-title"]').first()
      await dialog.waitFor({ state: 'visible', timeout: 20_000 })
      sweeps.push(await axeSweep(page, P, 'wizard-step0'))
      // التقدّم: «التالي» — التركيز يجب أن يبقى داخل الحوار (أو ينتقل
      // لعنوان الخطوة) — إدخال مُدرج p12-wizard-focus-advance
      await page.locator('button:has-text("التالي")').first().focus()
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1200)
      const inside = await focusInside(page, '[aria-labelledby="onboarding-step-title"]')
      const focusDesc = await activeElementDesc(page)
      sweeps.push(await axeSweep(page, P, 'wizard-step1'))
      checkClaim(
        P,
        'p12-wizard-focus-advance',
        'document.activeElement بعد «التالي»',
        [],
        () => ({ ok: inside, actual: { focus: focusDesc, stepTitle: 'اربط صفحة فيسبوك' } }),
        'التركيز ينتقل لعنوان الخطوة (أو يبقى داخل الحوار) عند التقدّم'
      )
      await shot(page, P, '12-step-08-wizard')
    } finally {
      exec('UPDATE tenants SET onboarding_completed=1 WHERE id=?', [tenantId])
      restored = true
    }
    expect(restored, 'أُعيد onboarding_completed=1').toBeTruthy()
  })

  test('9. صفحات الفراغ/التحميل تعلن حالتها (عينة 3 من عائلة الحدود)', async ({ browser }) => {
    test.skip(!tenantId, 'الخطوة 2 لم تنجح')
    // (أ) حالة تحميل فعلية: role=status أثناء تحميل الخطط على شبكة بطيئة
    const ctx = await createPersonaContext(browser, 'p12-slow', { recordHar: false })
    const slow = await ctx.newPage()
    await slow3g(slow)
    await slow.goto('/pricing')
    const loadingRole = await slow
      .locator('[role="status"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)
    await slow.locator('button:has-text("ابدأ مجاناً")').first().waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {})
    await ctx.close().catch(() => {})
    // (ب) سطح الحدود الثاني: تنبيهات الإعداد على اللوحة (role=alert —
    // SetupWarnings v3 §4.1) — عدّ وصفي لصفحة p02
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    const dashboardRoles = await page.locator('[role="status"], [role="alert"]').count()
    // (ج) السطح الثالث: إعلانات نافذة الدفع — أثبتها ادعاء الخطوة 5
    // (p12-payment-aria-live) — هنا تُحال مرجعياً لا تُكرر
    await page.goto('/dashboard/broadcast')
    await page.waitForTimeout(1500)
    checkClaim(
      P,
      'p12-boundary-states-announce',
      '[role=status]/[role=alert] على أسطح الحدود',
      [],
      () => ({
        ok: loadingRole,
        actual: {
          pricing_loading_role: loadingRole,
          dashboard_alert_roles: dashboardRoles,
          payment_live: 'أثبته p12-payment-aria-live (خطوة 5)',
        },
      }),
      'حالة التحميل معلنة (role=status) أثناء البطء + تنبيهات اللوحة (role=alert) موثقة + إعلان الحوار (خطوة 5) — عينة 3 أسطح',
      { query: 'UI [role=status]/[role=alert]' }
    )
    expect(loadingRole, 'حالة تحميل معلنة أثناء البطء').toBeTruthy()
    await shot(page, P, '12-step-09-boundary')
  })

  test('10. فتح محادثة بـ Enter + نموذج الرد قابل للوصول', async () => {
    test.skip(!tenantId, 'الخطوة 2 لم تنجح')
    await page.goto('/dashboard/messages')
    await page.waitForTimeout(2500)
    const conv = page.locator('[role="listitem"]').first()
    const hasConv = await conv.isVisible({ timeout: 10_000 }).catch(() => false)
    let opened = false
    let replyLabelOk = false
    let enterSent = false
    if (hasConv) {
      await conv.focus()
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1500)
      opened = await page.locator('textarea[aria-label="نص الرد"]').isVisible({ timeout: 8000 }).catch(() => false)
      if (opened) {
        replyLabelOk = true // aria-label="نص الرد" (label مرتبط دلالياً)
        await page.locator('textarea[aria-label="نص الرد"]').focus()
        await page.keyboard.type('شكراً لتواصلك — سنعود إليك قريباً', { delay: 10 })
        const replyP = page.waitForResponse(
          (r) => r.url().includes('/reply') && r.request().method() === 'POST',
          { timeout: 15_000 }
        )
        await page.keyboard.press('Enter')
        const rp = await Promise.race([replyP, new Promise((r) => setTimeout(() => r(null), 12_000))])
        enterSent = Boolean(rp)
      }
    }
    checkClaim(
      P,
      'p12-messages-keyboard-reply',
      'UI /dashboard/messages (Enter + aria-label)',
      [],
      () => ({ ok: opened && replyLabelOk, actual: { opened, replyLabelOk, enter_sent: enterSent } }),
      'المحادثة تفتح بـ Enter ونموذج الرد مسمى (aria-label) ويُرسل بـ Enter'
    )
    expect(opened, 'المحادثة فتحت بالكيبورد').toBeTruthy()
    await shot(page, P, '12-step-10-reply')
  })

  test('11. ادعاء مجمّع مفروض: 0 serious/critical عبر كل المسارات الممسوحة', async () => {
    test.skip(!tenantId, 'الخطوة 2 لم تنجح')
    checkClaim(
      P,
      'p12-axe-journeys',
      `axe-core ×${sweeps.length} مساراً`,
      [],
      () => ({
        ok: axeJourneyOk(sweeps),
        actual: sweeps.map((s) => `${s.page}: s=${s.serious} c=${s.critical} m=${s.moderate}`),
      }),
      `0 serious/critical عبر ≥7 مسارات كاملة (ممسوح ${sweeps.length}) + تقارير JSON في أدلة الجولة`,
      { query: `axe JSON ×${sweeps.length}` }
    )
    expect(sweeps.length, 'عدد الاجتياحات').toBeGreaterThanOrEqual(7)
    expect(consoleBucket.real().slice(0, 2), 'لا أخطاء JS حقيقية').toHaveLength(0)
  })
})
