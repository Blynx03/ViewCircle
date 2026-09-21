import { expect, test, type Page } from '@playwright/test';

const widths = [320, 375, 390, 414, 430];
const session = { roomCode: 'AB7K', hostName: 'Host', sessionName: 'A walk by the lake', status: 'LIVE', visibility: 'public', guestCount: 2, pendingRequests: 0, hostConnected: true, everJoined: true, locked: false, pinRequired: false, capacity: 10, createdAt: new Date().toISOString(), expiresAt: Date.now() + 9_000_000 };
async function fixture(page: Page, count = 1, warning = false) {
  let waiting = Array.from({ length: count }, (_, index) => ({ id: `guest-${index}`, name: index ? `Guest ${index}` : 'Jon' }));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (path.endsWith('/public')) data = { ...session, ...(warning ? { cameraMissingSince: Date.now() - 10_000 } : {}) };
    if (path.endsWith('/requests')) data = waiting;
    if (path.endsWith('/decide')) {
      const body = route.request().postDataJSON() as { ids: string[] };
      waiting = waiting.filter(r => !body.ids.includes(r.id));
    }
    if (path === '/api/access') data = { owner: true, authorized: true, request: null };
    if (path.endsWith('/active')) data = null;
    if (path.endsWith('/available')) data = [{ id: 'public', label: 'A very long session name that should wrap within the available width', status: 'Waiting for guests' }];
    if (path.endsWith('/access-requests')) data = [{ id: 'one', name: 'A visiting Host with a long display name', status: 'pending', createdAt: Date.now() }];
    if (path.endsWith('/push-key')) data = { publicKey: null };
    if (path === '/api/owner/sessions') data = { capacity: 2, sessions: [session] };
    await route.fulfill({ json: { success: true, data } });
  });
  return (next: typeof waiting) => { waiting = next; };
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, scale: visualViewport?.scale }))).toEqual({ width: page.viewportSize()!.width, scroll: page.viewportSize()!.width, scale: 1 });
}
async function hostGeometry(page: Page) {
  const geometry = await page.evaluate(() => {
    const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return { code: box('.host-room-code'), header: box('.host-room-header'), actions: box('.host-status-actions'), timer: box('.session-time-left'), status: box('.host-status-row'), video: box('.video-stage'), controls: box('.controls-bar') };
  });
  expect(geometry.code.bottom).toBeLessThanOrEqual(geometry.status.y);
  expect(geometry.actions.right).toBeLessThanOrEqual(geometry.timer.x);
  expect(geometry.timer.right).toBeGreaterThanOrEqual(page.viewportSize()!.width - 12);
  expect(geometry.timer.y).toBeGreaterThanOrEqual(geometry.status.y);
  expect(geometry.timer.bottom).toBeLessThanOrEqual(geometry.status.bottom);
  expect(geometry.video.y).toBe(geometry.status.bottom);
  expect(geometry.video.bottom).toBe(geometry.controls.y);
  expect(geometry.header.height + geometry.status.height).toBeLessThanOrEqual(92);
  expect(geometry.video.height).toBeGreaterThan(page.viewportSize()!.height * .45);
  await noOverflow(page);
  return geometry;
}
for (const width of widths) {
  for (const landscape of [false, true]) {
    const size = landscape ? { width: 740, height: width } : { width, height: 740 };
    test(`Host ${size.width}x${size.height}: clear code, inline admission and fixed right timer`, async ({ page }, info) => {
      await page.setViewportSize(size); await fixture(page);
      await page.goto('/layout/index.html?variant=host&status=1');
      await expect(page.getByRole('button', { name: 'Allow', exact: true })).toBeVisible();
      const before = await hostGeometry(page);
      const group = await page.locator('.admission-inline').boundingBox();
      for (const name of ['Allow', 'Deny']) {
        const button = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(button!.height).toBeGreaterThanOrEqual(44); expect(button!.y).toBeGreaterThanOrEqual(group!.y);
        expect(button!.y + button!.height).toBeLessThanOrEqual(group!.y + group!.height);
      }
      await page.screenshot({ path: `/tmp/viewcircle-responsive-${info.project.name}-${size.width}x${size.height}.png` });
      await page.getByRole('button', { name: width % 2 ? 'Deny' : 'Allow', exact: true }).click();
      await expect(page.locator('.admission-inline')).toHaveCount(0);
      const after = await hostGeometry(page); expect(after.timer).toEqual(before.timer); expect(after.video).toEqual(before.video); expect(after.code).toEqual(before.code);
    });
  }
  test(`All pages fit at ${width}px without browser zoom`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 }); await fixture(page, 0);
    for (const path of ['/', '/host', '/host/AB7K', '/join', '/join?room=AB7K', '/owner', '/ended', '/layout/index.html?variant=pip']) {
      await page.goto(path); await expect(page.locator('main').first()).toBeVisible();
      if (path === '/host') await expect(page.getByRole('heading', { name: 'Create your circle' })).toBeVisible();
      if (path === '/host/AB7K') await expect(page.getByRole('heading', { name: 'Set up your camera and mic' })).toBeVisible();
      if (path === '/join') await expect(page.getByRole('button', { name: 'Request to Join' })).toBeVisible();
      if (path === '/owner') await expect(page.getByRole('heading', { name: 'Session Management' })).toBeVisible();
      await noOverflow(page);
      const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
      expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\D|$)/);
    }
    await page.route('**/api/access', route => route.fulfill({ json: { success: true, data: { owner: false, authorized: false, request: null } } }));
    await page.goto('/owner'); await expect(page.getByRole('button', { name: 'Owner Login' })).toBeVisible(); await noOverflow(page);
    expect(await page.getByLabel('Password', { exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await page.goto('/host'); await expect(page.getByRole('button', { name: 'Request Access' })).toBeVisible(); await noOverflow(page);
    await page.route('**/api/sessions/AB7K/public', route => route.fulfill({ status: 404, json: { success: false, error: { code: 'SESSION_NOT_FOUND', message: 'This session could not be found.' } } }));
    await page.goto('/host/AB7K'); await expect(page.getByRole('alert')).toBeVisible(); await noOverflow(page);
  });
}
test('Multiple requests use Review and preserve timer position through admission', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 }); await fixture(page, 3);
  await page.goto('/layout/index.html?variant=host&status=1');
  await expect(page.getByText('3 guests waiting')).toBeVisible(); const before = await hostGeometry(page);
  await expect(page.getByRole('button', { name: 'Allow', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Review waiting Guests' }).click();
  const dialog = page.getByRole('dialog', { name: 'Guest requests' }); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Allow', exact: true })).toHaveCount(3);
  await dialog.getByRole('button', { name: 'Allow All Waiting' }).click(); await expect(dialog.getByText('No Guests are waiting.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  expect((await hostGeometry(page)).timer).toEqual(before.timer);
});
test('Recovery notices share a compact region with requests, without obscuring identity', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 }); await fixture(page, 2, true);
  await page.goto('/layout/index.html?variant=host&status=1');
  await expect(page.getByText('Camera recovering')).toBeVisible(); const before = await hostGeometry(page);
  await page.getByRole('button', { name: 'Review session status' }).click();
  await expect(page.getByRole('button', { name: 'Try Camera Again' })).toBeVisible();
  await page.keyboard.press('Escape'); expect((await hostGeometry(page)).timer).toEqual(before.timer);
  await expect(page.getByRole('button', { name: 'Review 2 waiting Guests' })).toBeVisible();
});

test('Arrival and denial keep the timer and video fixed on short landscape screens', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 }); const setWaiting = await fixture(page, 0);
  await page.goto('/layout/index.html?variant=host&status=1');
  await expect(page.getByLabel('Time left')).toContainText('2h 30m'); const before = await hostGeometry(page);
  setWaiting([{ id: 'arrival', name: 'Alexandra with a longer display name' }]);
  await expect(page.getByRole('button', { name: 'Allow', exact: true })).toBeVisible();
  expect((await hostGeometry(page)).timer).toEqual(before.timer);
  await page.getByRole('button', { name: 'Deny', exact: true }).click();
  await expect(page.locator('.admission-inline')).toHaveCount(0);
  const after = await hostGeometry(page); expect(after.timer).toEqual(before.timer); expect(after.video).toEqual(before.video);
});

test('Urgent countdown stays readable at 320px while requests remain reviewable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 }); await fixture(page, 2);
  await page.route('**/api/sessions/AB7K/public', route => route.fulfill({ json: { success: true, data: { ...session, aloneSince: Date.now() - 100_000 } } }));
  await page.goto('/layout/index.html?variant=host&status=1');
  const summary = page.locator('.host-status-summary'); await expect(summary).toContainText('Ending in');
  expect(await summary.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true); await hostGeometry(page);
  await page.getByRole('button', { name: 'Review session status' }).click();
  await page.getByRole('button', { name: 'Review waiting Guests (2)' }).click();
  await expect(page.getByRole('dialog', { name: 'Guest requests' })).toBeVisible();
});
