import { expect, test } from '@playwright/test';

for (const size of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 740, height: 320 }]) {
  test(`Private Guest code and sharing fit ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { document.documentElement.dataset.copied = text; } } });
      Object.defineProperty(navigator, 'share', { value: undefined });
    });
    await page.goto('/layout/index.html?variant=private');
    const code = page.getByRole('button', { name: 'Room AB7K, sharing options' });
    await expect(code).toBeVisible();
    const box = await code.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(size.width);
    const connection = await page.locator('.connection').boundingBox(); expect(box!.x + box!.width).toBeLessThanOrEqual(connection!.x);
    await code.click();
    const dialog = page.getByRole('dialog', { name: 'Share Private session' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Copy Code' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-copied', 'AB7K');
    await dialog.getByRole('button', { name: 'Share Guest Link' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-copied', 'http://127.0.0.1:5178/join?room=AB7K');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(size.width);
    await dialog.getByRole('button', { name: 'Close' }).click(); await expect(dialog).not.toBeVisible();
  });
}
test('Private invitation becomes joinable without retyping and enters directly on first click', async ({ page }) => {
  let ready = false; let direct = 0; let requests = 0;
  await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (path.endsWith('/available')) data = [];
    if (path.endsWith('/public')) data = { roomCode: 'AB7K', hostName: 'Host', visibility: 'private', status: 'CREATED', provisioning: !ready, joinable: ready, locked: false, guestCount: 0, capacity: 10, createdAt: new Date().toISOString(), expiresAt: Date.now() + 10_800_000 };
    if (path.endsWith('/join')) { direct++; data = { identity: 'guest', token: 'test-token', livekitUrl: 'wss://example.test' }; }
    if (path.includes('/requests')) requests++;
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/join?room=AB7K');
  await page.getByLabel('Your Name').fill('Guest');
  const join = page.getByRole('button', { name: 'JOIN SESSION' });
  await expect(page.getByText(/Host is preparing/)).toBeVisible(); await expect(join).toBeDisabled();
  ready = true; await expect(join).toBeEnabled(); await join.click();
  await expect(page).toHaveURL(/\/watch\/AB7K$/); expect(direct).toBe(1); expect(requests).toBe(0);
});
