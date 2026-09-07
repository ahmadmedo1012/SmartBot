import { test, expect, type Browser, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

/**
 * v14-E7 (تصميم D13 §3 P03) — «عبدالسلام» مشترك جديد بتحويل بنكي + إيصال:
 *   تسجيل → تخطي المعالج برمجياً → خطة (bank) + بيانات المُرسِل + رفع إيصال
 *   صالح عبر الواجهة (ضغط client-side ثم POST /api/upload) → إرسال الدفع →
 *   رفض إيصال زائف (400) وضخم >5MB (400) عبر القناة الخام → موافقة أدمن →
 *   شاشة الموافقة تصل عبر SSE في نفس النافذة المفتوحة → لوحة التحكم.
 *
 * fixtures: e2e/sim/fixtures/{receipt.png, receipt-fake.txt, receipt-big.png}
 */
import { personas, tsSuffix } from './sim/helpers/personas'
import { createPersonaContext, watchConsole } from './sim/helpers/net'
import { shot } from './sim/helpers/shots'
import { browserFetch, apiGet } from './sim/helpers/api'
import { registerViaUI, savePersonaToken, getToken, approvePayment } from './sim/helpers/session'
import { checkClaim } from './sim/helpers/db-claims.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const P = 'p03'
const p = personas.p03
const uname = `p03_${tsSuffix()}`
const email = `${uname}@sim.ly`
const FIXTURES = path.resolve(__dirname, 'sim/fixtures')
const UPLOADS_DIR = path.resolve(__dirname, '../../../fb_dashboard/static/uploads/receipts')

let page: Page
let token = ''
let paymentId = 0

/** رفع خام عبر قناة المتصفح (يصك CSRF من document.cookie) — File بصيغة مُتحكَّم بها. */
async function rawUpload(
  page: Page,
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<{ status: number; body: any }> {
  const b64 = buffer.toString('base64')
  return page.evaluate(
    async ({ b64, fileName, mimeType }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const fd = new FormData()
      fd.append('file', new File([bytes], fileName, { type: mimeType }))
      const csrf = (document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/) || [])[1] || ''
      const r = await fetch('/api/upload', {
        method: 'POST',
        headers: csrf ? { 'X-CSRF-Token': csrf } : {},
        credentials: 'same-origin',
        body: fd,
      })
      let body: unknown = null
      try {
        body = await r.json()
      } catch {
        body = { raw: (await r.text()).slice(0, 200) }
      }
      return { status: r.status, body }
    },
    { b64, fileName, mimeType }
  )
}

test.describe('P03 — تحويل بنكي بإيصال', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctx = await createPersonaContext(browser, P)
    page = await ctx.newPage()
    watchConsole(page)
  })

  test.afterAll(async () => {
    await page.context().close().catch(() => {})
  })

  test('1-5. تسجيل + دفع bank + رفع إيصال صالح (UI كامل)', async () => {
    // الخطوة 1 — تسجيل (جلسة تلقائية) + إتمام المعالج عبر API (نمط mobile-nav L40)
    const url = await registerViaUI(page, uname, email, p.password!)
    expect(url).toMatch(/dashboard|onboarding/)
    token = await getToken(page.context())
    savePersonaToken(P, token)
    await page.request.post('/api/onboarding/complete', {
      headers: { cookie: `token=${token}` },
    })
    await page.goto('/dashboard')
    await page.waitForTimeout(2000)
    await shot(page, P, '03-step-01-registered')

    // الخطوة 2 — شبكة الخطط → بطاقة مدفوعة → متابعة → مراجعة → نافذة الدفع
    await page.goto('/subscribe')
    await page.locator('div.grid button[aria-pressed]').first().waitFor({ state: 'visible', timeout: 20_000 })
    const planCards = page.locator('div.grid button[aria-pressed]')
    const count = await planCards.count()
    await planCards.nth(Math.min(1, count - 1)).click() // بطاقة مدفوعة (الأولى مجانية غالباً)
    await page.waitForTimeout(700)
    await page.locator('button:has-text("متابعة")').first().click()
    await page.locator('button:has-text("ادفع الآن")').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('button:has-text("ادفع الآن")').first().click()

    // مزود «تحويل بنكي» (payment-methods.tsx — زر aria-pressed)
    const bankTab = page.locator('button[aria-pressed]:has-text("تحويل بنكي")').first()
    await bankTab.waitFor({ state: 'visible', timeout: 15_000 })
    await bankTab.click()
    await page.waitForTimeout(500)

    // بيانات المُرسِل (payment-instructions.tsx — ملصقات الحقول)
    await page.getByLabel('اسم صاحب الحساب المُرسِل').fill('عبدالسلام المهدي')
    await page.getByLabel('رقم حساب المُرسِل').fill('002100887766')
    await shot(page, P, '03-step-02-bank')

    // الخطوة 4 — رفع إيصال صالح عبر الواجهة (ضغط client-side ثم /api/upload)
    const uploadP = page.waitForResponse(
      (r) => r.url().includes('/api/upload') && r.request().method() === 'POST',
      { timeout: 30_000 }
    )
    await page.setInputFiles('input[type="file"]', path.join(FIXTURES, 'receipt.png'))
    const up = await uploadP
    expect(up?.status(), 'POST /api/upload = 200').toBe(200)
    const upBody = await up!.json().catch(() => null)
    expect(upBody?.success).toBe(true)
    expect(String(upBody?.data?.url || ''), 'مسار الإيصال تحت /static/uploads/receipts').toContain('/static/uploads/receipts/')
    await page.waitForTimeout(800)
    await shot(page, P, '03-step-04-upload')

    // الخطوة 5 — ادعاء ملف: jpg جديد فعلاً على القرص (إعادة ترميز Pillow)
    const jpgs = fs.readdirSync(UPLOADS_DIR).filter((f) => f.endsWith('.jpg'))
    checkClaim(
      P,
      'p03-receipt-file',
      `ls ${UPLOADS_DIR}`,
      [],
      () => ({ ok: jpgs.length > 0, actual: `${jpgs.length} ملف jpg: ${jpgs.slice(0, 3).join(', ')}` }),
      'ملف jpg واحد على الأقل بعد الرفع (إعادة ترميز Pillow)',
      { query: `ls ${UPLOADS_DIR}` }
    )
    expect(jpgs.length, 'إيصال مُخزَّن على القرص كـ jpg').toBeGreaterThan(0)

    // إرسال طلب الدفع البنكي (الإيصال مُرفق في extra_data) — النافذة تنتظر بعدها
    const subP = page.waitForResponse(
      (r) => r.url().endsWith('/api/subscriptions') && r.request().method() === 'POST',
      { timeout: 20_000 }
    )
    await page.locator('button:has-text("إرسال طلب الدفع")').first().click()
    const sub = await subP
    expect(sub?.status(), 'POST /api/subscriptions (bank) = 200').toBe(200)
    const subBody = await sub!.json().catch(() => null)
    paymentId = subBody?.data?.payment_id || 0
    expect(paymentId).toBeGreaterThan(0)
    await page.locator('text=في انتظار تأكيد الدفع').first().waitFor({ state: 'visible', timeout: 15_000 })

    // ادعاء DB: pending/bank + الإيصال في extra_data
    checkClaim(
      P,
      'p03-payment-pending-bank',
      'SELECT status, provider, extra_data FROM subscription_payments WHERE id=?',
      [paymentId],
      (rows) => {
        const r = rows[0]
        let extra: any = {}
        try {
          extra = typeof r?.extra_data === 'string' ? JSON.parse(r.extra_data || '{}') : r?.extra_data || {}
        } catch {
          extra = {}
        }
        return {
          ok:
            r?.status === 'pending' &&
            r?.provider === 'bank' &&
            String(extra.receipt_url || '').includes('/static/uploads/receipts/'),
          actual: { status: r?.status, provider: r?.provider, receipt_url: extra.receipt_url },
        }
      },
      'pending + bank + receipt_url'
    )
  })

  test('6-7. رفض إيصال زائف (400) وضخم >5MB (400) — عقود الخادم الخام', async () => {
    // النافذة ما زالت تنتظر — الفحوص الخام تعمل من نفس الصفحة (بلا تنقل)
    // الخطوة 6 — ملف نصي بصيغة image/png مزيفة → Pillow يرفض → 400 عربية
    const fakeRes = await rawUpload(page, 'receipt-fake.png', 'image/png', fs.readFileSync(path.join(FIXTURES, 'receipt-fake.txt')))
    expect(fakeRes.status, `الإيصال الزائف مرفوض (فعلي ${fakeRes.status})`).toBe(400)
    expect(String(fakeRes.body?.detail || ''), 'رسالة «ليس صورة صالحة»').toContain('صورة')
    await shot(page, P, '03-step-06-fake-receipt')

    // الخطوة 7 — PNG منفوخ 6MB: سقف الحجم الخادمي (قبل أي فك ضغط)
    const bigRes = await rawUpload(page, 'receipt-big.png', 'image/png', fs.readFileSync(path.join(FIXTURES, 'receipt-big.png')))
    expect(bigRes.status, `الإيصال الضخم مرفوض (فعلي ${bigRes.status})`).toBe(400)
    expect(String(bigRes.body?.detail || ''), 'رسالة السقف 5MB').toContain('5')
    await shot(page, P, '03-step-07-too-big')

    checkClaim(
      P,
      'p03-receipt-guards',
      'POST /api/upload (زائف + ضخم)',
      [],
      () => ({ ok: fakeRes.status === 400 && bigRes.status === 400, actual: `زائف=${fakeRes.status}، ضخم=${bigRes.status}` }),
      '400 + 400 (سقف الصيغة والحجم)',
      { query: 'POST /api/upload' }
    )
  })

  test('8-9. موافقة أدمن → تفعيل عبر SSE → لوحة التحكم', async ({ request }) => {
    test.setTimeout(120_000)
    // الخطوة 8 — نفس نداء P02-15
    const approve = await approvePayment(request, paymentId, 'verified')
    expect(approve.status, `موافقة الأدمن (فعلي ${approve.status})`).toBe(200)
    checkClaim(P, 'p03-approved', 'POST /api/admin/subscriptions {verified}', [], (rows) => ({ ok: true, actual: approve.status }), '200', {
      query: 'POST /api/admin/subscriptions',
    })

    // الخطوة 9 — النافذة المفتوحة تلتقط القرار (SSE دفع أو poll 5s) ≤30s
    await page.locator('text=تم الموافقة على الاشتراك').first().waitFor({ state: 'visible', timeout: 30_000 })
    await shot(page, P, '03-step-09-activated')
    const goDash = page.locator('button:has-text("الانتقال إلى لوحة التحكم")').first()
    if (await goDash.count()) {
      await goDash.click().catch(() => {})
    }
    await page.waitForURL(/dashboard/, { timeout: 30_000 }).catch(() => {})
    await page.goto('/dashboard')
    await page.waitForTimeout(2500)
    expect(await page.locator('main, [class*="card"]').count(), 'اللوحة تعمل بعد التفعيل').toBeGreaterThan(0)

    // توكن p03 يبقى صالحاً — GET /api/me 200 (ادعاء ختامي)
    const me = await apiGet(page.request, '/api/me', { headers: { cookie: `token=${token}` } })
    expect(me.status).toBe(200)
  })
})
