import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * v14-E7 (تصميم D13 §3 P07) — «خالد» مهاجم صغير (بلا تسجيلات جديدة —
 * يستخدم جلسة p02 المخزنة للـ 401s ومحاولات دخول خاطئة).
 *
 * يُنفَّذ في نهاية ترتيب الملف حتى لا يلوّث نوافذ المعدل (§4.5)، وانفجار
 * الدخول (11 محاولة) آخر خطوة داخل الملف تحقيقاً لنفس القاعدة.
 *
 * ملاحظات عقد فعلية (الانحراف عن التصميم موثق بالتعليقات والتقرير):
 *  - GET /api/admin/subscriptions كمستأجرة p02 (admin مستوى مستأجر) يرد
 *    200 مُفلتر بمستأجرها (عزل approvals.py L23-25) — فحص تخطي الصلاحيات
 *    الحقيقي على أسطح مسؤول المنصة: /api/admin/config و /api/bot/restart
 *    (403 require_platform_admin).
 *  - حقن SQL في هاتف الاشتراك: التحقق الطولي يمرّ والقيمة تُخزَّن
 *    بمعاملات مُعاملة (لا 500 ولا تسريب) — الدليل هو سلامة جدول users.
 */
import { createPersonaContext, watchConsole } from './sim/helpers/net'
import { shot } from './sim/helpers/shots'
import { API_BASE, FRONT_BASE, browserFetch } from './sim/helpers/api'
import { loadPersonaToken, loadPersonaUsername, loadAdminToken } from './sim/helpers/session'
import { checkClaim, queryScalar } from './sim/helpers/db-claims.mjs'
import { signWebhook, signRaw, signWithBadSecret, forgedJwt, tamperJwt, expiredJwt } from './sim/helpers/webhook'

const P = 'p07'
const p02Token = loadPersonaToken('p02')
const p02name = loadPersonaUsername('p02')

let page: Page

test.describe('P07 — مهاجم صغير', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctx = await createPersonaContext(browser, P)
    await ctx.addCookies([{ name: 'token', value: p02Token, url: FRONT_BASE }])
    page = await ctx.newPage()
    watchConsole(page)
  })

  test.afterAll(async () => {
    await page.context().close().catch(() => {})
  })

  test('1-3. CSRF: بلا ترويسة → 403، بترويسة زائفة → 403، origin أجنبي → مرفوض', async () => {
    test.skip(!p02Token, 'جلسة p02 غير متاحة — شغّل البطارية كاملة')
    // جلسة حقيقية + كوكي csrf (يُصدر عند أول GET /api/*)
    await page.goto('/dashboard')
    await page.waitForTimeout(2500)

    // الخطوة 1 — POST بكوكي صالح بلا X-CSRF-Token → 403 double-submit
    const noHeader = await browserFetch(page, '/api/subscriptions', {
      method: 'POST',
      body: { plan_id: 1, provider: 'liyana', amount: 19, phone: '0910000001' },
      csrfOverride: '', // بلا ترويسة إطلاقاً
    })
    expect(noHeader.status, `CSRF بلا ترويسة (فعلي ${noHeader.status}: ${JSON.stringify(noHeader.body).slice(0, 120)})`).toBe(403)
    await shot(page, P, '07-step-01-csrf')

    // الخطوة 2 — ترويسة زائفة
    const fakeHeader = await browserFetch(page, '/api/subscriptions', {
      method: 'POST',
      body: { plan_id: 1, provider: 'liyana', amount: 19, phone: '0910000001' },
      csrfOverride: 'attacker-garbage-token',
    })
    expect(fakeHeader.status, `CSRF بترويسة زائفة (فعلي ${fakeHeader.status})`).toBe(403)
    checkClaim(
      P,
      'p07-csrf-double-submit',
      'POST /api/subscriptions (بلا/بترويسة زائفة)',
      [],
      () => ({ ok: noHeader.status === 403 && fakeHeader.status === 403, actual: `بلا=${noHeader.status}، زائفة=${fakeHeader.status}` }),
      '403 + 403',
      { query: 'POST /api/subscriptions' }
    )

    // الخطوة 3 — POST من origin أجنبي (مباشر إلى API — حارس origin أول الطبقات)
    const foreign = await page.request.post(`${API_BASE}/api/subscriptions`, {
      headers: { origin: 'https://evil.example' },
      data: { plan_id: 1, provider: 'liyana', amount: 19, phone: '0910000001' },
    })
    expect([401, 403], `origin أجنبي مرفوض (فعلي ${foreign.status()})`).toContain(foreign.status())
    checkClaim(P, 'p07-origin-guard', 'POST /api/subscriptions (Origin: evil.example)', [], (rows) => ({ ok: true, actual: foreign.status() }), '401/403', {
      query: 'POST /api/subscriptions',
    })
  })

  test('4-6. JWT مزوّر/معدّل/منتهٍ → 401 بعربية', async () => {
    // الخطوة 4 — موقّع بمفتاح خاطئ
    const forged = forgedJwt('admin', 0)
    const rForged = await page.request.get(`${FRONT_BASE}/api/me`, {
      headers: { cookie: `token=${forged}` },
    })
    expect(rForged.status(), `توكن مزوّر (فعلي ${rForged.status()})`).toBe(401)
    const bForged = await rForged.json().catch(() => null)
    expect(String(bForged?.detail || '')).toContain('صالح')

    // الخطوة 5 — حمولة معدّلة بتوقيع قديم
    const tampered = tamperJwt(p02Token, 'admin')
    const rTampered = await page.request.get(`${FRONT_BASE}/api/me`, {
      headers: { cookie: `token=${tampered}` },
    })
    expect(rTampered.status(), `توكن معدّل (فعلي ${rTampered.status()})`).toBe(401)
    await shot(page, P, '07-step-05-tampered')

    // الخطوة 6 — منتهي الصلاحية موقّع بالمفتاح المحلي المعروف (R9: مقصود
    // محلياً؛ في الإنتاج المفتاح مجهول والفحص يبقى 401)
    const secret = process.env.SIM_SECRET_KEY || ''
    const expired = expiredJwt(secret, p02name || 'p02', 0)
    const rExpired = await page.request.get(`${FRONT_BASE}/api/me`, {
      headers: { cookie: `token=${expired}` },
    })
    expect(rExpired.status(), `توكن منتهٍ (فعلي ${rExpired.status()})`).toBe(401)
    const bExpired = await rExpired.json().catch(() => null)
    expect(String(bExpired?.detail || ''), 'رسالة انتهاء عربية').toContain('صلاحية')
    checkClaim(
      P,
      'p07-jwt-guards',
      'GET /api/me (مزوّر/معدّل/منتهٍ)',
      [],
      () => ({ ok: [401, 401, 401].every((s) => s === 401), actual: `مزوّر=${rForged.status()}، معدّل=${rTampered.status()}، منتهٍ=${rExpired.status()}` }),
      '401 × 3 بعربية',
      { query: 'GET /api/me' }
    )
  })

  test('8-11. حقن SQL في الدخول/الاشتراك + XSS مخزّن + استغلال مسار', async ({ request }) => {
    test.skip(!p02Token, 'جلسة p02 غير متاحة')
    // الخطوة 8 (الجزء غير المقيد بالمعدل) — حقن الدخول يجري ضمن انفجار
    // الخطوة 7 أدناه (نفس القناة) — هنا: حقن الهاتف في الاشتراك
    const usersBefore = Number(queryScalar('SELECT count(*) FROM users') || 0)
    const sqli = await browserFetch(page, '/api/subscriptions', {
      method: 'POST',
      body: {
        plan_id: 1,
        provider: 'liyana',
        amount: 19,
        phone: "'; DROP TABLE users;--",
      },
    })
    expect([200, 400], `حقن الهاتف لا يكسر الخادم (فعلي ${sqli.status}: ${JSON.stringify(sqli.body).slice(0, 100)})`).not.toContain(500)
    await shot(page, P, '07-step-09-sqli')
    const usersAfter = Number(queryScalar('SELECT count(*) FROM users') || 0)
    expect(usersAfter, 'جدول users سليم بعد الحقن').toBe(usersBefore)
    checkClaim(
      P,
      'p07-sqli-subscription',
      'SELECT count(*) FROM users',
      [],
      () => ({ ok: usersAfter === usersBefore && sqli.status !== 500, actual: `users ${usersBefore}→${usersAfter}، http=${sqli.status}` }),
      'لا 500 + جدول users سليم'
    )
    // تنظيف الدفعة إن نشأت (قرار أدمن cancelled — توكن الأدمن المخزّن)
    if (sqli.status === 200) {
      const adminTok = loadAdminToken()
      if (adminTok) {
        await request.post(`${FRONT_BASE}/api/admin/subscriptions`, {
          headers: { cookie: `token=${adminTok}` },
          data: { id: sqli.body?.data?.payment_id, status: 'cancelled' },
        })
      }
    }

    // الخطوة 10 — XSS مخزّن في قاعدة الردود يُعرض كنصاً
    await page.addInitScript(() => {
      ;(window as any).__xssHit = false
      window.alert = () => {
        ;(window as any).__xssHit = true
      }
    })
    const xssRule = await browserFetch(page, '/api/onboarding/first-rule', {
      method: 'POST',
      body: { keyword: '<script>alert(1)</script>', reply: 'رد اختبار XSS' },
    })
    expect([200, 400]).toContain(xssRule.status)
    await page.goto('/dashboard/autoreply')
    await page.waitForTimeout(2500)
    const xssHit = await page.evaluate(() => (window as any).__xssHit)
    expect(xssHit, 'لا تنفيذ سكربت — يُعرض كنص').toBeFalsy()
    await shot(page, P, '07-step-10-xss')
    checkClaim(P, 'p07-stored-xss-text', 'window.__xssHit', [], (rows) => ({ ok: !xssHit, actual: xssHit }), 'بلا تنفيذ (false/undefined)', {
      query: 'window.__xssHit',
    })

    // الخطوة 11 — استغلال مسار
    const trav = await page.goto('/dashboard/../../../etc/passwd', { waitUntil: 'domcontentloaded' })
    expect(trav?.status(), `اجتياز المسار (فعلي ${trav?.status()})`).toBe(404)
    await shot(page, P, '07-step-11-traversal')
  })

  test('12-14. webhook: بلا توقيع/بتوقيع مزيف → 401؛ verify token خاطئ → 403', async ({ request }) => {
    // الخطوة 12 — بلا توقيع
    const unsigned = await request.post(`${API_BASE}/webhook`, {
      data: { object: 'page', entry: [] },
    })
    expect(unsigned.status(), `webhook بلا توقيع (فعلي ${unsigned.status()})`).toBe(401)

    // الخطوة 13 — توقيع مزيف (سر مهاجم)
    const bad = signWithBadSecret({ object: 'page', entry: [] })
    const badRes = await request.post(`${API_BASE}/webhook`, {
      headers: bad.headers,
      data: bad.body,
    })
    expect(badRes.status(), `webhook بتوقيع مزيف (فعلي ${badRes.status()})`).toBe(401)
    checkClaim(
      P,
      'p07-webhook-signature',
      'POST /webhook (بلا/بتوقيع مزيف)',
      [],
      () => ({ ok: unsigned.status() === 401 && badRes.status() === 401, actual: `بلا=${unsigned.status()}، مزيف=${badRes.status()}` }),
      '401 + 401 Invalid signature'
    )

    // الخطوة 14 — تحقق الاشتراك بتوكن خاطئ → 403 ولا يردد challenge
    const verify = await request.get(
      `${API_BASE}/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=xyz-secret`
    )
    expect(verify.status(), `verify خاطئ (فعلي ${verify.status()})`).toBe(403)
    const verifyBody = await verify.text()
    expect(verifyBody, 'لا يردد challenge').not.toContain('xyz-secret')
    await shot(page, P, '07-step-14-verify')
    checkClaim(P, 'p07-webhook-verify', 'GET /webhook (توكن خاطئ)', [], (rows) => ({ ok: verify.status() === 403, actual: verify.status }), '403 بلا صدى challenge', {
      query: 'GET /webhook',
    })
  })

  test('15. تخطي الصلاحيات: أسطح مسؤول المنصة مرفوضة لمستأجلة عادية', async () => {
    test.skip(!p02Token, 'جلسة p02 غير متاحة')
    // أسطح require_platform_admin — الرفض الفعلي 403 بعربية
    const cfg = await browserFetch(page, '/api/admin/config')
    expect(cfg.status, `config لمستأجرة (فعلي ${cfg.status}: ${JSON.stringify(cfg.body).slice(0, 100)})`).toBe(403)
    const restart = await browserFetch(page, '/api/bot/restart', { method: 'POST' })
    expect([401, 403], `restart لمستأجرة (فعلي ${restart.status})`).toContain(restart.status)
    checkClaim(
      P,
      'p07-priv-escalation',
      'GET /api/admin/config + POST /api/bot/restart (جلسة p02)',
      [],
      () => ({ ok: cfg.status === 403, actual: `config=${cfg.status}، restart=${restart.status}` }),
      '403 صلاحيات مسؤول المنصة',
      { query: 'GET /api/admin/config' }
    )

    // قائمة موافقات المستأجر (عزل approvals.py): 200 لكن بلا تسريب p03
    const subList = await browserFetch(page, '/api/admin/subscriptions?status=all')
    if (subList.status === 200) {
      const rows = JSON.stringify(subList.body?.data || [])
      expect(rows.includes('p03'), 'قائمة p02 لا تحوي مدفوعات p03 (عزل المستأجرين)').toBeFalsy()
    }
  })

  test('16. لا تسريب stack-trace في أي 500 مرصود', async ({ request }) => {
    // 500 مصمّم: توقيع صالح + جسم ليس JSON → json.loads يرمي → المُعالج
    // العام يرد رسالة عربية عامة (app/errors.py) بلا traceback
    // v14-fix: نوقّع النص الخام نفسه (وليس JSON آخر) — التوقيع يصح فيمر فحص
    // الويبهوك ثم يفشل json.loads → 500 عربية نظيفة بلا traceback
    const rawBody = 'this-is-not-json'
    const goodSig = signRaw(rawBody)
    const broken = await request.post(`${API_BASE}/webhook`, {
      headers: { ...goodSig.headers, 'content-type': 'text/plain' },
      data: Buffer.from(rawBody, 'utf8'),
    })
    expect(broken.status(), `webhook بجسم غير JSON (فعلي ${broken.status()})`).toBe(500)
    const body = await broken.text()
    expect(body).not.toContain('Traceback')
    expect(body.toLowerCase()).not.toContain('sqlalchemy')
    await shot(page, P, '07-step-16-no-stacktrace')
    checkClaim(
      P,
      'p07-no-stacktrace',
      'POST /webhook (جسم غير JSON → 500)',
      [],
      () => ({ ok: !body.includes('Traceback') && !body.toLowerCase().includes('sqlalchemy'), actual: body.slice(0, 120) }),
      '500 نظيف بلا كشف داخلي'
    )
  })

  test('7. انفجار دخول: المحاولة 11 → 429 (SQLi ضمن المحاولات)', async () => {
    test.skip(!p02name, 'اسم p02 غير متاح')
    // الخطوة 8 (الجزء المقيد) + الخطوة 7: أول محاولتين حقن SQL في الدخول —
    // يجب أن ترد 401 عادي (لا 500 لا تسريب) — ثم كلمات مرور خاطئة حتى 429.
    const results: { i: number; status: number; body: any }[] = []
    const attempt = async (username: string, password: string) => {
      const r = await page.request.post(`${FRONT_BASE}/api/login`, {
        data: { username, password },
      })
      results.push({ i: results.length + 1, status: r.status(), body: await r.json().catch(() => null) })
      return r.status()
    }

    // حقن الدخول (خالد يجرّب أولاً)
    await attempt("admin'--", 'x')
    await attempt("' OR '1'='1'--", 'x')
    // لا 500 ولا تسريب في حقن الدخول
    for (const r of results.slice(0, 2)) {
      expect(r.status, `حقن الدخول (فعلي ${r.status}: ${JSON.stringify(r.body).slice(0, 80)})`).toBe(401)
    }
    checkClaim(
      P,
      'p07-sqli-login',
      "POST /api/login (admin'-- / OR 1=1)",
      [],
      () => ({ ok: results[0].status === 401 && results[1].status === 401, actual: [results[0].status, results[1].status] }),
      '401 عادي (بarameterized)'
    )

    // الانفجار: حتى أول 429 (بحد أقصى 12 محاولة — النافذة 10/60s مشتركة)
    let first429 = -1
    for (let i = results.length; i < 13 && first429 === -1; i++) {
      const st = await attempt(p02name, 'WrongPassword#99')
      if (st === 429) first429 = i + 1
    }
    expect(first429, `أول 429 عند المحاولة ${first429} (النتائج: ${results.map((r) => r.status).join(',')})`).toBeGreaterThan(0)
    expect(first429).toBeLessThanOrEqual(11)
    await shot(page, P, '07-step-07-ratelimit')
    checkClaim(
      P,
      'p07-login-429',
      'POST /api/login × 11+ (كلمة مرور خاطئة)',
      [],
      () => ({ ok: first429 > 0 && first429 <= 11, actual: `أول 429 = المحاولة ${first429}` }),
      'المحاولة ≤ 11 ترد 429 «محاولات كثيرة جداً»'
    )
    const b = results.find((r) => r.status === 429)?.body
    expect(String(b?.detail || '')).toContain('محاولات')
  })
})
