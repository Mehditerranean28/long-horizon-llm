import { test, expect } from '@playwright/test';

// Ensure the language dropdown allows scrolling to all languages

test('language selector scrolls to reveal all options', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByTestId('language-selector-trigger');
  await trigger.click();

  const lastOption = page.getByRole('menuitem', { name: 'Slovenčina' });
  await lastOption.scrollIntoViewIfNeeded();
  await expect(lastOption).toBeVisible();
});
