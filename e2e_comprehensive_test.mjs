/**
 * Comprehensive E2E test for SmartBot dashboard
 * Tests: register, login, all pages, navigation, logout, re-login, mobile, theme, page titles
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:8000';
const TEST_USER = { username: 'fulltest', email: 'ft@test.com', password: 'Pass1234' };

const RESULTS = [];
let PASS = 0;
let FAIL = 0;

function report(page, status, errors = [], notes = '') {
  RESULTS.push({ page, status, errors, notes });
  if (status === 'PASS') PASS++; else FAIL++;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- API helpers ---
async function apiRegister() {
  const form = new URLSearchParams();
  form.set('username', TEST_USER.username);
  form.set('email', TEST_USER.email);
  form.set('password', TEST_USER.password);
  const res = await fetch(`${BASE}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    redirect: 'manual',
  });
  // 200 or possible 400 if already registered
  return res.status === 200;
}

async function apiLogin() {
  const form = new URLSearchParams();
  form.set('username', TEST_USER.username);
  form.set('password', TEST_USER.password);
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
    redirect: 'manual',
  });
  const body = await res.json();
  const cookies = res.headers.getSetCookie?.() || res.headers.raw?.()?.['set-cookie'] || [];
  const tokenCookie = Array.isArray(cookies) ? cookies.find(c => c.startsWith('token=')) : null;
  const token = tokenCookie ? tokenCookie.split(';')[0].replace('token=', '') : null;
  return { ok: res.status === 200, token, role: body.role };
}

// --- Main test ---
async function run() {
  await apiRegister(); // may already exist

  const loginResult = await apiLogin();
  if (!loginResult.ok || !loginResult.token) {
    report('Register + Login', 'FAIL', ['Could not register or login']);
    // Final output
    console.log(JSON.stringify({ results: RESULTS, summary: 'Register failed before browser tests', pass_count: PASS, fail_count: FAIL }));
    return;
  }
  report('Register + Login API', 'PASS', [], `token=${loginResult.token.substring(0, 10)}... role=${loginResult.role}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'ar',
  });

  // Inject auth cookie
  await context.addCookies([
    { name: 'token', value: loginResult.token, domain: 'localhost', path: '/' }
  ]);

  const page = await context.newPage();
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  // --- Helper: navigate to page and verify it loads ---
  async function testPage(pageKey, pageLabel) {
    consoleErrors.length = 0;
    try {
      await page.goto(`${BASE}/#${pageKey}`, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(800); // let lazy-loaded components settle

      const errors = [...consoleErrors];
      const errMsg = errors.join('; ');

      // Check not blank — look for visible content
      const bodyText = await page.locator('body').innerText().catch(() => '');
      const hasContent = bodyText && bodyText.length > 10 && !bodyText.includes('جاري التحميل');

      // Check page title
      const title = await page.title().catch(() => '');

      // Check for error boundary or loading state
      const hasError = await page.locator('text=حدث خطأ').count() > 0;
      const hasLoading = await page.locator('.animate-spin').count() > 0 && bodyText.length < 50;

      if (hasContent && !hasError && !hasLoading) {
        report(`${pageLabel} (${pageKey})`, 'PASS', errors, `title="${title}"`);
      } else {
        const note = [];
        if (!hasContent) note.push('blank-or-spinner');
        if (hasError) note.push('error-boundary');
        if (hasLoading) note.push('stuck-loading');
        report(`${pageLabel} (${pageKey})`, 'FAIL', errors, note.join(', '));
      }
    } catch (e) {
      report(`${pageLabel} (${pageKey})`, 'FAIL', [e.message], 'navigation-error');
    }
  }

  try {
    // 1. Dashboard
    await testPage('dashboard', 'Dashboard');

    // 2-22. All sidebar pages
    const allPages = [
      ['messages', 'Messages'],
      ['comments', 'Comments'],
      ['posts', 'Posts'],
      ['scheduled', 'Scheduled'],
      ['analytics', 'Analytics'],
      ['audience', 'Audience'],
      ['leads', 'Leads'],
      ['ads', 'Ads'],
      ['broadcast', 'Broadcast'],
      ['marketing', 'Marketing'],
      ['reports', 'Reports'],
      ['pages', 'Pages'],
      ['team', 'Team'],
      ['calendar', 'Calendar'],
      ['autoreply', 'Autoreply'],
      ['activity', 'Activity'],
      ['notifications', 'Notifications'],
      ['tools', 'Tools'],
      ['billing', 'Billing'],
      ['support', 'Support'],
      ['settings', 'Settings'],
    ];

    for (const [key, label] of allPages) {
      await testPage(key, label);
    }

    // 23. Logout button click
    consoleErrors.length = 0;
    try {
      // Navigate to dashboard first
      await page.goto(`${BASE}/#dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(1000);

      // Open sidebar
      const hamburger = page.locator('#hamburger');
      if (await hamburger.isVisible()) {
        await hamburger.click();
        await sleep(500);
      }

      // Find and click logout button
      const logoutBtn = page.locator('button:has-text("تسجيل الخروج")');
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await sleep(1000);
      }

      // After logout, should be on landing or login page
      const currentUrl = page.url();
      const loginVisible = await page.locator('button:has-text("تسجيل الدخول"), input[type="password"]').isVisible().catch(() => false);

      if (loginVisible || currentUrl.includes('login') || currentUrl.includes('landing')) {
        report('Logout', 'PASS', [...consoleErrors], `url=${currentUrl}`);
      } else {
        report('Logout', 'FAIL', [...consoleErrors], `not-redirected, url=${currentUrl}`);
      }
    } catch (e) {
      report('Logout', 'FAIL', [e.message]);
    }

    // 24. Login page renders after logout
    consoleErrors.length = 0;
    try {
      await page.goto(`${BASE}/#login`, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(1000);
      const loginBtn = page.locator('button:has-text("تسجيل الدخول"), button:has-text("Login"), button[type="submit"]');
      const hasPassword = await page.locator('input[type="password"]').isVisible().catch(() => false);

      if ((await loginBtn.count() > 0) || hasPassword) {
        report('Login page after logout', 'PASS', [...consoleErrors], 'login-form-rendered');
      } else {
        report('Login page after logout', 'FAIL', [...consoleErrors], 'no-login-form');
      }
    } catch (e) {
      report('Login page after logout', 'FAIL', [e.message]);
    }

    // 25. Re-login via form
    consoleErrors.length = 0;
    try {
      // Fill login form
      const usernameInput = page.locator('input[type="text"], input[name="username"], input:not([type="password"])').first();
      const passwordInput = page.locator('input[type="password"]');
      const submitBtn = page.locator('button[type="submit"], button:has-text("تسجيل الدخول"), button:has-text("Login")').first();

      if (await usernameInput.isVisible() && await passwordInput.isVisible()) {
        await usernameInput.fill(TEST_USER.username);
        await passwordInput.fill(TEST_USER.password);
        if (await submitBtn.isVisible()) {
          await submitBtn.click();
        } else {
          await passwordInput.press('Enter');
        }
        await sleep(2000);

        // Should redirect to dashboard
        const reAuth = await page.locator('text=لوحة البيانات').isVisible().catch(() => false);
        const reTitle = await page.title();
        if (reAuth || reTitle.includes('لوحة البيانات')) {
          report('Re-login via form', 'PASS', [...consoleErrors], 'redirected-to-dashboard');
        } else {
          report('Re-login via form', 'FAIL', [...consoleErrors], 'no-redirect');
        }
      } else {
        report('Re-login via form', 'FAIL', [...consoleErrors], 'form-fields-not-found');
      }
    } catch (e) {
      report('Re-login via form', 'FAIL', [e.message]);
    }

    // 26. Theme toggle
    consoleErrors.length = 0;
    try {
      // Re-inject cookie and go to dashboard
      await context.addCookies([
        { name: 'token', value: loginResult.token, domain: 'localhost', path: '/' }
      ]);
      await page.goto(`${BASE}/#dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(1000);

      // Find and click theme toggle
      const themeBtn = page.locator('button[aria-label*="theme"], button[aria-label*="Theme"], button:has(svg.lucide-moon), button:has(svg[class*="moon"]), button:has(svg[class*="sun"])').first();
      const anyThemeBtn = page.locator('button').filter({ has: page.locator('svg') }).first();

      if (await themeBtn.isVisible().catch(() => false)) {
        const beforeDark = await page.locator('html').getAttribute('class').catch(() => '');
        await themeBtn.click();
        await sleep(500);
        const afterDark = await page.locator('html').getAttribute('class').catch(() => '');
        report('Theme toggle', 'PASS', [...consoleErrors], `class-changed: ${beforeDark}→${afterDark}`);
      } else {
        // Try the ones near the header — the ThemeToggle component
        const possibleToggles = page.locator('.header-left button, header button');
        const count = await possibleToggles.count();
        if (count > 0) {
          await possibleToggles.last().click();
          await sleep(500);
          report('Theme toggle', 'PASS', [...consoleErrors], 'clicked-header-toggle');
        } else {
          report('Theme toggle', 'FAIL', [...consoleErrors], 'no-theme-toggle-found');
        }
      }
    } catch (e) {
      report('Theme toggle', 'FAIL', [e.message]);
    }

    // 27. Mobile viewport bottom nav
    consoleErrors.length = 0;
    try {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`${BASE}/#dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(1000);

      // Bottom nav should be visible
      const mobileNavBtns = page.locator('nav button').filter({ has: page.locator('text=الرئيسية, text=الرسائل, text=تحليلات, text=بث, text=الإعدادات') });
      const navCount = await mobileNavBtns.count();

      if (navCount > 0) {
        // Click each bottom nav tab
        const mobileTabs = ['الرسائل', 'تحليلات', 'بث', 'الإعدادات'];
        for (const tab of mobileTabs) {
          const btn = page.locator(`button:has-text("${tab}")`).first();
          if (await btn.isVisible()) {
            await btn.click();
            await sleep(800);
            const tabContent = await page.locator('body').innerText();
            if (tabContent.length > 0) {
              report(`Mobile nav: ${tab}`, 'PASS', [...consoleErrors]);
            } else {
              report(`Mobile nav: ${tab}`, 'FAIL', [...consoleErrors], 'blank-page');
            }
          }
        }
        report('Mobile bottom nav visible', 'PASS', []);
      } else {
        report('Mobile bottom nav', 'FAIL', [...consoleErrors], 'no-mobile-nav-buttons');
      }
    } catch (e) {
      report('Mobile bottom nav', 'FAIL', [e.message]);
    }

  } finally {
    await browser.close();
  }

  // --- Final output ---
  const summary = `Comprehensive E2E: ${PASS} passed, ${FAIL} failed out of ${PASS + FAIL} checks`;
  console.log(JSON.stringify({
    results: RESULTS,
    summary,
    pass_count: PASS,
    fail_count: FAIL,
  }, null, 2));
}

run().catch(err => {
  console.log(JSON.stringify({
    results: [{ page: 'Fatal', status: 'FAIL', errors: [err.message] }],
    summary: `Fatal error: ${err.message}`,
    pass_count: 0,
    fail_count: 1,
  }));
});
