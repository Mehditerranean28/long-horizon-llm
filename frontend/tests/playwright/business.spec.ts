import { test, expect } from '@playwright/test';

test('business page loads', async ({ page }) => {
  await page.goto('/business');
  const aboutButton = page.locator('.started');
  await expect(aboutButton).toHaveText(/about us/i);
});
