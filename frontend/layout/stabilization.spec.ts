import { expect, test } from '@playwright/test';
for (const width of [375,390,393,414,430]) for (const landscape of [false,true]) {
  for (const variant of ['host','safari']) test(`live bounds ${variant} ${width} ${landscape ? 'landscape' : 'portrait'}`, async ({ page }) => {
    const size = landscape ? { width:844, height:width } : { width, height:844 };
    await page.setViewportSize(size);
    await page.addInitScript(() => {
      const viewport = Object.assign(new EventTarget(), { width:innerWidth, height:innerHeight, offsetLeft:0, offsetTop:0, scale:1 });
      Object.defineProperty(window, 'visualViewport', { configurable:true, value:viewport });
    });
    await page.route(/^https?:\/\/[^/]+\/api\//, route => route.fulfill({ json:{ success:true, data:null } }));
    await page.goto(`/layout/index.html?variant=${variant}&chat=1&zoom=supported${variant === 'host' ? '&status=1' : ''}`);
    await page.getByRole('button', { name:'Open chat' }).click();
    for (let i=0;i<12;i++) { await page.getByRole('textbox', { name:'Message' }).fill(`Long message ${i} with enough content to fill the message stream`); await page.getByRole('button', { name:'Send',exact:true }).click(); }
    const inspect = () => page.evaluate(() => {
      const vv = window.visualViewport!;
      const main = document.querySelector('.live-page')!.getBoundingClientRect();
      const logo = document.querySelector('.live-header > strong')!.getBoundingClientRect();
      const chat = document.querySelector('.session-chat')!.getBoundingClientRect();
      const log = document.querySelector('.chat-messages')!;
      return { mainX:main.x, logoX:logo.x-main.x, logoVisible:logo.left >= vv.offsetLeft && logo.right <= vv.offsetLeft+vv.width, chatVisible:chat.left >= vv.offsetLeft && chat.right <= vv.offsetLeft+vv.width, overflow:document.documentElement.scrollWidth > innerWidth, height:chat.height, scrollable:log.scrollHeight > log.clientHeight };
    });
    const before = await inspect();
    expect(before.logoVisible && before.chatVisible && !before.overflow).toBe(true);
    expect(before.height).toBeLessThanOrEqual(size.height*(landscape?.5:1/3)+1); expect(before.scrollable).toBe(true);
    if (variant === 'host') {
      const code = await page.evaluate(() => {
        const logo = document.querySelector('.host-room-header > strong')!;
        const code = document.querySelector('.host-room-code')!;
        return { gap:code.getBoundingClientRect().left-logo.getBoundingClientRect().right, size:parseFloat(getComputedStyle(code).fontSize), logoSize:parseFloat(getComputedStyle(logo).fontSize) };
      });
      expect(code.gap).toBeCloseTo(20,0); expect(code.size).toBeGreaterThanOrEqual(code.logoSize*.9);
      await expect(page.getByRole('group', { name:'Host camera zoom' })).toBeVisible();
    }
    // Model Safari visual-viewport pan and keyboard resize independently of
    // the layout viewport. Physical keyboard animation remains a device check.
    await page.evaluate(() => {
      Object.assign(window.visualViewport!, { offsetLeft:8, offsetTop:12, width:innerWidth-16, height:innerHeight-180 });
      window.visualViewport!.dispatchEvent(new Event('resize'));
    });
    const keyboard = await inspect();
    expect(keyboard.mainX).toBe(8); expect(keyboard.logoX).toBe(before.logoX);
    expect(keyboard.logoVisible && keyboard.chatVisible && !keyboard.overflow).toBe(true);
    await page.evaluate(() => { Object.assign(window.visualViewport!, { offsetLeft:0, offsetTop:0, width:innerWidth, height:innerHeight }); window.visualViewport!.dispatchEvent(new Event('resize')); });
    expect((await inspect()).logoX).toBe(before.logoX);
  });
}
