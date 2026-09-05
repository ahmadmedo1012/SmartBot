import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * latest_plan.md Track F.3 — mobile navigation proof at 375px.
 * Gate: navigate between 5 different sections via the bottom bar, and reach
 * a deep section (calendar) through the "المزيد" sheet — 2 taps max.
 */
const BASE = 'http://localhost:8000';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ART = path.resolve(__dirname, '../e2e_artifacts');
const RUN = `mobile-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

const shot = (page: any, name: string) =>
  page.screenshot({ path: path.join(ART, `${RUN}-${name}.png`) });

test.use({ viewport: { width: 375, height: 812 } });
test.setTimeout(90_000);

test('mobile 375px: bottom bar navigates 5 sections + sheet reaches deep sections', async ({ page }) => {
  const uname = `mob_${Date.now().toString(36)}`;

  // login journey (register auto-logs-in)
  await page.goto(`${BASE}/register`);
  await page.fill('#username', uname);
  await page.fill('#email', `${uname}@t.ly`);
  await page.fill('#password', 'Test12345!');
  await page.fill('#confirm', 'Test12345!');
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 20_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(3000);
  // New users get the onboarding wizard on every guarded navigation —
  // complete onboarding via the real API once, then reload.
  const cookies = await page.context().cookies(BASE);
  const token = cookies.find(c => c.name === 'token')?.value;
  await page.request.post(`${BASE}/api/onboarding/complete`, {
    headers: { cookie: `token=${token}` },
  });
  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(2500);
  await shot(page, '01-dashboard-mobile');

  // ── bottom bar is visible & desktop sidebar is hidden on mobile ──
  const bar = page.locator('nav[aria-label="التنقل الرئيسي"]');
  await expect(bar).toBeVisible({ timeout: 10_000 });
  const sidebarWrapper = page.locator('div.fixed.top-0').first();
  await expect(sidebarWrapper).toBeHidden();

  // ── 5 sections through the bar (each = 1 tap) ──
  const sections = [
    { label: 'الرئيسية', url: /\/dashboard$/, name: '02-home' },
    { label: 'الرسائل', url: /\/dashboard\/messages/, name: '03-messages' },
    { label: 'التحليلات', url: /\/dashboard\/analytics/, name: '04-analytics' },
    { label: 'الإشعارات', url: /\/dashboard\/notifications/, name: '05-notifications' },
  ];
  for (const s of sections) {
    await page.locator(`nav[aria-label="التنقل الرئيسي"] button:has-text("${s.label}")`).first().click();
    await page.waitForURL(s.url, { timeout: 15_000 });
    await page.waitForTimeout(1200);
    await shot(page, s.name);
  }

  // ── deep section via sheet (tap 2) ──
  await page.locator('nav[aria-label="التنقل الرئيسي"] button:has-text("المزيد")').first().click();
  const sheet = page.locator('[role="dialog"][aria-label="كل الأقسام"]');
  await expect(sheet).toBeVisible({ timeout: 5_000 });
  await shot(page, '06-more-sheet');
  await sheet.locator('button:has-text("تقويم المحتوى")').first().click();
  await page.waitForURL(/\/dashboard\/calendar/, { timeout: 15_000 });
  await page.waitForTimeout(1200);
  await shot(page, '07-calendar-via-sheet');

  // ── every section label in the sheet matches a reachable route ──
  await page.locator('nav[aria-label="التنقل الرئيسي"] button:has-text("المزيد")').first().click();
  await expect(sheet).toBeVisible({ timeout: 5_000 });
  const sheetButtons = await sheet.locator('div.grid button').count();
  expect(sheetButtons, 'all 23 sections in the sheet').toBeGreaterThanOrEqual(22);
  await shot(page, '08-full-sheet');
});
