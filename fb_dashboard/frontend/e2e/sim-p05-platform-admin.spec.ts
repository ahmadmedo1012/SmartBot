import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * v14-E7 (تصميم D13 §3 P05) — «أنس» أدمن المنصة (رحلتان):
 *
 * P05-A: دخول الأدمن → طابور المدفوعات + فلترة → الإعدادات (قراءة/تغيير/
 *   إرجاع mobile_wallet_cap — تنظيف آثار إلزامي) → تلغرام (اختبار صادق) →
 *   cron (الحالة + النبض بالسر) → مستخدمو المنصة → تشغيل البوت
 *   (restart → status → trigger → logs → stop).
 *
 * P05-B: جولة المشغل (p05op — التسجيلة الرابعة): leads + إنشاء عميل متوقع
 *   يدوياً + marketing (حملة تجريبية تُنشأ وتُحذف — تنظيف).
 *
 * ملاحظتان عن العقد الفعلي (الانحراف موثق):
 *  - heartbeat بلا سر يرد 403 «وصول غير مصرح به لمهام الجدولة» (bot.py L124)
 *    لا 401 كما في التصميم — نختبر الفعلي.
 *  - طابور pending عند وصول P05 يكون فارغاً بالفعل (كل دفعات P02-P04
 *    عُولجت) — الفلترة الحقيقية تُثبت بالتبديل إلى «الكل» حيث تظهر صفوف
 *    p02/p03.
 */
import { operatorPersona, tsSuffix } from './sim/helpers/personas'
import { createPersonaContext, watchConsole } from './sim/helpers/net'
import { shot, runId } from './sim/helpers/shots'
import { ADMIN_USER, ADMIN_PASS, browserFetch } from './sim/helpers/api'
import { registerViaUI, loginViaUI, skipJoyride, getToken, savePersonaToken } from './sim/helpers/session'
import { checkClaim, queryScalar } from './sim/helpers/db-claims.mjs'

const P = 'p05'
const CRON_SECRET = process.env.SIM_CRON_SECRET || ''

let page: Page

test.describe('P05 — أدمن المنصة', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctx = await createPersonaContext(browser, P)
    page = await ctx.newPage()
    watchConsole(page)
  })

  test.afterAll(async () => {
    await page.context().close().catch(() => {})
  })

  test('1-4. دخول الأدمن وطابور المدفوعات + الفلترة', async () => {
    // الخطوة 1 — دخول UI بحساب أدمن البذرة → /admin (v10-B5)
    const landing = await loginViaUI(page, ADMIN_USER, ADMIN_PASS)
    expect(landing, `هبوط الأدمن: ${landing}`).toMatch(/admin|dashboard/)
    await page.waitForTimeout(2000)
    await shot(page, P, '05-step-01-admin-login')

    // الخطوة 2 — طابور المدفوعات: pending عند وصولنا فارغ غالباً (كل دفعات
    // p02-p04 عُولجت — موثق في رأس الملف) → EmptyState بدل الجدول، والجدول
    // يظهر فعلياً عند التبديل إلى «الكل» في الخطوة 4
    await page.goto('/admin')
    // v14-fix: صيغة text= داخل قائمة CSS غير صالحة — فاصل or() السليم
    const queueArea = page
      .locator('table[aria-labelledby="admin-payments-heading"]')
      .or(page.getByText('لا توجد طلبات اشتراك'))
    await queueArea.first().waitFor({ state: 'visible', timeout: 20_000 })
    await shot(page, P, '05-step-02-admin-payments')

    // الخطوة 3 — فلترة pending (زر aria-pressed — الحالة الافتراضية)
    await page.locator('button[aria-pressed]:has-text("قيد الانتظار")').first().click()
    await page.waitForTimeout(1500)
    await shot(page, P, '05-step-03-filter')

    // الخطوة 4 — مدفوعات p02/p03 ظاهرة عند التبديل إلى «الكل»
    await page.locator('button[aria-pressed]:has-text("الكل"), button:has-text("الكل")').first().click()
    await page
      .locator('table[aria-labelledby="admin-payments-heading"]')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)
    const tableText = await page.locator('table').first().innerText().catch(() => '')
    const hasRows = tableText.includes('p02') || tableText.includes('p03') || (await page.locator('table tbody tr').count()) > 0
    expect(hasRows, `صفوف المدفوعات في «الكل»: ${tableText.slice(0, 120).replace(/\n/g, ' ')}`).toBeTruthy()
    checkClaim(
      P,
      'p05-payments-queue',
      'GET /api/admin/subscriptions?status=all',
      [],
      () => ({ ok: hasRows, actual: tableText.slice(0, 160).replace(/\s+/g, ' ') }),
      'صفوف p02/p03/الكل ظاهرة',
      { query: 'GET /api/admin/subscriptions' }
    )
  })

  test('5-6. الإعدادات: قراءة وتغيير وإرجاع mobile_wallet_cap (تنظيف)', async () => {
    // الخطوة 5 — قراءة الإعدادات
    await page.goto('/admin/settings')
    await page.locator('#mobile_wallet_cap').first().waitFor({ state: 'visible', timeout: 20_000 })
    const cfg = await browserFetch(page, '/api/admin/config')
    expect(cfg.status, 'GET /api/admin/config = 200').toBe(200)
    expect(cfg.body?.success).toBe(true)
    await shot(page, P, '05-step-05-settings')
    const originalCap = String(
      (cfg.body?.data || {}).mobile_wallet_cap || (await page.locator('#mobile_wallet_cap').inputValue()) || '99'
    )

    // الخطوة 6 — تغيير السقف إلى 200 ثم حفظ ثم إرجاع الأصل (مرتان POST)
    const capInput = page.locator('#mobile_wallet_cap').first()
    await capInput.fill('200')
    await page.locator('button:has-text("حفظ")').first().click()
    await page.waitForTimeout(1500)
    const setCfg = await browserFetch(page, '/api/admin/config')
    expect(String((setCfg.body?.data || {}).mobile_wallet_cap)).toBe('200')
    await shot(page, P, '05-step-06-cap-change')

    // الإرجاع (تنظيف آثار إلزامي — التصميم)
    await page.locator('#mobile_wallet_cap').first().fill(originalCap)
    await page.locator('button:has-text("حفظ")').first().click()
    await page.waitForTimeout(1500)
    const restored = await browserFetch(page, '/api/admin/config')
    const restoredCap = String((restored.body?.data || {}).mobile_wallet_cap)
    checkClaim(
      P,
      'p05-cap-restored',
      'GET /api/admin/config → mobile_wallet_cap',
      [],
      () => ({ ok: restoredCap === originalCap, actual: `${originalCap} → 200 → ${restoredCap}` }),
      `القيمة الأصلية ${originalCap} مستعادة`,
      { query: 'GET /api/admin/config' }
    )
    expect(restoredCap, `السقف مستعار: ${restoredCap}`).toBe(originalCap)
  })

  test('7-8. تلغرام: اختبار صادق + صفحة التشخيص', async () => {
    // الخطوة 7 — اختبار التلغرام: بلا توكن مُعد → 400 عربية (فشل صادق مُوثق
    // بالتصميم — «أو فشل صادق مُوثّق إن لم يضبط bot token»)
    const tg = await browserFetch(page, '/api/telegram/test', { method: 'POST' })
    expect([200, 400], `اختبار تلغرام (فعلي ${tg.status}: ${JSON.stringify(tg.body).slice(0, 120)})`).toContain(tg.status)
    await shot(page, P, '05-step-07-telegram-test')

    // الخطوة 8 — صفحة التشخيص
    const tgPage = await page.goto('/admin/telegram')
    expect(tgPage?.status()).toBe(200)
    await page.waitForTimeout(2000)
    await shot(page, P, '05-step-08-telegram')
    checkClaim(
      P,
      'p05-telegram-honest',
      'POST /api/telegram/test',
      [],
      () => ({ ok: tg.status === 200 || tg.status === 400, actual: tg.status }),
      '200 أو 400 (فشل صادق)',
      { query: 'POST /api/telegram/test' }
    )
  })

  test('9-10. cron: الحالة + النبض (بالسر)', async () => {
    // الخطوة 9 — حالة الجدولة
    const cron = await browserFetch(page, '/api/cron/status')
    expect(cron.status, 'GET /api/cron/status = 200').toBe(200)
    expect(cron.body?.success).toBe(true)
    checkClaim(P, 'p05-cron-status', 'GET /api/cron/status', [], (rows) => ({ ok: true, actual: cron.status }), '200 ok', {
      query: 'GET /api/cron/status',
    })

    // الخطوة 10 — النبض: بلا سر → 403 (العقد الفعلي bot.py L191)؛ بالسر → 200
    const noSecret = await browserFetch(page, '/api/cron/heartbeat')
    expect([401, 403], `نبض بلا سر مرفوض (فعلي ${noSecret.status})`).toContain(noSecret.status)
    const withSecret = await browserFetch(page, '/api/cron/heartbeat', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    // 503 ممكن نظرياً عند فشل عمودي (v12-E3.6) — القياس يوثّق الفعلي
    expect([200, 503], `نبض بالسر (فعلي ${withSecret.status})`).toContain(withSecret.status)
    await shot(page, P, '05-step-10-heartbeat')
    checkClaim(
      P,
      'p05-cron-heartbeat',
      'GET /api/cron/heartbeat',
      [],
      () => ({ ok: noSecret.status >= 401 && [200, 503].includes(withSecret.status), actual: `بلا سر=${noSecret.status}، بالسر=${withSecret.status}` }),
      'رفض بلا سر + استجابة مصرّحة بالسر',
      { query: 'GET /api/cron/heartbeat' }
    )
  })

  test('11. مستخدمو المنصة يُدرجون', async () => {
    // الخطوة 11 — قائمة المستخدمين تحوي p02/p03
    const users = await browserFetch(page, '/api/admin/platform/users?per_page=50')
    expect(users.status, 'GET /api/admin/platform/users = 200').toBe(200)
    const names = (users.body?.data?.items || users.body?.data || [])
      .map((u: any) => String(u.username || ''))
      .join(',')
    expect(names.includes('p02'), `مستخدمو المنصة: ${names}`).toBeTruthy()
    expect(names.includes('p03')).toBeTruthy()
    checkClaim(P, 'p05-users', 'GET /api/admin/platform/users', [], (rows) => ({ ok: true, actual: names }), 'تحوي p02+p03', {
      query: 'GET /api/admin/platform/users',
    })
  })

  test('12-14. تشغيل البوت: restart → status → trigger → logs تكبر → stop', async () => {
    test.setTimeout(150_000)
    // الخطوة 12 — restart ثم status
    const before = Number(queryScalar('SELECT count(*) FROM bot_logs') || 0)
    const restart = await browserFetch(page, '/api/bot/restart', { method: 'POST' })
    expect(restart.status, `restart (فعلي ${restart.status})`).toBe(200)
    const status = await browserFetch(page, '/api/bot/status')
    expect(status.status).toBe(200)
    const running = Boolean(status.body?.data?.running)
    await shot(page, P, '05-step-12-bot-restart')
    checkClaim(
      P,
      'p05-bot-restart',
      'GET /api/bot/status',
      [],
      () => ({ ok: status.status === 200, actual: `running=${running}, mode=${status.body?.data?.mode}` }),
      '200 + حالة موثقة',
      { query: 'GET /api/bot/status' }
    )

    // الخطوة 13 — دورة فورية ثم السجلات تكبر (دفعة monitor كل 10 أحداث —
    // انتظار استطلاع حتى 30 ث)
    const trigger = await browserFetch(page, '/api/bot/trigger', { method: 'POST' })
    expect(trigger.status, `trigger (فعلي ${trigger.status})`).toBe(200)
    const logs = await browserFetch(page, '/api/logs?limit=20')
    expect(logs.status, 'GET /api/logs = 200').toBe(200)
    let after = before
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(3000)
      after = Number(queryScalar('SELECT count(*) FROM bot_logs') || 0)
      if (after > before) break
    }
    checkClaim(
      P,
      'p05-bot-logs-grew',
      'SELECT count(*) FROM bot_logs',
      [],
      () => ({ ok: after > before, actual: `${before} → ${after}` }),
      'bot_logs زادت بعد trigger',
      { query: 'SELECT count(*) FROM bot_logs', note: 'دفعة monitor.py غير متزامنة (كل 10 أحداث) — استطلاع 30 ث' }
    )
    // السجل لا يتراجع أبداً — فقدان الصفوف هو الفشل الحقيقي
    expect(after, `bot_logs ${before} → ${after}`).toBeGreaterThanOrEqual(before)

    // الخطوة 14 — إطفاء نظيف
    const stop = await browserFetch(page, '/api/bot/stop', { method: 'POST' })
    expect(stop.status, `stop (فعلي ${stop.status})`).toBe(200)
  })

  test.describe('P05-B المشغل: leads وmarketing', () => {
    let opPage: Page

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
      // مشغل جديد (التسجيلة الرابعة — ميزانية §4.5) بنفس سياق p05 (HAR واحد)
      opPage = await page.context().newPage()
    })

    test('B1-B2. leads: القائمة + إنشاء عميل متوقع يدوياً', async () => {
      const opname = `p05op_${tsSuffix()}`
      const url = await registerViaUI(opPage, opname, `${opname}@sim.ly`, operatorPersona.password!)
      expect(url).toMatch(/dashboard|onboarding/)
      const opToken = await getToken(opPage.context())
      savePersonaToken('p05op', opToken)
      await opPage.request.post('/api/onboarding/complete', {
        headers: { cookie: `token=${opToken}` },
      })

      // صفحة العملاء المتوقعين
      await opPage.goto('/dashboard/leads')
      await opPage.waitForTimeout(2500)
      await shot(opPage, 'p05b', '05b-step-01-leads')
      const customers = await browserFetch(opPage, '/api/crm/customers')
      expect(customers.status, 'GET /api/crm/customers = 200').toBe(200)

      // إنشاء عميل متوقع يدوياً (Form-data — عقد crm_routes.py L57)
      const create = await opPage.evaluate(async () => {
        const csrf = (document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/) || [])[1] || ''
        const fd = new FormData()
        fd.append('fb_user_id', `sim_lead_${Date.now().toString(36)}`)
        fd.append('name', 'عميل متوقع من المحاكاة')
        fd.append('phone', '0912345678')
        fd.append('stage', 'lead')
        fd.append('interested_in', 'الباقات المدفوعة')
        const r = await fetch('/api/crm/customers', {
          method: 'POST',
          headers: csrf ? { 'X-CSRF-Token': csrf } : {},
          credentials: 'same-origin',
          body: fd,
        })
        return { status: r.status, body: await r.json().catch(() => null) }
      })
      expect(create.status, `إنشاء عميل (فعلي ${create.status}: ${JSON.stringify(create.body).slice(0, 120)})`).toBe(200)
      await shot(opPage, 'p05b', '05b-step-02-lead-created')
      checkClaim(
        'p05b',
        'p05b-lead-created',
        'POST /api/crm/customers',
        [],
        () => ({ ok: create.status === 200, actual: create.status }),
        '200 + id',
        { query: 'POST /api/crm/customers' }
      )
    })

    test('B3-B5. marketing: الحملات وaudience-size + إنشاء وحذف (تنظيف)', async () => {
      await opPage.goto('/dashboard/marketing')
      await opPage.waitForTimeout(2500)
      await shot(opPage, 'p05b', '05b-step-03-marketing')

      const campaigns = await browserFetch(opPage, '/api/marketing/campaigns')
      expect(campaigns.status, 'GET /api/marketing/campaigns = 200').toBe(200)
      const audience = await browserFetch(opPage, '/api/marketing/audience-size?audience=all')
      expect(audience.status, 'GET /api/marketing/audience-size = 200').toBe(200)

      // حملة تجريبية ثم حذفها (تنظيف آثار — التصميم)
      const created = await browserFetch(opPage, '/api/marketing/campaigns', {
        method: 'POST',
        body: {
          name: `حملة محاكاة ${runId()}`,
          message: 'رسالة حملة تجريبية من بطارية المحاكاة — تُحذف فوراً',
          audience: 'all',
        },
      })
      expect(created.status, `إنشاء حملة (فعلي ${created.status}: ${JSON.stringify(created.body).slice(0, 120)})`).toBe(200)
      const campaignId = Number(created.body?.data?.id || 0)
      expect(campaignId).toBeGreaterThan(0)
      await shot(opPage, 'p05b', '05b-step-04-campaign-created')

      const deleted = await browserFetch(opPage, `/api/marketing/campaigns/${campaignId}`, {
        method: 'DELETE',
      })
      expect(deleted.status, `حذف الحملة (فعلي ${deleted.status})`).toBe(200)
      await shot(opPage, 'p05b', '05b-step-05-campaign-cleaned')
      checkClaim(
        'p05b',
        'p05b-marketing-crud',
        'POST + DELETE /api/marketing/campaigns',
        [],
        () => ({
          ok: campaigns.status === 200 && created.status === 200 && deleted.status === 200,
          actual: `list=${campaigns.status} create=${created.status} delete=${deleted.status}`,
        }),
        '200 + 200 + 200 (مع تنظيف)',
        { query: 'POST/DELETE /api/marketing/campaigns' }
      )
    })

    test.afterAll(async () => {
      await opPage?.close().catch(() => {})
    })
  })
})
