import { expect, test } from '@playwright/test';

for (const [width, height] of [[390,844], [844,390], [1440,900]]) {
  test(`Host zoom ${width}x${height}: mouse/keyboard and overlay stay clear of existing controls`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/layout/index.html?variant=host&zoom=supported');
    const zoom = page.getByRole('group', { name: 'Host camera zoom' });
    await expect(zoom).toBeVisible();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(page.getByLabel('Current camera zoom')).toHaveText('0.75×');
    const slider = page.getByRole('slider', { name: 'Camera zoom' });
    await slider.focus(); await page.keyboard.press('End');
    await expect(page.getByLabel('Current camera zoom')).toHaveText('3.5×');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByLabel('Current camera zoom')).toHaveText('3.25×');
    const errors = await page.evaluate(() => {
      const failures: string[] = [];
      const stage = document.querySelector('.video-stage')!.getBoundingClientRect();
      const overlay = document.querySelector('.host-camera-zoom')!.getBoundingClientRect();
      const nav = document.querySelector('.controls-bar')!.getBoundingClientRect();
      if (overlay.left < stage.left || overlay.right > stage.right || overlay.top < stage.top || overlay.bottom > stage.bottom) failures.push('zoom outside preview');
      if (overlay.bottom > nav.top) failures.push('zoom overlaps Host controls');
      if (document.documentElement.scrollWidth > innerWidth) failures.push('horizontal overflow');
      return failures;
    });
    expect(errors).toEqual([]);
    await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(8);
    await expect(page.getByRole('button', { name: 'End Session' })).toBeVisible();
    await page.goto('/layout/index.html?variant=host'); await expect(zoom).toHaveCount(0);
    await page.goto('/layout/index.html?variant=pip&zoom=supported'); await expect(zoom).toHaveCount(0);
  });
}

test('hybrid input on a wide viewport expands touch dial, accepts mouse and auto-collapses', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 }));
  await page.goto('/layout/index.html?variant=host&zoom=supported');
  await page.getByRole('button', { name: 'Camera zoom 0.5×' }).click();
  const slider = page.getByRole('slider', { name: 'Camera zoom' });
  await expect(slider).toBeVisible();
  await slider.fill('2');
  await expect(page.getByRole('button', { name: 'Camera zoom 2×' })).toBeVisible();
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect(page.getByRole('button', { name: 'Camera zoom 1.75×' })).toBeVisible();
  await expect(slider).toHaveCount(0, { timeout: 6500 });
  await expect(page.getByRole('button', { name: 'Camera zoom 1.75×' })).toBeVisible();
});
