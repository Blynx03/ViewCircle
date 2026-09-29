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

for (const visibility of ['public', 'private']) test(`approval prefills ${visibility} creation, survives reopen and submits an edited name`, async ({ page }) => {
  let status = 'new'; let submitted: unknown;
  await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = null;
    if (path === '/api/access-requests') { expect(route.request().postDataJSON().name).toBe('Charlie'); status = 'pending'; data = { id: 'one', status }; }
    if (path === '/api/access') data = { authorized: status === 'approved', owner: false, ...(status === 'approved' ? { requestorName: 'Charlie' } : {}), request: status === 'new' ? null : { id: 'one', status, expiresAt: Date.now() + 3600000 } };
    if (path === '/api/sessions' && route.request().method() === 'POST') {
      submitted = route.request().postDataJSON();
      return route.fulfill({ status: 503, json: { success: false, error: { code: 'TEST_STOP', message: 'Submission captured' } } });
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/host'); await page.getByLabel('Your Name', { exact: true }).fill('Charlie');
  await page.getByRole('button', { name: 'Request Access' }).click();
  await expect(page.getByText('Waiting for owner approval…')).toBeVisible();
  status = 'approved';
  await expect(page.getByRole('heading', { name: 'Create your circle' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByLabel('Your Name', { exact: true })).toHaveValue('Charlie');
  await page.reload(); await expect(page.getByLabel('Your Name', { exact: true })).toHaveValue('Charlie');
  await page.goto('/'); await page.goto('/host');
  await expect(page.getByLabel('Your Name', { exact: true })).toHaveValue('Charlie');
  if (visibility === 'private') await page.getByRole('checkbox').check();
  await expect(page.getByLabel('Your Name', { exact: true })).toHaveValue('Charlie');
  await page.getByLabel('Your Name', { exact: true }).fill('Charles');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.getByRole('button', { name: 'CREATE SESSION', exact: true }).click();
  await expect(page.getByText('Submission captured')).toBeVisible();
  expect(submitted).toEqual({ hostName: 'Charles', visibility });
});
