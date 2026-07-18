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

// ponytail: extracted to avoid duplicating cookie-extraction logic
async function loginAndExtractToken(page) {
  const loginRes = await page.request.post(`${BASE}/api/login`, {
    form: { username: TEST_USER.username, password: TEST_USER.password }
  });
  const status = loginRes.status();
  const body = await loginRes.json().catch(() => ({}));
  const hdrs = loginRes.headers();
  const sc = hdrs['set-cookie'] || '';
  const match = sc.match(/token=([^;]+)/);
  const token = match ? match[1] : '';
  return { status, body, token };
}

// --- Main test ---
async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'ar',
  });
  const page = await context.newPage();
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  async function clearErrors() { consoleErrors.length = 0; }

  // --- Step 1: Register ---
  clearErrors();
  try {
    const regRes = await page.request.post(`${BASE}/api/register`, {
      form: { username: TEST_USER.username, email: TEST_USER.email, password: TEST_USER.password }
    });
    const regStatus = regRes.status();
    const regBody = await regRes.json();
    const ok = regStatus === 200 || (regStatus === 400 && (regBody.detail || '').includes('موجود'));
    report('Register API', ok ? 'PASS' : 'FAIL', [...consoleErrors], ok ? (regStatus === 200 ? 'created' : 'exists') : `status=${regStatus}`);
  } catch (e) {
    report('Register API', 'FAIL', [e.message]);
  }

  // --- Step 2: Login ---
  clearErrors();
  let authToken = '';
  try {
    const { status, body, token } = await loginAndExtractToken(page);
    authToken = token;
    if (status === 200 && authToken) {
      report('Login API', 'PASS', [], `role=${body.role}`);
    } else {
      report('Login API', 'FAIL', [...consoleErrors], `status=${status}`);
    }
  } catch (e) {
    report('Login API', 'FAIL', [e.message]);
  }

  if (!authToken) {
    report('Fatal: No auth token', 'FAIL', []);
    await browser.close();
    const summary = `E2E aborted: ${PASS} passed, ${FAIL} failed`;
    console.log(JSON.stringify({ results: RESULTS, summary, pass_count: PASS, fail_count: FAIL }, null, 2));
    return process.exit(1);
  }

  // --- Step 3: Inject cookie and load dashboard ---
  clearErrors();
  await context.addCookies([{
    name: 'token', value: authToken, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax'
  }]);

  async function testPage(key, label) {
    clearErrors();
    try {
      await page.goto(`${BASE}/#${key}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await sleep(2500); // let lazy components + API calls settle

      const errors = [...consoleErrors];
      // BUG 2 fix: keep 404 filter only, expose other resource-load failures
      const non404 = errors.filter(e => !/404/i.test(e));
      const bodyText = await page.locator('body').innerText().catch(() => '');
      const hasContent = bodyText && bodyText.length > 15;
      const spinnerCount = await page.locator('.animate-spin').count().catch(() => 0);
      // BUG 4 fix: error boundary detection + stuck-loading detection
      const hasErrorBoundary = await page.locator('text=حدث خطأ').count().catch(() => 0) > 0;

      if (hasErrorBoundary) {
        report(`${label} (${key})`, 'FAIL', non404, `error-boundary len=${bodyText.length}`);
      } else if (hasContent) {
        const spinnerWarn = spinnerCount > 0 ? 'has-spinner' : '';
        // ponytail: stuck-loading = spinner visible but almost no content
        const stuck = (spinnerCount > 0 && bodyText.length < 50) ? 'stuck-loading' : '';
        report(`${label} (${key})`, 'PASS', non404, `len=${bodyText.length} ${spinnerWarn} ${stuck}`.trim());
      } else {
        report(`${label} (${key})`, 'FAIL', non404, `blank len=${bodyText.length} spinners=${spinnerCount}`);
      }
    } catch (e) {
      report(`${label} (${key})`, 'FAIL', [e.message], 'nav-error');
    }
  }

  // Dashboard first
  await testPage('dashboard', 'Dashboard');

  // All sidebar pages
  const allPages = [
    ['messages', 'Messages'], ['comments', 'Comments'], ['posts', 'Posts'],
    ['scheduled', 'Scheduled'], ['analytics', 'Analytics'], ['audience', 'Audience'],
    ['leads', 'Leads'], ['ads', 'Ads'], ['broadcast', 'Broadcast'],
    ['marketing', 'Marketing'], ['reports', 'Reports'], ['pages', 'Pages'],
    ['team', 'Team'], ['calendar', 'Calendar'], ['autoreply', 'Autoreply'],
    ['activity', 'Activity'], ['notifications', 'Notifications'], ['tools', 'Tools'],
    ['billing', 'Billing'], ['support', 'Support'], ['settings', 'Settings'],
  ];

  for (const [key, label] of allPages) {
    await testPage(key, label);
  }

  // --- Sidebar / nav links ---
  clearErrors();
  try {
    await page.goto(`${BASE}/#dashboard`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await sleep(2000);
    const links = page.locator('nav a, aside a, .sidebar a, [class*="sidebar"] a');
    const count = await links.count();
    report('Sidebar navigation', count > 0 ? 'PASS' : 'FAIL', [...consoleErrors], `${count} links`);
  } catch (e) {
    report('Sidebar navigation', 'FAIL', [e.message]);
  }

  // --- Logout ---
  clearErrors();
  try {
    await page.goto(`${BASE}/#dashboard`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await sleep(2000);
    const logoutBtn = page.locator('button:has-text("تسجيل الخروج"), button:has-text("Logout"), [href*="logout"]').first();
    if (await logoutBtn.isVisible().catch(() => false)) {
      await logoutBtn.click();
      await sleep(1500);
    } else {
      await page.request.post(`${BASE}/api/logout`);
      await sleep(500);
    }
    const curUrl = page.url();
    await sleep(1000);
    const hasLoginForm = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
    const onLanding = await page.locator('text=الذكاء الاصطناعي, text=SmartBot, text=التسويق').first().isVisible().catch(() => false);
    report('Logout', (hasLoginForm || onLanding || curUrl.includes('landing') || curUrl.includes('login')) ? 'PASS' : 'FAIL',
      [...consoleErrors], `url=${curUrl.split('?')[0]}`);
  } catch (e) {
    report('Logout', 'FAIL', [e.message]);
  }

  // --- Login page after logout ---
  clearErrors();
  try {
    await page.goto(`${BASE}/#login`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await sleep(2000);
    const hasPw = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
    const hasBtn = await page.locator('button[type="submit"]').first().isVisible().catch(() => false);
    report('Login page after logout', (hasPw || hasBtn) ? 'PASS' : 'FAIL', [...consoleErrors], hasPw || hasBtn ? 'form-visible' : 'no-form');
  } catch (e) {
    report('Login page after logout', 'FAIL', [e.message]);
  }

  // --- Re-login via form ---
  clearErrors();
  try {
    // ponytail: single navigate to /#login, removed duplicate goto
    await page.goto(`${BASE}/#login`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await sleep(2000);
    const unameInput = page.locator('input[type="text"], input:not([type="password"]):not([type="hidden"])').first();
    const pwInput = page.locator('input[type="password"]').first();
    const subBtn = page.locator('button[type="submit"]').first();
    if (await unameInput.isVisible().catch(() => false) && await pwInput.isVisible().catch(() => false)) {
      await unameInput.fill(TEST_USER.username);
      await pwInput.fill(TEST_USER.password);
      if (await subBtn.isVisible().catch(() => false)) await subBtn.click();
      else await pwInput.press('Enter');
      await sleep(2500);
      const bodyText = await page.locator('body').innerText().catch(() => '');
      report('Re-login via form', bodyText.length > 50 ? 'PASS' : 'FAIL', [...consoleErrors], `len=${bodyText.length}`);
    } else {
      report('Re-login via form', 'FAIL', [...consoleErrors], 'no-form-fields');
    }
  } catch (e) {
    report('Re-login via form', 'FAIL', [e.message]);
  }

  // --- BUG 1: Check re-login succeeded before continuing ---
  clearErrors();
  const { status: loginStatus2, token: token2 } = await loginAndExtractToken(page);
  if (loginStatus2 !== 200 || !token2) {
    report('Re-login for follow-up', 'FAIL', [...consoleErrors], `status=${loginStatus2}`);
    // Skip theme/mobile/stats/title tests when auth failed
    await browser.close();
    const summary = `E2E aborted after re-login failure: ${PASS} passed, ${FAIL} failed`;
    console.log(JSON.stringify({ results: RESULTS, summary, pass_count: PASS, fail_count: FAIL }, null, 2));
    return process.exit(1);
  }
  report('Re-login for follow-up', 'PASS', [], 'token-refreshed');
  await context.addCookies([{
    name: 'token', value: token2, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax'
  }]);

  // --- Theme toggle ---
  clearErrors();
  try {
    await page.goto(`${BASE}/#dashboard`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await sleep(2000);
    // Try to find theme toggle by various selectors
    const themeBtn = page.locator('.header-left').locator('button[aria-label*="الوضع"]').first();
    let found = false;
    if (await themeBtn.isVisible().catch(() => false)) {
      await themeBtn.click();
      await sleep(500);
      found = true;
    }
    report('Theme toggle', found ? 'PASS' : 'FAIL', [...consoleErrors], found ? 'clicked' : 'not-found');
  } catch (e) {
    report('Theme toggle', 'FAIL', [e.message]);
  }

  // --- Mobile viewport ---
  clearErrors();
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/#dashboard`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await sleep(2500);
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const navLinks = await page.locator('nav a, a[href*="#"]').count().catch(() => 0);
    report('Mobile viewport', bodyText.length > 15 ? 'PASS' : 'FAIL', [...consoleErrors], `len=${bodyText.length} links=${navLinks}`);
  } catch (e) {
    report('Mobile viewport', 'FAIL', [e.message]);
  }

  // --- Mobile bottom nav tab clicks ---
  clearErrors();
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/#dashboard`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await sleep(2500);
    // Mobile bottom nav is visible on mobile via md:hidden
    const mobileButtons = page.locator('.md\\:hidden.fixed.bottom-0 button, nav.fixed button, [class*="bottom-0"] button');
    const count = await mobileButtons.count().catch(() => 0);
    let clicked = 0;
    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        try {
          await mobileButtons.nth(i).click();
          await sleep(1000);
          clicked++;
        } catch (e2) { console.log('mobile nav click error:', e2.message); } // BUG 5 fix
      }
    }
    report('Mobile nav clicks', clicked > 0 ? 'PASS' : 'FAIL', [...consoleErrors], `clicked ${clicked}/${count} mobileBtns`);
  } catch (e) {
    report('Mobile nav clicks', 'FAIL', [e.message]);
  }

  // --- Dashboard stat cards (desktop) ---
  clearErrors();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE}/#dashboard`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await sleep(3000);
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const hasNumbers = /\d+/.test(bodyText);
    const statCount = await page.locator('[class*="stat"], [class*="Stat"], [class*="card"], [class*="Card"]').count().catch(() => 0);
    report('Dashboard stat cards', (statCount >= 2 || hasNumbers) ? 'PASS' : 'FAIL', [...consoleErrors], `stats=${statCount} hasNums=${hasNumbers}`);
  } catch (e) {
    report('Dashboard stat cards', 'FAIL', [e.message]);
  }

  // --- Page titles ---
  const titleChecks = [['dashboard', 'لوحة البيانات'], ['messages', 'الرسائل'], ['comments', 'التعليقات'], ['posts', 'المنشورات'], ['settings', 'الإعدادات']];
  for (const [key, expectedAr] of titleChecks) {
    clearErrors();
    try {
      await page.goto(`${BASE}/#${key}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await sleep(1000);
      const title = await page.title().catch(() => '');
      // BUG 3 fix: remove 'SmartBot' fallback, require Arabic title
      const ok = title.includes(expectedAr);
      report(`Page title: ${key}`, ok ? 'PASS' : 'FAIL', [...consoleErrors], `"${title}"`);
    } catch (e) {
      report(`Page title: ${key}`, 'FAIL', [e.message]);
    }
  }

  // --- Summary ---
  await browser.close();
  const summary = `Comprehensive E2E: ${PASS} passed, ${FAIL} failed out of ${PASS + FAIL} checks`;
  console.log(JSON.stringify({ results: RESULTS, summary, pass_count: PASS, fail_count: FAIL }, null, 2));
}

run().catch(err => {
  console.log(JSON.stringify({
    results: [{ page: 'Fatal', status: 'FAIL', errors: [err.message] }],
    summary: `Fatal error: ${err.message}`,
    pass_count: 0, fail_count: 1,
  }));
});
