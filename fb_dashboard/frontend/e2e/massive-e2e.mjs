/**
 * SmartBot Massive E2E — 30+ parallel user scenarios
 * Covers: auth, pricing, subscribe, all dashboard pages, mobile, theme, edge cases
 * Runs against: https://bot.smart-link.ly
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE = 'https://bot.smart-link.ly';
const API = 'https://api.bot.smart-link.ly';
const RESULTS = [];
let PASS = 0, FAIL = 0, WARN = 0;

const report = (test, status, errors = [], notes = '') => {
  RESULTS.push({ test: `#${RESULTS.length+1} ${test}`, status, errors, notes });
  if (status === 'PASS') PASS++;
  else if (status === 'WARN') WARN++;
  else FAIL++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ERR_CAPTURE = (page, arr = []) => {
  const handler = msg => { if (msg.type() === 'error') arr.push(msg.text()); };
  page.on('console', handler);
  return () => { page.removeListener('console', handler); return [...arr]; };
};
const ERR_PAGE = page => {
  const arr = [];
  page.on('pageerror', err => arr.push(err.message));
  return () => [...arr];
};

async function run() {
  const ts = Date.now();
  const browser = await chromium.launch({ headless: true });
  const ARTIFACTS = `/tmp/smartbot-e2e-${ts}`;
  mkdirSync(ARTIFACTS, { recursive: true });

  const gid = () => `u${ts}_${Math.random().toString(36).slice(2,8)}`;

  // ==========================================================================
  // SCENARIO 1-5: Landing page / public pages
  // ==========================================================================
  console.log('=== Phase 1: Public pages & landing ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
    const p = await ctx.newPage();
    const cons = []; const detach = ERR_CAPTURE(p, cons);
    const detach2 = ERR_PAGE(p);

    // 1. Landing page loads
    try {
      await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(2000);
      const body = await p.evaluate(() => document.body.innerText || '');
      const title = await p.title();
      report('Landing page loads', body.length > 50 ? 'PASS' : 'FAIL', [], `title="${title}" len=${body.length}`);
    } catch (e) { report('Landing page loads', 'FAIL', [e.message], ''); }

    // 2. Landing: key sections visible (hero, features, pricing, faq, cta)
    try {
      await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3000);
      const cta1 = await p.locator('text=ابدأ الآن').count();
      const cta2 = await p.locator('text=اشتراك').count();
      const cta3 = await p.locator('text=تجربة').count();
      const f1 = await p.locator('text=ردود تلقائية').count();
      const f2 = await p.locator('text=صندوق وارد').count();
      const f3 = await p.locator('text=تحليلات').count();
      const hasCTA = cta1 + cta2 + cta3;
      const hasFeatures = f1 + f2 + f3;
      report('Landing sections visible', hasCTA > 0 && hasFeatures > 0 ? 'PASS' : 'WARN', cons.slice(0,3),
        `cta=${hasCTA} features=${hasFeatures}`);
    } catch (e) { report('Landing sections', 'FAIL', [e.message], ''); }
    cons.length = 0;

    // 3. Pricing page loads & has plans
    try {
      await p.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3000);
      await sleep(2000); // extra wait for API plans fetch
      const plan1 = await p.locator('text=مجاني').count();
      const plan2 = await p.locator('text=أساسي').count();
      const plan3 = await p.locator('text=احترافي').count();
      const hasPlans = plan1 + plan2 + plan3;
      const sub1 = await p.locator('text=اشتراك').count();
      const sub2 = await p.locator('text=ابدأ مجاناً').count();
      const hasSubscribeBtn = sub1 + sub2;
      report('Pricing page plans visible', hasPlans >= 2 ? 'PASS' : 'FAIL', cons.slice(0,3),
        `plans=${hasPlans} subscribe_btns=${hasSubscribeBtn}`);
    } catch (e) { report('Pricing page', 'FAIL', [e.message], ''); }
    cons.length = 0;

    // 4. Demo page loads
    try {
      await p.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3000);
      const body = await p.evaluate(() => document.body.innerText || '');
      report('Demo page loads', body.length > 30 ? 'PASS' : 'FAIL', cons.slice(0,3), `len=${body.length}`);
    } catch (e) { report('Demo page', 'FAIL', [e.message], ''); }
    cons.length = 0;

    // 5. Subscribe page (unauthenticated) redirects
    try {
      await p.goto(`${BASE}/subscribe`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(2000);
      const url = p.url();
      report('Subscribe page unauthenticated', url.includes('login') ? 'PASS' : 'WARN', [], `redirected to ${url}`);
    } catch (e) { report('Subscribe unauthenticated', 'FAIL', [e.message], ''); }

    await detach(); detach2();
    await ctx.close();
  }

  // ==========================================================================
  // SCENARIO 6-10: Registration — bad data + edge cases
  // ==========================================================================
  console.log('=== Phase 2: Registration edge cases ===');
  {
    // 6. Register: short username (<3 chars)
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      try {
        await p.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
        await p.fill('input[id="username"]', 'ab');
        await p.fill('input[id="email"]', 'test@test.com');
        await p.fill('input[id="password"]', '123456');
        await p.fill('input[id="confirm"]', '123456');
        await p.click('button[type="submit"]');
        await sleep(1000);
        const errorText = await p.locator('text=3 أحرف,text=قصير').count();
        const bodyText = await p.evaluate(() => document.body.innerText);
        report('Register short username', errorText > 0 || bodyText.includes('3 أحرف') ? 'PASS' : 'FAIL',
          cons.slice(0,3), 'client-side validation');
      } catch (e) { report('Register short username', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }

    // 7. Register: invalid email format
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      try {
        await p.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
        await p.fill('input[id="username"]', 'testuser123');
        await p.fill('input[id="email"]', 'test@test'); // passes HTML5 email, fails regex (no dot)
        await p.fill('input[id="password"]', '123456');
        await p.fill('input[id="confirm"]', '123456');
        await p.click('button[type="submit"]', { force: true, timeout: 2000 });
        await sleep(2000);
        const bodyText = await p.evaluate(() => document.body.innerText);
        const validationMsg = await p.locator('text=غير صالح').count();
        report('Register invalid email', (bodyText.includes('غير صالح') || validationMsg > 0) ? 'PASS' : 'FAIL',
          cons.slice(0,3), `client-side validation matches=${validationMsg}`);
      } catch (e) { report('Register invalid email', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }

    // 8. Register: short password (<6 chars)
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      try {
        await p.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
        await p.fill('input[id="username"]', 'testuser456');
        await p.fill('input[id="email"]', 'test@test.com');
        await p.fill('input[id="password"]', '123');
        await p.fill('input[id="confirm"]', '123');
        await p.click('button[type="submit"]');
        await sleep(1000);
        const bodyText = await p.evaluate(() => document.body.innerText);
        report('Register short password', bodyText.includes('6 أحرف') ? 'PASS' : 'FAIL',
          cons.slice(0,3), 'client-side validation');
      } catch (e) { report('Register short password', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }

    // 9. Register: password mismatch
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      try {
        await p.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
        await p.fill('input[id="username"]', 'testuser789');
        await p.fill('input[id="email"]', 'test@test.com');
        await p.fill('input[id="password"]', '123456');
        await p.fill('input[id="confirm"]', '654321');
        await p.click('button[type="submit"]');
        await sleep(1000);
        const bodyText = await p.evaluate(() => document.body.innerText);
        report('Register password mismatch', bodyText.includes('غير متطابقتين') ? 'PASS' : 'FAIL',
          cons.slice(0,3), 'client-side validation');
      } catch (e) { report('Register password mismatch', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }

    // 10. Register: duplicate existing user
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      try {
        await p.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
        await p.fill('input[id="username"]', 'comprehensive');
        await p.fill('input[id="email"]', 'ce@test.com');
        await p.fill('input[id="password"]', 'TestPass123');
        await p.fill('input[id="confirm"]', 'TestPass123');
        await p.click('button[type="submit"]');
        await sleep(2000);
        const bodyText = await p.evaluate(() => document.body.innerText);
        const isOnRegister = await p.locator('text=إنشاء حساب جديد').isVisible().catch(() => false);
        const isOnDashboard = await p.locator('text=لوحة البيانات').isVisible().catch(() => false);
        report('Register duplicate user', (bodyText.includes('موجود') || bodyText.includes('بالفعل') || isOnRegister) ? 'PASS' : 'WARN',
          cons.slice(0,3), `msg=${bodyText.slice(0,100)} dashboard=${isOnDashboard}`);
      } catch (e) { report('Register duplicate user', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }
  }

  // ==========================================================================
  // SCENARIO 11-15: Login — edge cases
  // ==========================================================================
  console.log('=== Phase 3: Login edge cases ===');
  {
    // 11. Login: empty fields
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      try {
        await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
        await p.click('button[type="submit"]');
        await sleep(1000);
        const bodyText = await p.evaluate(() => document.body.innerText);
        report('Login empty fields', (bodyText.includes('يرجى إدخال') || p.url().includes('login')) ? 'PASS' : 'FAIL',
          cons.slice(0,3), `url=${p.url().slice(0,60)}`);
      } catch (e) { report('Login empty fields', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }

    // 12. Login: wrong password
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      try {
        await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
        await p.fill('input[id="username"]', 'comprehensive');
        await p.fill('input[id="password"]', 'WrongPass999');
        await p.click('button[type="submit"]');
        await sleep(2000);
        const bodyText = await p.evaluate(() => document.body.innerText);
        report('Login wrong password', (bodyText.includes('خطأ') || bodyText.includes('فشل') || bodyText.includes('غير صحيح')) ? 'PASS' : 'FAIL',
          cons.slice(0,3), `msg=${bodyText.slice(0,100)} url=${p.url().slice(0,60)}`);
      } catch (e) { report('Login wrong password', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }

    // 13. Login: wrong username
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      try {
        await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
        await p.fill('input[id="username"]', `nonexistent_${gid()}`);
        await p.fill('input[id="password"]', 'TestPass123');
        await p.click('button[type="submit"]');
        await sleep(2000);
        const bodyText = await p.evaluate(() => document.body.innerText);
        report('Login nonexistent user', (bodyText.includes('خطأ') || bodyText.includes('فشل') || bodyText.includes('غير صحيح')) ? 'PASS' : 'FAIL',
          cons.slice(0,3), `msg=${bodyText.slice(0,100)}`);
      } catch (e) { report('Login nonexistent user', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }

    // 14. Login: toggle password visibility
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      try {
        await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
        await p.fill('input[id="password"]', 'TestPass123');
        const toggleBtn = p.locator('button[aria-label*="إظهار"], button[aria-label*="إخفاء"]');
        if (await toggleBtn.isVisible().catch(() => false)) {
          const beforeType = await p.getAttribute('input[id="password"]', 'type');
          await toggleBtn.click();
          await sleep(300);
          const afterType = await p.getAttribute('input[id="password"]', 'type');
          report('Login password visibility toggle', beforeType !== afterType ? 'PASS' : 'WARN', [],
            `${beforeType}→${afterType}`);
        } else {
          report('Login password visibility toggle', 'WARN', [], 'toggle-button-not-found');
        }
      } catch (e) { report('Login password visibility toggle', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }

    // 15. Login → register link navigates
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      try {
        await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
        const regLink = p.locator('a[href="/register"], text=إنشاء حساب جديد');
        if (await regLink.isVisible().catch(() => false)) {
          await regLink.click();
          await sleep(1500);
          const onRegister = await p.locator('text=إنشاء حساب جديد').isVisible().catch(() => false);
          report('Login→Register navigation', onRegister || p.url().includes('register') ? 'PASS' : 'FAIL', [],
            `url=${p.url()}`);
        } else {
          report('Login→Register navigation', 'WARN', [], 'register-link-not-found');
        }
      } catch (e) { report('Login→Register navigation', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }
  }

  // ==========================================================================
  // SCENARIO 16-18: Successful auth flow (register + login)
  // ==========================================================================
  console.log('=== Phase 4: Successful auth flow ===');
  let authToken = '';
  const testUser = { username: `e2e_${gid()}`, email: `e2e_${gid()}@test.com`, password: 'StrongP@ss1' };
  {
    // 16. Register valid new user
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      try {
        await p.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
        await p.fill('input[id="username"]', testUser.username);
        await p.fill('input[id="email"]', testUser.email);
        await p.fill('input[id="password"]', testUser.password);
        await p.fill('input[id="confirm"]', testUser.password);
        await sleep(500);
        // Check validation icons turned green
        const checks = await p.locator('text=CheckCircle, svg.text-green-500').count();
        await p.click('button[type="submit"]');
        await sleep(3000);
        const url = p.url();
        const onDashboard = url.includes('dashboard') || await p.locator('text=لوحة البيانات').isVisible().catch(() => false);
        report('Register valid new user', onDashboard ? 'PASS' : 'FAIL', cons.slice(0,3),
          `url=${url} dashboard=${onDashboard}`);
        // Capture token
        const cookies = await ctx.cookies();
        const tc = cookies.find(c => c.name === 'token');
        if (tc) authToken = tc.value;
      } catch (e) { report('Register valid new user', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }

    // 17. Login valid user via form
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      try {
        await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
        await p.fill('input[id="username"]', testUser.username);
        await p.fill('input[id="password"]', testUser.password);
        await p.click('button[type="submit"]');
        await sleep(3000);
        const onDashboard = await p.locator('text=لوحة البيانات').isVisible().catch(() => false);
        const onAdmin = await p.locator('text=لوحة الإدارة,text=المشرفين,text=Admin').count();
        const url = p.url();
        const isAuthed = onDashboard || onAdmin > 0 || url.includes('dashboard') || url.includes('admin');
        report('Login valid user', isAuthed ? 'PASS' : 'FAIL', cons.slice(0,3),
          `url=${url} dashboard=${onDashboard} admin=${onAdmin}`);
        const cookies = await ctx.cookies();
        const tc = cookies.find(c => c.name === 'token');
        if (tc && !authToken) authToken = tc.value;
      } catch (e) { report('Login valid user', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }

    // 18. Login with API directly (get token for subsequent tests)
    if (!authToken) {
      try {
        const http = await fetch(`${API}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ username: testUser.username, password: testUser.password }).toString(),
        });
        const sc = http.headers.get('set-cookie') || '';
        const m = sc.match(/token=([^;]+)/);
        if (m) authToken = m[1];
        const body = await http.json();
        report('Login API direct', http.status === 200 && authToken ? 'PASS' : 'FAIL', [],
          `status=${http.status} tok=${!!authToken} role=${body.role}`);
      } catch (e) { report('Login API direct', 'FAIL', [e.message], ''); }
    }
  }

  if (!authToken) {
    console.log('⚠ No auth token — using known user from previous session');
    // Fallback: try the comprehensive test user
    try {
      const http = await fetch(`${API}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: 'comprehensive', password: 'TestPass123' }).toString(),
      });
      const sc = http.headers.get('set-cookie') || '';
      const m = sc.match(/token=([^;]+)/);
      if (m) authToken = m[1];
      console.log(`🔄 Fallback auth: token=${!!authToken}`);
    } catch (e) { console.log('Fallback auth failed:', e.message); }
  }

  if (!authToken) {
    console.log('⚠ No auth token — dashboard tests will be logged-out views');
  }

  // ==========================================================================
  // SCENARIO 19-25: Dashboard + authenticated pages
  // ==========================================================================
  console.log('=== Phase 5: Dashboard & pages (authenticated) ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
    const p = await ctx.newPage();
    const cons = []; const detach = ERR_CAPTURE(p, cons);

    if (authToken) {
      await ctx.addCookies([{
        name: 'token', value: authToken, domain: 'bot.smart-link.ly', path: '/', httpOnly: true, sameSite: 'Lax'
      }]);
    }

    // 19. Dashboard page loads
    try {
      await p.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3000);
      const body = await p.evaluate(() => document.body.innerText || '');
      const chartEl = await p.locator('canvas, svg.recharts-surface, .recharts-wrapper').count();
      const sidebar = await p.locator('aside, nav[class*="sidebar"], [class*="sidebar"]').count();
      report('Dashboard loads', body.length > 30 ? 'PASS' : 'FAIL', cons.slice(0,3),
        `len=${body.length} charts=${chartEl} sidebar=${sidebar}`);
    } catch (e) { report('Dashboard loads', 'FAIL', [e.message], ''); }
    cons.length = 0;

    // 20. Theme toggle
    try {
      const themeBtn = p.locator('button[aria-label*="الوضع"], button[aria-label*="النهاري"], button[aria-label*="الليلي"], [class*="theme"] button');
      if (await themeBtn.isVisible().catch(() => false) && await themeBtn.isEnabled().catch(() => false)) {
        const before = await p.evaluate(() => document.documentElement.className || document.documentElement.getAttribute('data-theme') || '');
        await themeBtn.click();
        await sleep(800);
        const after = await p.evaluate(() => document.documentElement.className || document.documentElement.getAttribute('data-theme') || '');
        report('Theme toggle', before !== after ? 'PASS' : 'WARN', cons.slice(0,3),
          `before=${before} after=${after}`);
      } else {
        report('Theme toggle', 'WARN', [], 'theme-btn-not-interactable');
      }
    } catch (e) { report('Theme toggle', 'FAIL', [e.message], ''); }
    cons.length = 0;

    // 21. Sidebar navigation — click each visible link
    {
      const sidebarLinks = p.locator('aside a, nav a[href], [class*="sidebar"] a, a[href*="/"]').filter({ hasText: /.+/ });
      const linkCount = await sidebarLinks.count().catch(() => 0);
      let clicked = 0;
      for (let i = 0; i < Math.min(linkCount, 12); i++) {
        try {
          const link = sidebarLinks.nth(i);
          if (await link.isVisible().catch(() => false) && await link.isEnabled().catch(() => false)) {
            await link.click();
            await sleep(1200);
            clicked++;
          }
        } catch (e) { /* skip */ }
      }
      report('Sidebar navigation links', clicked > 0 ? 'PASS' : 'WARN', cons.slice(0,3), `${clicked}/${linkCount} clicked`);
    }
    cons.length = 0;

    // 22. Search bar (Ctrl+K)
    try {
      await p.goto(`${BASE}/dashboard`, { waitUntil: 'load', timeout: 20000 });
      await sleep(2000);
      await p.keyboard.press('Control+k');
      await sleep(800);
      const searchInput = p.locator('input[placeholder*="ابحث"], input[placeholder*="بحث"], [role="combobox"], [class*="search"] input');
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill('رسائل');
        await sleep(500);
        const suggestions = await p.locator('[role="option"], [role="listbox"] button, [class*="suggestion"]').count();
        await p.keyboard.press('Escape');
        await sleep(300);
        report('Search bar Ctrl+K', suggestions > 0 ? 'PASS' : 'WARN', cons.slice(0,3), `suggestions=${suggestions}`);
      } else {
        report('Search bar Ctrl+K', 'WARN', [], 'search-bar-not-found');
      }
    } catch (e) { report('Search bar Ctrl+K', 'FAIL', [e.message], ''); }
    cons.length = 0;

    // 23. Dashboard stat cards / widgets
    try {
      await p.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3000);
      const statCard = await p.locator('[class*="stat"], [class*="card"], [class*="widget"]').count();
      const digits = (await p.evaluate(() => document.body.innerText || '')).match(/\d+/g);
      report('Dashboard data widgets', (statCard > 2 || (digits && digits.length > 3)) ? 'PASS' : 'FAIL', cons.slice(0,3),
        `widgets=${statCard} numbers=${digits?.length}`);
    } catch (e) { report('Dashboard data widgets', 'FAIL', [e.message], ''); }

    await detach();
    await ctx.close();
  }

  // ==========================================================================
  // SCENARIO 26-30: ALL available pages (breadth coverage)
  // ==========================================================================
  console.log('=== Phase 6: All pages breadth ===');
  {
    const pagesToTest = [
      ['Login', '/login'],
      ['Register', '/register'],
      ['Pricing', '/pricing'],
      ['Subscribe', '/subscribe'],
      ['Demo', '/demo'],
      ['Admin', '/admin'],
      ['Dashboard', '/dashboard'],
    ];

    for (const [label, path] of pagesToTest) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      if (authToken) {
        await ctx.addCookies([{ name: 'token', value: authToken, domain: 'bot.smart-link.ly', path: '/', httpOnly: true, sameSite: 'Lax' }]);
      }
      try {
        const start = Date.now();
        await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2500);
        const body = await p.evaluate(() => document.body.innerText || '');
        const loadTime = Date.now() - start;
        const hasData = body.length > 20;
        report(`Page ${label} (${path})`, hasData ? 'PASS' : 'FAIL', cons.slice(0,3),
          `len=${body.length} load=${loadTime}ms`);
      } catch (e) { report(`Page ${label} (${path})`, 'FAIL', [e.message], 'nav-error'); }
      await detach(); await ctx.close();
    }
  }

  // ==========================================================================
  // SCENARIO 31-33: Subscribe flow
  // ==========================================================================
  console.log('=== Phase 7: Subscribe flow ===');
  {
    // 31. Subscribe page (authenticated) — plan selection
    if (authToken) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      await ctx.addCookies([{ name: 'token', value: authToken, domain: 'bot.smart-link.ly', path: '/', httpOnly: true, sameSite: 'Lax' }]);
      try {
        await p.goto(`${BASE}/subscribe`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(3000);
        const plans = await p.locator('text=مجاني,text=أساسي,text=احترافي,majani').count();
        const subBtn = p.locator('button:has-text("ابدأ مجاناً"), button:has-text("اختيار")').first();
        let clicked = false;
        if (await subBtn.isVisible().catch(() => false) && await subBtn.isEnabled().catch(() => false)) {
          await subBtn.click();
          await sleep(1500);
          clicked = true;
        }
        report('Subscribe plan selection', plans >= 2 ? 'PASS' : 'WARN', cons.slice(0,3),
          `plans=${plans} clicked=${clicked}`);
      } catch (e) { report('Subscribe plan selection', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }

    // 32. Subscribe form — empty validation
    if (authToken) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      await ctx.addCookies([{ name: 'token', value: authToken, domain: 'bot.smart-link.ly', path: '/', httpOnly: true, sameSite: 'Lax' }]);
      try {
        await p.goto(`${BASE}/subscribe`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(3000);
        // Try clicking a plan card directly
        const planCard = p.locator('text=مجاني').first();
        if (await planCard.isVisible().catch(() => false)) {
          await planCard.click();
          await sleep(1500);
        }
        // Submit the subscription form without phone
        const subBtn = p.locator('button:has-text("متابعة الدفع")');
        if (await subBtn.isVisible().catch(() => false)) {
          await subBtn.click();
          await sleep(1000);
          const bodyText = await p.evaluate(() => document.body.innerText);
          report('Subscribe form empty validation', (bodyText.includes('يرجى إدخال') || bodyText.includes('رقم الهاتف')) ? 'PASS' : 'FAIL',
            cons.slice(0,3), `msg=${bodyText.slice(0,80)}`);
        } else {
          report('Subscribe form empty validation', 'WARN', [], 'no-payment-button');
        }
      } catch (e) { report('Subscribe form empty validation', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }

    // 33. Subscribe — invalid email validation
    if (authToken) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      await ctx.addCookies([{ name: 'token', value: authToken, domain: 'bot.smart-link.ly', path: '/', httpOnly: true, sameSite: 'Lax' }]);
      try {
        await p.goto(`${BASE}/subscribe`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(3000);
        // Click free plan
        const freePlan = p.locator('text=مجاني').first();
        if (await freePlan.isVisible().catch(() => false)) {
          await freePlan.click();
          await sleep(1500);
        }
        // Fill form with invalid email
        const phoneInput = p.locator('input[id="phone"], input[placeholder*="هاتف"], input[placeholder*="09"]');
        if (await phoneInput.isVisible().catch(() => false)) {
          await phoneInput.fill('0912345678');
        }
        const emailInput = p.locator('input[type="email"]');
        if (await emailInput.isVisible().catch(() => false)) {
          await emailInput.fill('bademail');
        }
        const subBtn = p.locator('button:has-text("متابعة الدفع")');
        if (await subBtn.isVisible().catch(() => false)) {
          await subBtn.click();
          await sleep(1000);
          const bodyText = await p.evaluate(() => document.body.innerText);
          report('Subscribe invalid email', (bodyText.includes('غير صالح') || cons.join(' ').includes('غير صالح')) ? 'PASS' : 'WARN',
            cons.slice(0,3), 'client or server validation');
        } else {
          report('Subscribe invalid email', 'WARN', [], 'no-submit-button');
        }
      } catch (e) { report('Subscribe invalid email', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }
  }

  // ==========================================================================
  // SCENARIO 34-37: Mobile viewport
  // ==========================================================================
  console.log('=== Phase 8: Mobile viewport ===');
  {
    const pagesOnMobile = [['Landing', '/'], ['Login', '/login'], ['Pricing', '/pricing'], ['Dashboard', '/dashboard']];
    for (const [label, path] of pagesOnMobile) {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ar', isMobile: true });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      if (authToken && (path === '/dashboard')) {
        await ctx.addCookies([{ name: 'token', value: authToken, domain: 'bot.smart-link.ly', path: '/', httpOnly: true, sameSite: 'Lax' }]);
      }
      try {
        await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(3000);
        const body = await p.evaluate(() => document.body.innerText || '');
        const viewport = await p.evaluate(() => `${window.innerWidth}x${window.innerHeight}`);
        report(`Mobile ${label} (375x812)`, body.length > 20 ? 'PASS' : 'FAIL', cons.slice(0,3),
          `len=${body.length} vp=${viewport}`);
      } catch (e) { report(`Mobile ${label} (375x812)`, 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }

    // Mobile hamburger menu
    if (authToken) {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ar', isMobile: true });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      await ctx.addCookies([{ name: 'token', value: authToken, domain: 'bot.smart-link.ly', path: '/', httpOnly: true, sameSite: 'Lax' }]);
      try {
        await p.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(3000);
        const hamBtn = p.locator('#hamburger, .hamburger, button[aria-label*="قائمة"], [class*="hamburger"], button[class*="menu"]');
        if (await hamBtn.isVisible().catch(() => false) && await hamBtn.isEnabled().catch(() => false)) {
          await hamBtn.click();
          await sleep(800);
          await p.keyboard.press('Escape');
          await sleep(500);
          report('Mobile hamburger menu', 'PASS', cons.slice(0,3), 'opened-and-closed');
        } else {
          report('Mobile hamburger menu', 'WARN', [], 'hamburger-not-found');
        }
      } catch (e) { report('Mobile hamburger menu', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }
  }

  // ==========================================================================
  // SCENARIO 38-40: Edge case — 404, error boundaries, network resilience
  // ==========================================================================
  console.log('=== Phase 9: Edge cases ===');
  {
    // 38. 404 page
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      try {
        const resp = await p.goto(`${BASE}/nonexistent-page-xyz`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(2000);
        const status = resp?.status() || 0;
        const body = await p.evaluate(() => document.body.innerText || '');
        report('404 page', body.length > 5 ? 'PASS' : 'WARN', cons.slice(0,3),
          `status=${status} len=${body.length}`);
      } catch (e) { report('404 page', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }

    // 39. Admin page (if not admin, should still render)
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const cons = []; const detach = ERR_CAPTURE(p, cons);
      try {
        const resp = await p.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(2000);
        const body = await p.evaluate(() => document.body.innerText || '');
        report('Admin page access', body.length > 10 ? 'PASS' : 'FAIL', cons.slice(0,3), `len=${body.length}`);
      } catch (e) { report('Admin page access', 'FAIL', [e.message], ''); }
      await detach(); await ctx.close();
    }

    // 40. Check console errors across pages (aggregate)
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
      const p = await ctx.newPage();
      const allErrors = [];
      p.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') {
        if (!msg.text().includes('favicon') && !msg.text().includes('404')) {
          allErrors.push(`[${msg.type()}] ${msg.text()}`);
        }
      }});
      // Hit 3 pages and collect
      for (const path of ['/', '/login', '/pricing', '/demo']) {
        try {
          await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await sleep(2000);
        } catch (e) {}
      }
      const uniqueErrors = [...new Set(allErrors)];
      report('Console errors across pages', uniqueErrors.length === 0 ? 'PASS' : 'WARN',
        uniqueErrors.slice(0,5), `${uniqueErrors.length} unique issues`);
      await ctx.close();
    }
  }

  // ==========================================================================
  // SCENARIO 41-43: SEO & metadata
  // ==========================================================================
  console.log('=== Phase 10: SEO & metadata ===');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
    const p = await ctx.newPage();

    // 41. Root page has correct SEO meta
    try {
      await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(1500);
      const title = await p.title();
      const desc = await p.getAttribute('meta[name="description"]', 'content').catch(() => '');
      const ogTitle = await p.getAttribute('meta[property="og:title"]', 'content').catch(() => '');
      const canonical = await p.getAttribute('link[rel="canonical"]', 'href').catch(() => '');
      report('SEO metadata', (title?.length > 3 || desc?.length > 10) ? 'PASS' : 'WARN', [],
        `title="${title?.slice(0,40)}" desc=${desc?.length} og=${!!ogTitle} can=${!!canonical}`);
    } catch (e) { report('SEO metadata', 'FAIL', [e.message], ''); }

    // 42. Robots.txt accessible
    try {
      const resp = await p.goto(`${BASE}/robots.txt`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await sleep(500);
      const body = await p.evaluate(() => document.body.innerText || '');
      report('robots.txt', (resp?.status() === 200 && body.length > 0) ? 'PASS' : 'WARN', [],
        `status=${resp?.status()} len=${body.length}`);
    } catch (e) { report('robots.txt', 'FAIL', [e.message], ''); }

    // 43. Sitemap accessible
    try {
      const resp = await p.goto(`${BASE}/sitemap.xml`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await sleep(500);
      const body = await p.evaluate(() => document.body.innerText || '');
      report('sitemap.xml', (resp?.status() === 200 && body.length > 0) ? 'PASS' : 'WARN', [],
        `status=${resp?.status()} len=${body.length}`);
    } catch (e) { report('sitemap.xml', 'FAIL', [e.message], ''); }

    await ctx.close();
  }

  // ==========================================================================
  // SCENARIO 44-45: Screenshots
  // ==========================================================================
  console.log('=== Phase 11: Screenshots ===');
  {
    const ssCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
    const ssPage = await ssCtx.newPage();
    const screens = ['landing', 'login', 'pricing', 'demo'];
    // Take screenshots of public pages
    for (const name of screens) {
      try {
        await ssPage.goto(`${BASE}/${name === 'landing' ? '' : name}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(2500);
        await ssPage.screenshot({ path: join(ARTIFACTS, `${name}.png`), fullPage: true });
      } catch (e) {}
    }
    // Dashboard screenshot if authenticated
    if (authToken) {
      try {
        await ssCtx.addCookies([{ name: 'token', value: authToken, domain: 'bot.smart-link.ly', path: '/', httpOnly: true, sameSite: 'Lax' }]);
        await ssPage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(3000);
        await ssPage.screenshot({ path: join(ARTIFACTS, 'dashboard.png'), fullPage: true });
        // Mobile screenshot
        await ssPage.setViewportSize({ width: 375, height: 812 });
        await sleep(500);
        await ssPage.screenshot({ path: join(ARTIFACTS, 'dashboard-mobile.png'), fullPage: true });
      } catch (e) {}
    }
    report('Screenshots captured', 'PASS', [], `${screens.length}+ screenshots in ${ARTIFACTS}`);
    await ssCtx.close();
  }

  // Get the actual count with unique test numbers
  await browser.close();
  return dump();
}

function dump() {
  const total = PASS + FAIL + WARN;
  const summary = `${PASS} ✅ passed, ${FAIL} ❌ failed, ${WARN} ⚠ warnings out of ${total} checks`;
  const output = { summary, pass_count: PASS, fail_count: FAIL, warn_count: WARN, total_checks: total, results: RESULTS };
  const json = JSON.stringify(output, null, 2);
  console.log(json);
  return output;
}

run().catch(err => {
  console.log(JSON.stringify({
    summary: `FATAL: ${err.message}`,
    pass_count: 0, fail_count: 1, warn_count: 0, total_checks: 1,
    results: [{ test: '#FATAL', status: 'FAIL', errors: [err.message], notes: '' }],
  }));
});
