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

import { FRONT_BASE, ADMIN_USER, ADMIN_PASS, apiPost, tokenFromSetCookie, withRateGuard } from './api'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SIM_ROOT = path.resolve(__dirname, '../../../e2e_artifacts/sim')

function tokenFile(persona: string): string {
  return path.join(SIM_ROOT, `.${persona}_token`)
}
function userFile(persona: string): string {
  return path.join(SIM_ROOT, `.${persona}_username`)
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
 */
export async function loginViaUI(
  page: Page,
  username: string,
  password: string,
  timeout = 30_000
): Promise<string> {
  await page.goto('/login')
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

/**
 * أدمن البذرة عبر API (نمط journey.spec.ts L103-111): POST /api/login →
 * استخراج token من set-cookie، مع تخزين القرص. يُدخل مرة واحدة لكل جولة.
 */
export async function adminToken(request: APIRequestContext): Promise<string> {
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

/**
 * تخطي المعالج برمجياً (نمط mobile-nav.spec.ts L38-42): POST
 * /api/onboarding/complete ببند الجلسة — بلا Origin والتحقق double-submit
 * يسقط عند غياب كوكي csrf (العقد المُثبت).
 */
export async function skipOnboarding(
  request: APIRequestContext | Page,
  token: string
): Promise<void> {
  if ('goto' in (request as any)) {
    // صفحة: استخدم السياق المباشر
    const page = request as Page
    await page.request.post(`${FRONT_BASE}/api/onboarding/complete`, {
      headers: { cookie: `token=${token}` },
    })
    return
  }
  await apiPost(request as APIRequestContext, '/api/onboarding/complete', undefined, {
    token,
  })
}

/** زر «تخطي» لجولة joyride إن ظهرت (نفس الحرس القائم). */
export async function skipJoyride(page: Page): Promise<void> {
  const skip = page.locator('button:has-text("تخطي")').first()
  if (await skip.isVisible({ timeout: 2500 }).catch(() => false)) {
    await skip.click().catch(() => {})
    await page.waitForTimeout(600)
  }
}
