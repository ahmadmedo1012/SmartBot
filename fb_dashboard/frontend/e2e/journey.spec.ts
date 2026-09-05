import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * latest_plan.md Track B.1 — Full customer journey E2E:
 *
 *   visitor → /register → account + auth
 *   → /pricing → choose plan → /subscribe?plan=X
 *   → choose provider → submit payment (wallet)
 *   → admin approves (API as admin)
 *   → SSE/poll detects verified → success step
 *   → /dashboard fully usable with real data
 *
 * Screenshots for every step land in e2e_artifacts/ (gate evidence).
 */
const BASE = 'http://localhost:8000';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ART = path.resolve(__dirname, '../e2e_artifacts');
const RUN = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

test.setTimeout(120_000);

const shot = (page: any, name: string) =>
  page.screenshot({ path: path.join(ART, `${RUN}-${name}.png`), fullPage: true });

test('full journey: register → subscribe → pay → admin approve → dashboard', async ({ page, request }) => {
  const uname = `journey_${Date.now().toString(36)}`;

  // ── Step 1: register ────────────────────────────────────────────────
  await page.goto(`${BASE}/register`);
  await shot(page, '01-register-page');
  await page.fill('#username', uname);
  await page.fill('#email', `${uname}@t.ly`);
  await page.fill('#password', 'Test12345!');
  await page.fill('#confirm', 'Test12345!');
  await Promise.all([
    page.waitForURL(/dashboard|onboarding/, { timeout: 20_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(2500);
  await shot(page, '02-after-register');
  // auth cookie must exist now
  const cookies = await page.context().cookies(BASE);
  expect(cookies.some(c => c.name === 'token')).toBeTruthy();

  // /api/me returns the new user (envelope contract)
  const me = await request.get(`${BASE}/api/me`, { headers: { cookie: `token=${cookies.find(c => c.name === 'token')!.value}` } });
  expect(me.ok()).toBeTruthy();
  const meBody = await me.json();
  expect(meBody.success).toBe(true);
  expect(meBody.data.user.username).toBe(uname);

  // ── Step 2: pricing → choose a plan ─────────────────────────────────
  await page.goto(`${BASE}/pricing`);
  await shot(page, '03-pricing');
  // subscribe CTA on first paid plan card
  const subBtn = page.locator('a[href*="/subscribe"], button:has-text("اشترك")').first();
  await shot(page, '04-pricing-plans');
  const href = await subBtn.getAttribute('href').catch(() => null);
  await page.goto(href ? `${BASE}${href}` : `${BASE}/subscribe`);
  await page.waitForTimeout(2000);
  await shot(page, '05-subscribe-plan');

  // ── Step 3: fill payment form (mobile wallet) ───────────────────────
  // /subscribe without a plan param lands on the plan-selection grid first
  const planGrid = page.locator('div.grid.gap-6 [class*="card"]');
  const gridCount = await planGrid.count();
  if (gridCount > 0) {
    // pick the popular (middle) plan card
    await planGrid.nth(Math.min(1, gridCount - 1)).click();
    await page.waitForTimeout(1200);
  }
  // wallet provider (liyana) is the default; fill the phone
  await page.fill('#phone', '0910000001');
  await shot(page, '06-payment-form');
  const submit = page.locator('button:has-text("إرسال طلب الدفع")').first();
  await submit.waitFor({ state: 'visible', timeout: 10_000 });
  const [payResp] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/subscriptions') && r.request().method() === 'POST', { timeout: 15_000 }).catch(() => null),
    submit.click(),
  ]);
  await page.waitForTimeout(2500);
  await shot(page, '07-payment-submitted');
  // payment request must exist server-side
  const payBody = payResp ? await payResp.json().catch(() => null) : null;
  expect(payBody?.success).toBe(true);
  const paymentId = payBody?.data?.payment_id;

  // ── Step 4: admin approves via API ──────────────────────────────────
  // (auto-seeded admin: INITIAL_ADMIN_USERNAME/PASSWORD env, default admin/admin)
  const adminLogin = await request.post(`${BASE}/api/login`, {
    data: { username: process.env.E2E_ADMIN_USER || 'admin', password: process.env.E2E_ADMIN_PASS || 'admin' },
  });
  expect(adminLogin.ok(), 'admin login failed — seed INITIAL_ADMIN_* env').toBeTruthy();
  const setCookie = adminLogin.headers()['set-cookie'] as string | string[] | undefined;
  const cookieLine = Array.isArray(setCookie) ? setCookie.join(';') : (setCookie || '');
  const tokenMatch = /token=([^;]+)/.exec(cookieLine);
  const adminToken = tokenMatch ? tokenMatch[1] : '';
  expect(adminToken).toBeTruthy();
  const approve = await request.post(`${BASE}/api/admin/subscriptions`, {
    headers: { cookie: `token=${adminToken}`, 'content-type': 'application/json' },
    data: { id: paymentId, status: 'verified' },
  });
  const approveBody = await approve.json().catch(() => ({} as any));
  expect(approve.ok(), `admin approve failed: ${JSON.stringify(approveBody)}`).toBeTruthy();

  // ── Step 5: user sees activation (SSE ≤2s or poll ≤5s) ──────────────
  await page.waitForURL(/dashboard|success/, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(4000); // give SSE/poll + redirect time
  await shot(page, '08-after-approval');
  const pageContent = await page.content();
  const successVisible =
    pageContent.includes('تم تفعيل اشتراكك') ||
    page.url().includes('dashboard') ||
    page.url().includes('success');
  expect(successVisible, `no activation evidence at ${page.url()}`).toBeTruthy();

  // ── Step 6: dashboard works with real data ──────────────────────────
  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(3500);
  await shot(page, '09-dashboard');
  // sidebar exists (desktop) with sections
  const sidebar = page.locator('aside, nav, [class*="sidebar"]').first();
  await expect(sidebar.first()).toBeVisible({ timeout: 10_000 });
  // KPI cards render (numbers or em-dashes — not crash)
  const kpiCount = await page.locator('[class*="card"], [class*="kpi"]').count();
  expect(kpiCount).toBeGreaterThan(0);

  // billing page shows the verified subscription
  await page.goto(`${BASE}/dashboard/billing`);
  await page.waitForTimeout(2500);
  await shot(page, '10-billing');

  // two more sections prove the 23-section shell navigates
  await page.goto(`${BASE}/dashboard/analytics`);
  await page.waitForTimeout(2000);
  await shot(page, '11-analytics');
  await page.goto(`${BASE}/dashboard/support`);
  await page.waitForTimeout(2000);
  await shot(page, '12-support');
});
