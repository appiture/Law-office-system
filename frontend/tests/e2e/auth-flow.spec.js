import { test, expect } from '@playwright/test';

test.describe('Auth Flow & Route Protection', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/.*login/);
  });

  test('successful login redirects to dashboard', async () => {
    // Scaffold test for future implementation
    test.info().annotations.push({ type: 'todo', description: 'Implement full login flow using test credentials' });
  });
});
