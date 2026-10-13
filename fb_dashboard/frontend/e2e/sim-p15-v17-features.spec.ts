import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * v17 (منسّق) — p15 «مستخدم الميزات الجديدة»: رحلة محرر على مستأجر p02
 * النشط تفحص حيًّا الميزات التي فتحتها جولة v17 (كل الوظائف بلا استثناء):
 *
 *  1. /subscribe متاح للمجهول (إصلاح D8-G1: apiFetch /api/me بلا skipAuthRedirect
 *     كان يطرد الزائر لـ /login) — تُفحص بزيارة بلا جلسة.
 *  2. إنشاء قالب في tools (إصلاح P0: الواجهة ترسل JSON والخادم كان يعلن
 *     Form → 422 دائمًا — لا يمكن إنشاء قالب إطلاقًا قبل v17-E-B1).
 *  3. إنشاء عرض في tools (وعد Premium «محرك العروض»: البوت يقدم العروض
 *     لكن لم يكن يمكن إنشاؤها — v17-E-F8).
 *  4. إنشاء حملة تسلسلية بخطوة واحدة (وعد Pro 129د.ل: المحرك حي منذ v16
 *     بلا أي سطح — v17-E-F9 صفحة جديدة كاملة).
 *  5. فتح محادثة في messages يصفّر unread (mark-read endpoint جديد —
 *     v17-E-B1 + الاستهلاك المتفائل v17-E-F1) — يُقاس في القاعدة.
 *
 * الادعاءات كلها عبر checkClaim (إثبات DB) + لقطات لكل خطوة.
 */
import {
  loadPersonaUsername, savePersonaToken, loadPersonaState, savePersonaState, ensureSession,
  approvePayment, loginViaUI,
} from './sim/helpers/session'
import { createPersonaContext, watchConsole } from './sim/helpers/net'
import { shot, runId } from './sim/helpers/shots'
import { browserFetch } from './sim/helpers/api'
import { checkClaim, queryScalar, queryOne } from './sim/helpers/db-claims.mjs'

const P = 'p15'
let uname = loadPersonaUsername('p02')
const password = 'Sim#P02pass' // نفس كلمة سر شخصية p02 (personas.ts)

let page: Page

// phase8 (إعادة 3b83f76): إعادة امتلاء من القرص بعد أي إعادة تشغيل عامل —
// p15 يفتح نموذج الدخول في الخطوة 1 فلا حقن في beforeAll (لا ارتداد /login)؛
// الامتلاء شرطي على حالة مخزنة.
async function rehydrate(): Promise<void> {
  const st = loadPersonaState(P)
  if (st.username) uname = st.username
  if (st.token && uname) {
    await ensureSession(page, P, { username: uname, password })
  }
}

test.describe('P15 — مستخدم ميزات v17', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctx = await createPersonaContext(browser, P)
    page = await ctx.newPage()
    watchConsole(page)
  })

  test.afterAll(async () => {
    await page.context().close().catch(() => {})
  })

  // phase8: إعادة امتلاء قبل كل اختبار (حصانة إعادة تشغيل العامل)
  test.beforeEach(async () => {
    await rehydrate()
  })

  test('0. /subscribe متاح للمجهول (لا طرد لـ/login)', async () => {
    await page.goto('/subscribe')
    await page.waitForLoadState('domcontentloaded')
    // v17-E-F2 (D8-G1): المجهول يبقى على /subscribe ويرى الخطط — الدفع هو
    // من يفرض المصادقة (لا صفحة الدخول)
    expect(page.url(), `المجهول طُرد إلى ${page.url()}`).not.toMatch(/login/)
    await shot(page, P, '15-step-00-anonymous-subscribe')
  })

  test('1. دخول محرر مستأجر p02', async () => {
    test.skip(!uname, 'P02 لم تكتب اسم المستخدمة — شغّل البطارية كاملة')
    const landing = await loginViaUI(page, uname, password)
    expect(landing, `هبوط ${landing}`).toMatch(/dashboard|onboarding/)
    const token = await page.context().cookies().then((cs) => cs.find((c) => c.name === 'token')?.value || '')
    if (token) {
      savePersonaToken('p15', token)
      // phase8: الحالة على القرص — إعادة تشغيل العامل تعيد امتلاء الجلسة
      savePersonaState(P, { username: uname, token })
    }
    await shot(page, P, '15-step-01-login')
  })

  test('2. إنشاء قالب في tools (إصلاح 422: JSON يقبل الآن)', async () => {
    test.skip(!uname, 'الدخول لم ينجح')
    await page.goto('/dashboard/tools')
    // زر «قالب جديد» يفتح النموذج (اسم/تصنيف/نص)
    await page.getByRole('button', { name: /قالب جديد/ }).first().click()
    const stamp = runId(P)
    await page.getByLabel('اسم القالب').fill(`قالب v17 ${stamp}`)
    await page.getByLabel('نص القالب').fill('شكرًا لتواصلك! سنعود إليك قريبًا.')
    const before = Number(queryScalar('SELECT COUNT(*) FROM reply_templates') || 0)
    await page.getByRole('button', { name: /حفظ|إضافة القالب/ }).first().click()
    await page.waitForTimeout(1500)
    const after = Number(queryScalar('SELECT COUNT(*) FROM reply_templates') || 0)
    checkClaim(
      P,
      'p15-template-create-json',
      'POST /api/templates بجسم JSON ينشئ صفًا (كان 422 دائمًا قبل v17)',
      [stamp],
      () => ({ ok: after === before + 1, actual: { before, after } }),
      'القالب أُنشئ فعليًا في القاعدة'
    )
    await shot(page, P, '15-step-02-template-created')
  })

  test('3. إنشاء عرض في tools (وعد Premium — محرك العروض)', async () => {
    test.skip(!uname, 'الدخول لم ينجح')
    await page.goto('/dashboard/tools')
    await page.getByRole('button', { name: /عرض جديد/ }).first().click()
    const stamp = runId(P)
    // حقول نموذج العرض حسب عقد POST /api/offers (title/text/discount…)
    const titleField = page.getByLabel(/عنوان|اسم العرض/).first()
    if (await titleField.count()) await titleField.fill(`عرض v17 ${stamp}`)
    const before = Number(queryScalar('SELECT COUNT(*) FROM offers') || 0)
    await page.getByRole('button', { name: /حفظ|إضافة العرض|إنشاء العرض/ }).first().click()
    await page.waitForTimeout(1500)
    const after = Number(queryScalar('SELECT COUNT(*) FROM offers') || 0)
    checkClaim(
      P,
      'p15-offer-create',
      'نموذج «عرض جديد» ينشئ صف offers (كان الإنشاء مستحيلًا)',
      [stamp],
      () => ({ ok: after === before + 1, actual: { before, after } }),
      'العرض أُنشئ في القاعدة'
    )
    await shot(page, P, '15-step-03-offer-created')
  })

  test('4. إنشاء حملة تسلسلية بخطوة (وعد Pro — رقِّ خطتك أولاً)', async ({ request }) => {
    test.skip(!uname, 'الدخول لم ينجح')
    // phase8 (إعادة 3b83f76 — رحلة الترقية الأمينة): بوابة الخطة حقيقية
    // (v22-D4: has_sequences على Pro/Enterprise فقط — sequences.py:18) —
    // مستأجر p02 على أساسي/غير نشط، فالإنشاء المباشر يُرفض 403 «رقِّ
    // خطتك» (رحلة الجولة 6 كانت تفترض الإنشاء المباشر فبقيت الصفوف صفرًا).
    // الرحلة الكاملة الصادقة: (أ) البوابة تُقاس أولاً، (ب) ترقية فعلية
    // (دفعة Pro — تحويل بنكي: 129 فوق سقف المحفظة فيُجبر المنتج عليه) →
    // موافقة الأدمن → (ج) الإنشاء من الواجهة يمر والصفوف تُنشأ.
    const pro = queryOne('SELECT id, price FROM subscription_plans WHERE name=?', ['Pro']) as
      | { id: number; price: number }
      | undefined
    expect(pro, 'خطة Pro موجودة').toBeTruthy()

    // (أ) البوابة — تُقاس قبل الترقية (لا تُخفى)
    const gate = await browserFetch(page, '/api/sequences', {
      method: 'POST',
      body: { name: `بوابة p15 ${runId(P)}` },
    })
    checkClaim(
      P,
      'p15-sequence-plan-gate',
      'POST /api/sequences (خطة بلا has_sequences)',
      [],
      () => ({ ok: gate.status === 403, actual: { status: gate.status, detail: gate.body?.detail } }),
      '403 «الحملات التسلسلية متاحة في خطة احترافي أو أعلى — رقِّ خطتك» (بوابة v22-D4 حية)'
    )
    expect(gate.status, `بوابة خطة التسلسلات (فعلي ${gate.status})`).toBe(403)

    // (ب) الترقية: المسار حسب حالة المستأجر — نشط → /upgrade (خطة أعلى)،
    // غير نشط (إلغاء p04/حسم p13-9b cancelled) → اشتراك جديد. كلاهما دفعة
    // Pro بنكية (129 > سقف المحفظة) تُحسم verified فيفعّل has_sequences.
    const tenantRow = queryOne(
      'SELECT subscription_status, plan_end FROM tenants WHERE id=(SELECT tenant_id FROM users WHERE username=?)',
      [uname]
    ) as { subscription_status?: string; plan_end?: string | null } | undefined
    const status = String(tenantRow?.subscription_status || '').toUpperCase()
    const planEnd = tenantRow?.plan_end ? new Date(tenantRow.plan_end) : null
    const active = (status === 'PAID' || status === 'TRIAL') && (!planEnd || planEnd.getTime() > Date.now())
    const bankBody = {
      plan_id: pro!.id,
      provider: 'bank',
      amount: Number(pro!.price),
      senderAccountName: 'منال p15',
      senderAccountNumber: '000915',
    }
    const upgradeResp = active
      ? await browserFetch(page, '/api/subscriptions/upgrade', { method: 'POST', body: bankBody })
      : await browserFetch(page, '/api/subscriptions', { method: 'POST', body: bankBody })
    expect(upgradeResp.status, `ترقية Pro (${active ? 'upgrade' : 'اشتراك جديد'} — فعلي ${upgradeResp.status}: ${JSON.stringify(upgradeResp.body).slice(0, 140)})`).toBe(200)
    const pid = Number(upgradeResp.body?.data?.payment_id || 0)
    expect(pid, 'payment_id للترقية').toBeGreaterThan(0)
    const settle = await approvePayment(request, pid, 'verified')
    expect(settle.status, `موافقة الأدمن على Pro (فعلي ${settle.status})`).toBe(200)
    const proNow = queryOne(
      'SELECT p.name AS plan, t.subscription_status FROM tenants t JOIN subscription_plans p ON p.id=t.plan_id WHERE t.id=(SELECT tenant_id FROM users WHERE username=?)',
      [uname]
    ) as { plan?: string; subscription_status?: string } | undefined
    checkClaim(
      P,
      'p15-pro-upgrade-verified',
      'POST /api/subscriptions{,/upgrade} (Pro بنكي) + موافقة الأدمن',
      [],
      () => ({ ok: proNow?.plan === 'Pro' && proNow?.subscription_status === 'PAID', actual: proNow }),
      'المستأجر على Pro PAID بعد الترقية والموافقة (has_sequences=true)'
    )
    expect(proNow?.plan, 'المستأجر على Pro').toBe('Pro')

    // (ج) الإنشاء من الواجهة (السطح الحقيقي للميزة — نفس رحلة الجولة 6)
    await page.goto('/dashboard/sequences')
    // الصفحة نفسها يجب أن تعمل (nav عنصر جديد في AdminSidebar)
    await page.getByRole('button', { name: /حملة جديدة/ }).first().click()
    const stamp = runId(P)
    await page.getByLabel('اسم الحملة').fill(`حملة v17 ${stamp}`)
    await page.getByLabel('نص الخطوة 1').fill('أهلًا بك! هذه أول رسالة السلسلة.')
    const before = Number(queryScalar('SELECT COUNT(*) FROM sequences') || 0)
    await page.getByRole('button', { name: /إنشاء الحملة/ }).first().click()
    await page.waitForTimeout(2000)
    const after = Number(queryScalar('SELECT COUNT(*) FROM sequences') || 0)
    const steps = Number(queryScalar('SELECT COUNT(*) FROM sequence_steps') || 0)
    checkClaim(
      P,
      'p15-sequence-create',
      'إنشاء حملة تسلسلية + خطوتها الأولى من الواجهة بعد ترقية Pro (كانت الميزة بلا سطح)',
      [stamp],
      () => ({ ok: after === before + 1 && steps >= 1, actual: { before, after, steps } }),
      'الحملة والخطوة أُنشئتا في القاعدة'
    )
    expect(after, 'صف sequences نما 1').toBe(before + 1)
    expect(steps, 'خطوة واحدة على الأقل').toBeGreaterThanOrEqual(1)
    await shot(page, P, '15-step-04-sequence-created')
  })

  test('5. فتح محادثة يصفّر unread (mark-read الحي)', async () => {
    test.skip(!uname, 'الدخول لم ينجح')
    // p08/p09 أنشآ محادثات على مستأجر p02 — اختر واحدة ذات unread>0
    // ونقر زرها في القائمة عبر اسم صاحبها (القائمة مرتبة بالأحدث — النقر
    // «لأول عنصر» قد يفتح محادثة مختلفة؛ المطابقة بالاسم هي العقد الصحيح)
    const row = queryOne(
      'SELECT id, user_name, fb_conversation_id, unread_count FROM conversations WHERE unread_count > 0 ORDER BY id LIMIT 1'
    ) as { id: number; user_name: string; fb_conversation_id: string; unread_count: number } | undefined
    test.skip(!row, 'لا محادثة غير مقروءة (شخصيات p08/p09 لم تترك واحدة)')
    await page.goto('/dashboard/messages')
    await page.waitForTimeout(1500)
    // phase8 (v24-C2): دلالات القائمة على <li> حقيقية (ul role=list) —
    // role="listitem" على الزر أُزيل. getByRole('listitem') يلتقط <li> الفعلي
    // والنص داخله (الاسم نفسه الذي كان على الزر).
    const name = (row.user_name || '').trim()
    const convBtn = page.getByRole('listitem').filter({ hasText: name }).first()
    await convBtn.waitFor({ state: 'visible', timeout: 15_000 })
    await convBtn.click()
    await page.waitForTimeout(2000)
    const unreadNow = Number(
      queryScalar('SELECT unread_count FROM conversations WHERE id=?', [row.id]) || 0
    )
    checkClaim(
      P,
      'p15-mark-read',
      'فتح المحادثة يصفّر unread (endpoint جديد v17 + استهلاك متفائل)',
      [String(row.id)],
      () => ({ ok: unreadNow === 0, actual: { before: row.unread_count, after: unreadNow } }),
      'unread صفر بعد الفتح'
    )
    await shot(page, P, '15-step-05-mark-read')
  })
})
