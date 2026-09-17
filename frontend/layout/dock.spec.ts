import { test, expect } from '@playwright/test';
const sizes = [[320,568],[375,667],[390,844],[393,852],[430,932],[360,800],[412,915],[768,1024],[820,1180],[1024,1366]];
for (const [width, height] of [...sizes.flatMap(([w,h]) => [[w,h],[h,w]]), [1440,900]]) {
  test(`${width}x${height}: Guest overlays and shared Host controls`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    for (const variant of ['pip', 'safari', 'hidden', 'busy', 'return', 'active', 'host']) {
      await page.goto(`/layout/index.html?variant=${variant}`);
      await expect(page.getByRole('navigation')).toBeVisible();
      await expect(page.getByRole('button', { name: /rotate|fullscreen|full screen/i })).toHaveCount(0);
      // Simulated notch/home indicator exclusions, not physical iOS validation.
      await page.addStyleTag({ content: '.guest-dock, .controls-bar { padding-bottom:34px; padding-left:44px; padding-right:44px; }' });
      const errors = await page.evaluate((host) => {
        const failures: string[] = [];
        const controls = [...document.querySelectorAll('nav button')];
        const rects = controls.map(control => control.getBoundingClientRect());
        const video = document.querySelector('.video-stage')!.getBoundingClientRect();
        const header = document.querySelector('.live-header')!.getBoundingClientRect();
        const landscape = innerWidth > innerHeight && !host;
        if (landscape && [video.x, video.y, video.width - innerWidth, video.height - innerHeight].some(value => Math.abs(value) > 1)) failures.push('landscape video does not fill viewport');
        rects.forEach((rect, index) => {
          const control = controls[index]!;
          const name = control.getAttribute('aria-label');
          if (!control.querySelector('svg') || !control.querySelector('span')) failures.push(`${name}: missing icon/label`);
          if (rect.width < 44 || rect.height < 44) failures.push(`${name}: small target`);
          if (rect.left < 44 || rect.right > innerWidth - 44 || rect.top < header.bottom || rect.bottom > innerHeight - 34) failures.push(`${name}: outside safe viewport or overlaps header`);
          if (!landscape && rect.top < video.bottom - 1) failures.push(`${name}: intersects portrait/Host video`);
          rects.slice(index + 1).forEach(other => { if (rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top) failures.push(`${name}: overlap`); });
        });
        const danger = document.querySelector('.is-danger')!;
        if (parseFloat(getComputedStyle(danger).marginInlineStart) < 8) failures.push('missing destructive separation');
        if (video.width <= 0 || video.height <= 0) failures.push('no video area');
        if (document.documentElement.scrollWidth > innerWidth) failures.push('horizontal overflow');
        return failures;
      }, variant === 'host');
      expect(errors, variant).toEqual([]);
    }
  });
}
for (const [width, height] of [[390,844],[844,390]]) {
  test(`${width}x${height}: dock fades without changing geometry or adding controls`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await page.clock.install();
    await page.goto('/layout/index.html?variant=safari');
    const dock = page.locator('.guest-dock');
    await expect(dock).toHaveCSS('background-color', 'rgba(11, 16, 32, 0.23)');
    await expect(dock).toHaveCSS('opacity', '1');
    await expect(page.getByRole('button')).toHaveCount(5);
    await expect(page.getByRole('button', { name: /hide controls|show controls|rotate|fullscreen/i })).toHaveCount(0);
    const geometry = () => page.locator('.video-stage, .guest-dock, .guest-dock button').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON() as Record<string, number>));
    const before = await geometry();
    await page.clock.runFor(4800);
    await expect(dock).toHaveCSS('opacity', '0');
    await expect(page.getByRole('button')).toHaveCount(0);
    expect(await geometry()).toEqual(before);
    await page.locator('.video-stage').click({ position: { x: 80, y: 80 } });
    await page.clock.runFor(250);
    await expect(dock).toHaveCSS('opacity', '1');
    expect(await geometry()).toEqual(before);
    await expect(page.getByRole('button', { name: 'Leave session' })).toBeVisible();
    await page.clock.runFor(4000); await expect(dock).toHaveAttribute('aria-hidden', 'false');
    await page.clock.runFor(600); await expect(dock).toHaveAttribute('aria-hidden', 'true');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(dock).toHaveCSS('transition-duration', '0s');
  });
}
