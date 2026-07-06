# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/smartbot-full.spec.js >> SmartBot Full Checklist >> Theme toggle switches and persists
- Location: e2e/smartbot-full.spec.js:76:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('h1')
Expected substring: "SmartBot"
Received string:    "لوحة التحكم"
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('h1')
    14 × locator resolved to <h1 class="text-2xl font-bold text-slate-900 tracking-tight">لوحة التحكم</h1>
       - unexpected value "لوحة التحكم"

```

```yaml
- heading "لوحة التحكم" [level=1]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const BASE = 'http://localhost:8765';
  4   | 
  5   | async function login(page) {
  6   |   await page.goto(BASE);
  7   |   const inputs = page.locator('input');
  8   |   await inputs.nth(0).fill('admin');
  9   |   await inputs.nth(1).fill('admin');
  10  |   await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  11  |   await page.waitForSelector('h1:has-text("لوحة")', { timeout: 10000 });
  12  | }
  13  | 
  14  | test.describe('SmartBot Full Checklist', () => {
  15  | 
  16  |   test('Dashboard: no console errors', async ({ page }) => {
  17  |     const errors = [];
  18  |     page.on('console', (msg) => {
  19  |       // Ignore 401 on /api/me during initial auth check (expected before login)
  20  |       if (msg.type() === 'error' && !msg.text().includes('401')) errors.push(msg.text());
  21  |     });
  22  |     await login(page);
  23  |     await page.waitForTimeout(2000);
  24  |     expect(errors).toEqual([]);
  25  |   });
  26  | 
  27  |   test('Rules page: no console errors', async ({ page }) => {
  28  |     const errors = [];
  29  |     page.on('console', (msg) => {
  30  |       if (msg.type() === 'error' && !msg.text().includes('401')) errors.push(msg.text());
  31  |     });
  32  |     await login(page);
  33  |     await page.getByText('القواعد').first().click();
  34  |     await page.waitForTimeout(2000);
  35  |     expect(errors).toEqual([]);
  36  |   });
  37  | 
  38  |   test('Replies page: no console errors', async ({ page }) => {
  39  |     const errors = [];
  40  |     page.on('console', (msg) => {
  41  |       if (msg.type() === 'error' && !msg.text().includes('401')) errors.push(msg.text());
  42  |     });
  43  |     await login(page);
  44  |     await page.getByText('الردود').first().click();
  45  |     await page.waitForTimeout(2000);
  46  |     expect(errors).toEqual([]);
  47  |   });
  48  | 
  49  |   test('Settings page: no console errors', async ({ page }) => {
  50  |     const errors = [];
  51  |     page.on('console', (msg) => {
  52  |       if (msg.type() === 'error' && !msg.text().includes('401')) errors.push(msg.text());
  53  |     });
  54  |     await login(page);
  55  |     await page.getByText('الإعدادات').first().click();
  56  |     await page.waitForTimeout(2000);
  57  |     expect(errors).toEqual([]);
  58  |   });
  59  | 
  60  |   test('No horizontal overflow at 375px', async ({ page }) => {
  61  |     await page.setViewportSize({ width: 375, height: 812 });
  62  |     await login(page);
  63  |     await page.waitForTimeout(2000);
  64  |     const overflowW = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  65  |     expect(overflowW).toBeLessThanOrEqual(5);
  66  |   });
  67  | 
  68  |   test('No horizontal overflow at 1440px', async ({ page }) => {
  69  |     await page.setViewportSize({ width: 1440, height: 900 });
  70  |     await login(page);
  71  |     await page.waitForTimeout(2000);
  72  |     const overflowW = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  73  |     expect(overflowW).toBeLessThanOrEqual(5);
  74  |   });
  75  | 
  76  |   test('Theme toggle switches and persists', async ({ page }) => {
  77  |     await login(page);
  78  |     // Find theme toggle anywhere in sidebar (shadcn renders div not aside)
  79  |     const sidebarEl = page.locator('[class*="sidebar"], [class*="Sidebar"], .bg-slate-900');
  80  |     let themeBtn = page.locator('button').filter({ has: page.locator('svg.lucide-sun') }).first();
  81  |     let hasSun = await themeBtn.count();
  82  |     if (!hasSun) themeBtn = page.locator('button').filter({ has: page.locator('svg.lucide-moon') }).first();
  83  |     let hasMoon = await themeBtn.count();
  84  |     if (hasSun || hasMoon) {
  85  |       await themeBtn.click();
  86  |       await page.waitForTimeout(500);
  87  |       await page.reload();
  88  |       await page.waitForTimeout(1000);
> 89  |       await expect(page.locator('h1')).toContainText('SmartBot');
      |                                        ^ Error: expect(locator).toContainText(expected) failed
  90  |     }
  91  |   });
  92  | 
  93  |   test('Delete rule shows confirm dialog', async ({ page }) => {
  94  |     await login(page);
  95  |     // Navigate to rules via sidebar
  96  |     const sidebarBtns = page.locator('aside nav button');
  97  |     const rulesBtn = sidebarBtns.filter({ hasText: 'القواعد' });
  98  |     if (await rulesBtn.count() > 0) await rulesBtn.click();
  99  |     await page.waitForTimeout(3000);
  100 |     // Wait for table to render
  101 |     await page.waitForSelector('table', { timeout: 5000 }).catch(() => {});
  102 |     const deleteBtns = page.locator('button[title*="حذف"], button:has(svg.lucide-trash-2)');
  103 |     if (await deleteBtns.count() > 0) {
  104 |       await deleteBtns.first().click();
  105 |       await page.waitForTimeout(500);
  106 |       await expect(page.getByText('تأكيد حذف القاعدة')).toBeVisible();
  107 |       await page.getByRole('button', { name: 'إلغاء' }).click();
  108 |     }
  109 |   });
  110 | 
  111 |   test('Full flow: login + all pages accessible', async ({ page }) => {
  112 |     await login(page);
  113 |     await expect(page.locator('h1')).toContainText('لوحة التحكم');
  114 |     const pages = ['القواعد', 'الردود', 'المنشورات', 'الإعدادات', 'المستخدمين'];
  115 |     for (const p of pages) {
  116 |       const navButton = page.getByText(p).first();
  117 |       if (await navButton.isVisible()) {
  118 |         await navButton.click();
  119 |         await page.waitForTimeout(1000);
  120 |       }
  121 |     }
  122 |   });
  123 | });
  124 | 
```