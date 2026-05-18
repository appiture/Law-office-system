import { test } from '@playwright/test';

test.describe('Export Flow', () => {
  test('opens export modal and triggers download', async () => {
    // Scaffold test
    test.info().annotations.push({ type: 'todo', description: 'Authenticate, navigate to cases, trigger export modal, select format, and verify download/email' });
  });
});
