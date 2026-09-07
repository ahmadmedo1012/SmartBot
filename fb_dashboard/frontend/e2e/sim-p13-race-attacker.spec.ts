import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * v15-E8 (تصميم D13 §4.6) — P13 «مروان المهاجم الموسّع»: امتداد خالد
 * (p07) بلا تسجيل مشروع جديد (جلسة p02 + توكن الأدمن المخزّن).
 *
 * جديد الجولة: حقن bidi · سباق النقر المزدوج على الدفع · سباق POST
 * المتزامن · سباق الحسم المتزامن (verified مقابل cancelled) · سباق
 * التسجيل المتزامن · SSRF بالاسم وبالعنوان الحرفي · brute-force لكلمة
 * المرور · ?token= للكرون. يُنفَّذ آخر ملف يفجّر الحدود (قاعدة المعدل —
 * §6.4) وقبيل p14 (التدوير) حصراً.
 */
import { createPersonaContext, watchConsole } from './sim/helpers/net'
import { shot } from './sim/helpers/shots'
import { API_BASE, FRONT_BASE, browserFetch } from './sim/helpers/api'
import { loadPersonaToken, loadPersonaUsername, approvePayment, loadAdminToken } from './sim/helpers/session'
import { checkClaim, queryScalar, queryOne, exec } from './sim/helpers/db-claims.mjs'
import { signWebhook, messageEvent } from './sim/helpers/webhook'
import { doubleClickSubmit, concurrentPosts } from './sim/helpers/races'

const P = 'p13'
const p02Token = loadPersonaToken('p02')
const p02name = loadPersonaUsername('p02')
const adminToken = loadAdminToken()
const CRON_SECRET = process.env.SIM_CRON_SECRET || ''

let page: Page
let consoleBucket: ReturnType<typeof watchConsole>
let usersBefore = 0
const bodiesSwept: string[] = []

test.describe('P13 — مهاجم موسّع (سباقات + bidi + SSRF + حدود)', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctx = await createPersonaContext(browser, P)
    if (p02Token) {
      await ctx.addCookies([{ name: 'token', value: p02Token, url: FRONT_BASE }])
    }
    page = await ctx.newPage()
    consoleBucket = watchConsole(page)
    usersBefore = Number(queryScalar('SELECT count(*) FROM users') || 0)
  })

  test.afterAll(async () => {
    await page.context().close().catch(() => {})
  })

  test('1. حقن bidi في اسم مستخدم: رفض نظيف (400) بلا 500', async ({ request }) => {
    const bidiName = `mar${'\u202E'}wan${'\u2066'}x${'\u2069'}${Date.now().toString(36).slice(-5)}`
    const r = await request.post(`${FRONT_BASE}/api/register`, {
      data: { username: bidiName, email: `m13_${Date.now().toString(36).slice(-5)}@evil.ly`, password: 'Evil#Pass123' },
    })
    const body = await r.text()
    bodiesSwept.push(body)
    checkClaim(
      P,
      'p13-bidi-username-clean-reject',
      'POST /api/register (اسم bidi)',
      [],
      () => ({
        ok: r.status() === 400 && !/Traceback|SQLAlchemy/.test(body),
        actual: { status: r.status(), body: body.slice(0, 120) },
      }),
      '400 (التحقق ^[\\w.-]+$ يرفض محارف التحكم) بلا تسريب خام',
      { query: 'POST /api/register' }
    )
    expect([400]).toContain(r.status())
    // DOM يعرض القيمة الحرفية بلا انقلاب إن خُزّنت يوماً (الاسم هنا مرفوض —
    // الفحص البنيوي على صفحة التسجيل نفسها)
    await page.goto('/register')
    await page.locator('#username').fill(bidiName)
    const shown = await page.locator('#username').inputValue()
    expect(shown, 'القيمة الحرفية كما هي').toBe(bidiName)
  })

  test('2. حقن bidi في قاعدة رد: تخزين وعرض كنص بلا انقلاب', async () => {
    test.skip(!p02Token, 'جلسة p02 غير متاحة — شغّل البطارية كاملة')
    const bidiKeyword = `سعر${'\u2066'}X${'\u2069'}`
    const bidiReply = `الرد ${'\u202E'}dl.50${'\u202C'} — شكراً لك`
    // v15-fix (بطارية 22:15): العقد الفعلي Form-data (rules.py:71 — Form(...)) —
    // وFormData لا تعبر تسلسل evaluate (تصل فارغة) — نبنيها داخل الصفحة
    // عبر init.form (نفس ما يرسله نموذج الواجهة فعلاً)
    const res = await browserFetch(page, '/api/rules', {
      method: 'POST',
      form: { name: 'قاعدة bidi', keywords: bidiKeyword, reply_template: bidiReply },
    })
    const bodyStr = JSON.stringify(res.body)
    bodiesSwept.push(bodyStr)
    await page.goto('/dashboard/autoreply')
    await page.waitForTimeout(2500)
    const pageText = await page.locator('body').innerText()
    const structureOk = await page.evaluate(() => document.documentElement.getAttribute('dir') === 'rtl')
    checkClaim(
      P,
      'p13-bidi-rule-safe-display',
      'POST /api/rules (bidi) + UI /dashboard/autoreply',
      [],
      () => ({
        ok: res.status === 200 && structureOk && !/Traceback/.test(pageText),
        actual: { status: res.status, dir: structureOk, stored: bodyStr.slice(0, 100) },
      }),
      'القاعدة تُخزَّن وتُعرض كنص (dir=rtl سليم) بلا 500 ولا انقلاب بنية',
      { query: 'POST /api/rules' }
    )
    expect(res.status, `إنشاء القاعدة (فعلي ${res.status})`).toBe(200)
    await shot(page, P, '13-step-02-bidi-rule')
  })

  test('3. webhook برسالة bidi موقّعة → النص الحرفي المخزّن والعرض آمن', async ({ request }) => {
    test.skip(!p02name, 'جلسة p02 غير متاحة')
    const bidiText = `فاتورة 4521 ${'\u202E'}USD 99${'\u202C'} رابط: https://evil.ly/x?id=1`
    const signed = signWebhook(
      messageEvent('1002003001', { senderId: '9130', senderName: 'مروان', mid: 'm_p13_bidi', text: bidiText })
    )
    const r = await request.post(`${API_BASE}/webhook`, { headers: signed.headers, data: signed.body })
    expect(r.status(), 'الحدث الموقّع مقبول').toBe(200)
    let row: any = null
    for (let i = 0; i < 10 && !row; i++) {
      row = queryOne('SELECT text FROM messages WHERE fb_message_id=?', ['m_p13_bidi'])
      if (!row) await page.waitForTimeout(1000)
    }
    checkClaim(
      P,
      'p13-bidi-webhook-literal',
      'SELECT text FROM messages WHERE fb_message_id=?',
      ['m_p13_bidi'],
      () => ({ ok: row?.text === bidiText, actual: row?.text }),
      'النص المخزّن حرفي (بايتات) — لا تطهير يفسد القيمة ولا انقلاب عند العرض'
    )
    expect(row?.text).toBe(bidiText)
  })

  test('4. سباق النقر المزدوج (UI): POST واحد + payment_id واحد + الزر معطّل', async ({ request }) => {
    test.skip(!p02Token, 'جلسة p02 غير متاحة')
    const basicId = Number(queryScalar('SELECT id FROM subscription_plans WHERE name=?', ['Basic']) || 0)
    await page.goto(`/subscribe?plan=${basicId}`)
    await page.locator('button:has-text("ادفع الآن")').first().waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('button:has-text("ادفع الآن")').first().click()
    await page.locator('#payment-phone').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('#payment-phone').fill('0910000001')
    const race = await doubleClickSubmit(page, 'إرسال طلب الدفع', (r) =>
      r.url().endsWith('/api/subscriptions') && r.request().method() === 'POST'
    )
    const pid = race.paymentIds[0] || 0
    checkClaim(
      P,
      'p13-double-submit',
      'POST /api/subscriptions (نقر مزدوج dispatch×2)',
      [],
      () => ({
        ok: race.posts === 1 && race.paymentIds.length <= 1,
        actual: { posts: race.posts, payment_ids: race.paymentIds, disabled: race.disabledDuring, label: race.labelDuring },
      }),
      'استجابة POST واحدة + payment_id واحد + الزر disabled لحظة التقديم (sentRef + _pending_lock)',
      { query: 'POST /api/subscriptions ×2 click' }
    )
    expect(race.posts, `عدد POST (فعلي ${race.posts})`).toBe(1)
    // حسم دفعة السباق حتى لا تعيق الخطوات التالية (pending وحيد)
    if (pid > 0) {
      const approve = await approvePayment(request, pid, 'verified')
      expect(approve.status, `حسم دفعة النقر المزدوج (فعلي ${approve.status})`).toBe(200)
    }
    await shot(page, P, '13-step-04-double-submit')
  })

  test('5. سباق API: POST متزامنان → لا 500 والاتفاق النهائي خطة فعّالة واحدة', async ({ request }) => {
    test.skip(!p02Token, 'جلسة p02 غير متاحة')
    const basicId = Number(queryScalar('SELECT id FROM subscription_plans WHERE name=?', ['Basic']) || 0)
    const results = await concurrentPosts(page, '/api/subscriptions', [
      { plan_id: basicId, provider: 'liyana', amount: 19, phone: '0910000001' },
      { plan_id: basicId, provider: 'liyana', amount: 19, phone: '0910000002' },
    ])
    bodiesSwept.push(JSON.stringify(results))
    const statuses = results.map((r) => r.status)
    const ok200 = statuses.filter((s) => s === 200).length
    // حسم الدفعة الفائزة (واحدة فقط موجودة — pending وحيد)
    const winner = results.find((r) => r.status === 200)
    let verifiedCount = 0
    if (winner?.body?.data?.payment_id) {
      const approve = await approvePayment(request, Number(winner.body.data.payment_id), 'verified')
      expect(approve.status).toBe(200)
      verifiedCount = 1
    }
    const tenant = queryOne('SELECT plan_id, subscription_status FROM tenants WHERE id=(SELECT tenant_id FROM users WHERE username=?)', [p02name])
    checkClaim(
      P,
      'p13-concurrent-posts-single-payment',
      'POST /api/subscriptions ×2 (Promise.all)',
      [],
      () => ({
        ok: statuses.every((s) => s < 500) && ok200 === 1 && verifiedCount === 1 && Boolean(tenant),
        actual: { statuses, winner_pid: winner?.body?.data?.payment_id, tenant },
      }),
      'لا 500؛ دفعة واحدة (الخاسر 400 «طلب معلق») وبعد الحسم: خطة فعّالة واحدة',
      { query: 'POST /api/subscriptions ×2' }
    )
    expect(statuses.every((s) => s < 500), `الحالات: ${statuses}`).toBeTruthy()
    expect(ok200, `نجح واحد بالضبط (فعلي ${statuses})`).toBe(1)
    await shot(page, P, '13-step-05-api-race')
  })

  test('6. سباق الحسم المتزامن: verified مقابل cancelled → حالة حتمية واحدة', async ({ request }) => {
    test.skip(!p02Token, 'جلسة p02 غير متاحة')
    test.setTimeout(120_000)
    // v15-fix: فتح نافذة معدل الدفعات مباشرة (البطارية تملك قاعدتها المحلية؛
    // عقد 429 نفسه مثبت حياً في p07) بدل سكون 61s يكسر حد زمن التشغيل الكلي
    exec('DELETE FROM rate_limit_entries WHERE key LIKE ?', ['sub:%'])
    const basicId = Number(queryScalar('SELECT id FROM subscription_plans WHERE name=?', ['Basic']) || 0)
    const create = await browserFetch(page, '/api/subscriptions', {
      method: 'POST',
      body: { plan_id: basicId, provider: 'madar', amount: 19, phone: '0910000003' },
    })
    expect(create.status, `دفعة السباق (فعلي ${create.status})`).toBe(200)
    const racePid = Number(create.body?.data?.payment_id || 0)
    expect(racePid).toBeGreaterThan(0)
    // القراران المتناقضان في نفس التكة — الحسم الذرّي (UPDATE WHERE pending)
    const [a, b] = await Promise.all([
      approvePayment(request, racePid, 'verified'),
      approvePayment(request, racePid, 'cancelled'),
    ])
    bodiesSwept.push(JSON.stringify([a.body, b.body]))
    const pay = queryOne('SELECT status FROM subscription_payments WHERE id=?', [racePid])
    const user = queryOne('SELECT subscription_status FROM users WHERE username=?', [p02name])
    const tenant = queryOne('SELECT subscription_status FROM tenants WHERE id=(SELECT tenant_id FROM users WHERE username=?)', [p02name])
    const decided200 = [a.status, b.status].filter((s) => s === 200).length
    const finalStatus = String(pay?.status || '')
    const consistent =
      finalStatus === 'verified'
        ? user?.subscription_status === 'PAID' && tenant?.subscription_status === 'PAID'
        : finalStatus === 'cancelled'
          ? user?.subscription_status === 'REJECTED'
          : false
    checkClaim(
      P,
      'p13-concurrent-decision-deterministic',
      'POST /api/admin/subscriptions {verified, cancelled} متزامنان',
      [],
      () => ({
        ok: decided200 === 1 && [a.status, b.status].every((s) => s < 500) && ['verified', 'cancelled'].includes(finalStatus) && consistent,
        actual: { statuses: [a.status, b.status], final: finalStatus, user: user?.subscription_status, tenant: tenant?.subscription_status },
      }),
      'قرار 200 واحد فقط + حالة نهائية حتمية + اتساق users/tenants معها (لا نصف مختلط — عائلة D13-F1/D1-H4)',
      { query: 'POST /api/admin/subscriptions ×2' }
    )
    expect(decided200, `قرار ناجح واحد (فعلي ${a.status}/${b.status})`).toBe(1)
    expect(['verified', 'cancelled']).toContain(finalStatus)
    await shot(page, P, '13-step-06-decision-race')
  })

  test('7. سباق التسجيل المتزامن: مستخدم واحد والرفض 400/409 بلا 500', async ({ request }) => {
    // v15-fix (بطارية 22:22): حد التسجيل 10/60s لكل IP استهلكته تسجيلات
    // الشخصيات السابقة → الاثنان 429 والسباق لا يُقاس. عقد 429 نفسه محروس
    // بنقطة النهاية نفسها؛ نفتح النافذة لقياس العقد الحقيقي هنا (تداخل
    // التسجيل + uq_user_email_lower من E2)
    exec('DELETE FROM rate_limit_entries WHERE key LIKE ?', ['register:%'])
    const uname = `p13race_${Date.now().toString(36).slice(-6)}`
    const payload = { username: uname, email: `${uname}@sim.ly`, password: 'Race#Pass123' }
    const [r1, r2] = await Promise.all([
      request.post(`${FRONT_BASE}/api/register`, { data: payload }),
      request.post(`${FRONT_BASE}/api/register`, { data: payload }),
    ])
    const [b1, b2] = await Promise.all([r1.text(), r2.text()])
    bodiesSwept.push(b1, b2)
    const users = Number(queryScalar('SELECT count(*) FROM users WHERE username=?', [uname]) || 0)
    const statuses = [r1.status(), r2.status()]
    checkClaim(
      P,
      'p13-register-race-500',
      'POST /api/register ×2 (نفس الاسم)',
      [],
      () => ({ ok: users === 1 && statuses.every((s) => s !== 500), actual: { statuses, users } }),
      'مستخدم واحد + الرفض الثاني 400/409 (لا 500 خام — D1-H4/D12-H4)'
    )
    expect(users, `مستخدمو ${uname}`).toBe(1)
    expect(statuses.every((s) => s !== 500), `الحالات ${statuses}`).toBeTruthy()
  })

  test('8. webhook نفس mid متزامناً → صف رسالة واحد (idempotency)', async ({ request }) => {
    test.skip(!p02name, 'جلسة p02 غير متاحة')
    const signed = signWebhook(
      messageEvent('1002003001', { senderId: '9131', senderName: 'مروان', mid: 'm_p13_dup', text: 'سباق التسليم' })
    )
    const [r1, r2] = await Promise.all([
      request.post(`${API_BASE}/webhook`, { headers: signed.headers, data: signed.body }),
      request.post(`${API_BASE}/webhook`, { headers: signed.headers, data: signed.body }),
    ])
    expect([r1.status(), r2.status()]).toEqual([200, 200])
    await page.waitForTimeout(2000)
    const cnt = Number(queryScalar('SELECT count(*) FROM messages WHERE fb_message_id=?', ['m_p13_dup']) || 0)
    checkClaim(
      P,
      'p13-webhook-mid-idempotency',
      'SELECT count(*) FROM messages WHERE fb_message_id=?',
      ['m_p13_dup'],
      () => ({ ok: cnt === 1, actual: cnt }),
      'صف واحد (uq_messages_tenant_fb عبر التسليم المتزامن)'
    )
    expect(cnt, `صفوف m_p13_dup = ${cnt}`).toBe(1)
  })

  test('9. SSRF الإيصال: عنوان داخلي حرفي 400 + مضيف DNS بالاسم (finding D6-H2)', async ({ request }) => {
    test.skip(!p02Token, 'جلسة p02 غير متاحة')
    test.setTimeout(120_000)
    // v15-fix: فتح نافذة معدل الدفعات (بدل سكون 61s) — عقد 429 مثبت في p07
    exec('DELETE FROM rate_limit_entries WHERE key LIKE ?', ['sub:%'])
    const basicId = Number(queryScalar('SELECT id FROM subscription_plans WHERE name=?', ['Basic']) || 0)
    // (أ) دفعة بإيصال بعنوان داخلي حرفي (169.254.169.254 — metadata)
    const createA = await browserFetch(page, '/api/subscriptions', {
      method: 'POST',
      body: {
        plan_id: basicId, provider: 'bank', amount: 19,
        senderAccountName: 'مروان', senderAccountNumber: '000111',
        receiptImageUrl: 'https://169.254.169.254/x.png',
      },
    })
    const pidA = Number(createA.body?.data?.payment_id || 0)
    const fetchA = pidA
      ? await browserFetch(page, `/api/payments/receipt/${pidA}`)
      : { status: 0, body: null, ok: false }
    // حسم A (رفض) لتفرير خانة الـpending الوحيدة للدفعة الثانية
    if (pidA) await approvePayment(request, pidA, 'cancelled').catch(() => {})
    // (ب) دفعة بإيصال بمضيف DNS خارجي غير محلول — العقد المستهدف: 400
    // «رابط الإيصال مرفوض» (حارس DNS) — الواقع: الحارس المتزامن السريع
    // وحده على هذا المسار فيمر الاسم ثم يفشل الجلب → 404 — finding D6-H2
    const createB = await browserFetch(page, '/api/subscriptions', {
      method: 'POST',
      body: {
        plan_id: basicId, provider: 'bank', amount: 19,
        senderAccountName: 'مروان', senderAccountNumber: '000222',
        receiptImageUrl: 'https://receipt-ssrf.evil.ly/x.png',
      },
    })
    const pidB = Number(createB.body?.data?.payment_id || 0)
    const fetchB = pidB
      ? await browserFetch(page, `/api/payments/receipt/${pidB}`)
      : { status: 0, body: null, ok: false }
    if (pidB) await approvePayment(request, pidB, 'cancelled').catch(() => {})
    bodiesSwept.push(JSON.stringify([fetchA.body, fetchB.body]))
    checkClaim(
      P,
      'p13-ssrf-literal-blocked',
      'GET /api/payments/receipt/{id} (169.254.169.254)',
      [],
      () => ({ ok: fetchA.status === 400, actual: { status: fetchA.status, detail: fetchA.body?.detail } }),
      'العنوان الداخلي الحرفي مرفوض 400 «رابط الإيصال مرفوض» (حارس v10-A8)',
      { query: 'GET /api/payments/receipt/{id}' }
    )
    checkClaim(
      P,
      'p13-ssrf-receipt-dns',
      'GET /api/payments/receipt/{id} (receipt-ssrf.evil.ly)',
      [],
      () => ({ ok: fetchB.status === 400, actual: { status: fetchB.status, detail: fetchB.body?.detail } }),
      '400 «رابط مرفوض» (حارس بحل DNS — E4) — لا جلب يُجرَّب لمضيف بالاسم',
      { query: 'GET /api/payments/receipt/{id}' }
    )
    expect([400]).toContain(fetchA.status)
    expect([400, 404]).toContain(fetchB.status)
    await shot(page, P, '13-step-09-ssrf')
  })

  test('10. brute-force كلمة المرور الحالية: 429 خلال ≤ المحاولة 31', async () => {
    test.skip(!p02Token, 'جلسة p02 غير متاحة')
    test.setTimeout(120_000)
    let first429 = -1
    const statuses: number[] = []
    for (let i = 1; i <= 32; i++) {
      const r = await browserFetch(page, '/api/auth/change-password', {
        method: 'POST',
        body: { current_password: `WrongPass#${i}`, new_password: 'NewStrong#Pass1' },
      })
      statuses.push(r.status)
      if (r.status === 429 && first429 < 0) first429 = i
      if (first429 > 0 && i >= first429 + 2) break // ثبت السقف — لا داعي لكل 32
    }
    bodiesSwept.push(JSON.stringify(statuses))
    checkClaim(
      P,
      'p13-changepw-429',
      'POST /api/auth/change-password ×N (كلمة حالية خاطئة)',
      [],
      () => ({ ok: first429 > 0 && first429 <= 31, actual: { first_429_at_attempt: first429, sample: statuses.slice(0, 8) } }),
      'سقف per-account (5/ساعة — E2/D6-M4): 429 يظهر خلال ≤ المحاولة 31',
      { query: 'POST /api/auth/change-password' }
    )
    expect(first429, `أول 429 عند المحاولة ${first429}`).toBeGreaterThan(0)
    await shot(page, P, '13-step-10-bruteforce')
  })

  test('11. CRON عبر ?token=: ما زال مقبولاً (finding D6-M3)', async () => {
    test.skip(!CRON_SECRET, 'SIM_CRON_SECRET غير مضبوط — شغّل البطارية عبر السكربت')
    const viaQuery = await page.request.get(`${API_BASE}/api/cron/heartbeat?token=${encodeURIComponent(CRON_SECRET)}`)
    checkClaim(
      P,
      'p13-cron-query-token',
      'GET /api/cron/heartbeat?token=<CS>',
      [],
      () => ({ ok: [403, 404].includes(viaQuery.status()), actual: viaQuery.status() }),
      '403/404 (السر بالترويسة فقط — إزالة مسار الاستعلام)',
      { query: 'GET /api/cron/heartbeat?token=' }
    )
    // بالترويسة (العقد الحي): 200
    const viaHeader = await page.request.get(`${API_BASE}/api/cron/heartbeat`, {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    expect(viaHeader.status(), 'الترويسة تعمل (200)').toBe(200)
  })

  test('12. ختام: لا نمو مستخدمين غير مشروع + لا Traceback في أي جسم', async () => {
    const usersAfter = Number(queryScalar('SELECT count(*) FROM users') || 0)
    // النمو المشروع في p13: مستخدم السباق الواحد (1) — الاسم الbidi مرفوض
    const leaked = bodiesSwept.some((b) => /Traceback|SQLAlchemy|Internal Server Error/i.test(b))
    checkClaim(
      P,
      'p13-no-leak-no-zombie-growth',
      'عدّ users (قبل/بعد) + اجتياح أجسام الردود المرصودة',
      [],
      () => ({ ok: usersAfter - usersBefore === 1 && !leaked, actual: { growth: usersAfter - usersBefore, leaked } }),
      'نمو واحد بالضبط (مستخدم السباق) وصفر Traceback/SQLAlchemy في الأجسام (سلسلة v14-t16)'
    )
    expect(usersAfter - usersBefore, `نمو المستخدمين ${usersBefore} → ${usersAfter}`).toBe(1)
    expect(leaked, 'لا تسريب خام').toBeFalsy()
    // v15-fix: رسائل 4xx من الحراس المتعمدة (بوابات الخطة 403 / حدود المعدل 429)
    // ليست أخطاء JS — العقد المفحوص: أخطاء 5xx وJS الفعلية فقط
    const realJs = consoleBucket.real().filter((e) => !/status of 4(0[0-9]|29)\b/.test(e))
    expect(realJs.slice(0, 2), 'لا أخطاء JS حقيقية').toHaveLength(0)
  })
})
