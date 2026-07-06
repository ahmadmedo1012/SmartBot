import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8765';

test.describe('SmartBot Dashboard', () => {

  test('Login page loads', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('h1')).toContainText('SMARTBOT');
    await expect(page.getByRole('button', { name: 'AUTHENTICATE' })).toBeVisible();
  });

  test('Login with valid credentials', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('input').nth(0).fill('admin');
    await page.locator('input').nth(1).fill('admin');
    await page.getByRole('button', { name: 'AUTHENTICATE' }).click();
    await expect(page.locator('h1')).toContainText('DARASHBOARD');
  });

  test('All pages accessible after login', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('input').nth(0).fill('admin');
    await page.locator('input').nth(1).fill('admin');
    await page.getByRole('button', { name: 'AUTHENTICATE' }).click();
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
    await page.getByRole('button', { name: 'AUTHENTICATE' }).click();
    await page.waitForTimeout(1500);

    const logoutBtn = page.locator('button:has(svg.lucide-log-out)').first();
    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
    }
    await expect(page.locator('h1')).toContainText('SMARTBOT');
  });
});
