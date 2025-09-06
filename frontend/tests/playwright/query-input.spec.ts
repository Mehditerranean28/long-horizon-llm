import { test, expect } from '@playwright/test';

// Ensure the query input is visible and can accept text

test('query input accepts text', async ({ page }) => {
  await page.goto('/');
  const textarea = page.getByLabel('Query Input');
  await expect(textarea).toBeVisible();
  await textarea.fill('hello world');
  await expect(textarea).toHaveValue('hello world');
});
