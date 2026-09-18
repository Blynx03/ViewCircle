import { expect, test, type Page } from '@playwright/test';

async function contact(page: Page, type: string, id: number, x: number, y: number) {
  await page.locator('.guest-video-viewport').evaluate((stage, point) => {
    const rect = stage.getBoundingClientRect();
    stage.dispatchEvent(new PointerEvent(point.type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: point.id,
      clientX: rect.left + rect.width / 2 + point.x, clientY: rect.top + rect.height / 2 + point.y }));
  }, { type, id, x, y });
}
async function start(page: Page) {
  await contact(page, 'pointerdown', 1, -50, 0); await contact(page, 'pointerdown', 2, 50, 0);
}
async function release(page: Page) {
  await contact(page, 'pointerup', 1, -100, 0); await contact(page, 'pointerup', 2, 100, 0);
}
async function matrix(page: Page) {
  return page.locator('video').evaluate(video => { const m = new DOMMatrix(getComputedStyle(video).transform); return { scale: m.a, x: m.e, y: m.f }; });
}
async function prepare(page: Page) {
  await page.clock.install(); await page.goto('/layout/index.html?variant=safari');
  await expect(page.getByRole('navigation')).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.locator('video').evaluate(video => {
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1600 }); Object.defineProperty(video, 'videoHeight', { configurable: true, value: 900 });
    video.dispatchEvent(new Event('loadedmetadata'));
  });
}
for (const [width, height] of [[390, 844], [844, 390]]) {
  test(`Guest pinch ${width}x${height}: local transform, bounds, tap separation and unchanged layout`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await prepare(page);
    const stage = page.locator('.guest-video-viewport'); const dock = page.locator('.guest-dock');
    const before = await stage.boundingBox();
    await page.clock.runFor(4800); await expect(dock).toHaveAttribute('aria-hidden', 'true');
    await start(page); await contact(page, 'pointermove', 1, -100, 0); await contact(page, 'pointermove', 2, 100, 0); await page.clock.runFor(20);
    expect((await matrix(page)).scale).toBe(2);
    await expect(page.getByLabel('Local video zoom')).toHaveText('2.0×');
    await expect(page.getByLabel('Local video zoom')).toHaveCSS('opacity', '1');
    await release(page);
    await stage.dispatchEvent('click'); await expect(dock).toHaveAttribute('aria-hidden', 'true');
    await contact(page, 'pointerdown', 3, 0, 0); await contact(page, 'pointermove', 3, 3000, 3000); await page.clock.runFor(20);
    const pan = await matrix(page);
    const bounds = await stage.evaluate(element => {
      const r = element.getBoundingClientRect(); const fit = Math.min(r.width / 1600, r.height / 900);
      return { x: Math.max(0, (1600 * fit * 2 - r.width) / 2), y: Math.max(0, (900 * fit * 2 - r.height) / 2) };
    });
    expect(pan.x).toBeCloseTo(bounds.x, 2); expect(pan.y).toBeCloseTo(bounds.y, 2);
    await contact(page, 'pointerup', 3, 3000, 3000); await stage.dispatchEvent('click'); await expect(dock).toHaveAttribute('aria-hidden', 'true');
    await page.clock.runFor(1500); await expect(page.getByLabel('Local video zoom')).toHaveCSS('opacity', '0');
    await contact(page, 'pointerdown', 4, 0, 0); await contact(page, 'pointerup', 4, 0, 0); await stage.dispatchEvent('click');
    await expect(dock).toHaveAttribute('aria-hidden', 'false');
    expect(await stage.boundingBox()).toEqual(before);
    await expect(stage).toHaveCSS('touch-action', 'none');
    await expect(page.getByRole('button', { name: 'Leave session' })).toBeVisible();
    await expect(page.locator('nav button')).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Pinch back below 1x always restores an exactly centered identity transform.
    await start(page); await contact(page, 'pointermove', 1, -5, 0); await contact(page, 'pointermove', 2, 5, 0); await page.clock.runFor(20);
    expect(await matrix(page)).toEqual({ scale: 1, x: 0, y: 0 }); await release(page);
    await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(page.getByLabel('Local video zoom')).toHaveCSS('transition-duration', '0s');
  });
}

test('Guest zoom survives orientation and Host dimension changes with fresh pan bounds', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await prepare(page);
  await start(page); await contact(page, 'pointermove', 1, -200, 0); await contact(page, 'pointermove', 2, 200, 0); await release(page); await page.clock.runFor(20);
  expect((await matrix(page)).scale).toBe(3);
  await page.setViewportSize({ width: 844, height: 390 }); await page.clock.runFor(100);
  expect((await matrix(page)).scale).toBe(3);
  const stage = await page.locator('.video-stage').boundingBox(); expect(stage).toEqual({ x: 0, y: 0, width: 844, height: 390 });
  await page.locator('video').evaluate(video => {
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 900 }); Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1600 }); video.dispatchEvent(new Event('resize'));
  });
  await page.clock.runFor(20); expect((await matrix(page)).x).toBe(0);
  await page.locator('video').dispatchEvent('emptied'); await page.clock.runFor(20); expect(await matrix(page)).toEqual({ scale: 1, x: 0, y: 0 });
});
