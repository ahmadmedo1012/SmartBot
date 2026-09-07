import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * v14-E7 (تصميم D13 §3 P04) — «منال» عائدة: نفس مستخدمة P02 (هذا معنى
 * «مشترك عائد») — دخول واجهة جديد ثم: محفظة (رصيد/سجل) → شحن رصيد →
 * رفض السقف والمزود → تجديد (madar) بموافقة → إلغاء بقرار الأدمن →
 * الفواتير تعكس.
 *
 * ملاحظتان صادقتان عن انحراف التوقع في التصميم (السلوك الفعلي هو العقد):
 *  - «سجل الدفع يحوي دفعة P02»: /api/payments/history يعرض جدول
 *    payment_requests (الشحنات) لا subscription_payments — لذا الدفعة
 *    الظاهرة فيه هي شحنة هذه الشخصية نفسها (خطوة 4).
 *  - «حالة المستأجر تراجعت»: قرار cancelled يضبط users.subscription_status
 *    = REJECTED فقط (approvals.py L87-91) — tenants.subscription_status يبقى
 *    PAID. البطارية توثق المتاح (ملاحظة التصميم §P04 نفسها).
 */
import { personas } from './sim/helpers/personas'
import { createPersonaContext, watchConsole } from './sim/helpers/net'
import { shot } from './sim/helpers/shots'
import { browserFetch } from './sim/helpers/api'
import { loginViaUI, loadPersonaUsername, savePersonaToken, getToken, approvePayment, skipJoyride } from './sim/helpers/session'
import { checkClaim, queryOne, queryScalar } from './sim/helpers/db-claims.mjs'

const P = 'p04'
const p = personas.p04
const uname = loadPersonaUsername('p02')
const password = personas.p02.password!

let page: Page
let token = ''
let userId = 0
let tenantId = 0
let topupId = 0
let renewId = 0
let cancelId = 0

test.describe('P04 — مشتركة عائدة', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctx = await createPersonaContext(browser, P)
    page = await ctx.newPage()
    watchConsole(page)
  })

  test.afterAll(async () => {
    await page.context().close().catch(() => {})
  })

  test('1-3. دخول UI ببيانات p02 → لوحتها + المحفظة (رصيد/سجل)', async () => {
    test.skip(!uname, 'P02 لم تكتب اسم المستخدمة — شغّل البطارية كاملة')
    // الخطوة 1 — دخول واجهة جديد (وكوكي جلسة جديد)
    const landing = await loginViaUI(page, uname, password)
    expect(landing, `هبوط ${landing}`).toMatch(/dashboard/)
    token = await getToken(page.context())
    savePersonaToken('p02', token) // التوكن الجديد هو ما تستخدمه P08
    await page.waitForTimeout(2000)
    await skipJoyride(page)
    await shot(page, P, '04-step-01-login')

    // هوية p02 من DB (user_id/tenant_id للادعاءات)
    const u = queryOne('SELECT id, tenant_id FROM users WHERE username=?', [uname])
    userId = Number(u?.id || 0)
    tenantId = Number(u?.tenant_id || 0)
    expect(userId, 'مستخدمة p02 موجودة').toBeGreaterThan(0)

    // الخطوة 2-3 — صفحة الفواتير تجلب الرصيد والسجل (الاستعلامان الفعليان)
    await page.goto('/dashboard/billing')
    await page.locator('text=الرصيد الحالي').first().waitFor({ state: 'visible', timeout: 15_000 })
    const balance = await browserFetch(page, '/api/payments/balance')
    expect(balance.status, 'GET /api/payments/balance = 200').toBe(200)
    expect(balance.body?.success).toBe(true)
    expect(typeof balance.body?.data?.balance).toBe('number')
    const history = await browserFetch(page, '/api/payments/history')
    expect(history.status, 'GET /api/payments/history = 200').toBe(200)
    expect(Array.isArray(history.body?.data)).toBe(true)
    await shot(page, P, '04-step-02-balance')
    await shot(page, P, '04-step-03-history')
    checkClaim(
      P,
      'p04-wallet-balance-history',
      'GET /api/payments/balance + /api/payments/history',
      [],
      () => ({ ok: balance.status === 200 && history.status === 200, actual: `balance=${balance.status} history=${history.status} (${history.body?.data?.length} صف)` }),
      '200 + 200',
      { query: 'GET /api/payments/{balance,history}' }
    )
  })

  test('4-6. شحن رصيد يعمل وحدود المدخلات تُرفض (سقف/مزود)', async () => {
    test.skip(!userId, 'الخطوة 1 لم تنجح')
    // الخطوة 4 — شحن 50 د.ل عبر ليبيانا (قناة المتصفح بعقد CSRF الكامل)
    const topup = await browserFetch(page, '/api/payments/topup', {
      method: 'POST',
      body: { amount: 50, provider: 'liyana', phone: '0910000001' },
    })
    expect(topup.status, `شحن الرصيد 200 (فعلي ${topup.status}: ${JSON.stringify(topup.body).slice(0, 140)})`).toBe(200)
    topupId = Number(topup.body?.data?.payment_id || 0)
    expect(topupId).toBeGreaterThan(0)
    await page.goto('/dashboard/billing')
    await page.waitForTimeout(2000)
    await shot(page, P, '04-step-04-topup')
    checkClaim(
      P,
      'p04-topup-pending',
      'SELECT status, amount, provider FROM payment_requests WHERE id=?',
      [topupId],
      (rows) => {
        const r = rows[0]
        return { ok: r?.status === 'pending' && Number(r?.amount) === 50 && r?.provider === 'liyana', actual: r }
      },
      'pending + 50 + liyana'
    )

    // الخطوة 5 — فوق سقف المحفظة (500 > 99 افتراضياً) → تحويل بنكي إجباري.
    // (التصميم قال 99999 — لكن ذاك يقع في فحص الحدود 1..10000 أولاً؛
    // القيمة 500 تضرب فحص السقف نفسه: wallet.py L26-43)
    const overCap = await browserFetch(page, '/api/payments/topup', {
      method: 'POST',
      body: { amount: 500, provider: 'liyana', phone: '0910000001' },
    })
    expect(overCap.status, `فوق السقف مرفوض (فعلي ${overCap.status})`).toBe(400)
    expect(String(overCap.body?.detail || '')).toContain('تحويل بنكي')
    await shot(page, P, '04-step-05-cap')

    // الخطوة 6 — مزود غير صالح
    const badProvider = await browserFetch(page, '/api/payments/topup', {
      method: 'POST',
      body: { amount: 50, provider: 'visa', phone: '0910000001' },
    })
    expect(badProvider.status, `مزود غير صالح (فعلي ${badProvider.status})`).toBe(400)
    expect(String(badProvider.body?.detail || '')).toContain('مزود')
    await shot(page, P, '04-step-06-provider')
    checkClaim(
      P,
      'p04-topup-guards',
      'POST /api/payments/topup (فوق السقف + مزود غير صالح)',
      [],
      () => ({ ok: overCap.status === 400 && badProvider.status === 400, actual: `سقف=${overCap.status}، مزود=${badProvider.status}` }),
      '400 + 400',
      { query: 'POST /api/payments/topup' }
    )
  })

  test('7-8. التجديد: دفعة جديدة (madar) + موافقة → verified', async ({ request }) => {
    test.skip(!userId, 'الخطوة 1 لم تنجح')
    // جلب الخطط واختيار خطة مدفوعة (المبلغ يجب أن يطابق سعرها)
    const plans = await browserFetch(page, '/api/plans')
    const paid = (plans.body?.data || []).find((pl: any) => Number(pl.price) > 0 && Number(pl.price) < 90)
    expect(paid, 'خطة مدفوعة تحت سقف المحفظة').toBeTruthy()

    // الخطوة 7 — تجديد بمزود مدار
    const renew = await browserFetch(page, '/api/subscriptions', {
      method: 'POST',
      body: {
        plan_id: paid.id,
        provider: 'madar',
        amount: Number(paid.price),
        phone: '0910000001',
      },
    })
    expect(renew.status, `تجديد 200 (فعلي ${renew.status}: ${JSON.stringify(renew.body).slice(0, 140)})`).toBe(200)
    renewId = Number(renew.body?.data?.payment_id || 0)
    expect(renewId).toBeGreaterThan(0)
    await shot(page, P, '04-step-07-renew')

    // موافقة الأدمن
    const approve = await approvePayment(request, renewId, 'verified')
    expect(approve.status, `موافقة التجديد (فعلي ${approve.status})`).toBe(200)
    checkClaim(
      P,
      'p04-renew-verified',
      'SELECT status, provider FROM subscription_payments WHERE id=?',
      [renewId],
      (rows) => {
        const r = rows[0]
        return { ok: r?.status === 'verified' && r?.provider === 'madar', actual: r }
      },
      'verified + madar'
    )

    // الخطوة 8 — ادعاء DB: عدد دفعات p02 ≥ 2 (الأصل + التجديد)
    const cnt = Number(queryScalar('SELECT count(*) FROM subscription_payments WHERE user_id=?', [userId]) || 0)
    checkClaim(
      P,
      'p04-payments-count',
      'SELECT count(*) FROM subscription_payments WHERE user_id=?',
      [userId],
      () => ({ ok: cnt >= 2, actual: cnt }),
      '≥2'
    )
    expect(cnt, `دفعات p02 = ${cnt}`).toBeGreaterThanOrEqual(2)
  })

  test('9-11. الإلغاء: قرار الأدمن cancelled يُنعكس في DB والواجهة', async ({ request }) => {
    test.skip(!renewId, 'التجديد لم ينشأ')
    // الخطوة 9 — v14-fix: الحسم الذرّي يشترط status='pending' — دفعة التجديد
    // صارت verified في الاختبار السابق، فالإلغاء يستهدف دفعة pending جديدة
    // (نفس مسار الخلق) — هذا عقد approvals.py الفعلي (UPDATE WHERE pending)
    const plans = await browserFetch(page, '/api/plans')
    const paid = (plans.body?.data || []).find((pl: any) => Number(pl.price) > 0 && Number(pl.price) < 90)
    const pending = await browserFetch(page, '/api/subscriptions', {
      method: 'POST',
      body: { plan_id: paid.id, provider: 'madar', amount: Number(paid.price), phone: '0910000002' },
    })
    cancelId = Number(pending.body?.data?.payment_id || 0)
    expect(cancelId, 'دفعة pending للإلغاء').toBeGreaterThan(0)
    const cancel = await approvePayment(request, cancelId, 'cancelled')
    expect(cancel.status, `إلغاء الأدمن (فعلي ${cancel.status})`).toBe(200)
    checkClaim(P, 'p04-cancelled', 'POST /api/admin/subscriptions {cancelled}', [], (rows) => ({ ok: true, actual: cancel.status }), '200', {
      query: 'POST /api/admin/subscriptions',
    })

    // الخطوة 10 — ادعاء DB: الدفعة cancelled + حالة المستخدم REJECTED
    // (المستأجر يبقى PAID — عقد approvals.py الفعلي، مذكّر أعلاه)
    const pay = queryOne('SELECT status FROM subscription_payments WHERE id=?', [cancelId])
    const user = queryOne('SELECT subscription_status FROM users WHERE id=?', [userId])
    const tenant = queryOne('SELECT subscription_status FROM tenants WHERE id=?', [tenantId])
    checkClaim(
      P,
      'p04-tenant-after-cancel',
      'SELECT status FROM subscription_payments WHERE id=?',
      [cancelId],
      () => ({
        ok: pay?.status === 'cancelled' && user?.subscription_status === 'REJECTED',
        actual: { payment: pay?.status, user: user?.subscription_status, tenant: tenant?.subscription_status },
      }),
      'payment=cancelled + user=REJECTED (المستأجر يبقى PAID بعقد الكود)',
      { query: 'SELECT … subscription_payments/users/tenants' }
    )
    expect(pay?.status).toBe('cancelled')

    // الخطوة 11 — الفواتير تعكس (الشحنة قيد الانتظار ظاهرة)
    await page.goto('/dashboard/billing')
    await page.waitForTimeout(2500)
    const billText = await page.locator('body').innerText()
    expect(billText.includes('قيد الانتظار') || billText.includes('ليبيانا'), 'الفواتير تعكس الشحنة').toBeTruthy()
    await shot(page, P, '04-step-11-billing-after')
  })
})
