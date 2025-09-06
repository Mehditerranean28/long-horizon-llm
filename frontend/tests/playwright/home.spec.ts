import { test, expect } from '@playwright/test';

test('homepage title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Sovereign/i);
});
