import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * v15-E8 (تصميم D13 §4.3) — P10 «وسام مدير الخطة» (مستأجر يضبط حدود
 * الخطة — ميزانية المدفوع): التسجيل الخامس + معالج كامل (ربط صفحة
 * 1002003003 + قاعدة رد) ثم:
 *
 *   1) الخطة المجانية أولاً (funnel C-FREE1/D4-C1): خطوة تفعيل مجاني
 *      مخصصة → POST /api/subscriptions بمبلغ 0 → pending → موافقة أدمن.
 *   2) بوابات حدود المال على الخطة المجانية (Free: has_dm=0,
 *      has_broadcast=0, max_replies=100): DM ممنوع، البث مرفوض 403،
 *      الردود تتوقف عند السقف (بذر usage_counters=cap + انتظار TTL كاش
 *      الحدود 60s) — عقود D2-H1/D2-H3.
 *   3) الاشتراك المدفوع (أساسي 19 د.ل) بمحفظة ليبيانا: الزر disabled
 *      أثناء التقديم + نقر مزدوج (races.doubleClickSubmit) → POST واحد.
 *   4) الترقية (مميز 29 د.ل) + سقف المحفظة (500 → 400 بنكي إجباري).
 *
 * ملاحظة تنفيذية موثقة: تصميم D13 سمّى الخطة المدفوعة «Starter» — الخطط
 * الفعلية (أساسي/مميز/احترافي/مؤسسي) تملك has_dm=1 جميعها، فاختبار بوابة
 * DM يتطلب خطة بلا has_dm = «مجاني» تحديداً؛ لذلك تُقاس البوابات على
 * الخطة المجانية (بعد تفعيلها) قبل الاشتراك المدفوع — نفس العقود،
 * والمدفوع يغطي ما تبقى (البث بعد الترقية للخطة التي تملك has_broadcast).
 */
import { personas, tsSuffix } from './sim/helpers/personas'
import { createPersonaContext, watchConsole } from './sim/helpers/net'
import { shot } from './sim/helpers/shots'
import { browserFetch, API_BASE } from './sim/helpers/api'
import { registerViaUI, approvePayment, getToken, savePersonaToken, savePersonaUsername, skipJoyride } from './sim/helpers/session'
import { checkClaim, queryOne, queryScalar, exec } from './sim/helpers/db-claims.mjs'
import { signWebhook, commentEvent } from './sim/helpers/webhook'
import { doubleClickSubmit } from './sim/helpers/races'

const P = 'p10'
const p = personas.p10
const uname = `p10_${tsSuffix()}`
const email = `${uname}@sim.ly`

let page: Page
let consoleBucket: ReturnType<typeof watchConsole>
let token = ''
let tenantId = 0
let userId = 0
let freePlanId = 0
let basicPlanId = 0
let premiumPlanId = 0
let paidPaymentId = 0

test.describe('P10 — مدير الخطة: حدود المال المدفوعة', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctx = await createPersonaContext(browser, P)
    page = await ctx.newPage()
    consoleBucket = watchConsole(page)
  })

  test.afterAll(async () => {
    await page.context().close().catch(() => {})
  })

  test('1. التسجيل الخامس + المعالج الكامل (ربط صفحة + قاعدة أولى)', async () => {
    const reg = page.waitForResponse(
      (r) => r.url().endsWith('/api/register') && r.request().method() === 'POST',
      { timeout: 20_000 }
    )
    const url = await registerViaUI(page, uname, email, p.password!)
    const regResp = await reg
    expect(regResp?.status(), 'POST /api/register = 200').toBe(200)
    const regBody = await regResp!.json().catch(() => null)
    tenantId = regBody?.data?.user?.tenant_id || 0
    expect(tenantId).toBeGreaterThan(0)
    token = await getToken(page.context())
    savePersonaToken(P, token)
    savePersonaUsername(P, uname)
    const u = queryOne('SELECT id FROM users WHERE username=?', [uname])
    userId = Number(u?.id || 0)

    // معالج onboarding كامل (نفس مسار p02): ربط الصفحة + القاعدة + الإتمام
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'التالي' }).first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByRole('button', { name: 'التالي' }).first().click()
    await page.locator('#pageId').waitFor({ state: 'visible', timeout: 15_000 })
    await page.fill('#pageId', p.pageId!)
    await page.fill('#accessToken', p.accessToken!)
    await page.fill('#pageName', p.pageName!)
    const connP = page.waitForResponse((r) => r.url().includes('/api/onboarding/connect-page'), { timeout: 20_000 })
    await page.locator('button:has-text("التالي")').first().click()
    const conn = await connP
    expect(conn?.status(), 'POST connect-page = 200').toBe(200)
    await page.fill('#keyword', p.rule!.keyword)
    await page.fill('#reply', p.rule!.reply)
    const ruleP = page.waitForResponse((r) => r.url().includes('/api/onboarding/first-rule'), { timeout: 20_000 })
    await page.locator('button:has-text("التالي")').first().click()
    expect((await ruleP)?.status(), 'POST first-rule = 200').toBe(200)
    await page.locator('button:has-text("التالي")').first().click()
    await page.waitForTimeout(700)
    const compP = page.waitForResponse((r) => r.url().includes('/api/onboarding/complete'), { timeout: 20_000 })
    await page.locator('button:has-text("ابدأ الآن")').first().click()
    expect((await compP)?.status(), 'POST complete = 200').toBe(200)
    await page.waitForTimeout(1500)
    await skipJoyride(page)
    await shot(page, P, '10-step-01-registered')

    // بطاقات الخطة من /api/plans (Free/Basic/Premium بالمعرفات الفعلية)
    const plans = await browserFetch(page, '/api/plans')
    const list = (plans.body?.data || []) as any[]
    freePlanId = Number((list.find((x) => Number(x.price) === 0) || {}).id || 0)
    basicPlanId = Number((list.find((x) => Number(x.price) === 19) || list.find((x) => x.name === 'Basic') || {}).id || 0)
    premiumPlanId = Number((list.find((x) => x.name === 'Premium') || {}).id || 0)
    expect(freePlanId, 'خطة مجانية موجودة').toBeGreaterThan(0)
    expect(basicPlanId, 'خطة أساسية موجودة').toBeGreaterThan(0)
    expect(premiumPlanId, 'خطة مميزة موجودة').toBeGreaterThan(0)
    checkClaim(
      P,
      'p10-plans-expose-limits',
      'GET /api/plans (max_replies/has_dm/has_broadcast)',
      [],
      () => ({
        ok: list.every((x) => 'max_replies' in x && 'has_dm' in x && 'has_broadcast' in x),
        actual: list.map((x) => `${x.name}:${x.max_replies}/dm=${x.has_dm}/bcast=${x.has_broadcast}`),
      }),
      'الخطط تكشف عقود الحدود (D2-H1)',
      { query: 'GET /api/plans' }
    )
  })

  test('2. الخطة المجانية: خطوة تفعيل مخصصة → دفعة 0 → موافقة (C-FREE1)', async ({ request }) => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    test.setTimeout(120_000)
    // التسعير → بطاقة «مجاني» (الأولى) → /subscribe
    await page.goto('/pricing')
    await page.locator('button:has-text("ابدأ مجاناً")').first().waitFor({ state: 'visible', timeout: 15_000 })
    await shot(page, P, '10-step-02-pricing-free')
    await page.locator('button:has-text("ابدأ مجاناً")').first().click()
    await page.waitForURL(/\/subscribe/, { timeout: 20_000 })
    // اختيار البطاقة الأولى (مجاني) في PlanSelector → متابعة → مراجعة
    await page.locator('div.grid button[aria-pressed]').first().waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('div.grid button[aria-pressed]').first().click()
    await page.locator('button:has-text("متابعة")').first().click()
    await page.locator('button:has-text("ادفع الآن")').first().waitFor({ state: 'visible', timeout: 15_000 })
    await shot(page, P, '10-step-02-review-free')
    await page.locator('button:has-text("ادفع الآن")').first().click()

    // نافذة الدفع بخطوة التفعيل المجاني المخصصة (v15-E5)
    const freeTitle = page.locator('text=تفعيل الخطة المجانية').first()
    await freeTitle.waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('#payment-phone').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('#payment-phone').fill(p.phone!)
    await shot(page, P, '10-step-02-free-dialog')
    const subP = page.waitForResponse(
      (r) => r.url().endsWith('/api/subscriptions') && r.request().method() === 'POST',
      { timeout: 20_000 }
    )
    await page.locator('button:has-text("تفعيل الخطة المجانية")').first().click()
    const sub = await subP
    const subBody = await sub!.json().catch(() => null)
    const freePaymentId = Number(subBody?.data?.payment_id || 0)
    // العقد (بعد إصلاح E5): POST مقبول + payment_id — الإدخال مُدرج كـ finding
    // حتى يثبت الانقلاب (كاشف findingClosed)
    checkClaim(
      P,
      'p10-free-funnel',
      'POST /api/subscriptions {plan=Free, amount=0}',
      [],
      () => ({ ok: sub?.status() === 200 && freePaymentId > 0, actual: { status: sub?.status(), payment_id: freePaymentId } }),
      'خطوة تفعيل مجاني + POST بمبلغ 0 ينشئ دفعة pending قابلة للموافقة',
      { query: 'POST /api/subscriptions' }
    )
    expect([200, 400]).toContain(sub?.status())

    if (freePaymentId > 0) {
      // موافقة الأدمن → المستأجر على الخطة المجانية PAID
      const approve = await approvePayment(request, freePaymentId, 'verified')
      expect(approve.status, `موافقة الدفعة المجانية (فعلي ${approve.status})`).toBe(200)
      await page.locator('text=تم الموافقة على الاشتراك').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
      const t = queryOne('SELECT plan_id, subscription_status FROM tenants WHERE id=?', [tenantId])
      checkClaim(
        P,
        'p10-free-activated',
        'SELECT plan_id, subscription_status FROM tenants WHERE id=?',
        [tenantId],
        () => ({ ok: Number(t?.plan_id) === freePlanId && t?.subscription_status === 'PAID', actual: t }),
        'المستأجر على الخطة المجانية PAID بعد الموافقة'
      )
      await shot(page, P, '10-step-02-free-approved')
    }
  })

  test('3. بوابة has_dm: تعليق مطابق على خطة بلا DM (D2-H1)', async ({ request }) => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    const signed = signWebhook(
      commentEvent(p.pageId!, {
        commentId: 'c_p10_dm',
        text: 'كم السعر لو سمحت؟',
        fromId: '9020',
        fromName: 'زبون وسام',
      })
    )
    const r = await request.post(`${API_BASE}/webhook`, { headers: signed.headers, data: signed.body })
    expect(r.status(), 'التعليق مقبول').toBe(200)
    await page.waitForTimeout(3000)
    // البوابة في pipeline المرحلة 8b — بعد نجاح إرسال Graph العلني؛ ببيئة
    // المحاكاة الإرسال يُرفض (توكن زائف) فلا يُقاس أثر البوابة هنا — إصلاح
    // E1 موجود ومثبت في pytest؛ الإدخال مُدرج p10-dm-gate حتى توكن حقيقي.
    const dmGate = Number(
      queryScalar("SELECT count(*) FROM bot_logs WHERE tenant_id=? AND message LIKE '%الرد الخاص%'", [tenantId]) || 0
    )
    const commentRow = queryOne('SELECT comment_text FROM comments WHERE fb_comment_id=?', ['c_p10_dm'])
    checkClaim(
      P,
      'p10-dm-gate',
      "SELECT count(*) FROM bot_logs WHERE tenant_id=? AND message LIKE '%الرد الخاص%'",
      [tenantId],
      () => ({ ok: dmGate >= 1, actual: { dm_gate_logs: dmGate, comment_stored: Boolean(commentRow) } }),
      'DM ممنوع لخطة بلا has_dm + BotLog عربي للمستأجر'
    )
  })

  test('4. بوابة max_replies: الردود تتوقف عند السقف (بذر العداد = cap)', async ({ request }) => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    test.setTimeout(150_000)
    // بذر عداد الاستخدام عند سقف الخطة المجانية (100) — البطارية تملك
    // قاعدة v15-sim.db المحلية؛ صيغة period_start تطابق مرساة plan_start
    const anchor = new Date().toISOString().slice(0, 10) + ' 00:00:00.000000'
    exec(
      "INSERT INTO usage_counters (tenant_id, metric, period_start, current_value, updated_at) VALUES (?, 'replies_used', ?, 100, CURRENT_TIMESTAMP)",
      [tenantId, anchor]
    )
    const seeded = queryOne('SELECT current_value FROM usage_counters WHERE tenant_id=? AND metric=?', [
      tenantId,
      'replies_used',
    ])
    // انتظار انقضاء TTL كاش الحدود (60s — عقد engine._get_limits) حتى
    // يقرأ المحرك القيمة المبذورة عند التعليق التالي
    await page.waitForTimeout(65_000)
    const signed = signWebhook(
      commentEvent(p.pageId!, {
        commentId: 'c_p10_cap',
        text: 'السعر كم؟',
        fromId: '9021',
        fromName: 'زبون السقف',
      })
    )
    const r = await request.post(`${API_BASE}/webhook`, { headers: signed.headers, data: signed.body })
    expect(r.status(), 'التعليق عند السقف مقبول (200 — الرفض داخلي)').toBe(200)
    let gateLog = 0
    for (let i = 0; i < 8; i++) {
      gateLog = Number(
        queryScalar("SELECT count(*) FROM bot_logs WHERE tenant_id=? AND message LIKE '%الحد الشهري للردود%'", [tenantId]) || 0
      )
      if (gateLog > 0) break
      await page.waitForTimeout(2500)
    }
    checkClaim(
      P,
      'p10-max-replies',
      "SELECT count(*) FROM bot_logs WHERE tenant_id=? AND message LIKE '%الحد الشهري%'",
      [tenantId],
      () => ({ ok: gateLog >= 1, actual: { gate_logs: gateLog, seeded: seeded?.current_value } }),
      'الردود تتوقف عند السقف + BotLog عربي (تم الوصول إلى الحد الشهري)'
    )
    // D2-H3: العدّاد يزيد من مسار التعليقات — العدّ يقع بعد نجاح Graph
    // (بيئة المحاكاة لا تستطيع إثباته — إصلاح E1 موحد في الكود) — finding
    const counterNow = Number(
      queryScalar('SELECT current_value FROM usage_counters WHERE tenant_id=? AND metric=?', [tenantId, 'replies_used']) || 0
    )
    checkClaim(
      P,
      'p10-replies-used-comments',
      "SELECT current_value FROM usage_counters WHERE tenant_id=? AND metric='replies_used'",
      [tenantId],
      () => ({ ok: counterNow > 100, actual: counterNow }),
      'replies_used يزيد من مسار تعليقات webhook بعد كل رد'
    )
  })

  test('5. بوابة has_broadcast: خطة بلا بث لا تنشئ حتى مسودة (403)', async () => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    const res = await browserFetch(page, '/api/broadcasts', {
      method: 'POST',
      body: { name: 'بث وسام التجريبي', message_template: 'عرض خاص لمشتركي متجر وسام اليوم فقط' },
    })
    const rowCnt = Number(
      queryScalar('SELECT count(*) FROM broadcasts WHERE tenant_id=? AND name=?', [tenantId, 'بث وسام التجريبي']) || 0
    )
    checkClaim(
      P,
      'p10-broadcast-gate',
      'POST /api/broadcasts (خطة بلا has_broadcast)',
      [],
      () => ({ ok: res.status === 403 && rowCnt === 0, actual: { status: res.status, rows: rowCnt, detail: res.body?.detail } }),
      '403 عربية + لا صف بث إطلاقاً (البوابة عند الإنشاء — D2-H1)',
      { query: 'POST /api/broadcasts' }
    )
    expect([403, 400]).toContain(res.status)
    await shot(page, P, '10-step-05-broadcast-gate')
  })

  test('6-7. الاشتراك المدفوع (أساسي): نقر مزدوج → POST واحد + موافقة', async ({ request }) => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    test.setTimeout(150_000)
    // /subscribe?plan=<Basic> → مراجعة → نافذة الدفع (محفظة ليبيانا)
    await page.goto(`/subscribe?plan=${basicPlanId}`)
    await page.locator('button:has-text("ادفع الآن")').first().waitFor({ state: 'visible', timeout: 20_000 })
    await shot(page, P, '10-step-06-review-basic')
    await page.locator('button:has-text("ادفع الآن")').first().click()
    await page.locator('#payment-phone').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('#payment-phone').fill(p.phone!)
    // نقر مزدوج حقيقي (dispatch ×2) — الزر disabled أثناء التقديم + POST واحد
    const race = await doubleClickSubmit(page, 'إرسال طلب الدفع', (r) =>
      r.url().endsWith('/api/subscriptions') && r.request().method() === 'POST'
    )
    paidPaymentId = race.paymentIds[0] || 0
    checkClaim(
      P,
      'p10-pay-single-submit',
      'POST /api/subscriptions (نقر مزدوج)',
      [],
      () => ({
        ok: race.posts === 1 && race.paymentIds.length <= 1 && paidPaymentId > 0,
        actual: {
          posts: race.posts,
          payment_ids: race.paymentIds,
          statuses: race.statuses,
          disabled_during: race.disabledDuring,
          label_during: race.labelDuring,
        },
      }),
      'POST واحد + payment_id واحد (sentRef + _pending_lock) والزر معطّل لحظة التقديم',
      { query: 'POST /api/subscriptions × double-click' }
    )
    expect(race.posts, `عدد استجابات POST (فعلي ${race.posts})`).toBe(1)
    expect(paidPaymentId, 'payment_id صادر').toBeGreaterThan(0)

    // موافقة الأدمن → أساسي PAID + مرساة الدفعة (D7-F5/F8/F9)
    const approve = await approvePayment(request, paidPaymentId, 'verified')
    expect(approve.status, `موافقة الأساسي (فعلي ${approve.status})`).toBe(200)
    await page.locator('text=تم الموافقة على الاشتراك').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
    const pay = queryOne('SELECT status, amount, provider, plan_name FROM subscription_payments WHERE id=?', [paidPaymentId])
    const t = queryOne('SELECT plan_id, subscription_status FROM tenants WHERE id=?', [tenantId])
    checkClaim(
      P,
      'p10-paid-verified',
      'SELECT status, amount, provider, plan_name FROM subscription_payments WHERE id=?',
      [paidPaymentId],
      () => ({
        ok: pay?.status === 'verified' && Number(pay?.amount) === 19 && pay?.provider === 'liyana' && Number(t?.plan_id) === basicPlanId,
        actual: { payment: pay, tenant: t },
      }),
      'verified + 19 + liyana + المستأجر على الأساسي PAID'
    )
    await shot(page, P, '10-step-07-basic-activated')
  })

  test('8. الفواتير تعكس + مرساة usage_counters قوية', async () => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    await page.goto('/dashboard/billing')
    await page.waitForTimeout(2500)
    const billText = await page.locator('body').innerText()
    expect(billText.length, 'صفحة الفواتير حيّة').toBeGreaterThan(120)
    await shot(page, P, '10-step-08-billing')
    const usage = queryOne('SELECT metric, current_value, period_start FROM usage_counters WHERE tenant_id=? AND metric=?', [
      tenantId,
      'replies_used',
    ])
    const paidCount = Number(
      queryScalar('SELECT count(*) FROM subscription_payments WHERE tenant_id=? AND status=?', [tenantId, 'verified']) || 0
    )
    checkClaim(
      P,
      'p10-usage-counter-anchor',
      'SELECT metric, current_value FROM usage_counters WHERE tenant_id=?',
      [tenantId],
      () => ({
        ok: Boolean(usage) && Number(usage?.current_value) === 100 && paidCount >= 1 && (billText.includes('د.ل') || billText.includes('الفواتير')),
        actual: { usage, verified_payments: paidCount },
      }),
      'صف عدّاد الاستخدام قائم (المرساة التي يقرؤها get_plan_limits) + دفعة موثقة معروضة'
    )
  })

  test('9. الترقية إلى مميز: حدود الخطة الجديدة تسري ولا اشتراكان فعّالان', async ({ request }) => {
    test.skip(!paidPaymentId, 'الخطوة 6 لم تنجح')
    const up = await browserFetch(page, '/api/subscriptions/upgrade', {
      method: 'POST',
      body: { plan_id: premiumPlanId, provider: 'liyana', amount: 29, phone: p.phone! },
    })
    expect(up.status, `ترقية (فعلي ${up.status}: ${JSON.stringify(up.body).slice(0, 140)})`).toBe(200)
    const upgradePaymentId = Number(up.body?.data?.payment_id || 0)
    expect(upgradePaymentId).toBeGreaterThan(0)
    const approve = await approvePayment(request, upgradePaymentId, 'verified')
    expect(approve.status, `موافقة الترقية (فعلي ${approve.status})`).toBe(200)
    const t = queryOne('SELECT plan_id, subscription_status FROM tenants WHERE id=?', [tenantId])
    // دلالة D7-F15: خطة فعّالة واحدة (plan_id مفرد) لا اشتراكان
    checkClaim(
      P,
      'p10-upgrade-single-active-plan',
      'SELECT plan_id, subscription_status FROM tenants WHERE id=?',
      [tenantId],
      () => ({ ok: Number(t?.plan_id) === premiumPlanId && t?.subscription_status === 'PAID', actual: t }),
      'plan_id = مميز (خطة فعّالة واحدة — دلالة D7-F15) والحدود تُقرأ منها'
    )
    // البث بعد الترقية (has_broadcast=1): الإنشاء والإرسال عبر اللوحة —
    // الحالة لا تبقى draft (عقد D1-C1 المحلي — طابور claim E3)
    await page.goto('/dashboard/broadcast')
    await page.waitForTimeout(2500)
    const newBtn = page.locator('button:has-text("بث جديد")').first()
    if (await newBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await newBtn.click()
      await page.locator('#broadcast-name').fill('بث مميز')
      await page.locator('textarea[aria-label="نص الرسالة"]').fill('عرض نهاية الأسبوع لمشتركي متجر وسام')
      await page.locator('button:has-text("إنشاء البث")').first().click()
      await page.waitForTimeout(2500)
      const sendBtn = page.locator('button:has-text("إرسال")').first()
      if (await sendBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
        await sendBtn.click().catch(() => {})
        await page.waitForTimeout(3500)
      }
      await shot(page, P, '10-step-09-broadcast-sent')
      const bc = queryOne('SELECT status FROM broadcasts WHERE tenant_id=? ORDER BY id DESC LIMIT 1', [tenantId])
      checkClaim(
        P,
        'p10-broadcast-queue-not-draft',
        'SELECT status FROM broadcasts WHERE tenant_id=? ORDER BY id DESC',
        [tenantId],
        () => ({ ok: Boolean(bc) && bc.status !== 'draft', actual: bc?.status }),
        'البث لا يبقى draft (claim ذرّي pending→sending→sent/failed — D1-C1)'
      )
    }
  })

  test('10. سقف المحفظة: شحن 500 عبر محفظة → 400 تحويل بنكي إجباري', async () => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    const overCap = await browserFetch(page, '/api/payments/topup', {
      method: 'POST',
      body: { amount: 500, provider: 'liyana', phone: p.phone! },
    })
    expect(overCap.status, `فوق السقف (فعلي ${overCap.status})`).toBe(400)
    expect(String(overCap.body?.detail || '')).toContain('تحويل بنكي')
    await shot(page, P, '10-step-10-wallet-cap')
    checkClaim(
      P,
      'p10-wallet-cap',
      'POST /api/payments/topup {500, liyana}',
      [],
      () => ({ ok: overCap.status === 400, actual: overCap.status }),
      '400 — سقف المحفظة يجبر التحويل البنكي (عقد v14 حي بأرقام p10)',
      { query: 'POST /api/payments/topup' }
    )
  })

  test('11. ادعاء ختامي: الفواتير = ما في subscription_payments بالضبط', async () => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    const rows = Number(
      queryScalar('SELECT count(*) FROM subscription_payments WHERE tenant_id=?', [tenantId]) || 0
    )
    const verified = Number(
      queryScalar('SELECT count(*) FROM subscription_payments WHERE tenant_id=? AND status=?', [tenantId, 'verified']) || 0
    )
    await page.goto('/dashboard/billing')
    await page.waitForTimeout(2500)
    const body = await page.locator('body').innerText()
    checkClaim(
      P,
      'p10-invoices-match-payments',
      'SELECT count(*) FROM subscription_payments WHERE tenant_id=?',
      [tenantId],
      () => ({ ok: rows >= 2 && verified >= 2 && body.includes('د.ل'), actual: { rows, verified } }),
      'دفعتا p10 (مجاني + أساسي + ترقية) ظاهرة في الفواتير بنفس حالات DB'
    )
    expect(rows, 'دفعات p10 في DB').toBeGreaterThanOrEqual(2)
    // v15-fix: رسائل 4xx من الحراس المتعمدة (بوابات الخطة 403 / حدود المعدل 429)
    // ليست أخطاء JS — العقد المفحوص: أخطاء 5xx وJS الفعلية فقط
    const realJs = consoleBucket.real().filter((e) => !/status of 4(0[0-9]|29)\b/.test(e))
    expect(realJs.slice(0, 2), 'لا أخطاء JS حقيقية').toHaveLength(0)
  })
})
