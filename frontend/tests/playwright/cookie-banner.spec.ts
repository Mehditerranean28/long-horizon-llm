import { test, expect } from '@playwright/test';

test('cookie banner hides after closing and stores prefs', async ({ page }) => {
  await page.goto('/');
  const close = page.getByRole('button', { name: /close settings/i });
  await expect(close).toBeVisible();
  await close.click();
  await expect(close).not.toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem('cookie-preferences'));
  expect(stored).not.toBeNull();
});
