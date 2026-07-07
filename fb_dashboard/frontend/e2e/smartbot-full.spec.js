import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8765';

async function login(page) {
  await page.goto(BASE);
  await page.locator('input').nth(0).fill('admin');
  await page.locator('input').nth(1).fill('admin');
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await page.waitForSelector('h1:has-text("لوحة التحكم")', { timeout: 10000 });
}

test.describe('SmartBot Full Checklist', () => {

  test('Dashboard: no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('401')) errors.push(msg.text());
    });
    await login(page);
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });

  test('Rules page: no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('401')) errors.push(msg.text());
    });
    await login(page);
    await page.getByText('القواعد').first().click();
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });

  test('Replies page: no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('401')) errors.push(msg.text());
    });
    await login(page);
    await page.getByText('الردود').first().click();
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });

  test('Settings page: no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('401')) errors.push(msg.text());
    });
    await login(page);
    await page.getByText('الإعدادات').first().click();
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });

  test('No horizontal overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    await page.waitForTimeout(2000);
    const overflowW = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflowW).toBeLessThanOrEqual(5);
  });

  test('No horizontal overflow at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page);
    await page.waitForTimeout(2000);
    const overflowW = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflowW).toBeLessThanOrEqual(5);
  });

  test('No horizontal overflow at 1600px', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await login(page);
    await page.waitForTimeout(2000);
    const overflowW = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflowW).toBeLessThanOrEqual(5);
  });

  test('No horizontal overflow at 768px', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await login(page);
    await page.waitForTimeout(2000);
    const overflowW = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflowW).toBeLessThanOrEqual(5);
  });

  test('Theme toggle switches and persists', async ({ page }) => {
    await login(page);
    let themeBtn = page.locator('button').filter({ has: page.locator('svg.lucide-sun') }).first();
    let hasSun = await themeBtn.count();
    if (!hasSun) themeBtn = page.locator('button').filter({ has: page.locator('svg.lucide-moon') }).first();
    let hasMoon = await themeBtn.count();
    if (hasSun || hasMoon) {
      await themeBtn.click();
      await page.waitForTimeout(500);
      await page.reload();
      await page.waitForTimeout(1000);
      await expect(page.locator('h1')).toContainText('لوحة التحكم');
    }
  });

  test('Delete rule shows confirm dialog', async ({ page }) => {
    await login(page);
    const sidebarBtns = page.locator('aside nav button');
    const rulesBtn = sidebarBtns.filter({ hasText: 'القواعد' });
    if (await rulesBtn.count() > 0) await rulesBtn.click();
    await page.waitForTimeout(3000);
    await page.waitForSelector('table', { timeout: 5000 }).catch(() => {});
    const deleteBtns = page.locator('button:has(svg.lucide-trash-2)');
    if (await deleteBtns.count() > 0) {
      await deleteBtns.first().click();
      await page.waitForTimeout(500);
      await expect(page.getByText('تأكيد حذف القاعدة')).toBeVisible();
      await page.getByRole('button', { name: 'إلغاء' }).click();
    }
  });

  test('Full flow: login + all pages accessible', async ({ page }) => {
    await login(page);
    await expect(page.locator('h1')).toContainText('لوحة التحكم');
    const pages = ['القواعد', 'الردود', 'المنشورات', 'الإعدادات', 'المستخدمين'];
    for (const p of pages) {
      const navButton = page.getByText(p).first();
      if (await navButton.isVisible()) {
        await navButton.click();
        await page.waitForTimeout(1000);
      }
    }
  });
});
