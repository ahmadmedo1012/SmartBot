/**
 * v14-E7 (تصميم D13 §6.2 session) — الجلسات والتخزين على القرص.
 *
 * الدرس المؤسس (R8): worker قد يُعاد تشغيله فيعيد استيراد الوحدات وتُمسح
 * الذاكرة — التوكنات تُخزَّن على القرص بنمط .e2e_auth_token القائم لكن
 * بملف معزول لكل شخصية (e2e_artifacts/sim/.pNN_token + .pNN_username).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { APIRequestContext, Page, BrowserContext } from '@playwright/test'

import { FRONT_BASE, ADMIN_USER, ADMIN_PASS, apiPost, apiGet, tokenFromSetCookie, withRateGuard } from './api'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SIM_ROOT = path.resolve(__dirname, '../../../e2e_artifacts/sim')

function tokenFile(persona: string): string {
  return path.join(SIM_ROOT, `.${persona}_token`)
}
function userFile(persona: string): string {
  return path.join(SIM_ROOT, `.${persona}_username`)
}
function stateFile(persona: string): string {
  return path.join(SIM_ROOT, `.${persona}_state.json`)
}

function ensureRoot(): void {
  if (!fs.existsSync(SIM_ROOT)) fs.mkdirSync(SIM_ROOT, { recursive: true })
}

export function savePersonaToken(persona: string, token: string): void {
  ensureRoot()
  fs.writeFileSync(tokenFile(persona), token, 'utf-8')
}

export function loadPersonaToken(persona: string): string {
  try {
    return fs.existsSync(tokenFile(persona)) ? fs.readFileSync(tokenFile(persona), 'utf-8').trim() : ''
  } catch {
    return ''
  }
}

export function savePersonaUsername(persona: string, username: string): void {
  ensureRoot()
  fs.writeFileSync(userFile(persona), username, 'utf-8')
}

export function loadPersonaUsername(persona: string): string {
  try {
    return fs.existsSync(userFile(persona)) ? fs.readFileSync(userFile(persona), 'utf-8').trim() : ''
  } catch {
    return ''
  }
}

/** توكن الأدمن على القرص (يُشارك بين المواصفات — بلا دخول متكرر). */
const ADMIN_TOKEN_FILE = path.join(SIM_ROOT, '.admin_token')
export function saveAdminToken(token: string): void {
  ensureRoot()
  fs.writeFileSync(ADMIN_TOKEN_FILE, token, 'utf-8')
}
export function loadAdminToken(): string {
  try {
    return fs.existsSync(ADMIN_TOKEN_FILE) ? fs.readFileSync(ADMIN_TOKEN_FILE, 'utf-8').trim() : ''
  } catch {
    return ''
  }
}

// ── دخول/تسجيل عبر الواجهة (محددات login/register القائمة حرفياً) ────────
const LOGIN_FIELDS = { username: '#username', password: 'input[type=password]' } as const

/**
 * دخول واجهة كامل: /login → #username + input[type=password] +
 * button[type=submit] → waitForURL(/dashboard|admin/) (v10-B5: أدمن
 * المنصة يهبط /admin، مالك المستأجر /dashboard).
 *
 * phase8 (واعي بالارتداد — إعادة 3b83f76): صفحة /login ترتد المصادَقين
 * تلقائيًا (login/page.tsx: apiFetch /api/me → location.replace للوحة).
 * سياق يحمل جلسة حية لن يعرض النموذج أبدًا — الملء سي.Timeout. العقد
 * الأمين: بعد التنقل ننتظر إما النموذج أو الارتداد؛ الارتداد = دخول
 * ناجح بالفعل (نعيد URL الهدف بلا ملء).
 */
export async function loginViaUI(
  page: Page,
  username: string,
  password: string,
  timeout = 30_000
): Promise<string> {
  await page.goto('/login')
  // سباق: النموذج يظهر (زائر) أو الارتداد يتم (جلسة حية)
  const bounced = await Promise.race([
    page.waitForURL(/dashboard|admin/, { timeout: 10_000 }).then(() => true).catch(() => false),
    page.locator('#username').waitFor({ state: 'visible', timeout: 10_000 }).then(() => false).catch(() => false),
  ])
  if (bounced || /dashboard|admin/.test(page.url())) {
    await page.waitForLoadState('domcontentloaded').catch(() => {})
    return page.url()
  }
  await page.fill(LOGIN_FIELDS.username, username)
  await page.fill(LOGIN_FIELDS.password, password)
  await Promise.all([
    page.waitForURL(/dashboard|admin/, { timeout }).catch(() => {}),
    page.click('button[type="submit"]'),
  ])
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  return page.url()
}

/** تسجيل واجهة كامل: /register + الحقول الأربعة → جلسة تلقائية. */
export async function registerViaUI(
  page: Page,
  username: string,
  email: string,
  password: string,
  timeout = 40_000
): Promise<string> {
  await page.goto('/register')
  await page.fill('#username', username)
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.fill('#confirm', password)
  await Promise.all([
    page.waitForURL(/dashboard|onboarding/, { timeout }).catch(() => {}),
    page.click('button[type="submit"]'),
  ])
  await page.waitForTimeout(1500)
  return page.url()
}

/** قراءة كوكي token من سياق (async — واجهة Playwright). */
export async function getToken(context: BrowserContext, base = FRONT_BASE): Promise<string> {
  const cookies = await context.cookies(base)
  return cookies.find((c) => c.name === 'token')?.value || ''
}

// ── phase8 (إعادة 3b83f76 — فقدت بإعادة تعيين الصندوق): حصانة إعادة تشغيل ──
// العامل ─────────────────────────────────────────────────────────────────
// الحقيقة المثبتة (P7-3-a): مراقب userspace في الصندوق يقتل عامل Playwright
// (SIGTERM تحت ضغط ذاكرة كروميوم — نمط code=143 الموثق) فيعيد تقييم الوحدات
// بصمت: المتغيرات النمطية (uname/token/paymentId/tenantId) تُمسح والسياقات
// تُبنى من جديد بلا كوكيز → 401 جماعي منتصف الملف (اللغز الذي نجا 3 مراحل).
// الدواء: كل حالة تُكتب للقرص فور تغيّرها (.pNN_state.json) وتُقرأ عند كل
// استخدام — العامل الجديد يعيد امتلاء حالته من القرص لا من الذاكرة.

/** الحالة الدائمة للشخصية — أي مفاتيح يحتاجها الملف (دمج ضحيل عند الكتابة). */
export interface PersonaState {
  username?: string
  token?: string
  email?: string
  tenantId?: number
  userId?: number
  paymentId?: number
  [key: string]: unknown
}

/** كتابة دمجية للحالة على القرص (تنجو من إعادة تشغيل العامل). */
export function savePersonaState(persona: string, patch: PersonaState): void {
  ensureRoot()
  const current = loadPersonaState(persona)
  fs.writeFileSync(stateFile(persona), JSON.stringify({ ...current, ...patch }, null, 2), 'utf-8')
}

/** قراءة الحالة من القرص ({} عند الغياب/الفساد — لا رمي أبدًا). */
export function loadPersonaState(persona: string): PersonaState {
  try {
    return fs.existsSync(stateFile(persona))
      ? (JSON.parse(fs.readFileSync(stateFile(persona), 'utf-8')) as PersonaState)
      : {}
  } catch {
    return {}
  }
}

/**
 * حقن كوكي الجلسة في سياق من توكن الشخصية المحفوظ (ملف الحالة ثم ملف
 * التوكن القديم) — يعيد التوكن المحقون أو '' (لا يفشل أبدًا).
 */
export async function injectSessionCookie(
  context: BrowserContext,
  persona: string,
  base = FRONT_BASE
): Promise<string> {
  const st = loadPersonaState(persona)
  const token = st.token || loadPersonaToken(persona)
  if (!token) return ''
  try {
    await context.addCookies([{ name: 'token', value: token, url: base }])
  } catch {
    return ''
  }
  return token
}

/**
 * حرس الجلسة الشامل (استدعَ في بداية كل اختبار يحتاج جلسة):
 *  1. كوكي السياق الحالي حي؟ → لا شيء.
 *  2. التوكن المخزن على القرص حي (/api/me=200)؟ → حقن.
 *  3. وإلا (تدوير p14/خروج/فقدان) → دخول صادق جديد بالاسم المحفوظ ثم
 *     تخزين التوكن الجديد (loginViaUI الواعي بالارتداد يتعامل مع الجلسة
 *     الحية بالفعل).
 * يعيد التوكن الفعال أو '' عند استحالة الدخول (بلا رمي — الاختبار يقرر).
 */
export async function ensureSession(
  page: Page,
  persona: string,
  opts: { username?: string; password?: string } = {}
): Promise<string> {
  const st = loadPersonaState(persona)
  const username = opts.username || st.username || loadPersonaUsername(persona)
  const password = opts.password
  let token = st.token || loadPersonaToken(persona)

  // 1) السياق يحمل كوكيًّا حيًّا بالفعل
  const current = await getToken(page.context()).catch(() => '')
  if (current && token && current === token) return current

  // 2) التوكن المخزن ما زال حيًّا؟ (التدوير/الخروج يسوّدانه)
  if (token) {
    const me = await apiGet(page.request, '/api/me', { headers: { cookie: `token=${token}` } }).catch(() => null)
    if (me && me.status === 200) {
      await injectSessionCookie(page.context(), persona)
      return token
    }
  }

  // 3) دخول صادق جديد بالاسم/كلمة المرور المعروفين
  if (username && password) {
    const landing = await loginViaUI(page, username, password)
    if (/dashboard|admin/.test(landing)) {
      token = await getToken(page.context())
      if (token) {
        savePersonaToken(persona, token)
        savePersonaUsername(persona, username)
        savePersonaState(persona, { username, token })
        return token
      }
    }
  }
  return ''
}

/**
 * أدمن البذرة عبر API (نمط journey.spec.ts L103-111): POST /api/login →
 * استخراج token من set-cookie، مع تخزين القرص. يُدخل مرة واحدة لكل جولة.
 * (r132-F3a: export dropped — module-internal, used by approvePayment;
 * the specs use the disk-cached loadAdminToken() instead.)
 */
async function adminToken(request: APIRequestContext): Promise<string> {
  const cached = loadAdminToken()
  if (cached) return cached
  const r = await withRateGuard(() =>
    apiPost(request, '/api/login', { username: ADMIN_USER, password: ADMIN_PASS })
  )
  const token = tokenFromSetCookie(r.headers['set-cookie'])
  if (!token) throw new Error(`فشل دخول الأدمن (${r.status}) — seed INITIAL_ADMIN_* عبر السكربت`)
  saveAdminToken(token)
  return token
}

/** موافقة الأدمن على دفعة (عقد approvals.py: {id, status: verified|cancelled}). */
export async function approvePayment(
  request: APIRequestContext,
  paymentId: number,
  decision: 'verified' | 'cancelled' = 'verified'
): Promise<{ status: number; body: any }> {
  const token = await adminToken(request)
  return withRateGuard(() =>
    apiPost(request, '/api/admin/subscriptions', { id: paymentId, status: decision }, { token })
  )
}

/* r132-F3a: skipOnboarding deleted — zero consumers (the wizard-completion
 * path is exercised via the specs' own browserFetch/apiPost calls). */

/** زر «تخطي» لجولة joyride إن ظهرت (نفس الحرس القائم). */
export async function skipJoyride(page: Page): Promise<void> {
  const skip = page.locator('button:has-text("تخطي")').first()
  if (await skip.isVisible({ timeout: 2500 }).catch(() => false)) {
    await skip.click().catch(() => {})
    await page.waitForTimeout(600)
  }
}
