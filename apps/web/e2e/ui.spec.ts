import { test, expect } from '@playwright/test';

test('Home loads without console errors and can start a session', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') consoleErrors.push(msg.text());
  });
  const failedRequests: string[] = [];
  page.on('requestfailed', (req) => failedRequests.push(`${req.method()} ${req.url()} ${req.failure()?.errorText || ''}`));

  await page.goto('/');
  await expect(page.locator('text=New Request')).toBeVisible();

  // Trigger a new session (evidence mode synthesizes an id)
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page).toHaveURL(/\/session\//);

  // Session page basics: Pipeline and Editor containers visible
  await expect(page.getByText('Pipeline')).toBeVisible();
  await expect(page.getByText('Editor')).toBeVisible();

  // Wait for at least one SSE phase update to be reflected in the UI list
  // Evidence mode streams a default sequence; wait for any known phase to appear highlighted
  await expect(page.locator('li:has-text("planned")')).toBeVisible();

  // Monaco editor container should exist (read-only view)
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15_000 });

  // Assert no console errors / failed requests
  expect(consoleErrors, `Console errors: ${consoleErrors.join('\n')}`).toHaveLength(0);
  expect(failedRequests, `Failed requests: ${failedRequests.join('\n')}`).toHaveLength(0);
});

