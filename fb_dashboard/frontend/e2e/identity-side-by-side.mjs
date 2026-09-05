/**
 * Side-by-side payment page screenshots: SmartBot vs Smart-Menu.
 *
 * SmartBot  → http://localhost:8000  (real API, real register flow)
 * Smart-Menu → http://localhost:3005  (network-mocked API — visual identity
 *             comparison only; payloads mirror the real shapes)
 *
 * Output: e2e_artifacts/identity/payment-smartbot.png
 *         e2e_artifacts/identity/payment-smartmenu.png
 *         e2e_artifacts/identity/payment-side-by-side.png (composed)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'e2e_artifacts', 'identity');
mkdirSync(OUT, { recursive: true });

const SM_MENU = 'http://localhost:3005';
const SB = 'http://localhost:8000';
const VP = { width: 1050, height: 950 };

// ── Shared plan payloads (canonical SmartBot prices — same funnel in both) ──
const SB_PLANS = null; // real API
const SM_PLANS = [
  { id: 1, name: 'Free', nameAr: 'مجاني', price: 0, periodDays: 30, features: ['قائمة واحدة', '20 صنفًا', 'طلبات غير محدودة'], maxMenus: 1, maxItems: 20, maxOrders: 200, sortOrder: 1 },
  { id: 2, name: 'Basic', nameAr: 'أساسي', price: 19, periodDays: 30, features: ['3 قوائم', '60 صنفًا', 'طلبات غير محدودة', 'QR مخصص'], maxMenus: 3, maxItems: 60, maxOrders: 2000, sortOrder: 2 },
  { id: 3, name: 'Premium', nameAr: 'مميز', price: 29, periodDays: 30, features: ['10 قوائم', '200 صنف', 'طلبات غير محدودة', 'QR مخصص', 'تحليلات متقدمة'], maxMenus: 10, maxItems: 200, maxOrders: 10000, sortOrder: 3 },
  { id: 4, name: 'Pro', nameAr: 'احترافي', price: 129, periodDays: 30, features: ['قوائم غير محدودة', 'أصناف غير محدودة', 'طلبات غير محدودة', 'فرعان'], maxMenus: 99, maxItems: 999, maxOrders: 50000, sortOrder: 4 },
];
const SM_CONFIG_ROWS = [
  { key: 'balance_transfer_phone_1', value: '0920000002' },   // madar
  { key: 'balance_transfer_phone_2', value: '0910000001' },   // libyana
  { key: 'bank_transfer_bank_name', value: 'مصرف الجمهورية' },
  { key: 'bank_transfer_account_number', value: '00210048' },
  { key: 'bank_transfer_iban', value: 'LY83002048000020100120361' },
];

async function shotSmartBot(browser) {
  const ctx = await browser.newContext({ viewport: VP, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const uname = `shot_${Date.now().toString(36)}`;

  // register (real backend)
  await page.goto(`${SB}/register`);
  await page.fill('#username', uname);
  await page.fill('#email', `${uname}@t.ly`);
  await page.fill('#password', 'Test12345!');
  await page.fill('#confirm', 'Test12345!');
  await Promise.all([
    page.waitForURL(/dashboard|onboarding/, { timeout: 20_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(2000);

  // subscribe → pick Premium (مميز) → payment form
  await page.goto(`${SB}/subscribe`);
  await page.waitForSelector('text=مميز', { timeout: 20_000 });
  await page.click('text=مميز');
  await page.waitForSelector('text=طريقة الدفع', { timeout: 10_000 });
  await page.waitForTimeout(900); // settle animations
  await page.screenshot({ path: join(OUT, 'payment-smartbot.png'), fullPage: false });
  await ctx.close();
  console.log('SmartBot payment form captured');
}

async function shotSmartMenu(browser) {
  const ctx = await browser.newContext({ viewport: VP, colorScheme: 'dark' });
  // network mocks (visual comparison — no DB attached to the dev server)
  await ctx.route('**/api/plans**', (route) =>
    route.fulfill({ json: { data: SM_PLANS } }));
  await ctx.route('**/api/auth/me**', (route) =>
    route.fulfill({ json: { success: true, data: { role: 'owner', restaurantId: 1, subscriptionStatus: 'TRIAL' } } }));
  await ctx.route('**/api/config**', (route) =>
    route.fulfill({ json: { success: true, data: SM_CONFIG_ROWS } }));
  await ctx.route('**/api/user/events**', (route) =>
    route.fulfill({ json: { success: true, data: [] } }));

  const page = await ctx.newPage();
  await page.goto(`${SM_MENU}/subscribe`);
  await page.waitForSelector('text=مميز', { timeout: 30_000 });
  // pick Premium plan
  await page.locator('button', { hasText: 'مميز' }).first().click();
  await page.waitForTimeout(400);
  // continue to next step (upgrade mode → summary + pay button)
  const cont = page.locator('button', { hasText: 'متابعة' }).first();
  await cont.click().catch(() => {});
  await page.waitForSelector('text=ادفع الآن', { timeout: 15_000 });
  await page.locator('button', { hasText: 'ادفع الآن' }).first().click();
  await page.waitForSelector('text=دفع الاشتراك', { timeout: 15_000 });
  await page.waitForTimeout(900); // dialog animations
  await page.screenshot({ path: join(OUT, 'payment-smartmenu.png'), fullPage: false });
  await ctx.close();
  console.log('Smart-Menu payment dialog captured');
}

(async () => {
  const browser = await chromium.launch();
  try {
    await shotSmartBot(browser);
    await shotSmartMenu(browser);
  } finally {
    await browser.close();
  }
  console.log('DONE');
})().catch((e) => { console.error(e); process.exit(1); });
