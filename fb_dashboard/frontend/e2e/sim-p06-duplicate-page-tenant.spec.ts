import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * v14-E7 (تصميم D13 §3 P06) — «رامي» مستأجر ثانٍ يحاول ربط صفحة مربوطة
 * أصلاً بـ p02 (1002003001).
 *
 * السلوك المعروف اليوم (الترحيلة 012 — uq_botstate_key_value الجزئي):
 * IntegrityError عند الـcommit → 500. المتوقع المستقبلي 409. البطارية
 * تقبل [500, 409] وتسجل 500 كـ finding D13-F1 (لا إخفاق صلب على علة
 * معروفة موثقة)؛ وبعد إصلاح E-wave يقلبها المنسّق بمتغير
 * SIM_STRICT_409=1 لتصبح قفلاً صارماً على 409 حصراً.
 */
import { personas, tsSuffix } from './sim/helpers/personas'
import { createPersonaContext, watchConsole } from './sim/helpers/net'
import { shot } from './sim/helpers/shots'
import { browserFetch } from './sim/helpers/api'
import { registerViaUI, getToken, loadPersonaUsername } from './sim/helpers/session'
import { checkClaim, queryOne, queryScalar } from './sim/helpers/db-claims.mjs'

const P = 'p06'
const p = personas.p06
const uname = `p06_${tsSuffix()}`
const email = `${uname}@sim.ly`
const STRICT_409 = process.env.SIM_STRICT_409 === '1'

let page: Page
let token = ''
let p02TenantId = 0

test.describe('P06 — مستأجر ثانٍ يربط صفحة مربوطة', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctx = await createPersonaContext(browser, P)
    page = await ctx.newPage()
    watchConsole(page)
    const p02name = loadPersonaUsername('p02')
    p02TenantId = Number(queryScalar('SELECT tenant_id FROM users WHERE username=?', [p02name]) || 0)
  })

  test.afterAll(async () => {
    await page.context().close().catch(() => {})
  })

  test('1. تسجيل p06 وإنهاء المعالج برمجياً', async () => {
    const url = await registerViaUI(page, uname, email, p.password!)
    expect(url).toMatch(/dashboard|onboarding/)
    token = await getToken(page.context())
    await page.request.post('/api/onboarding/complete', {
      headers: { cookie: `token=${token}` },
    })
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await shot(page, P, '06-step-01-registered')
    expect(token).not.toBe('')
  })

  test('2-3. ربط صفحة مأخوذة → 500 اليوم (finding D13-F1) / 409 بعد الإصلاح', async () => {
    // الخطوة 2 — POST connect-page بصفحة p02
    const r = await browserFetch(page, '/api/onboarding/connect-page', {
      method: 'POST',
      body: { page_id: p.hijackPageId!, page_name: 'مقلّد', access_token: 'sim-token-p06' },
    })
    await shot(page, P, '06-step-02-duplicate')

    // الخطوة 3 — الحكم: [500,409] اليوم؛ قفل 409 صارم بعد الإصلاح
    if (STRICT_409) {
      expect(r.status, `الربط المزدوج يجب أن يرد 409 بعد إصلاح D13-F1 (فعلي ${r.status})`).toBe(409)
    } else {
      expect([500, 409], `الربط المزدوج (فعلي ${r.status}: ${JSON.stringify(r.body).slice(0, 120)})`).toContain(r.status)
    }
    checkClaim(
      P,
      'p06-duplicate-page-result',
      'POST /api/onboarding/connect-page {page_id=1002003001}',
      [],
      () => ({
        ok: true, // القياس نفسه ناجح — السلوك موثق كـ finding
        actual: r.status,
      }),
      '500 (finding D13-F1) أو 409 بعد الإصلاح',
      {
        query: 'POST /api/onboarding/connect-page',
        finding: r.status === 500 ? 'D13-F1: IntegrityError → 500 بدل 409 — معروف وموثق' : null,
      }
    )
    if (r.status === 500) {
      // جسم 500 لا يسرب traceback (app/errors.py) — يوثَّق ضمن P07-16 أيضاً
      expect(JSON.stringify(r.body)).not.toContain('Traceback')
    }
  })

  test('4-5. DB سليم: لا ربط ثانٍ + بيانات الضحية لم تُمسّ', async () => {
    // الخطوة 4 — صف واحد فقط يملك الصفحة
    const cnt = Number(queryScalar("SELECT count(*) FROM bot_state WHERE key='fb_page_id' AND value=?", [p.hijackPageId!]) || 0)
    checkClaim(
      P,
      'p06-no-second-binding',
      "SELECT count(*) FROM bot_state WHERE key='fb_page_id' AND value=?",
      [p.hijackPageId!],
      () => ({ ok: cnt === 1, actual: cnt }),
      '1 (لم يُنشئ الربط الثاني — الجدول سليم)'
    )
    expect(cnt, `أصحاب الصفحة 1002003001 = ${cnt}`).toBe(1)

    // الخطوة 5 — ربط p02 بقيمه الأصلية (page_name لا يساوي «مقلّد»)
    const victim = queryOne('SELECT tenant_id, value FROM bot_state WHERE key=? AND value=?', [
      'fb_page_id',
      p.hijackPageId!,
    ])
    const ownerTenant = Number(victim?.tenant_id || 0)
    const nameRow = queryOne('SELECT value FROM bot_state WHERE tenant_id=? AND key=?', [ownerTenant, 'fb_page_name'])
    checkClaim(
      P,
      'p06-victim-intact',
      'SELECT value FROM bot_state WHERE tenant_id=? AND key=?',
      [ownerTenant, 'fb_page_name'],
      () => ({ ok: ownerTenant === p02TenantId && String(nameRow?.value || '') !== 'مقلّد', actual: { owner: ownerTenant, page_name: nameRow?.value } }),
      `المالك ${p02TenantId} والاسم الأصلي «متجر منال» سليم`,
      { query: 'SELECT tenant_id, value FROM bot_state' }
    )
    expect(ownerTenant).toBe(p02TenantId)
  })

  test('6-7. المسار الموازي (PUT settings) بنفس العقد + عزل المستأجرين', async () => {
    // الخطوة 6 — PUT /api/facebook/settings من p06 بنفس الصفحة
    const put = await browserFetch(page, '/api/facebook/settings', {
      method: 'PUT',
      body: { page_id: p.hijackPageId!, access_token: 'sim-token-p06-put' },
    })
    await shot(page, P, '06-step-06-put-settings')
    if (STRICT_409) {
      expect(put.status).toBe(409)
    } else {
      expect([500, 409], `PUT للصفحة المربوطة (فعلي ${put.status})`).toContain(put.status)
    }

    // الخطوة 7 — p06 لا يرى إعدادات p02 (عزل المستأجرين)
    const own = await browserFetch(page, '/api/facebook/settings')
    expect(own.status).toBe(200)
    const d = own.body?.data || {}
    expect(String(d.page_id || ''), `p06 يرى صفحته فقط — الفعلي: ${JSON.stringify(d)}`).not.toBe(p.hijackPageId!)
    checkClaim(
      P,
      'p06-isolation',
      'GET /api/facebook/settings (p06)',
      [],
      () => ({ ok: String(d.page_id || '') !== p.hijackPageId!, actual: d }),
      'لا يرى صفحة/توكن p02',
      { query: 'GET /api/facebook/settings' }
    )
  })

  test('8. p06 يربط صفحة حرة بنجاح (المسار نفسه يعمل)', async () => {
    // يثبت أن فشل الخطوة 2 سببه التفرد وليس تعطل مسار الربط
    const own = await browserFetch(page, '/api/onboarding/connect-page', {
      method: 'POST',
      body: { page_id: p.ownPageId!, page_name: 'متجر رامي', access_token: 'sim-token-p06-own' },
    })
    expect(own.status, `ربط صفحة حرة (فعلي ${own.status}: ${JSON.stringify(own.body).slice(0, 120)})`).toBe(200)
    await shot(page, P, '06-step-08-own-page')
    const cnt = Number(queryScalar('SELECT count(*) FROM bot_state WHERE key=? AND value=?', ['fb_page_id', p.ownPageId!]) || 0)
    checkClaim(
      P,
      'p06-own-page-bound',
      'SELECT count(*) FROM bot_state WHERE key=? AND value=?',
      ['fb_page_id', p.ownPageId!],
      () => ({ ok: cnt === 1, actual: cnt }),
      '1'
    )
  })
})
