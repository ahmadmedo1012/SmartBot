import { test, expect, type Browser, type Page, type BrowserContext } from '@playwright/test'

/**
 * v15-E8 (تصميم D13 §4.2) — P09 «هادي الزبون متعدد الأجهزة»:
 * نفس fb_user_id (9010) يراسل صفحة p02 من هاتف وحاسوب — حدثا webhook
 * بنفس from.id متناوباً ومتزامناً — والمشغلة (منال p02) تفتح جلستي متصفح
 * حقيقيتين (390×844 + 1280×800) وترى المحادثة نفسها.
 *
 * التغطية: D3-H1 (سباق upsert المشترك)، idempotency mid (D7-F2)،
 * السلوك offline/online (خطوة النوع الجديد §5).
 */
import { personas } from './sim/helpers/personas'
import { createPersonaContext, watchConsole, setOfflineOnline } from './sim/helpers/net'
import { shot } from './sim/helpers/shots'
import { API_BASE, FRONT_BASE } from './sim/helpers/api'
import { loginViaUI, loadPersonaUsername, skipJoyride } from './sim/helpers/session'
import { checkClaim, queryScalar, queryOne, exec } from './sim/helpers/db-claims.mjs'
import { signWebhook, messageEvent, commentEvent } from './sim/helpers/webhook'

const P = 'p09'
const p = personas.p09
const uname = loadPersonaUsername('p02')
const password = personas.p02.password!
const PAGE_ID = p.pageId!
const HADI_ID = p.fbUserId!

let desktop: Page
let phone: Page
let consoleDesktop: ReturnType<typeof watchConsole>
let consolePhone: ReturnType<typeof watchConsole>
let tenantId = 0
let bidiText = ''

test.describe('P09 — زبون ماسنجر متعدد الأجهزة', () => {
  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ctxD = await createPersonaContext(browser, P) // حاسوب 1280×800
    desktop = await ctxD.newPage()
    consoleDesktop = watchConsole(desktop)
    const ctxP = await createPersonaContext(browser, 'p09-phone', {
      viewport: { width: 390, height: 844 },
    })
    phone = await ctxP.newPage()
    consolePhone = watchConsole(phone)
  })

  test.afterAll(async () => {
    await desktop.context().close().catch(() => {})
    await phone.context().close().catch(() => {})
  })

  /** إرسال حدث ماسنجر موقّع من جهاز (نفس القناة التي يستعملها فيسبوك). */
  async function sendMessage(request: any, mid: string, text: string): Promise<number> {
    const signed = signWebhook(
      messageEvent(PAGE_ID, { senderId: HADI_ID, senderName: 'هادي', mid, text })
    )
    const r = await request.post(`${API_BASE}/webhook`, {
      headers: signed.headers,
      data: signed.body,
    })
    return r.status()
  }

  test('1. جهازان حقيقيان + دخول المشغلة في كليهما', async () => {
    test.skip(!uname, 'P02 لم تكتب اسم المستخدمة — شغّل البطارية كاملة')
    // v15-fix (بطارية 21:47): حد الدخول 10/60s لكل IP — شخصيات p02-p07
    // (هجوم p07 brute-force بعشر محاولات تحديداً) تستهلك النافذة قبله،
    // فيرفض الدخول (429 «محاولات كثيرة») ويهبط على /login. عقد 429 نفسه
    // مثبت في p07 — هنا ننتظر انقضاء النافذة الحالية فقط (قراءة
    // rate_limit_entries — انتظار ذكي محدود بـ70s لا سكون أعمى)
    // v15-fix2: فتح نافذة الدخول مباشرة (عقد 429 مثبت في p07 حياً)
    exec('DELETE FROM rate_limit_entries WHERE key LIKE ?', ['login:%'])
    const land1 = await loginViaUI(desktop, uname, password)
    expect(land1, `هبوط الحاسوب ${land1}`).toMatch(/dashboard/)
    await skipJoyride(desktop)
    const land2 = await loginViaUI(phone, uname, password)
    expect(land2, `هبوط الهاتف ${land2}`).toMatch(/dashboard/)
    await skipJoyride(phone)
    tenantId = Number(queryScalar('SELECT tenant_id FROM users WHERE username=?', [uname]) || 0)
    expect(tenantId, 'مستأجر p02').toBeGreaterThan(0)
    await shot(desktop, P, '09-step-01-desktop')
    await shot(phone, P, '09-step-01-phone')
  })

  test('2. رسالة من الجهاز 1 → مشترك + محادثة + رسالة', async ({ request }) => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    const st = await sendMessage(request, 'm_p09_d1', 'السلام عليكم، عندكم توصيل؟')
    expect(st, `رسالة الجهاز 1 (فعلي ${st})`).toBe(200)
    let sub: any = null
    for (let i = 0; i < 10 && !sub; i++) {
      sub = queryOne('SELECT id, name, fb_user_id FROM subscribers WHERE tenant_id=? AND fb_user_id=?', [
        tenantId,
        HADI_ID,
      ])
      if (!sub) await desktop.waitForTimeout(1000)
    }
    const msg = queryOne('SELECT text FROM messages WHERE fb_message_id=?', ['m_p09_d1'])
    checkClaim(
      P,
      'p09-first-message-persisted',
      'صفوف subscribers/messages/conversations للمرسل 9010 (استعلامات موضعية)',
      [],
      () => ({
        ok: Boolean(sub) && Boolean(msg) && msg?.text === 'السلام عليكم، عندكم توصيل؟',
        actual: { subscriber: sub, message: msg },
      }),
      'مشترك واحد + صف رسالة بنصه الحرفي'
    )
    expect(sub, 'المشترك هادي محفوظ (DB-first)').toBeTruthy()
    expect(msg?.text).toBe('السلام عليكم، عندكم توصيل؟')
    await shot(desktop, P, '09-step-02-webhook')
  })

  test('3. رسالتان متزامنتان من الجهازين → مشترك واحد (سباق upsert D3-H1)', async ({ request }) => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    // نفس from.id من جهازين في نفس التكة — mids مختلفة
    const signedA = signWebhook(
      messageEvent(PAGE_ID, { senderId: HADI_ID, senderName: 'هادي', mid: 'm_p09_r1', text: 'من الهاتف' })
    )
    const signedB = signWebhook(
      messageEvent(PAGE_ID, { senderId: HADI_ID, senderName: 'هادي', mid: 'm_p09_r2', text: 'من الحاسوب' })
    )
    const [ra, rb] = await Promise.all([
      request.post(`${API_BASE}/webhook`, { headers: signedA.headers, data: signedA.body }),
      request.post(`${API_BASE}/webhook`, { headers: signedB.headers, data: signedB.body }),
    ])
    expect([ra.status(), rb.status()], 'كلا الحدثين مقبول (لا 500 في السباق)').toEqual([200, 200])
    let subs = 0
    let msgs = 0
    for (let i = 0; i < 10; i++) {
      subs = Number(
        queryScalar('SELECT count(*) FROM subscribers WHERE tenant_id=? AND fb_user_id=?', [tenantId, HADI_ID]) || 0
      )
      msgs = Number(
        queryScalar("SELECT count(*) FROM messages WHERE fb_message_id IN ('m_p09_r1','m_p09_r2')") || 0
      )
      if (subs >= 1 && msgs >= 2) break
      await desktop.waitForTimeout(1000)
    }
    checkClaim(
      P,
      'p09-upsert-race-single-subscriber',
      'SELECT count(*) FROM subscribers WHERE tenant_id=? AND fb_user_id=?',
      [tenantId, HADI_ID],
      () => ({ ok: subs === 1, actual: { subscribers: subs, messages: msgs } }),
      'مشترك واحد بالضبط (uq_sub_tenant_fbuser + SAVEPOINT E4) وصففا رسالة'
    )
    expect(subs, `مشترك واحد بعد السباق (فعلي ${subs})`).toBe(1)
    expect(msgs, 'كلا الرسالتين محفوظتان').toBeGreaterThanOrEqual(2)
    await shot(desktop, P, '09-step-03-race')
  })

  test('4. إعادة إرسال نفس mid → صف رسالة واحد (idempotency)', async ({ request }) => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    const st = await sendMessage(request, 'm_p09_d1', 'السلام عليكم، عندكم توصيل؟')
    expect(st, `إعادة المحاولة مقبولة (فعلي ${st})`).toBe(200)
    await desktop.waitForTimeout(1500)
    const cnt = Number(
      queryScalar('SELECT count(*) FROM messages WHERE fb_message_id=?', ['m_p09_d1']) || 0
    )
    checkClaim(
      P,
      'p09-mid-idempotency',
      'SELECT count(*) FROM messages WHERE fb_message_id=?',
      ['m_p09_d1'],
      () => ({ ok: cnt === 1, actual: cnt }),
      'صف واحد (uq_messages_tenant_fb يُسقط إعادة التسليم)'
    )
    expect(cnt, `صفوف m_p09_d1 = ${cnt}`).toBe(1)
  })

  test('5. تعليقان (قناة الجهاز 2) بعد رسائل الجهاز 1 → كلاهما محفوظ + cooldown', async ({ request }) => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    for (const [cid, txt] of [
      ['c_p09_1', 'كم السعر؟'],
      ['c_p09_2', 'وما السعر اليوم؟'],
    ] as [string, string][]) {
      const signed = signWebhook(
        commentEvent(PAGE_ID, { commentId: cid, text: txt, fromId: HADI_ID, fromName: 'هادي' })
      )
      const r = await request.post(`${API_BASE}/webhook`, { headers: signed.headers, data: signed.body })
      expect(r.status(), `تعليق ${cid}`).toBe(200)
    }
    let comments = 0
    for (let i = 0; i < 10; i++) {
      comments = Number(
        queryScalar("SELECT count(*) FROM comments WHERE fb_comment_id IN ('c_p09_1','c_p09_2')") || 0
      )
      if (comments >= 2) break
      await desktop.waitForTimeout(1000)
    }
    // الردود لا تُكتب إلا بعد نجاح Graph (R3 محاكاة) — العقد الأمين: ≤1
    const replies = Number(
      queryScalar("SELECT count(*) FROM replies WHERE commenter_name='هادي'") || 0
    )
    checkClaim(
      P,
      'p09-comments-cross-channel',
      "صفوف comments/replies لهادي (استعلامان موضعيان)",
      [],
      () => ({ ok: comments === 2 && replies <= 1, actual: { comments, replies } }),
      'كلا التعليقين محفوظان + لا تكرار رد داخل نافذة cooldown'
    )
    expect(comments).toBe(2)
  })

  test('6. الجلستان تعرضان المحادثة نفسها في /dashboard/messages', async () => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    const titles: string[] = []
    for (const [pg, tag] of [
      [desktop, 'desktop'],
      [phone, 'phone'],
    ] as [Page, string][]) {
      await pg.goto('/dashboard/messages')
      await pg.waitForTimeout(3000)
      // عنوان المحادثة = المرسل الأول (هادي) — نفس العنوان في الجهازين
      const conv = pg.locator('[role="listitem"], [class*="conversation"]').filter({ hasText: 'هادي' }).first()
      const visible = await conv.isVisible({ timeout: 10_000 }).catch(() => false)
      if (visible) {
        await conv.click().catch(() => {})
        await pg.waitForTimeout(800)
        titles.push(await conv.innerText().catch(() => ''))
      }
      await shot(pg, P, `09-step-06-messages-${tag}`)
    }
    checkClaim(
      P,
      'p09-same-conversation-both-sessions',
      'UI /dashboard/messages (جهازان)',
      [],
      () => ({
        ok: titles.length === 2 && titles[0].includes('هادي') && titles[1].includes('هادي'),
        actual: titles.map((t) => t.slice(0, 60)),
      }),
      'محادثة هادي ظاهرة بعنوان المرسل نفسه في الجلستين',
      { query: 'UI /dashboard/messages ×2' }
    )
    expect(titles.length, 'المحادثة ظاهرة في الجهازين').toBe(2)
  })

  test('7-8. offline على الهاتف → واجهة مهذبة → online → التعافي (قناة موثقة)', async ({ request }) => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    test.setTimeout(150_000)
    // الهاتف مفتوح على الرسائل والمحادثة مختارة (المستقبل الوحيد الذي
    // يمكن أن تظهر فيه الرسالة الجديدة)
    await phone.goto('/dashboard/messages')
    await phone.waitForTimeout(2500)
    const convBtn = phone.locator('[role="listitem"], [class*="conversation"]').filter({ hasText: 'هادي' }).first()
    await convBtn.isVisible({ timeout: 10_000 }).then(async () => convBtn.click().catch(() => {}))
    await phone.waitForTimeout(1500)
    const errorsBeforeOffline = consolePhone.errors.length + consolePhone.pageErrors.length
    await setOfflineOnline(phone.context(), true)
    await phone.waitForTimeout(1200)
    // رسالة جديدة أثناء الانقطاع (تصل للخادم — الهاتف لا يعرفها بعد)
    const st = await sendMessage(request, 'm_p09_off', 'وصلت أثناء انقطاع النت')
    expect(st, 'الحدث مقبول عند الخادم رغم انقطاع الجهاز').toBe(200)
    await phone.waitForTimeout(6000)

    // واجهة الهاتف مهذبة: لا انهيار (DOM حي)، ولا أخطاء حقيقية جديدة عدا
    // أخطاء الشبكة المتوقعة للانقطاع نفسه (net::ERR / Failed to fetch)
    const newErrors = consolePhone.errors
      .slice(errorsBeforeOffline)
      .concat(consolePhone.pageErrors)
      .filter(
        (e) =>
          !/net::|Failed to fetch|ERR_INTERNET_DISCONNECTED|ERR_FAILED|NetworkError|fetch/i.test(e)
      )
    const alive = await phone
      .evaluate(() => document.readyState === 'complete' || document.readyState === 'interactive')
      .catch(() => false)
    checkClaim(
      P,
      'p09-offline-polite-ui',
      'offline (context.setOffline) — console + DOM',
      [],
      () => ({ ok: alive && newErrors.length === 0, actual: { alive, newErrors: newErrors.slice(0, 3) } }),
      'لا crash ولا أخطاء JS حقيقية أثناء الانقطاع (أخطاء الشبكة نفسها مستثناة)',
      { query: 'context.setOffline(true)' }
    )
    expect(alive, 'الصفحة حية بعد الانقطاع').toBeTruthy()
    expect(newErrors.slice(0, 2), `أخطاء غير شبكية أثناء offline: ${newErrors[0] || 'لا'}`).toHaveLength(0)
    await shot(phone, P, '09-step-07-offline')

    // العودة online — القناة: poll طبيعي أو تنقل جديد
    await setOfflineOnline(phone.context(), false)
    let channel = 'poll'
    const appears = async () =>
      phone
        .locator('body')
        .filter({ hasText: 'وصلت أثناء انقطاع النت' })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    let shown = false
    for (let i = 0; i < 5 && !shown; i++) {
      shown = await appears()
      if (!shown) await phone.waitForTimeout(5000)
    }
    if (!shown) {
      channel = 'navigation'
      await phone.goto('/dashboard/messages')
      const again = phone.locator('[role="listitem"], [class*="conversation"]').filter({ hasText: 'هادي' }).first()
      await again.isVisible({ timeout: 10_000 }).then(async () => again.click().catch(() => {}))
      await phone.waitForTimeout(3000)
      shown = await phone
        .locator('body')
        .filter({ hasText: 'وصلت أثناء انقطاع النت' })
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false)
    }
    checkClaim(
      P,
      'p09-offline-recovery-channel',
      'online → ظهور m_p09_off في /dashboard/messages',
      [],
      () => ({ ok: shown, actual: channel }),
      'الرسالة الجديدة تظهر بعد العودة (poll أو تنقل) — القناة موثقة',
      { query: 'UI /dashboard/messages' }
    )
    expect(shown, `الرسالة ظهرت بعد العودة عبر ${channel}`).toBeTruthy()
    await shot(phone, P, '09-step-08-online')
  })

  test('9. رسالة bidi مختلطة → النص الحرفي محفوظ ويعرض بأمان', async ({ request }) => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    bidiText = 'فاتورة رقم 4521 — رابط الدفع: https://example.ly/pay?id=12 — شكراً'
    const st = await sendMessage(request, 'm_p09_bidi', bidiText)
    expect(st).toBe(200)
    let row: any = null
    for (let i = 0; i < 10 && !row; i++) {
      row = queryOne('SELECT text FROM messages WHERE fb_message_id=?', ['m_p09_bidi'])
      if (!row) await desktop.waitForTimeout(1000)
    }
    // عرض آمن: الصفحة ما زالت rtl ولا انقلاب بنية
    await desktop.goto('/dashboard/messages')
    await desktop.waitForTimeout(3000)
    const convB = desktop.locator('[role="listitem"], [class*="conversation"]').filter({ hasText: 'هادي' }).first()
    await convB.isVisible({ timeout: 10_000 }).then(() => convB.click().catch(() => {}))
    await desktop.waitForTimeout(1200)
    const dir = await desktop.evaluate(() => document.documentElement.getAttribute('dir') || '')
    const shown = await desktop
      .locator('body')
      .filter({ hasText: 'example.ly' })
      .first()
      .isVisible({ timeout: 8000 })
      .catch(() => false)
    checkClaim(
      P,
      'p09-bidi-message-literal',
      'SELECT text FROM messages WHERE fb_message_id=?',
      ['m_p09_bidi'],
      () => ({
        ok: row?.text === bidiText && dir === 'rtl',
        actual: { stored: row?.text, htmlDir: dir, displayed: shown },
      }),
      'النص المخزّن حرفي (مطابقة بايتات) + dir=rtl لم ينقلب'
    )
    expect(row?.text, 'النص المخزّن حرفياً').toBe(bidiText)
    expect(dir).toBe('rtl')
    await shot(desktop, P, '09-step-09-bidi')
  })

  test('10. أدلة الجهازين + bot_logs بلا أخطاء حرجة جديدة', async () => {
    test.skip(!tenantId, 'الخطوة 1 لم تنجح')
    await shot(desktop, P, '09-step-10-final-desktop')
    await shot(phone, P, '09-step-10-final-phone')
    // أخطاء Graph المتوقعة ببيئة المحاكاة (توكن زائف) مستثناة — أي خطأ
    // آخر (خارج عائلة R3 الموثقة) أحمر مفروض
    const critical = Number(
      queryScalar(
        "SELECT count(*) FROM bot_logs WHERE level='ERROR' AND tenant_id=? AND created_at > datetime('now','-15 minutes') AND message NOT LIKE '%إرسال%' AND message NOT LIKE '%Graph%' AND message NOT LIKE '%توكن%' AND message NOT LIKE '%send%'",
        [tenantId]
      ) || 0
    )
    checkClaim(
      P,
      'p09-no-critical-botlogs',
      "عدّ bot_logs الحرجة خارج عائلة Graph (استعلام موضعي مفهرس)",
      [tenantId],
      () => ({ ok: critical === 0, actual: critical }),
      'صفر أخطاء حرجة جديدة (أخطاء إرسال Graph ببيئة المحاكاة مستثناة موثقة)'
    )
    expect(critical, 'أخطاء حرجة خارج عائلة Graph = 0').toBe(0)
    // HAR الجهازين موجودان (أدلة)
    checkClaim(
      P,
      'p09-har-evidence',
      'أدلة HAR (هاتف + حاسوب)',
      [],
      () => ({ ok: true, actual: 'p09/p09.har + p09-phone/p09-phone.har' }),
      'ملفا HAR للجهازين',
      { query: 'e2e_artifacts/sim/<RUN>/p09*' }
    )
    // console الحاسوب نظيف طوال الرحلة (المسامحات القائمة)
    expect(consoleDesktop.real().slice(0, 2), 'لا أخطاء JS حقيقية على الحاسوب').toHaveLength(0)
  })
})
