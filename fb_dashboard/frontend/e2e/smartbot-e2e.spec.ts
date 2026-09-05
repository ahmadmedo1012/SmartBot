import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = 'http://localhost:8000';
const ARTIFACTS = path.resolve(__dirname, '../e2e_artifacts');

// ── Helpers ──────────────────────────────────────────────────────────

async function registerUser(page: Page) {
  // Give the page a real origin first — the CSRF origin guard correctly
  // rejects API posts from an about:blank page (Origin: null).
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const uname = `spec_${Date.now().toString(36)}`;
  const resp = await page.request.post(`${BASE}/api/register`, {
    data: { username: uname, email: `${uname}@t.ly`, password: 'test123456' },
  });
  const body = await resp.json();
  return { ok: resp.ok(), body, username: uname };
}

interface TestResult {
  page: string;
  failures: { element: string; issue: string }[];
}

const allResults: TestResult[] = [];

// Shared authenticated session. IMPORTANT: stored on DISK, not module state —
// Playwright restarts the worker after a failed test, which re-imports this
// module and wiped the in-memory token (discovered 2026-09-05: every nav
// test after the first failure silently ran unauthenticated).
const TOKEN_FILE = `${ARTIFACTS}/.e2e_auth_token`;
const sharedAuth: { token: string; username: string } = { token: '', username: '' };
function loadSharedToken(): string {
  try {
    sharedAuth.token = fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf-8') : '';
    return sharedAuth.token;
  } catch { return ''; }
}
function loadStoredUsername(): string {
  try {
    return fs.existsSync(TOKEN_FILE + '.user') ? fs.readFileSync(TOKEN_FILE + '.user', 'utf-8') : '';
  } catch { return ''; }
}

function record(pageName: string, element: string, issue: string) {
  let r = allResults.find(x => x.page === pageName);
  if (!r) { r = { page: pageName, failures: [] }; allResults.push(r); }
  r.failures.push({ element, issue });
}

async function testPageNav(page: Page, pageName: string, navText: string) {
  await test.step(`Navigate to ${pageName}`, async () => {
    // Try clicking nav item with exact text (sidebar renders [role="link"])
    const navItems = page.locator('nav [role="link"], nav a, nav button');
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
      // Re-renders (modals, toasts, lists loading) stale the mid-iteration
      // locator — read text defensively instead of letting it abort the test.
      let text = '';
      try { text = (await btn.textContent({ timeout: 2000 }))?.trim() || ''; } catch { continue; }
      // 'تسجيل الخروج' blacklists the shared JWT (logout) and wrecks every
      // subsequent nav test; 'اشتراك' navigates away from the page under test.
      if (!text || text === 'وضع داكن' || text === 'حالة البوت'
          || text === 'تسجيل الخروج' || text === 'اشتراك') continue;

      try {
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          if (process.env.DEBUG_NAV) console.log(`[BTN ${pageName}] clicking: "${text.slice(0, 30)}"`);
          await btn.click({ timeout: 3000 }).catch(() => { /* stale after re-render */ });
          await page.waitForTimeout(800);
          if (process.env.DEBUG_NAV) console.log(`[BTN ${pageName}] url now: ${page.url()}`);
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
          } else if (['datetime-local', 'date', 'time', 'month', 'week'].includes(type || '')) {
            // date/time inputs reject arbitrary text (browser constraint, not an
            // app bug) — fill a valid value instead of recording a fake failure
            await inp.fill('2026-01-15T10:30', { timeout: 1000 });
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
  // Mirrors defaultNavSections (AdminSidebar.tsx) — keep in sync when the
  // sidebar changes. Stale names here previously soft-recorded "not found"
  // while the suite still passed (fake-complete coverage — fixed 2026-09-05).
  { name: 'Dashboard', text: 'لوحة البيانات' },
  { name: 'Messages', text: 'الرسائل' },
  { name: 'Comments', text: 'التعليقات' },
  { name: 'Posts', text: 'المنشورات' },
  { name: 'Scheduled', text: 'المجدول' },
  { name: 'Analytics', text: 'التحليلات' },
  { name: 'Audience', text: 'الجمهور' },
  { name: 'Leads', text: 'العملاء المتوقعون' },
  { name: 'Ads', text: 'الإعلانات' },
  { name: 'Broadcast', text: 'البث الجماعي' },
  { name: 'Marketing', text: 'التسويق' },
  { name: 'Reports', text: 'التقارير' },
  { name: 'Pages', text: 'الصفحات' },
  { name: 'Team', text: 'الفريق' },
  { name: 'Calendar', text: 'تقويم المحتوى' },
  { name: 'Autoreply', text: 'الردود التلقائية' },
  { name: 'Activity', text: 'سجل النشاطات' },
  { name: 'Notifications', text: 'الإشعارات' },
  { name: 'Tools', text: 'الأدوات' },
  { name: 'Billing', text: 'الفواتير' },
  { name: 'Support', text: 'الدعم' },
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
    let result = await registerUser(page);

    // Register rate limit (5/300s per IP — back-to-back full-suite runs trip
    // it): fall back to the PREVIOUS run's stored user instead of failing.
    // All spec users share the fixed password below, so re-login is sound.
    if (!result.ok && (result.body?.detail?.includes?.('محاولات') || result.body?.detail?.includes?.('كثيرة'))) {
      const stored = loadStoredUsername();
      if (stored) {
        result = { ok: true, body: { data: { user: { username: stored } } }, username: stored };
      }
    }

    // If already exists, try login
    if (!result.ok && result.body?.detail?.includes?.('موجود')) {
      const loginResp = await page.request.post(`${BASE}/api/login`, {
        data: { username: result.username, password: 'test123456' },
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
      // Let's login anyway to get cookies set in browser
      const loginResp = await page.request.post(`${BASE}/api/login`, {
        data: { username: result.username, password: 'test123456' },
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
    const isLoggedIn = body?.includes('لوحة التحكم') || body?.includes(result.username);

    if (!isLoggedIn) {
      // Try direct login page
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);

      // Try UI login
      const usernameField = page.locator('input[type="text"], input[name="username"]').first();
      if (await usernameField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await usernameField.fill(result.username);
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

    // Export the authenticated session for the nav tests (same worker, tests
    // run in file order — workers: 1 in playwright.config.ts)
    const ctxCookies = await page.context().cookies(BASE);
    sharedAuth.token = ctxCookies.find(c => c.name === 'token')?.value || '';
    sharedAuth.username = result.username;
    expect(sharedAuth.token, 'login must yield an auth token for nav tests').not.toBe('');
    if (!fs.existsSync(ARTIFACTS)) fs.mkdirSync(ARTIFACTS, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, sharedAuth.token, 'utf-8');
    fs.writeFileSync(TOKEN_FILE + '.user', sharedAuth.username, 'utf-8');
  });

  NAV_ITEMS.forEach(nav => {
    test(`2. ${nav.name} page loads and is interactive`, async ({ page }) => {
      // Attach the shared authenticated session BEFORE navigation (disk-backed —
      // survives worker restarts; in-memory sharedAuth was wiped on re-import)
      const authToken = loadSharedToken();
      if (authToken) {
        await page.context().addCookies([{ name: 'token', value: authToken, url: BASE }]);
      }
      if (process.env.DEBUG_NAV) {
        const jar = await page.context().cookies(BASE);
        console.log(`[JAR ${nav.name}] cookies=${jar.map(c => `${c.name}(${c.value.slice(0, 12)}...,http=${c.httpOnly})`).join(',')} tokenLen=${sharedAuth.token.length}`);
      }
      // Go straight to the app shell — BASE (/) is the marketing landing
      // page by design; the dashboard shell (with the sidebar) is at
      // /dashboard. The old spec landed on / unauthenticated.
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);

      // Dismiss the first-run onboarding tour (react-joyride z-50 overlay
      // intercepts pointer events over the whole shell until skipped —
      // discovered via the nav-click timeout, not a missing element).
      const skipBtn = page.locator('button:has-text("تخطي")').first();
      if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await skipBtn.click().catch(() => {});
        await page.waitForTimeout(800);
      }

      // Find and click nav item — the sidebar renders motion.div[role="link"]
      // (a11y role), not <a>/<button>, so the selector must include it.
      // .first(): sidebar items precede MobileBottomNav in DOM. Shared labels
      // (الرسائل/التحليلات/الإشعارات) match BOTH bars — without .first() the
      // strict-mode violation throws and the .catch() silently faked "not found".
      const navItem = page.locator('nav [role="link"], nav a, nav button').filter({ hasText: nav.text }).first();
      const navVisible = await navItem.isVisible({ timeout: 3000 }).catch(() => false);

      if (!navVisible) {
        // Try the drawer toggle if sidebar is collapsed
        const drawerBtn = page.locator('button:has-text("menu"), button[aria-label*="menu" i], [class*="drawer"] button, button:has-text("☰")').first();
        if (await drawerBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await drawerBtn.click();
          await page.waitForTimeout(500);
        }
        // Retry
        const navItem2 = page.locator('nav [role="link"], nav a, nav button').filter({ hasText: nav.text }).first();
        if (await navItem2.isVisible({ timeout: 2000 }).catch(() => false)) {
          await navItem2.click();
        } else {
          if (process.env.DEBUG_NAV) {
            console.log(`[DEBUG ${nav.name}] url=${page.url()} title=${await page.title()}`);
            console.log(`[DEBUG ${nav.name}] roleLinks=${await page.locator('nav [role="link"]').count()}`);
            const txt = await page.textContent('body').catch(() => '');
            console.log(`[DEBUG ${nav.name}] body has text=${txt?.includes(nav.text)} login=${txt?.includes('تسجيل الدخول')}`);
            await page.screenshot({ path: `${ARTIFACTS}/debug-${nav.name}.png` }).catch(() => {});
          }
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

      // Check no JS crashes.
      // Tolerated resource statuses (each is a DESIGNED contract, not a crash):
      //  - 401: auth-gated endpoints probed before the session settles
      //  - 400: inbox endpoints signal "FB page not connected" — the messages
      //         page consumes this as its needsSetup state (retry: false on 400
      //         by design); E2E users never have a FB page connected
      //  - 404/favicon/ML-: cold-start noise
      const realErrors = consoleErrors.filter(e => !e.includes('401') && !e.includes('404') && !e.includes('400') && !e.includes('favicon') && !e.includes('ML-'));
      if (process.env.DEBUG_NAV && realErrors.length) {
        console.log(`[CONSOLE-ERRORS ${nav.name}]:`, JSON.stringify(realErrors, null, 2).slice(0, 1500));
      }
      expect(realErrors).toHaveLength(0);

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

  test('4. no soft-recorded navigation failures (fake-complete guard)', () => {
    // §5.3 of latest_plan.md: reporting success without terminal evidence is
    // forbidden. Any soft-recorded issue must FAIL the suite, not be logged.
    expect(
      allResults,
      `soft-recorded issues: ${JSON.stringify(allResults, null, 2)}`
    ).toHaveLength(0);
  });

  test.afterAll(async () => {
    // Write results
    const ARTIFACTS_DIR = ARTIFACTS;
    if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    fs.writeFileSync(`${ARTIFACTS_DIR}/e2e_results.json`, JSON.stringify(allResults, null, 2), 'utf-8');
    console.log(`\nE2E Results:\n${JSON.stringify(allResults, null, 2)}`);
  });
});
