import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:8000';
const ARTIFACTS = path.resolve('/home/ahmed/Downloads/SmartBot/fb_dashboard/e2e_artifacts');
fs.mkdirSync(ARTIFACTS, { recursive: true });

const results = { pass: 0, fail: 0, errors: [] };

function fail(page, elem, issue) { results.fail++; results.errors.push({ page, elem, issue }); }
function pass() { results.pass++; }

async function registerAndLogin(page, ctx) {
  // Try API register via fetch
  const resp = await page.request.post(`${BASE}/api/register`, {
    form: { username: 'testadmin', email: 'test@example.com', password: 'test123456' },
  });
  const body = await resp.json();
  if (!resp.ok() && JSON.stringify(body).includes('موجود')) {
    console.log('  User exists, logging in...');
  } else if (!resp.ok()) {
    console.log('  Register failed:', body);
  }

  // Login to get token cookie
  const loginResp = await page.request.post(`${BASE}/api/login`, {
    form: { username: 'testadmin', password: 'test123456' },
  });
  if (!loginResp.ok()) {
    console.log('  Login failed:', await loginResp.text());
    return false;
  }

  // Get cookie from response and add to context
  const setCookie = loginResp.headers()['set-cookie'];
  if (setCookie) {
    const token = setCookie.match(/token=([^;]+)/)?.[1];
    if (token) {
      await ctx.addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/' }]);
    }
  }
  return true;
}

const NAV_ITEMS = [
  'لوحة التحكم', 'الرسائل', 'التعليقات', 'القواعد', 'الردود',
  'الردود السريعة', 'التدفقات', 'AI الذكي', 'الوكيل الذكي',
  'المنشورات', 'تقويم المحتوى', 'العروض', 'المشتركين', 'التسلسلات',
  'البث الجماعي', 'التقارير', 'التحليلات', 'السجل المباشر',
  'الإعلانات', 'المستخدمين', 'الإعدادات',
];

async function clickNav(page, text) {
  // Try multiple selectors
  const selectors = [
    `a:has-text("${text}")`,
    `button:has-text("${text}")`,
    `[class*="nav"] *:has-text("${text}")`,
    `[class*="sidebar"] *:has-text("${text}")`,
    `text="${text}"`,
  ];
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      await el.click();
      return true;
    }
  }
  return false;
}

async function testPageInteractive(page, pageName) {
  // Click buttons
  const buttons = page.locator('button');
  const count = await buttons.count();
  let tested = 0;
  for (let i = 0; i < Math.min(count, 15); i++) {
    const btn = buttons.nth(i);
    const text = (await btn.textContent())?.trim() || '';
    if (!text || text === 'وضع داكن') continue;
    if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
      try {
        await btn.click({ timeout: 2000 });
        await page.waitForTimeout(500);
        tested++;
        // Close any modal
        const closeBtns = page.locator('button:has-text("إلغاء"), button:has-text("إغلاق"), [aria-label="Close"]');
        for (let j = 0; j < await closeBtns.count(); j++) {
          const cb = closeBtns.nth(j);
          if (await cb.isVisible({ timeout: 300 }).catch(() => false))
            await cb.click({ timeout: 1000 }).catch(() => {});
        }
        await page.waitForTimeout(300);
      } catch (e) {
        fail(pageName, `Button: ${text}`, e.message.slice(100));
      }
    }
  }
  return tested;
}

async function testInputs(page, pageName) {
  const inputs = page.locator('input:not([type="hidden"]):not([type="submit"]), select, textarea');
  const count = await inputs.count();
  for (let i = 0; i < Math.min(count, 5); i++) {
    const inp = inputs.nth(i);
    if (!await inp.isVisible({ timeout: 300 }).catch(() => false)) continue;
    const type = await inp.getAttribute('type').catch(() => '');
    if (type === 'checkbox' || type === 'radio') continue;
    try {
      const tag = await inp.evaluate(el => el.tagName);
      if (tag === 'SELECT') {
        await inp.selectOption({ index: 1 }).catch(() => {});
      } else {
        await inp.fill('test', { timeout: 1000 });
      }
    } catch (e) {
      fail(pageName, 'Input', e.message.slice(100));
    }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'ar-SA' });
  const page = await ctx.newPage();

  // Capture console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(`PAGE: ${err.message}`));

  // ---- 1. REGISTER / LOGIN ----
  console.log('\n=== 1. REGISTER/LOGIN ===');
  const loggedIn = await registerAndLogin(page, ctx);
  if (!loggedIn) {
    console.log('  FAILED: could not login');
    fail('Login', 'Auth', 'Login failed');
    await browser.close();
    fs.writeFileSync(`${ARTIFACTS}/results.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  pass();
  console.log('  Login OK');
  await page.screenshot({ path: `${ARTIFACTS}/00-login.png`, fullPage: true });

  // ---- 2. VISIT DASHBOARD ----
  console.log('\n=== 2. DASHBOARD ===');
  // SPA may have long-pooling — use domcontentloaded instead of networkidle
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  // Wait for the app shell to render
  await page.waitForSelector('#root', { timeout: 10000 });
  // Wait a beat for JS bundle to initialize
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${ARTIFACTS}/01-dashboard.png`, fullPage: true });

  const body = await page.textContent('body');
  if (body.includes('لوحة التحكم')) {
    pass();
    console.log('  Dashboard loaded OK');

    // Test dashboard buttons
    const tested = await testPageInteractive(page, 'Dashboard');
    console.log(`  Tested ${tested} buttons on dashboard`);
  } else {
    fail('Dashboard', 'Page load', 'لوحة التحكم text not found');
    console.log('  Dashboard FAILED: main text not found');
  }

  // ---- 3. NAVIGATE ALL PAGES ----
  console.log('\n=== 3. NAVIGATE ALL PAGES ===');
  for (let i = 0; i < NAV_ITEMS.length; i++) {
    const navText = NAV_ITEMS[i];
    console.log(`\n  [${i + 1}/${NAV_ITEMS.length}] ${navText}`);

    // Refresh to dashboard first
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const found = await clickNav(page, navText);
    if (!found) {
      fail(navText, 'Navigation', 'Nav item not found in sidebar');
      console.log(`    SKIP: nav item not found`);
      continue;
    }
    await page.waitForTimeout(2000);

    // Screenshot
    const safeName = navText.replace(/[/\\?%*:|"<>]/g, '-');
    await page.screenshot({ path: `${ARTIFACTS}/page-${safeName}.png`, fullPage: true });
    console.log(`    Screenshot saved`);

    // Test button interactions
    const btnsTested = await testPageInteractive(page, navText);
    console.log(`    Buttons tested: ${btnsTested}`);

    // Test inputs
    await testInputs(page, navText);

    pass();
    console.log(`    PASS`);
  }

  // ---- 4. STYLE FEATURES ----
  console.log('\n=== 4. STYLE FEATURES ===');
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Dark mode toggle
  const darkBtn = page.locator('button:has-text("وضع داكن")').first();
  if (await darkBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await darkBtn.click();
    await page.waitForTimeout(500);
    await darkBtn.click();
    await page.waitForTimeout(500);
    pass();
    console.log('  Dark mode toggle: OK');
  } else {
    console.log('  Dark mode toggle: not found');
  }

  // Refresh button
  const refreshBtn = page.locator('button:has-text("تحديث")').first();
  if (await refreshBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await refreshBtn.click();
    await page.waitForTimeout(1500);
    pass();
    console.log('  Refresh button: OK');
  } else {
    console.log('  Refresh button: not found');
  }

  // ---- 5. CONSOLE ERRORS ----
  console.log('\n=== 5. CONSOLE ERRORS ===');
  const filteredErrors = consoleErrors.filter(e =>
    !e.includes('401') && !e.includes('404') && !e.includes('favicon') &&
    !e.includes('ML-') && !e.includes('ERR_BLOCKED')
  );
  if (filteredErrors.length > 0) {
    console.log(`  Found ${filteredErrors.length} console errors:`);
    filteredErrors.forEach(e => {
      console.log(`    [ERROR] ${e.slice(200)}`);
      fail('Console', 'error', e.slice(200));
    });
  } else {
    console.log('  No console errors');
    pass();
  }

  // ---- RESULTS ----
  await browser.close();
  console.log('\n' + '='.repeat(60));
  console.log('E2E TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`Pass: ${results.pass}, Fail: ${results.fail}`);
  console.log('\nFailures:');
  results.errors.forEach(e => console.log(`  [${e.page}] ${e.elem}: ${e.issue.slice(120)}`));

  fs.writeFileSync(`${ARTIFACTS}/results.json`, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${ARTIFACTS}/results.json`);
  console.log(`Screenshots saved to ${ARTIFACTS}/`);
}

main().catch(console.error);
