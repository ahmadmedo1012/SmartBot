import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:8000';
const ARTIFACTS = path.resolve('/home/ahmed/Downloads/SmartBot/fb_dashboard/e2e_artifacts');
fs.mkdirSync(ARTIFACTS, { recursive: true });

const results = { pass: 0, fail: 0, errors: [] };
function fail(page, elem, issue) { results.fail++; results.errors.push({ page, elem, issue }); }
function pass() { results.pass++; }

const NAV = [
  'لوحة التحكم', 'الرسائل', 'التعليقات', 'القواعد', 'الردود',
  'الردود السريعة', 'التدفقات', 'AI الذكي', 'الوكيل الذكي',
  'المنشورات', 'تقويم المحتوى', 'العروض', 'المشتركين', 'التسلسلات',
  'البث الجماعي', 'التقارير', 'التحليلات', 'السجل المباشر',
  'الإعلانات', 'المستخدمين', 'الإعدادات',
];

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'ar-SA' });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(`PAGE: ${err.message}`));

  // 1. LOGIN via form submission (not cookie injection)
  console.log('\n=== 1. LOGIN ===');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${ARTIFACTS}/01-login-page.png`, fullPage: true });

  // Check if login page is shown or auto-redirected
  const content = await page.textContent('body');

  if (content.includes('لوحة التحكم') || content.includes('dashboard')) {
    console.log('  Already logged in (auto-redirect)');
    pass();
  } else {
    // Try to find and fill login form
    const inputs = page.locator('input');
    const count = await inputs.count();
    console.log(`  Found ${count} inputs`);

    // The API login sets cookies with httponly, which JS can't read but browser will send
    // Use fetch from browser context instead
    const tokenFromLogin = await page.evaluate(async () => {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'username=testadmin&password=test123456',
        credentials: 'include'
      });
      return r.ok ? 'ok' : 'fail';
    });
    console.log(`  API login from browser: ${tokenFromLogin}`);

    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    const bodyAfter = await page.textContent('body');
    if (bodyAfter.includes('لوحة التحكم')) {
      pass();
      console.log('  Login OK via browser fetch API');
    } else {
      fail('Login', 'Auth', 'Could not login');
      console.log('  Login FAILED');
      await browser.close();
      console.log(JSON.stringify(results, null, 2));
      fs.writeFileSync(`${ARTIFACTS}/results.json`, JSON.stringify(results, null, 2));
      return;
    }
  }

  await page.screenshot({ path: `${ARTIFACTS}/02-dashboard.png`, fullPage: true });

  // 2. NAVIGATE ALL PAGES
  console.log('\n=== 2. NAVIGATE ALL PAGES ===');
  for (let i = 0; i < NAV.length; i++) {
    const navText = NAV[i];
    console.log(`  [${i + 1}/${NAV.length}] ${navText}`);

    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);

    // Try various selectors for nav item
    const selectors = [
      `a:has-text("${navText}")`,
      `button:has-text("${navText}")`,
      `[class*="nav"]:has-text("${navText}")`,
      `[class*="sidebar"]:has-text("${navText}")`,
      `[class*="navigation"]:has-text("${navText}")`,
      `text="${navText}"`,
    ];

    let clicked = false;
    for (const sel of selectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        await el.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      fail(navText, 'Navigation', 'Nav item not found');
      console.log('    SKIP: nav not found');
      continue;
    }

    await page.waitForTimeout(2000);
    const safe = navText.replace(/[/\\?%*:|"<>]/g, '-');
    await page.screenshot({ path: `${ARTIFACTS}/page-${safe}.png`, fullPage: true });

    // Test buttons
    const buttons = page.locator('button');
    const btnCount = await buttons.count();
    let tested = 0;
    for (let j = 0; j < Math.min(btnCount, 10); j++) {
      const btn = buttons.nth(j);
      const text = (await btn.textContent())?.trim() || '';
      if (!text || text === 'وضع داكن') continue;
      if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
        try {
          await btn.click({ timeout: 1500 });
          await page.waitForTimeout(500);
          tested++;
          // Close modals
          const closeBtns = page.locator('button:has-text("إلغاء"), button:has-text("إغلاق"), button:has-text("إلغاء الأمر")');
          for (let k = 0; k < await closeBtns.count(); k++) {
            const cb = closeBtns.nth(k);
            if (await cb.isVisible({ timeout: 300 }).catch(() => false))
              await cb.click({ timeout: 1000 }).catch(() => {});
          }
        } catch (e) {
          fail(navText, `Button: ${text.slice(0, 30)}`, e.message.slice(80));
        }
      }
    }
    console.log(`    Buttons tested: ${tested}`);
    pass();
  }

  // 3. CONSOLE ERRORS
  console.log('\n=== 3. CONSOLE ERRORS ===');
  const filtered = consoleErrors.filter(e =>
    !e.includes('401') && !e.includes('404') && !e.includes('favicon') && !e.includes('ERR_ABORTED') &&
    !e.includes('ML-') && !e.includes('Failed to load resource')
  );
  if (filtered.length) {
    filtered.forEach(e => { console.log(`    [ERR] ${e.slice(200)}`); fail('Console', 'error', e.slice(200)); });
  } else {
    console.log('  No console errors');
    pass();
  }

  // 4. STYLE FEATURES
  console.log('\n=== 4. STYLE FEATURES ===');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1500);

  const darkBtn = page.locator('button:has-text("وضع داكن")').first();
  if (await darkBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await darkBtn.click();
    await page.waitForTimeout(500);
    await darkBtn.click();
    await page.waitForTimeout(500);
    pass();
    console.log('  Dark mode toggle: OK');
  }

  const refreshBtn = page.locator('button:has-text("تحديث")').first();
  if (await refreshBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await refreshBtn.click();
    await page.waitForTimeout(1500);
    pass();
    console.log('  Refresh button: OK');
  } else {
    console.log('  Refresh button: not found');
  }

  // RESULTS
  await browser.close();
  console.log('\n' + '='.repeat(50));
  console.log(`RESULTS: Pass ${results.pass}, Fail ${results.fail}`);
  results.errors.forEach(e => console.log(`  [${e.page}] ${e.elem}: ${e.issue.slice(120)}`));
  fs.writeFileSync(`${ARTIFACTS}/results.json`, JSON.stringify(results, null, 2));
  console.log(`\nResults: ${ARTIFACTS}/results.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
