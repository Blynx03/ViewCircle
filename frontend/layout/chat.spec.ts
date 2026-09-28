import { test, expect } from '@playwright/test';
for (const [width, height] of [[320,568], [390,844], [844,390], [568,320], [1440,900]]) {
  for (const variant of ['host', 'safari']) test(`chat ${variant} ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto(`/layout/index.html?variant=${variant}&chat=1&zoom=supported`);
    await page.getByRole('button', { name: 'Open chat' }).click();
    await page.getByRole('textbox', { name: 'Message' }).fill('Hello circle');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('log')).toContainText('Host: Hello circle');
    const errors = await page.locator('.session-chat').evaluate(chat => {
      const r = chat.getBoundingClientRect();
      const nav = document.querySelector('nav')!.getBoundingClientRect();
      const header = document.querySelector('header')!.getBoundingClientRect();
      const failures = [];
      if (r.left < 0 || r.right > innerWidth || r.top < header.bottom || r.bottom > nav.top + 1) failures.push('overlap/outside');
      if (innerWidth > innerHeight && r.width > innerWidth / 3 + 1) failures.push('too wide');
      if (innerWidth < innerHeight && r.height > innerHeight / 3 + 1) failures.push('too tall');
      const zoom = document.querySelector('.host-camera-zoom')?.getBoundingClientRect();
      if (zoom && r.left < zoom.right && r.right > zoom.left && r.top < zoom.bottom && r.bottom > zoom.top) failures.push('zoom overlap');
      if (document.documentElement.scrollWidth > innerWidth) failures.push('overflow');
      return failures;
    });
    expect(errors).toEqual([]);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.chat-messages p')).toHaveCSS('transition-duration', '0s');
    await page.getByRole('button', { name: 'Collapse chat' }).click();
    await expect(page.getByRole('log')).toHaveCount(0);
  });
}
