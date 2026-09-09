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
import { loadPersonaUsername, savePersonaToken } from './sim/helpers/session'
import { createPersonaContext, watchConsole } from './sim/helpers/net'
import { shot, runId } from './sim/helpers/shots'
import { loginViaUI } from './sim/helpers/session'
import { checkClaim, queryScalar, queryOne } from './sim/helpers/db-claims.mjs'

const P = 'p15'
const uname = loadPersonaUsername('p02')
const password = 'Sim#P02pass' // نفس كلمة سر شخصية p02 (personas.ts)

let page: Page

test.describe('P15 — مستخدم ميزات v17', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctx = await createPersonaContext(browser, P)
    page = await ctx.newPage()
    watchConsole(page)
  })

  test.afterAll(async () => {
    await page.context().close().catch(() => {})
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
    if (token) savePersonaToken('p15', token)
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

  test('4. إنشاء حملة تسلسلية بخطوة (وعد Pro — الصفحة الجديدة)', async () => {
    test.skip(!uname, 'الدخول لم ينجح')
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
      'إنشاء حملة تسلسلية + خطوتها الأولى من الواجهة (كانت الميزة بلا سطح)',
      [stamp],
      () => ({ ok: after === before + 1 && steps >= 1, actual: { before, after, steps } }),
      'الحملة والخطوة أُنشئتا في القاعدة'
    )
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
    // زر المحادثة يعرض اسم صاحبها (ConvItem: subject || senders[0].name)
    const name = (row.user_name || '').trim()
    const convBtn = page.locator('button[role="listitem"]').filter({ hasText: name }).first()
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
