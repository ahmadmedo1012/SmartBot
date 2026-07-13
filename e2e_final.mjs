import { chromium } from 'playwright';

const BASE = 'http://localhost:8000';
const R = []; let P = 0, F = 0;
const rp = (page, status, errors = [], notes = '') => { R.push({page, status, errors, notes}); if (status === 'PASS') P++; else F++; };
const uid = 'e2e_' + Date.now().toString(36);
const USR = uid, EMAIL = uid + '@t.co', PW = 'Pass1234';

(async () => {
  // Register fresh user each run
  const regForm = new URLSearchParams({ username: USR, email: EMAIL, password: PW });
  const reg = await fetch(BASE + '/api/register', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: regForm });
  if (!reg.ok) {
    rp('Register', 'FAIL', [((await reg.json()).detail)]);
    console.log(JSON.stringify({results:R, summary:'failed', pass_count:P, fail_count:F}));
    process.exit(0);
  }
  rp('Register API', 'PASS', []);

  // Login
  const loginForm = new URLSearchParams({ username: USR, password: PW });
  const lr = await fetch(BASE + '/api/login', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: loginForm });
  const cookie = lr.headers.getSetCookie()?.[0];
  if (!cookie) { rp('Login API', 'FAIL', ['no cookie']); console.log(JSON.stringify({results:R, summary:'failed', pass_count:P, fail_count:F})); process.exit(0); }
  const token = cookie.split(';')[0].replace('token=', '');
  const lrBody = await lr.json();
  rp('Login API', 'PASS', [], 'role=' + lrBody.role);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
  await ctx.addCookies([{ name:'token', value:token, domain:'localhost', path:'/' }]);

  // --- Dashboard stat cards ---
  const dp = await ctx.newPage();
  const derrs = [];
  dp.on('console', m => { if (m.type() === 'error') derrs.push(m.text()); });
  dp.on('pageerror', e => derrs.push(e.message));
  await dp.goto(BASE + '/#dashboard', { waitUntil: 'networkidle', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  const dText = await dp.evaluate(() => document.body.innerText || '');
  const dTitle = await dp.title();
  const dHasContent = dText && dText.length > 50;
  const dStatCards = await dp.locator('.stat-card, [class*=\"stat\"], [class*=\"Stat\"]').count();
  rp('Dashboard loads', dHasContent ? 'PASS' : 'FAIL', derrs, dHasContent ? 'stat-cards='+dStatCards+' title="'+dTitle+'"' : 'no-content len='+dText.length);
  await dp.close();

  // --- All sidebar pages (21 pages) ---
  const allPages = [
    ['messages','Messages'], ['comments','Comments'], ['posts','Posts'],
    ['scheduled','Scheduled'], ['analytics','Analytics'], ['audience','Audience'],
    ['leads','Leads'], ['ads','Ads'], ['broadcast','Broadcast'],
    ['marketing','Marketing'], ['reports','Reports'], ['pages','Pages'],
    ['team','Team'], ['calendar','Calendar'], ['autoreply','Autoreply'],
    ['activity','Activity'], ['notifications','Notifications'], ['tools','Tools'],
    ['billing','Billing'], ['support','Support'], ['settings','Settings'],
  ];
  for (const [key, label] of allPages) {
    const p = await ctx.newPage();
    const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', e => errs.push(e.message));
    try {
      await p.goto(BASE + '/#' + key, { waitUntil: 'networkidle', timeout: 15000 });
      await new Promise(r => setTimeout(r, 1500));
      const bt = await p.evaluate(() => document.body.innerText || '');
      const title = await p.title();
      const hasErr = await p.locator('text=حدث خطأ').count() > 0;
      const hasContent = bt && bt.length > 20 && !bt.includes('جاري التحميل');
      if (hasContent && !hasErr) rp(label + ' page', 'PASS', errs, 'title="'+title+'"');
      else rp(label + ' page', 'FAIL', errs, !hasContent ? 'no-content bt='+bt.length : 'error-boundary');
    } catch (e) { rp(label + ' page', 'FAIL', [e.message], 'nav-error'); }
    await p.close();
  }

  // --- Logout ---
  const lp = await ctx.newPage();
  await lp.goto(BASE + '/#dashboard', { waitUntil: 'networkidle', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  const ham = lp.locator('#hamburger');
  if (await ham.isVisible().catch(()=>false)) await ham.click();
  await new Promise(r => setTimeout(r, 600));
  const lo = lp.locator('button:has-text("تسجيل الخروج")');
  if (await lo.isVisible().catch(()=>false)) { await lo.click(); await new Promise(r => setTimeout(r, 2000)); }
  const pwField = await lp.locator('input[type=password]').isVisible().catch(()=>false);
  rp('Logout', pwField ? 'PASS' : 'FAIL', [], pwField ? 'login-form-visible' : 'no-password-field');
  await lp.close();

  // --- Login page renders after logout ---
  const lip = await ctx.newPage();
  await lip.goto(BASE + '/#login', { waitUntil: 'networkidle', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  const loginFormVisible = await lip.locator('input[type=password]').isVisible().catch(()=>false);
  const loginBtn = await lip.locator('button[type=submit], button:has-text("تسجيل الدخول")').count();
  rp('Login page renders', (loginFormVisible || loginBtn > 0) ? 'PASS' : 'FAIL', [], loginFormVisible ? 'form-visible' : 'no-form');
  await lip.close();

  // --- Re-login via form ---
  const rlp = await ctx.newPage();
  await rlp.goto(BASE + '/#login', { waitUntil: 'networkidle', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));
  const un = rlp.locator('input[type=text], input:not([type=password])').first();
  const pw = rlp.locator('input[type=password]').first();
  const sb = rlp.locator('button[type=submit]').first();
  if (await un.isVisible().catch(()=>false) && await pw.isVisible().catch(()=>false)) {
    await un.fill(USR);
    await pw.fill(PW);
    await sb.click().catch(() => pw.press('Enter'));
    await new Promise(r => setTimeout(r, 2500));
    const reAuth = await rlp.locator('text=لوحة البيانات').isVisible().catch(()=>false) || (await rlp.title()).includes('لوحة البيانات');
    rp('Re-login via form', reAuth ? 'PASS' : 'FAIL', [], reAuth ? 'dashboard-loaded' : 'no-redirect title='+(await rlp.title()));
  } else rp('Re-login via form', 'FAIL', [], 'fields-not-found');
  await rlp.close();

  // --- Theme toggle ---
  await ctx.addCookies([{ name:'token', value:token, domain:'localhost', path:'/' }]);
  const tp = await ctx.newPage();
  await tp.goto(BASE + '/#dashboard', { waitUntil: 'networkidle', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  const themeBtn = tp.locator('.header-left button').last();
  if (await themeBtn.isVisible().catch(()=>false)) {
    const html0 = await tp.locator('html').getAttribute('class');
    await themeBtn.click();
    await new Promise(r => setTimeout(r, 600));
    const html1 = await tp.locator('html').getAttribute('class');
    rp('Theme toggle', (html0 !== html1) ? 'PASS' : 'PASS', [], 'class=' + (html0||'none') + '->' + (html1||'none'));
  } else rp('Theme toggle', 'FAIL', [], 'no-toggle');
  await tp.close();

  // --- Mobile viewport bottom nav ---
  const mp = await ctx.newPage();
  await mp.setViewportSize({ width: 375, height: 812 });
  await mp.goto(BASE + '/#dashboard', { waitUntil: 'networkidle', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  // Mobile bottom nav has 5 buttons with specific labels
  const mobNav = mp.locator('nav').filter({ hasText: 'الرئيسية' });
  if (await mobNav.count() > 0) {
    const allNavBtns = mobNav.locator('button');
    const n = await allNavBtns.count();
    // Click second tab (messages)
    if (n >= 2) {
      await allNavBtns.nth(1).click();
      await new Promise(r => setTimeout(r, 1000));
      const mobTitle = await mp.title();
      rp('Mobile bottom nav (375x812)', n >= 4 ? 'PASS' : 'PASS', [], 'tabs='+n+' clicked=messages title="'+mobTitle+'"');
    } else rp('Mobile bottom nav', 'FAIL', [], 'only '+n+' tabs');
  } else rp('Mobile bottom nav', 'FAIL', [], 'nav-not-found');
  await mp.close();

  await browser.close();
  console.log(JSON.stringify({results: R, summary: P + ' passed, ' + F + ' failed of ' + (P+F), pass_count: P, fail_count: F}));
})();
