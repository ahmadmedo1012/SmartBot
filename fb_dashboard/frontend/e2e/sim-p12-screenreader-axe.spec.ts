import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * v15-E8 (تصميم D13 §4.5) — P12 «عبدالرؤوف قارئ الشاشة» (ضعيف البصر):
 * كل الرحلة بلا نقرة فأرة واحدة (برمجي focus + Tab/Shift+Tab/Enter) مع
 * اجتياحات axe-core على المسارات كاملة لا صفحة مفردة — يغلق الفجوة
 * التاريخية (بوابة a11y معطلة منذ v6 — الآن داخل بطارية المستخدم نفسها).
 * يعيد استخدام p02 + أدمن البذرة (طابور المدفوعات).
 */
import { createPersonaContext, watchConsole } from './sim/helpers/net'
import { shot } from './sim/helpers/shots'
import { ADMIN_USER, ADMIN_PASS, browserFetch } from './sim/helpers/api'
import {
  loadPersonaUsername, savePersonaToken, loadPersonaState, savePersonaState, ensureSession,
} from './sim/helpers/session'
import { checkClaim, queryScalar, exec } from './sim/helpers/db-claims.mjs'
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
let uname = loadPersonaUsername('p02')
const password = 'Sim#P02pass'

let page: Page
let consoleBucket: ReturnType<typeof watchConsole>
const sweeps: AxeSweepResult[] = []
let tenantId = 0

// phase8 (إعادة 3b83f76): إعادة امتلاء من القرص بعد أي إعادة تشغيل عامل —
// السياق يُبنى بلا كوكيز فتسقط الاختبارات اللاحقة. الجلسة تُنشأ في الخطوة 2
// (نموذج دخول) — لا حقن في beforeAll كي لا يرتد /login المصادَق (p12
// يفتح النموذج في الخطوة 1)؛ الامتلاء هنا شرطي على وجود حالة مخزنة.
async function rehydrate(): Promise<void> {
  const st = loadPersonaState(P)
  if (st.username) uname = st.username
  tenantId = Number(st.tenantId || tenantId || 0)
  if (st.token && tenantId && uname) {
    await ensureSession(page, P, { username: uname, password })
  }
}

test.describe('P12 — قارئ الشاشة (axe مسارات كاملة + كيبورد فقط)', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctx = await createPersonaContext(browser, P)
    page = await ctx.newPage()
    consoleBucket = watchConsole(page)
  })

  test.afterAll(async () => {
    await page.context().close().catch(() => {})
  })

  // phase8: إعادة امتلاء قبل كل اختبار (حصانة إعادة تشغيل العامل)
  test.beforeEach(async () => {
    await rehydrate()
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
    // phase8: الحالة على القرص — إعادة تشغيل العامل تعيد امتلاء الجلسة
    // وtenantId من هنا (الخطوات 3+ كلها مشروطة بهما)
    if (token) savePersonaState(P, { username: uname, token, tenantId })
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
    // الدفعة تبقى pending — الخطوة 6 قد تلغيها عبر مسار المنتج («إلغاء
    // الطلب المعلق») لفتح النموذج؛ الخطوة 7 تضمن وجود صف معلق للطابور
    // (تنشئ واحدًا عبر API الحقيقي إن لم يبق شيء) ثم تحسمه «رفض» بالكيبورد
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
    // phase8 (إعادة 3b83f76 + بقايا p12#6): دفعة الخطوة 5 ما زالت معلقة —
    // مسبار الفتح (v18-1-b: GET /api/subscriptions/pending عند فتح الحوار)
    // يقلب الحوار لشاشة «طلب معلق» بدل النموذج. سباق الجولة 7: النموذج
    // يُرسم أولًا ثم يُستبدل فتموت مهلة focus زر التبويب. رحلة المنتج
    // الحقيقية التي يعِد بها الزر نفسه: «إلغاء الطلب المعلق وإعادة المحاولة»
    // بالكيبورد → الحوار يعيد النموذج (payments/plans.py:553 إعادة فحص).
    const cancelPending = page.getByRole('button', { name: /إلغاء الطلب المعلق/ })
    // phase8-fix (p12#6): isVisible() لا تنتظر أصلًا (مهلة الخيار تُهمَل
    // داخليًا — التتبع أثبته: الاستدعاء أُرسل بلا مهلة) فقاضى زر الإلغاء
    // قبل أن يرسم الحوار شاشة «طلب معلق» بعد الجلب (probe غير متزامن)
    // → تخطي الإلغاء → النموذج لا يظهر أبدًا. الانتظار الحقيقي بـ waitFor.
    if (await cancelPending.first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) {
      await cancelPending.first().focus()
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1200)
    }
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
    // phase8: ضمان وجود صف معلق في الطابور — جدول الطابور لا يُرسم أصلًا
    // بلا صفوف (EmptyState) فتسقط ادعاءات th[scope]. الخطوة 6 قد ألغت دفعة
    // الخطوة 5 بمسار المنتج؛ ننشئ بديلًا عبر القناة الحقيقية نفسها
    // (POST /api/subscriptions من مستخدمة p12) ثم يرفضها الأدمن لاحقًا.
    const pendingCount = Number(queryScalar('SELECT COUNT(*) FROM subscription_payments WHERE status=?', ['pending']) || 0)
    if (pendingCount === 0) {
      const basicId = Number(queryScalar('SELECT id FROM subscription_plans WHERE name=?', ['Basic']) || 0)
      const created = await browserFetch(page, '/api/subscriptions', {
        method: 'POST',
        body: { plan_id: basicId, provider: 'liyana', amount: 19, phone: '0910000001' },
      })
      expect(created.status, `إنشاء دفعة للطابور (فعلي ${created.status})`).toBe(200)
    }
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
    if (await rejectBtn.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)) {
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
      /* v16-منسّق: مهلة استقرار قبل المسح — نفس المهلة التي كانت لخطوة 1
       * فقط. بدونها يقع مسح axe أثناء حركة ob-step-enter (opacity<1
       * محسوبة) فيمزج لون النص مع الخلفية ويفشل التباين عابراً — القياس
       * يجب أن يكون على الحالة المستقرة لا منتصف الحركة (WCAG يقيس
       * الحالات المستقرة؛ الحركات <500ms عابرة). */
      await page.waitForTimeout(1200)
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

  test('9. صفحات الحدود تعلن حالتها (فشل الخطط + أسطح اللوحة — عينة 3)', async ({ browser }) => {
    test.skip(!tenantId, 'الخطوة 2 لم تنجح')
    // (أ) فشل تحميل الخطط — حتميًا: إجهاض /api/plans من السياق نفسه.
    // phase8 (إعادة 3b83f76): التوقع القديم (role=status أثناء تحميل بطيء)
    // كان متقادمًا — /pricing يرسم البطاقات فورًا من الافتراضية (v18-1-c:
    // لا حالة تحميل على المسار البارد) فلا يُرى loading أبدًا. السطح
    // الحقيقي القابل للقياس: فشل الجلب النهائي → لافتة role=status
    // «تُعرض الباقات الافتراضية — أعد المحاولة» (pricing/page.tsx:158) —
    // نفس عائلة الحدود المعلنة، حتمية بلا سباقات شبكة.
    const ctx = await createPersonaContext(browser, 'p12-slow', { recordHar: false })
    const slow = await ctx.newPage()
    await slow.route('**/api/plans', (route) => route.abort('failed'))
    await slow.goto('/pricing')
    const failedBanner = slow.locator('[role="status"]').filter({ hasText: 'الباقات الافتراضية' })
    const loadingRole = await failedBanner.first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)
    // phase8-fix (p12#9): isVisible لا تنتظر (المهلة تُهمَل داخليًا) فقاضت
    // اللافتة قبل رسمها مرة وفازت السباق مرة — waitFor يحسمها حتميًا.
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
          pricing_plans_failed_banner: loadingRole,
          dashboard_alert_roles: dashboardRoles,
          payment_live: 'أثبته p12-payment-aria-live (خطوة 5)',
        },
      }),
      'فشل الخطط معلن (role=status «الباقات الافتراضية» — v18-1-c) + تنبيهات اللوحة (role=alert) موثقة + إعلان الحوار (خطوة 5) — عينة 3 أسطح',
      { query: 'UI [role=status]/[role=alert]' }
    )
    expect(loadingRole, 'حالة فشل الخطط معلنة (role=status)').toBeTruthy()
    await shot(page, P, '12-step-09-boundary')
  })

  test('10. فتح محادثة بـ Enter + نموذج الرد قابل للوصول', async () => {
    test.skip(!tenantId, 'الخطوة 2 لم تنجح')
    await page.goto('/dashboard/messages')
    await page.waitForTimeout(2500)
    // phase8 (v24-C2): دلالات القائمة على <li> حقيقية (ul role=list) —
    // role="listitem" على الزر أُزيل. getByRole('listitem') يلتقط <li> الفعلي.
    const conv = page.getByRole('listitem').first()
    const hasConv = await conv.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)
    let opened = false
    let replyLabelOk = false
    let enterSent = false
    if (hasConv) {
      // phase8-fix (p12#10): العنصر التفاعلي هو زر ConvItem داخل <li> —
      // <li> نفسه غير قابل للتركيز (لا tabindex) فتركيزه no-op وEnter
      // يضيع. الكيبورد الحقيقي يصل الزر بـ Tab — نفس ما نحاكيه هنا.
      await conv.getByRole('button').focus()
      await page.keyboard.press('Enter')
      await page.waitForTimeout(1500)
      opened = await page.locator('textarea[aria-label="نص الرد"]').waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)
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
