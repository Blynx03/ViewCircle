import { expect, test } from '@playwright/test';

test('cold launch selects the correct manifest even before React loads', async ({ page }) => {
  await page.route('**/src/main.tsx', route => route.abort());
  for (const [path, manifest] of [['/owner', '/owner-manifest.webmanifest'], ['/', '/manifest.webmanifest']]) {
    await page.goto(path!);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', manifest!);
    const response = await page.request.get(manifest!);
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).start_url).toBe(path);
  }
});

test('React navigation and history keep exactly one correct manifest', async ({ page }) => {
  await page.route(/^https?:\/\/[^/]+\/api\//, route => {
    const path = new URL(route.request().url()).pathname;
    const data = path === '/api/access' ? { authorized: true, owner: true, request: null, expiresAt: Date.now() + 60000 }
      : path === '/api/sessions/active' ? null : path === '/api/owner/sessions' ? { capacity: 2, sessions: [] } : path === '/api/owner/push-key' ? { publicKey: null } : [];
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/owner');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/owner-manifest.webmanifest');
  await page.getByRole('link', { name: 'Enter ViewCircle' }).click();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await page.goBack();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/owner-manifest.webmanifest');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
});
