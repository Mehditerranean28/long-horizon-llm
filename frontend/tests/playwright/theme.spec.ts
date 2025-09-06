import { test, expect } from '@playwright/test';

// Verify that the theme switcher button is present on the homepage

test('theme switcher exists', async ({ page }) => {
  await page.goto('/');
  const themeButton = page.getByTitle(/select theme/i);
  await expect(themeButton).toBeVisible();
});
