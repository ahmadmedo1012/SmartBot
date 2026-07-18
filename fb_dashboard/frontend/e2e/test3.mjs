import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:8000';
const ARTIFACTS = path.resolve('/home/ahmed/Downloads/SmartBot/fb_dashboard/e2e_artifacts');
fs.mkdirSync(ARTIFACTS, { recursive: true });

const results = { pass: 0, fail: 0, errors: [] };
function fail(p, e, i) { results.fail++; results.errors.push({ page: p, elem: e, issue: i }); }
function pass() { results.pass++; }

const NAV = [
  'لوحة التحكم', 'الرسائل', 'التعليقات', 'القواعد', 'الردود',
  'الردود السريعة', 'التدفقات', 'AI الذكي', 'الوكيل الذكي',
  'المنشورات', 'تقويم المحتوى', 'العروض', 'المشتركين', 'التسلسلات',
  'البث الجماعي', 'التقارير', 'التحليلات', 'السجل المباشر',
  'الإعلانات', 'المستخدمين', 'الإعدادات',
];

async function getToken() {
  // First register if needed, then login
  const resp = await fetch(`${BASE}/api/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=testadmin&email=test@example.com&password=test123456',
  });
  const loginResp = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=testadmin&password=test123456',
  });
  // Extract cookie from set-cookie header
  const cookies = loginResp.headers.getSetCookie?.() || [];
  const tokenCookie = cookies.find(c => c.startsWith('token='));
  if (tokenCookie) {
    const match = tokenCookie.match(/token=([^;]+)/);
    if (match) return match[1];
  }
  // Fallback: parse from Headers
  const raw = loginResp.headers.get('set-cookie') || '';
  const m = raw.match(/token=([^;]+)/);
  return m?.[1] || null;
}

async function main() {
  // Get a token first (Node.js fetch, not browser)
  const token = await getToken();
  console.log(`Token: ${token ? token.slice(0, 50) + '...' : 'NONE'}`);
  if (!token) {
    console.log('Failed to get token');
    fail('Setup', 'Auth', 'No token from API');
    console.log(JSON.stringify(results));
    return;
  }

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'ar-SA' });

  // Set cookie directly in browser context
  await ctx.addCookies([
    { name: 'token', value: token, domain: 'localhost', path: '/' }
  ]);
  console.log('Cookie set in browser context');

  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(`PAGE: ${err.message}`));

  // Go to app
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${ARTIFACTS}/00-login-check.png`, fullPage: true });

  // Check if authenticated
  const bodyText = await page.textContent('body');
  const isAuthed = bodyText.includes('لوحة التحكم') || bodyText.includes('testadmin') || bodyText.includes('admin');
  console.log(`Auth status: ${isAuthed ? 'LOGGED IN' : 'NOT LOGGED IN'}`);

  if (!isAuthed) {
    fail('Login', 'Auth', 'Cookie auth not working via context.addCookies');
    // Let's try by directly calling API from browser with the cookie set
    const meCheck = await page.evaluate(async (t) => {
      document.cookie = `token=${t}`;
      const r = await fetch('/api/me');
      return r.status.toString() + ': ' + (await r.text()).slice(50);
    }, token);
    console.log(`  /api/me with doc.cookie: ${meCheck}`);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${ARTIFACTS}/01-retry.png`, fullPage: true });
    const bt2 = await page.textContent('body');
    if (!bt2.includes('لوحة التحكم')) {
      console.log('  Still not authenticated. Exiting.');
      await browser.close();
      console.log(JSON.stringify(results, null, 2));
      fs.writeFileSync(`${ARTIFACTS}/results.json`, JSON.stringify(results, null, 2));
      return;
    }
  }

  pass();
  await page.screenshot({ path: `${ARTIFACTS}/02-dashboard.png`, fullPage: true });

  // NAVIGATE ALL PAGES
  console.log('\n=== NAVIGATE ALL PAGES ===');
  for (let i = 0; i < NAV.length; i++) {
    const navText = NAV[i];
    console.log(`  [${i+1}/${NAV.length}] ${navText}`);

    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);

    const selectors = [
      'a', 'button', '[class*="nav"]', '[class*="sidebar"]', '[class*="navigation"]'
    ];
    let clicked = false;
    for (const sel of selectors) {
      const el = page.locator(`${sel}:has-text("${navText}")`).first();
      if (await el.isVisible({ timeout: 800 }).catch(() => false)) {
        await el.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      fail(navText, 'Nav', 'Not found');
      console.log('    SKIP');
      continue;
    }

    await page.waitForTimeout(2000);
    const safe = navText.replace(/[/\\?%*:|"<>]/g, '-');
    await page.screenshot({ path: `${ARTIFACTS}/page-${safe}.png`, fullPage: true });

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
          const closeBtns = page.locator(
            'button:has-text("إلغاء"), button:has-text("إغلاق"), button:has-text("إلغاء الأمر"), [aria-label="Close"]'
          );
          for (let k = 0; k < await closeBtns.count(); k++) {
            const cb = closeBtns.nth(k);
            if (await cb.isVisible({ timeout: 300 }).catch(() => false))
              await cb.click({ timeout: 1000 }).catch(() => {});
          }
        } catch (e) {
          fail(navText, `Btn:${text.slice(0,20)}`, e.message.slice(80));
        }
      }
    }
    console.log(`    Buttons: ${tested}`);
    pass();
  }

  // CONSOLE ERRORS
  const filtered = consoleErrors.filter(e =>
    !e.includes('401') && !e.includes('404') && !e.includes('favicon') &&
    !e.includes('ERR_ABORTED') && !e.includes('ML-') &&
    !e.includes('Failed to load resource')
  );
  if (filtered.length) {
    filtered.forEach(e => { console.log(`  [CONSOLE] ${e.slice(200)}`); fail('Console', 'error', e.slice(200)); });
  } else { pass(); console.log('  No console errors'); }

  // DARK MODE
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1500);
  const dark = page.locator('button:has-text("وضع داكن")').first();
  if (await dark.isVisible({ timeout: 1000 }).catch(() => false)) {
    await dark.click(); await page.waitForTimeout(500);
    await dark.click(); await page.waitForTimeout(500);
    pass(); console.log('  Dark mode: OK');
  }

  await browser.close();
  console.log(`\nRESULTS: Pass ${results.pass}, Fail ${results.fail}`);
  results.errors.forEach(e => console.log(`  [${e.page}] ${e.elem}: ${e.issue.slice(120)}`));
  fs.writeFileSync(`${ARTIFACTS}/results.json`, JSON.stringify(results, null, 2));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
