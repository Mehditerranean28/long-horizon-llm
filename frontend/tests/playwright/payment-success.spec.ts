import { test, expect } from '@playwright/test';

test('payment success page shows confirmation', async ({ page }) => {
  await page.goto('/payment-success');
  await expect(page.getByText(/payment confirmed/i)).toBeVisible();
});
