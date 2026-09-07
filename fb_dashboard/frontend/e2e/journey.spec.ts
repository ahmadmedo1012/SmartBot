import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

/**
 * v14-E6 (D9 gap 1) — FULL REWRITE of the customer journey spec.
 *
 * Why the old spec was dead: it hard-coded `BASE = http://localhost:8000`
 * (the FastAPI SPA shell). That origin serves the LANDING markup for every
 * path, so `/register` had zero input fields and the journey could never
 * pass. The working architecture is the DUAL stack (proven live in D9 §4.1):
 * `next build` with `LOCAL_API_PROXY=http://127.0.0.1:8000` (same-origin
 * rewrites baked at build time), `next start` on :3200 + uvicorn on :8000.
 *
 * This spec now targets the CONFIG's baseURL (playwright.config.ts):
 *   PLAYWRIGHT_BASE_URL (default http://localhost:3200) — the Next origin,
 *   with /api/* and /webhook riding the baked proxy. Post-deploy, the same
 *   spec runs against https://bot.smart-link.ly by changing one env var.
 *
 * Journey (visitor → registered customer):
 *   1. landing `/`           — the real hero renders
 *   2. pricing `/pricing`    — via the header nav; plan cards + CTAs exist
 *   3. register `/register`  — full ARABIC form fill (username in Arabic —
 *                              the backend regex ^[\w.-]+$ is Unicode-aware;
 *                              D9 §2.3: no Arabic-input journey existed)
 *   4. dashboard             — auth cookie set, /api/me envelope answers,
 *                              first-run onboarding wizard dismissed,
 *                              dashboard shell renders real sections
 *   5. logout                — POST /api/logout → /login, session cookie gone
 *
 * Wait discipline (D9 F2): element-visible/URL expectations instead of
 * blind waitForTimeout; no networkidle on polling pages.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ART = path.resolve(__dirname, '../e2e_artifacts');
const RUN = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

test.setTimeout(120_000);

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(ART, `${RUN}-${name}.png`), fullPage: true });

test('journey: landing → pricing → register (Arabic) → dashboard → logout', async ({ page, request }) => {
  const uname = `رحلة_${Date.now().toString(36)}`;

  // ── 1. landing ──────────────────────────────────────────────────────
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: /إدارة تفاعل فيسبوك/ }),
    'landing hero h1 must render on the Next stack',
  ).toBeVisible({ timeout: 20_000 });
  await shot(page, '01-landing');

  // ── 2. pricing via the header nav ───────────────────────────────────
  await page.getByRole('link', { name: 'الخطط والأسعار' }).first().click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'خطط الأسعار' }),
    'pricing page heading',
  ).toBeVisible({ timeout: 20_000 });
  // plan cards with their subscribe CTAs (اشترك الآن for paid, ابدأ مجاناً for free)
  const planCtas = page.getByRole('button', { name: /اشترك الآن|ابدأ مجاناً/ });
  expect(await planCtas.count(), 'pricing must list plan cards').toBeGreaterThan(0);
  await shot(page, '02-pricing');

  // ── 3. register — full Arabic form fill ─────────────────────────────
  await page.goto('/register');
  const usernameField = page.locator('#username');
  await usernameField.waitFor({ state: 'visible', timeout: 20_000 });
  await shot(page, '03-register');
  await page.fill('#username', uname);
  await page.fill('#email', `journey_${Date.now().toString(36)}@t.ly`);
  await page.fill('#password', 'Test12345!');
  await page.fill('#confirm', 'Test12345!');

  // register sets the auth cookie + the form hard-navigates to /dashboard
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 30_000 }),
    page.click('button[type="submit"]'),
  ]);
  await shot(page, '04-after-register');

  // the auth cookie must exist on the stack origin
  const cookies = await page.context().cookies();
  const tokenCookie = cookies.find(c => c.name === 'token');
  expect(tokenCookie, 'register must leave the session token cookie').toBeTruthy();

  // /api/me answers the ok() envelope for the NEW user (same-origin proxy)
  const me = await request.get('/api/me', {
    headers: { cookie: `token=${tokenCookie!.value}` },
  });
  expect(me.ok(), `/api/me must be 200 — got ${me.status()}`).toBeTruthy();
  const meBody = await me.json();
  expect(meBody.success).toBe(true);
  expect(meBody.data.user.username).toBe(uname);

  // ── 4. dashboard — first-run wizard dismissed, real shell renders ───
  // Fresh tenants get the OnboardingWizard overlay (onboarding_completed=false
  // at register). Dismiss via its visible تخطي affordance (AuthGuard persists
  // the skip server-side); guard-tolerant if a future run shows none.
  const wizard = page.getByRole('dialog');
  if (await wizard.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await wizard.getByRole('button', { name: 'تخطي' }).first().click();
    await wizard.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  }

  // the dashboard shell: sidebar nav + page content + section cards
  const nav = page.locator('nav').first();
  await expect(nav, 'dashboard sidebar nav must render').toBeVisible({ timeout: 20_000 });
  await expect(
    page.locator('#page-content'),
    'dashboard content wrapper must render',
  ).toBeVisible({ timeout: 20_000 });
  const cards = page.locator('[class*="card"]');
  expect(await cards.count(), 'dashboard must render section cards').toBeGreaterThan(0);
  await shot(page, '05-dashboard');

  // one deep dashboard route proves the authenticated shell navigates
  await page.goto('/dashboard/billing');
  await expect(
    page.locator('nav').first(),
    'billing route must keep the authenticated shell',
  ).toBeVisible({ timeout: 20_000 });
  await shot(page, '06-billing');

  // ── 5. logout → /login, session gone ────────────────────────────────
  await page.getByRole('button', { name: 'تسجيل الخروج' }).first().click();
  await page.waitForURL(/\/login/, { timeout: 30_000 });
  await expect(
    page.locator('button[type="submit"]', { hasText: 'تسجيل الدخول' }),
    'login page form must render after logout',
  ).toBeVisible({ timeout: 15_000 });
  await shot(page, '07-logged-out');

  const cookiesAfter = await page.context().cookies();
  expect(
    cookiesAfter.find(c => c.name === 'token'),
    'logout must drop the session token cookie',
  ).toBeUndefined();
});
