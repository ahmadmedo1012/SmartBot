import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8765';

test.describe('SmartBot Dashboard', () => {

  test('Login page loads', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('h1')).toContainText('SmartBot');
    await expect(page.getByRole('button', { name: 'تسجيل الدخول' })).toBeVisible();
  });

  test('Login with valid credentials', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('input').nth(0).fill('admin');
    await page.locator('input').nth(1).fill('admin');
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(page.locator('h1')).toContainText('لوحة التحكم');
  });

  test('All pages accessible after login', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('input').nth(0).fill('admin');
    await page.locator('input').nth(1).fill('admin');
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await page.waitForTimeout(1500);

    const links = ['لوحة التحكم', 'القواعد', 'الردود', 'المنشورات', 'الإعدادات', 'المستخدمين'];
    for (const link of links) {
      await expect(page.getByText(link).first()).toBeVisible();
    }
  });

  test('Logout works', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('input').nth(0).fill('admin');
    await page.locator('input').nth(1).fill('admin');
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await page.waitForTimeout(1500);

    // Open user dropdown and click logout
    const userBtn = page.locator('button[class*="rounded-lg"]').filter({ hasText: 'admin' }).first();
    if (await userBtn.count() > 0) {
      await userBtn.click();
      await page.waitForTimeout(300);
      const logoutMenuItem = page.getByText('تسجيل الخروج');
      if (await logoutMenuItem.count() > 0) {
        await logoutMenuItem.click();
      }
    }
    await expect(page.locator('h1')).toContainText('SmartBot');
  });
});
