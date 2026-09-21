import { expect, test } from '@playwright/test';

test('Owner mobile login supports autofill, visibility and normal viewport sizing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/access', route => route.fulfill({ json: { success: true, data: { owner: false, authorized: false, request: null } } }));
  await page.goto('/owner');
  const password = page.getByLabel('Password', { exact: true });
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await password.fill('device-test'); await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(password).toHaveValue('device-test'); await expect(password).toHaveAttribute('type', 'text');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('Owner session cards and recovery controls fit an iPhone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https?:\/\/[^/]+\/api\//, route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (path.endsWith('/access')) data = { owner: true, authorized: true, request: null };
    if (path.endsWith('/access-requests')) data = [{ id: 'one', name: 'Visiting Host', status: 'pending', createdAt: Date.now() }];
    if (path.endsWith('/push-key')) data = { publicKey: null };
    if (path.endsWith('/sessions')) data = { capacity: 2, sessions: [{ roomCode: 'AB7K', hostName: 'Host', sessionName: 'A walk by the lake', status: 'LIVE', visibility: 'public', guestCount: 3, pendingRequests: 2, hostConnected: true, everJoined: true, createdAt: new Date().toISOString(), expiresAt: Date.now() + 10_800_000 }] };
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/owner'); await expect(page.getByText('1 of 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'End Session', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const box = await page.getByRole('button', { name: 'End Session', exact: true }).boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `/tmp/viewcircle-owner-${test.info().project.name}.png`, fullPage: true });
});
test('Private query invitations preserve the code and require only a Guest name', async ({ page }) => {
  await page.route('**/api/sessions/available', route => route.fulfill({ json: { success: true, data: [] } }));
  await page.route('**/api/sessions/AB7K/public', route => route.fulfill({ json: { success: true, data: { roomCode: 'AB7K', hostName: 'Host', visibility: 'private', status: 'LIVE', pinRequired: false } } }));
  await page.goto('/join?room=AB7K'); await expect(page.getByLabel('Room Code')).toHaveValue('AB7K');
  await expect(page.getByLabel('Your Name')).toBeVisible(); await expect(page.getByText('4-digit PIN')).toHaveCount(0);
});
