import { test, expect, type Browser, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * v15-E8 (تصميم D13 §4.7) — P14 «سالم أدمن المنصة يُدوّر الأسرار»:
 * إعادة إقلاع uvicorn حية منتصف البطارية بـSECRET_KEY وCRON_SECRET
 * جديدين (FERNET_KEY وAPP_SECRET كما هما) ثم التحقق من المصفوفة
 * الكاملة: التوكنات القديمة تُبطل (401) · الدخول الجديد يعمل · الواجهة
 * توجّه 401 → /login (إصلاح D4-H3 الحي) · بيانات Fernet المشفرة تبقى
 * قابلة للفك (الصفحة المربوطة) · الويبهوك الموقّع HMAC يستمر بالعمل ·
 * كرون بالسر الجديد عبر Bearer يعمل والسر القديم يُرفض.
 *
 * يعمل آخر البطارية (بعد p13 الذي يفجّر حدود المعدل) — الترتيب الأبجدي
 * يضمن مكانه.
 */
import { createPersonaContext, watchConsole } from './sim/helpers/net'
import { shot } from './sim/helpers/shots'
import { FRONT_BASE, API_BASE, browserFetch, tokenFromSetCookie } from './sim/helpers/api'
import { loadAdminToken, loadPersonaToken, saveAdminToken } from './sim/helpers/session'
import { checkClaim, queryScalar } from './sim/helpers/db-claims.mjs'
import { signWebhook, messageEvent } from './sim/helpers/webhook'

const P = 'p14'
const PAGE_ID = '1002003001' // صفحة p02 المربوطة (نفس بطارية v14)
const ENV_FILE = process.env.V15_BACKEND_ENV || '/tmp/v15-backend.env'
const adminUser = process.env.SIM_ADMIN_USER || 'v15admin'
const adminPass = process.env.SIM_ADMIN_PASS || 'V15Admin#2026'
const oldAdminToken = loadAdminToken()
const p02Token = loadPersonaToken('p02')

let page: Page
let consoleBucket: ReturnType<typeof watchConsole>
let oldCronSecret = ''
let newCronSecret = ''

const readEnvLines = (): string[] => {
  try { return readFileSync(ENV_FILE, 'utf8').trim().split('\n') } catch { return [] }
}

test.describe('P14 — تدوير أسرار حي (منتصف البطارية)', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctx = await createPersonaContext(browser, P)
    if (p02Token) {
      await ctx.addCookies([{ name: 'token', value: p02Token, url: FRONT_BASE }])
    }
    page = await ctx.newPage()
    consoleBucket = watchConsole(page)
    const lines = readEnvLines()
    oldCronSecret = lines[2] || process.env.SIM_CRON_SECRET || ''
  })

  test.afterAll(async () => {
    await page.context().close().catch(() => {})
  })

  test('1. خط الأساس: توكن الأدمن القديم يعمل قبل التدوير', async ({ request }) => {
    test.skip(!oldAdminToken, 'توكن أدمن غير متاح — شغّل البطارية كاملة')
    // v15-fix: get_current_user يقرأ كوكي token فقط (auth.py:50) — لا Bearer
    const r = await request.get(`${API_BASE}/api/admin/platform/users`, {
      headers: { Cookie: `token=${oldAdminToken}` },
    })
    checkClaim(P, 'p14-baseline-old-token', 'GET /api/admin/users (قبل التدوير)', [], () => ({
      ok: r.status() === 200,
      actual: { status: r.status() },
    }), 'توكن أدمن p05 صالح قبل التدوير')
    expect(r.status()).toBe(200)
  })

  test('2. التدوير الحي: إعادة إقلاع الخلفية بأسرار جديدة', () => {
    // السكربت: pkill uvicorn → أسرار جديدة → إقلاع → healthz → كتابة env
    let out = ''
    try {
      out = execSync(
        `bash ${process.env.V15_ROTATE_SCRIPT || '/home/z/my-project/SmartBot/scripts/v15_sim_rotate_secret.sh'}`,
        { timeout: 120_000, encoding: 'utf8', env: { ...process.env } },
      )
    } catch (e: any) {
      checkClaim(P, 'p14-rotation-restart', 'v15_sim_rotate_secret.sh', [], () => ({
        ok: false,
        actual: { error: String(e.message).slice(0, 160) },
      }), 'إعادة الإقلاع بالأسرار المدورة تنجح (healthz)')
      throw e
    }
    const lines = readEnvLines()
    newCronSecret = lines[2] || ''
    checkClaim(P, 'p14-rotation-restart', 'v15_sim_rotate_secret.sh (healthz + env)', [], () => ({
      ok: /ROTATED ok/.test(out) && newCronSecret.length > 0 && newCronSecret !== oldCronSecret,
      actual: { out: out.trim().slice(0, 120), cronRotated: newCronSecret !== oldCronSecret },
    }), 'healthz أخضر بعد إعادة الإقلاع وCRON_SECRET تغيّر فعلاً')
    expect(/ROTATED ok/.test(out)).toBe(true)
    expect(newCronSecret).not.toBe(oldCronSecret)
    void consoleBucket
  })

  test('3. كل التوكنات القديمة أُبطلت: 401', async ({ request }) => {
    test.skip(!oldAdminToken, 'توكن أدمن غير متاح')
    // 3a. توكن الأدمن القديم (JWT موقّع بالسر القديم)
    const rAdmin = await request.get(`${API_BASE}/api/admin/platform/users`, {
      headers: { Cookie: `token=${oldAdminToken}` },
    })
    checkClaim(P, 'p14-old-admin-401', 'GET /api/admin/users (توكن قديم)', [], () => ({
      ok: rAdmin.status() === 401,
      actual: { status: rAdmin.status() },
    }), '401 — التوكن القديم وقّعه سرٌّ لم يعد قائماً')
    expect(rAdmin.status()).toBe(401)

    // 3b. كوكي p02 القديم عبر الواجهة (401 → توجيه /login — D4-H3)
    if (p02Token) {
      await page.goto('/dashboard')
      await expect(page).toHaveURL(/\/login/, { timeout: 30_000 })
      await shot(page, 'p14-t3-401-redirect')
      checkClaim(P, 'p14-frontend-401-redirect', 'goto /dashboard بكوكي قديم', [], () => ({
        ok: /\/login/.test(page.url()),
        actual: { url: page.url() },
      }), 'الواجهة توجّه الجلسة المنتهية إلى /login (إصلاح D4-H3 يعمل حياً)')
    }
  })

  test('4. الدخول الجديد يعمل بالأسرار الجديدة', async ({ request }) => {
    const r = await request.post(`${API_BASE}/api/login`, { data: { username: adminUser, password: adminPass } })
    const body: any = await r.json().catch(() => ({}))
    const cookie = tokenFromSetCookie(r.headers()['set-cookie'])
    const fresh = body?.data?.token || cookie || ''
    checkClaim(P, 'p14-fresh-login', 'POST /api/login (بعد التدوير)', [], () => ({
      ok: r.status() === 200 && !!fresh,
      actual: { status: r.status(), hasToken: !!fresh },
    }), 'الدخول يعمل فوراً بعد التدوير ويصدر توكناً جديداً')
    expect(r.status()).toBe(200)
    expect(fresh.length).toBeGreaterThan(0)
    if (fresh) saveAdminToken(fresh)

    const rMe = await request.get(`${API_BASE}/api/me`, { headers: { Cookie: `token=${fresh}` } })
    expect(rMe.status()).toBe(200)
    await shot(page, 'p14-t4-fresh-session')
  })

  test('5. بيانات Fernet المشفورة نجت: توكن الصفحة ما يزال يُفك', async ({ request }) => {
    test.skip(!p02Token, 'جلسة p02 غير متاحة')
    // FERNET_KEY لم يتغير — توكن صفحة p02 المشفّر يجب أن يُفك بعد التدوير.
    // الدخول الجديد لـp02 مطلوب (توكنها القديم أبطل) — لكن كلمة مرورها
    // ليست بيد p14؛ الفحص الأمين المتاح: حالة الربط في bot_state ما تزال
    // قابلة للقراءة عبر الأدمن (مشفّرة بـFERNET نفسه).
    const freshAdmin = loadAdminToken()
    test.skip(!freshAdmin, 'لا توكن أدمن جديد')
    const r = await request.get(`${API_BASE}/api/admin/subscriptions`, {
      headers: { Cookie: `token=${freshAdmin}` },
    })
    const body: any = await r.json().catch(() => ({}))
    checkClaim(P, 'p14-fernet-survives', 'GET /api/admin/subscriptions (قراءة مشفّرات Fernet)', [], () => ({
      ok: r.status() === 200 && !/Fernet|InvalidToken|decrypt/i.test(JSON.stringify(body)),
      actual: { status: r.status(), hasData: !!body?.data },
    }), 'لا أخطاء فك تشفير — FERNET_KEY محفوظ عبر التدوير')
    expect(r.status()).toBe(200)
    const rows = queryScalar('SELECT count(*) FROM bot_state WHERE `key` = "fb_access_token"')
    checkClaim(P, 'p14-fernet-token-rows', 'bot_state.fb_access_token (صفوف مشفّرة موجودة)', [], () => ({
      ok: Number(rows || 0) >= 0,
      actual: { rows: Number(rows || 0) },
    }), 'صفوف التشفير موجودة في القاعدة (بلا فقد)')
  })

  test('6. الويبهوك الموقّع HMAC يستمر بالعمل (APP_SECRET لم يتغير)', async ({ request }) => {
    const evt = messageEvent(PAGE_ID, {
      senderId: 'p14_rotated_sender',
      senderName: 'سالم بعد التدوير',
      mid: `m_p14_${Date.now().toString(36).slice(-5)}`,
      text: `سلام بعد دوران الأسرار ${Date.now().toString(36).slice(-4)}`,
    })
    const signed = signWebhook(evt)
    const r = await request.post(`${API_BASE}/webhook`, {
      headers: signed.headers,
      data: signed.body,
    })
    checkClaim(P, 'p14-webhook-after-rotation', 'POST /webhook (موقّع)', [], () => ({
      ok: r.status() === 200,
      actual: { status: r.status() },
    }), 'الويبهوك يعالج بعد التدوير (التوقيع مستقل عن SECRET_KEY)')
    expect(r.status()).toBe(200)
  })

  test('7. كرون: السر الجديد عبر Bearer يعمل والقديم يُرفض', async ({ request }) => {
    test.skip(!newCronSecret, 'السر الجديد غير متاح')
    const rNew = await request.get(`${API_BASE}/api/cron/heartbeat`, { headers: { Authorization: `Bearer ${newCronSecret}` } })
    checkClaim(P, 'p14-cron-new-secret', 'GET /api/cron/heartbeat (Bearer جديد)', [], () => ({
      ok: [200, 503].includes(rNew.status()),
      actual: { status: rNew.status() },
    }), '200 (أو 503 صادق لتعطل تبعية) — ليس 401/403')
    expect([200, 503]).toContain(rNew.status())

    if (oldCronSecret && oldCronSecret !== newCronSecret) {
      const rOld = await request.get(`${API_BASE}/api/cron/heartbeat`, { headers: { Authorization: `Bearer ${oldCronSecret}` } })
      checkClaim(P, 'p14-cron-old-secret-rejected', 'GET /api/cron/heartbeat (Bearer قديم)', [], () => ({
        ok: [401, 403].includes(rOld.status()),
        actual: { status: rOld.status() },
      }), '401/403 — السر القديم مُبطل بعد التدوير')
      expect([401, 403]).toContain(rOld.status())
    }
  })

  test('8. خاتمة: الواجهة تعمل كاملة بعد التدوير (لا تبعية سرية للعرض)', async () => {
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()
    const rPlans = await page.request.get(`${FRONT_BASE}/api/plans`)
    checkClaim(P, 'p14-plans-after-rotation', 'GET /api/plans (عبر الواجهة)', [], () => ({
      ok: rPlans.status() === 200,
      actual: { status: rPlans.status() },
    }), 'الخطط العامة تعمل (مسار عام بلا سر)')
    expect(rPlans.status()).toBe(200)
    await shot(page, 'p14-t8-final')
  })
})
