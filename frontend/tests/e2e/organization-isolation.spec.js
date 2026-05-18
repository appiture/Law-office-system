import { test } from '@playwright/test';

test.describe('Organization Isolation', () => {
  test('user from org A cannot access data from org B', async () => {
    // Scaffold test
    test.info().annotations.push({ type: 'todo', description: 'Log in as user from Org A, attempt to query/navigate to cases belonging to Org B, expect denial' });
  });
});
