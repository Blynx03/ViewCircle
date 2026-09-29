import { expect, test } from '@playwright/test';

test('Host retry displays wait guidance, then reuses pending and approved access', async ({ page }) => {
  let state = 'new'; let attempts = 0;
  await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/access-requests') {
      attempts++;
      if (attempts === 1) return route.fulfill({ status: 429, json: { success: false, error: { code: 'ACCESS_REQUEST_THROTTLED', message: 'Too many access requests were received. Please contact the Owner or try again shortly.', retryAfterSeconds: 90 } } });
      state = 'pending';
      return route.fulfill({ json: { success: true, data: { id: 'one', status: state, message: 'Your access request is already waiting for approval.' } } });
    }
    const data = path === '/api/access' ? { authorized: state === 'approved', owner: false, requestorName: 'Host', request: state === 'new' ? null : { id: 'one', status: state, expiresAt: Date.now() + 3600000 } } : path.endsWith('/available') ? [] : null;
    await route.fulfill({ json: { success: true, data } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/host');
  await page.getByLabel('Your Name', { exact: true }).fill('Host');
  await page.getByRole('button', { name: 'Request Access' }).click();
  await expect(page.getByRole('alert')).toContainText('Try again in about 2 minutes.');
  await page.getByRole('button', { name: 'Request Access' }).click();
  await expect(page.getByText('Your access request is already waiting for approval.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Your access request is already waiting for approval.')).toBeVisible();
  expect(attempts).toBe(2);
  state = 'approved'; await page.reload();
  await expect(page.getByRole('button', { name: /create/i })).toBeVisible();
  expect(attempts).toBe(2);
});

test('Owner can confirm or cancel the narrow access reset on a mobile dashboard', async ({ page }) => {
  let resets = 0;
  await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (path === '/api/access') data = { authorized: true, owner: true, request: null };
    if (path === '/api/owner/access-requests') data = [{ id: 'one', name: 'Pending Host', status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + 60000 }];
    if (path === '/api/owner/sessions') data = { sessions: [] };
    if (path === '/api/owner/push-key') data = { publicKey: null };
    if (path.startsWith('/api/owner/access-request-protection')) {
      if (path.endsWith('/reset')) resets++;
      data = { browserBuckets: 1, ipBuckets: 1, newRequests: 5, lastThrottledAt: resets ? null : Date.now() };
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/owner');
  const button = page.getByRole('button', { name: 'Reset Access Request Limits' });
  page.once('dialog', dialog => dialog.dismiss()); await button.click(); expect(resets).toBe(0);
  page.once('dialog', async dialog => { expect(dialog.message()).toBe('Reset access request limits?\n\nThis allows blocked Hosts to request access again immediately.'); await dialog.accept(); });
  await button.click();
  await expect(page.getByText('Access request limits reset. Hosts can request access again.')).toBeVisible();
  expect(resets).toBe(1); await expect(page.getByText('Pending Host')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
