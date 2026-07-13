import { test, expect, Page } from '@playwright/test';
import path from 'path';

const BASE = 'http://localhost:8000';
const ARTIFACTS = path.resolve(__dirname, '../e2e_artifacts');

// ── Helpers ──────────────────────────────────────────────────────────

async function registerUser(page: Page) {
  const resp = await page.request.post(`${BASE}/api/register`, {
    form: { username: 'testadmin', email: 'test@example.com', password: 'test123456' },
  });
  const body = await resp.json();
  return { ok: resp.ok(), body };
}

interface TestResult {
  page: string;
  failures: { element: string; issue: string }[];
}

const allResults: TestResult[] = [];

function record(pageName: string, element: string, issue: string) {
  let r = allResults.find(x => x.page === pageName);
  if (!r) { r = { page: pageName, failures: [] }; allResults.push(r); }
  r.failures.push({ element, issue });
}

async function testPageNav(page: Page, pageName: string, navText: string) {
  await test.step(`Navigate to ${pageName}`, async () => {
    // Try clicking nav item with exact text
    const navItems = page.locator('nav a, nav button, [class*="nav"] a, [class*="sidebar"] a, [class*="navigation"] a');
    const target = navItems.filter({ hasText: navText }).first();

    if (await target.isVisible({ timeout: 3000 }).catch(() => false)) {
      await target.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);
    } else {
      // Try broader selector
      const anyEl = page.locator(`text="${navText}"`).first();
      if (await anyEl.isVisible({ timeout: 2000 }).catch(() => false)) {
        await anyEl.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1500);
      } else {
        record(pageName, 'Navigation', `Nav item "${navText}" not found`);
        return;
      }
    }
  });
}

async function testButtons(page: Page, pageName: string) {
  await test.step(`Test buttons on ${pageName}`, async () => {
    const buttons = page.locator('button');
    const count = await buttons.count();

    for (let i = 0; i < Math.min(count, 20); i++) {
      const btn = buttons.nth(i);
      const text = (await btn.textContent())?.trim() || '';
      if (!text || text === 'وضع داكن' || text === 'حالة البوت') continue;

      try {
        if (await btn.isVisible({ timeout: 500 })) {
          await btn.click({ timeout: 3000 });
          await page.waitForTimeout(800);
          // Close any modal that appears
          const closeBtns = page.locator('button:has-text("إلغاء"), button:has-text("إغلاق"), button:has-text("إلغاء الأمر"), button[aria-label="Close"], button:has-text("رجوع")');
          for (let j = 0; j < Math.min(await closeBtns.count(), 5); j++) {
            const cb = closeBtns.nth(j);
            if (await cb.isVisible({ timeout: 500 }).catch(() => false)) {
              await cb.click({ timeout: 2000 });
              await page.waitForTimeout(500);
            }
          }
        }
      } catch (e) {
        record(pageName, `Button "${text}"`, `Click failed: ${(e as Error).message.slice(100)}`);
      }
    }
  });
}

async function testSearchBox(page: Page, pageName: string) {
  await test.step(`Test search box on ${pageName}`, async () => {
    const search = page.locator('input[placeholder*="بحث"], input[type="search"]').first();
    if (await search.isVisible({ timeout: 1000 }).catch(() => false)) {
      await search.fill('test');
      await page.waitForTimeout(500);
      await search.fill('');
    }
  });
}

async function testFormElements(page: Page, pageName: string) {
  await test.step(`Test form elements on ${pageName}`, async () => {
    const inputs = page.locator('input, select, textarea');
    const count = await inputs.count();
    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        const inp = inputs.nth(i);
        const type = await inp.getAttribute('type').catch(() => 'unknown');
        const ph = await inp.getAttribute('placeholder').catch(() => '');
        if (type === 'submit' || type === 'hidden' || type === 'checkbox' || type === 'radio') continue;
        if (!await inp.isVisible({ timeout: 500 }).catch(() => false)) continue;
        try {
          if (type === 'select') {
            // try selecting first option
            const opt = inp.locator('option').first();
            if (await opt.isVisible().catch(() => false)) {
              await opt.click({ timeout: 1000 });
            }
          } else {
            await inp.fill('test value', { timeout: 1000 });
          }
        } catch (e) {
          record(pageName, `Input "${ph || type}"`, `Fill failed: ${(e as Error).message.slice(100)}`);
        }
      }
    }
  });
}

const NAV_ITEMS: { name: string; text: string }[] = [
  { name: 'Dashboard', text: 'لوحة التحكم' },
  { name: 'Messages', text: 'الرسائل' },
  { name: 'Comments', text: 'التعليقات' },
  { name: 'Rules', text: 'القواعد' },
  { name: 'Replies', text: 'الردود' },
  { name: 'Quick Replies', text: 'الردود السريعة' },
  { name: 'Flows', text: 'التدفقات' },
  { name: 'AI Smart', text: 'AI الذكي' },
  { name: 'Agent', text: 'الوكيل الذكي' },
  { name: 'Posts', text: 'المنشورات' },
  { name: 'Calendar', text: 'تقويم المحتوى' },
  { name: 'Offers', text: 'العروض' },
  { name: 'Subscribers', text: 'المشتركين' },
  { name: 'Sequences', text: 'التسلسلات' },
  { name: 'Broadcast', text: 'البث الجماعي' },
  { name: 'Reports', text: 'التقارير' },
  { name: 'Analytics', text: 'التحليلات' },
  { name: 'Live Log', text: 'السجل المباشر' },
  { name: 'Ads', text: 'الإعلانات' },
  { name: 'Users', text: 'المستخدمين' },
  { name: 'Settings', text: 'الإعدادات' },
];

// Style-related UI features
const STYLE_TESTS = [
  { name: 'Dark Mode', selector: 'button:has-text("وضع داكن")' },
  { name: 'Bot Status', selector: 'text=حالة البوت' },
];

// ── Tests ────────────────────────────────────────────────────────────

test.describe('SmartBot Dashboard E2E', () => {
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      consoleErrors.push(`PAGE ERROR: ${err.message}`);
    });
  });

  test('1. Register and login', async ({ page }) => {
    const result = await registerUser(page);

    // If already exists, try login
    if (!result.ok && result.body?.detail?.includes?.('موجود')) {
      const loginResp = await page.request.post(`${BASE}/api/login`, {
        form: { username: 'testadmin', password: 'test123456' },
      });
      expect(loginResp.ok()).toBeTruthy();
      // Set cookie manually
      const cookies = loginResp.headers()['set-cookie'] || '';
      const tokenMatch = cookies.match(/token=([^;]+)/);
      if (tokenMatch) {
        await page.evaluate((t) => { document.cookie = `token=${t}`; }, tokenMatch[1]);
      }
    } else {
      expect(result.ok).toBeTruthy();
      const cookies = page.response()?.headers()['set-cookie'] || '';
      // Actually, the API call via page.request won't set browser cookies.
      // Let's login anyway to get cookies set in browser
      const loginResp = await page.request.post(`${BASE}/api/login`, {
        form: { username: 'testadmin', password: 'test123456' },
      });
      expect(loginResp.ok()).toBeTruthy();
      const setCookie = loginResp.headers()['set-cookie'];
      if (setCookie) {
        const tokenMatch2 = setCookie.match(/token=([^;]+)/);
        if (tokenMatch2) {
          await page.evaluate((t) => { document.cookie = `token=${t}`; }, tokenMatch2[1]);
        }
      }
    }

    // Navigate to app
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Check we're on dashboard
    const body = await page.textContent('body');
    const isLoggedIn = body?.includes('لوحة التحكم') || body?.includes('testadmin');

    if (!isLoggedIn) {
      // Try direct login page
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);

      // Try UI login
      const usernameField = page.locator('input[type="text"], input[name="username"]').first();
      if (await usernameField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await usernameField.fill('testadmin');
        const pwField = page.locator('input[type="password"], input[name="password"]').first();
        await pwField.fill('test123456');
        await page.locator('button[type="submit"], button:has-text("دخول"), button:has-text("تسجيل الدخول")').first().click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({ path: `${ARTIFACTS}/01-login.png`, fullPage: true });
    const finalBody = await page.textContent('body');
    expect(finalBody).toContain('لوحة التحكم');
  });

  NAV_ITEMS.forEach(nav => {
    test(`2. ${nav.name} page loads and is interactive`, async ({ page }) => {
      // Ensure logged in
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);

      // Find and click nav item
      const navItem = page.locator('nav a, nav button, [class*="navigation"] a, [class*="nav"] a, [class*="sidebar"] a').filter({ hasText: nav.text });
      const navVisible = await navItem.isVisible({ timeout: 3000 }).catch(() => false);

      if (!navVisible) {
        // Try the drawer toggle if sidebar is collapsed
        const drawerBtn = page.locator('button:has-text("menu"), button[aria-label*="menu" i], [class*="drawer"] button, button:has-text("☰")').first();
        if (await drawerBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await drawerBtn.click();
          await page.waitForTimeout(500);
        }
        // Retry
        const navItem2 = page.locator('nav a, nav button, [class*="navigation"] a, [class*="nav"] a').filter({ hasText: nav.text });
        if (await navItem2.isVisible({ timeout: 2000 }).catch(() => false)) {
          await navItem2.click();
        } else {
          record(nav.name, 'Navigation', `Nav item "${nav.text}" not found even after drawer toggle`);
          return;
        }
      } else {
        await navItem.click();
      }

      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      // Screenshot
      await page.screenshot({ path: `${ARTIFACTS}/page-${nav.name}.png`, fullPage: true });

      // Check no JS crashes
      expect(consoleErrors.filter(e => !e.includes('401') && !e.includes('404') && !e.includes('favicon') && !e.includes('ML-'))).toHaveLength(0);

      // Test buttons
      await testButtons(page, nav.name);

      // Test search
      await testSearchBox(page, nav.name);

      // Test form elements
      await testFormElements(page, nav.name);
    });
  });

  test('3. Style/UI features', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Test dark mode toggle
    const darkBtn = page.locator('button:has-text("وضع داكن")').first();
    if (await darkBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await darkBtn.click();
      await page.waitForTimeout(500);
      // Toggle back
      await darkBtn.click();
      await page.waitForTimeout(500);
    }

    // Test "تحديث" (refresh) button on dashboard
    const refreshBtn = page.locator('button:has-text("تحديث")').first();
    if (await refreshBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await refreshBtn.click();
      await page.waitForTimeout(1500);
    }

    // Test user dropdown
    const userBtn = page.locator('text=admin, text=testadmin').first();
    if (await userBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await userBtn.click();
      await page.waitForTimeout(500);
      // Check for dropdown items
      const dropdownItems = page.locator('[role="menuitem"], [class*="dropdown"] a, [class*="menu"] a');
      if (await dropdownItems.count() > 0) {
        // Click outside to close
        await page.locator('body').click({ position: { x: 10, y: 10 } });
        await page.waitForTimeout(300);
      }
    }
  });

  test.afterAll(async () => {
    // Write results
    const fs = require('fs');
    const ARTIFACTS_DIR = ARTIFACTS;
    if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    fs.writeFileSync(`${ARTIFACTS_DIR}/e2e_results.json`, JSON.stringify(allResults, null, 2), 'utf-8');
    console.log(`\nE2E Results:\n${JSON.stringify(allResults, null, 2)}`);
  });
});
