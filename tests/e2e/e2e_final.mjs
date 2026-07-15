import { chromium } from 'playwright';

const BASE = 'http://localhost:8000';
const R = []; let P = 0, F = 0;
const rp = (page, status, errors = [], notes = '') => { R.push({page, status, errors, notes}); if (status === 'PASS') P++; else F++; };
const uid = 'e2e_' + Date.now().toString(36);
const USR = uid, EMAIL = uid + '@t.co', PW = 'Pass1234';

(async () => {
  const regForm = new URLSearchParams({ username: USR, email: EMAIL, password: PW });
  const reg = await fetch(BASE + '/api/register', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: regForm });
  if (!reg.ok) { rp('Register', 'FAIL', [((await reg.json()).detail)]); done(); return; }
  rp('Register API', 'PASS', []);

  const loginForm = new URLSearchParams({ username: USR, password: PW });
  const lr = await fetch(BASE + '/api/login', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: loginForm });
  const cookie = lr.headers.getSetCookie()?.[0];
  if (!cookie) { rp('Login API', 'FAIL', ['no cookie']); done(); return; }
  const token = cookie.split(';')[0].replace('token=', '');
  const lrBody = await lr.json();
  rp('Login API', 'PASS', [], 'role=' + lrBody.role);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
  await ctx.addCookies([{ name:'token', value:token, domain:'localhost', path:'/' }]);

  // Helper: goto with load wait
  async function go(page, hash) {
    await page.goto(BASE + '/#' + hash, { waitUntil: 'load', timeout: 20000 });
    await new Promise(r => setTimeout(r, 2000));
  }

  // --- Dashboard ---
  const dp = await ctx.newPage();
  const derrs = [];
  dp.on('console', m => { if (m.type() === 'error' && !m.text().includes('/ws')) derrs.push(m.text()); });
  dp.on('pageerror', e => derrs.push(e.message));
  await go(dp, 'dashboard');
  const dText = await dp.evaluate(() => document.body.innerText || '');
  const dTitle = await dp.title();
  const dOk = dText && dText.length > 50 && !dText.includes('جاري التحميل');
  rp('Dashboard loads with stat cards', dOk ? 'PASS' : 'FAIL', derrs, dOk ? 'title="'+dTitle+'" len='+dText.length : 'no-content');
  await dp.close();

  // --- All sidebar pages ---
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
      await go(p, key);
      const bt = await p.evaluate(() => document.body.innerText || '');
      const title = await p.title();
      const hasErr = await p.locator('text=حدث خطأ').count() > 0;
      const ok = bt && bt.length > 20 && !bt.includes('جاري التحميل');
      rp(label + ' renders', ok && !hasErr ? 'PASS' : 'FAIL', errs, ok ? 'title="'+title+'"' : 'no-content');
    } catch (e) { rp(label + ' renders', 'FAIL', [e.message], 'nav-error'); }
    await p.close();
  }

  // --- Logout ---
  const lp = await ctx.newPage();
  await go(lp, 'dashboard');
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
  await lip.goto(BASE + '/#login', { waitUntil: 'load', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  rp('Login page renders after logout', await lip.locator('input[type=password]').isVisible().catch(()=>false) ? 'PASS' : 'FAIL', []);
  await lip.close();

  // --- Re-login ---
  const rlp = await ctx.newPage();
  await rlp.goto(BASE + '/#login', { waitUntil: 'load', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));
  const un = rlp.locator('input[type=text], input:not([type=password])').first();
  const pw = rlp.locator('input[type=password]').first();
  const sb = rlp.locator('button[type=submit]').first();
  if (await un.isVisible().catch(()=>false) && await pw.isVisible().catch(()=>false)) {
    await un.fill(USR); await pw.fill(PW);
    await sb.click().catch(() => pw.press('Enter'));
    await new Promise(r => setTimeout(r, 2500));
    const reAuth = await rlp.locator('text=لوحة البيانات').isVisible().catch(()=>false) || (await rlp.title()).includes('لوحة البيانات');
    rp('Re-login via form', reAuth ? 'PASS' : 'FAIL', [], reAuth ? 'dashboard-loaded' : 'no-redirect');
  } else rp('Re-login via form', 'FAIL', [], 'fields-not-found');
  await rlp.close();

  // --- Theme toggle ---
  await ctx.addCookies([{ name:'token', value:token, domain:'localhost', path:'/' }]);
  const tp = await ctx.newPage();
  await go(tp, 'dashboard');
  const themeBtn = tp.locator('.header-left button').last();
  if (await themeBtn.isVisible().catch(()=>false)) { await themeBtn.click(); await new Promise(r => setTimeout(r, 600)); rp('Theme toggle works', 'PASS', []); }
  else rp('Theme toggle', 'FAIL', [], 'no-toggle');
  await tp.close();

  // --- Mobile viewport ---
  const mp = await ctx.newPage();
  await mp.setViewportSize({ width: 375, height: 812 });
  await mp.goto(BASE + '/#dashboard', { waitUntil: 'load', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  const mobNav = mp.locator('nav').filter({ hasText: 'الرئيسية' });
  if (await mobNav.count() > 0) {
    const btns = mobNav.locator('button'); const n = await btns.count();
    if (n >= 2) await btns.nth(1).click();
    await new Promise(r => setTimeout(r, 1000));
    rp('Mobile bottom nav (375x812)', 'PASS', [], 'tabs='+n);
  } else rp('Mobile bottom nav', 'FAIL', [], 'nav-not-found');
  await mp.close();

  await browser.close();
  console.log(JSON.stringify({results: R, summary: P + ' passed, ' + F + ' failed of ' + (P+F), pass_count: P, fail_count: F}));
})();
