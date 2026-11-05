import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

// creates an <ascii-img> with these attributes, set in order, the way
// frameworks (React, Vue, ...) do, and waits for its first render
async function mount(page: Page, attributes: Record<string, string>) {
  await page.evaluate(async (attributes) => {
    const el = document.createElement('ascii-img');
    for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
    document.querySelector('#container')!.replaceChildren(el);
    const pre = el.shadowRoot!.querySelector('pre')!;
    while (!pre.textContent) await new Promise((r) => requestAnimationFrame(r));
  }, attributes);
}

const art = (page: Page) =>
  page.evaluate(() => document.querySelector('ascii-img')!.shadowRoot!.querySelector('pre')!.textContent!);

// Does the rendered text fit inside the component, and fill it to within
// one character?
async function fit(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('ascii-img')!;
    const pre = el.shadowRoot!.querySelector('pre')!;
    if (!pre.textContent) return null;

    const range = document.createRange();
    range.selectNodeContents(pre);
    const textRight = Math.max(...Array.from(range.getClientRects(), (r) => r.right));
    const right = el.getBoundingClientRect().right;
    const charWidth = (textRight - pre.getBoundingClientRect().left) / pre.textContent.indexOf('\n');

    return { fits: textRight <= right + 0.5, fills: right - textRight < charWidth };
  });
}

// fraction of the art's characters that are the same as converting the
// full-size image directly, at the same cols and rows
async function matchWithFullSize(page: Page) {
  return page.evaluate(async () => {
    const el = document.querySelector('ascii-img')!;
    const art = el.shadowRoot!.querySelector('pre')!.textContent!;
    const lines = art.trimEnd().split('\n');

    const img = new Image();
    img.src = el.getAttribute('src')!;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const wasm = '/packages/wasm/pkg/ascii_web.js';
    const { default: init, ascii_art } = await import(wasm);
    await init();
    const full: string = ascii_art(new Uint8Array(pixels.buffer), canvas.width, canvas.height, lines[0].length, lines.length);

    let same = 0;
    for (let i = 0; i < art.length; i++) if (art[i] === full[i]) same++;
    return same / art.length;
  });
}

test.beforeEach(async ({ page }) => {
  // window error events, which is how browsers report ResizeObserver loops
  await page.addInitScript(() => {
    const errors: string[] = ((window as any).errors = []);
    window.addEventListener('error', (e) => errors.push(e.message));
  });
  await page.goto('/tests/fixtures/index.html');
});

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => (window as any).errors)).toEqual([]);
});

// upgraded rather than created, which runs the callbacks in a different order
test('renders when written in HTML', async ({ page }) => {
  await page.locator('#container').evaluate((el) => (el.innerHTML = '<ascii-img src="./test-image.jpg"></ascii-img>'));

  await expect.poll(() => fit(page)).toEqual({ fits: true, fills: true });
});

test('fits and fills its container as the container resizes', async ({ page }) => {
  await mount(page, { src: './test-image.jpg' });
  const container = page.locator('#container');

  // 200px is below the min-cols floor (80 cols at 8px), where the font scales down
  for (const width of [1200, 800, 400, 200, 800, 1200]) {
    await container.evaluate((el, w) => (el.style.width = `${w}px`), width);
    await expect.poll(() => fit(page), { message: `at ${width}px` }).toEqual({ fits: true, fills: true });
  }
});

// when the element's size doesn't depend on its content (here a fixed aspect
// ratio, like the infinite scroll example), a font change doesn't resize it
test('re-renders when the font size changes but the element size does not', async ({ page }) => {
  await mount(page, { src: './test-image.jpg' });
  const el = page.locator('ascii-img');
  // twice as tall as wide, so the art never sets the height
  await el.evaluate((el: HTMLElement) => (el.style.aspectRatio = '1 / 2'));
  await expect.poll(() => fit(page)).toEqual({ fits: true, fills: true });

  await el.evaluate((el: HTMLElement) => el.style.setProperty('--ascii-font-size', '6px'));

  await expect.poll(() => fit(page)).toEqual({ fits: true, fills: true });
});

// otherwise the old art shows at the new size for a frame: a visible flash
test('changes the font size and the art together', async ({ page }) => {
  await mount(page, { src: './test-image.jpg' });

  const { before, sizeRightAfter } = await page.evaluate(() => {
    const el = document.querySelector('ascii-img') as HTMLElement;
    const pre = el.shadowRoot!.querySelector('pre')!;
    const before = { art: pre.textContent, fontSize: getComputedStyle(pre).fontSize };
    el.style.setProperty('--ascii-font-size', '6px');
    return { before, sizeRightAfter: getComputedStyle(pre).fontSize };
  });
  // until the art is re-rendered, it keeps the size it was rendered at
  expect(sizeRightAfter).toBe(before.fontSize);

  await expect.poll(() => art(page)).not.toBe(before.art);
  expect(await page.locator('ascii-img').evaluate((el) => getComputedStyle(el.shadowRoot!.querySelector('pre')!).fontSize)).toBe('6px');
});

test('fills a wide container with a small font', async ({ page }) => {
  await mount(page, { src: './test-image.jpg' });
  // at 4px, a 1200px container needs about 500 columns, within the default max-cols
  await page.locator('ascii-img').evaluate((el: HTMLElement) => el.style.setProperty('--ascii-font-size', '4px'));
  await page.locator('#container').evaluate((el) => (el.style.width = '1200px'));

  await expect.poll(() => fit(page)).toEqual({ fits: true, fills: true });
});

test('does not make a narrow page scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mount(page, { src: './test-image.jpg' });
  await expect.poll(() => fit(page)).toEqual({ fits: true, fills: true });

  const { scrollWidth, clientWidth } = await page.evaluate(() => {
    const { scrollWidth, clientWidth } = document.documentElement;
    return { scrollWidth, clientWidth };
  });
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test('keeps the image proportions', async ({ page }) => {
  await mount(page, { src: './test-image.jpg' });

  const { art, image } = await page.evaluate(async () => {
    const el = document.querySelector('ascii-img')!;

    const img = new Image();
    img.src = el.getAttribute('src')!;
    await img.decode();

    const range = document.createRange();
    range.selectNodeContents(el.shadowRoot!.querySelector('pre')!);
    const { width, height } = range.getBoundingClientRect();

    return { art: width / height, image: img.naturalWidth / img.naturalHeight };
  });

  // within a few percent, for rounding to whole rows
  expect(art / image).toBeCloseTo(1, 1);
});

test('shows the latest src when an earlier image finishes loading last', async ({ page }) => {
  // slow.jpg is the test photo, held back until we release it
  let releaseSlow!: () => void;
  const slow = new Promise<void>((resolve) => (releaseSlow = resolve));
  await page.route('**/slow.jpg', async (route) => {
    await slow;
    await route.fulfill({ path: path.join(__dirname, 'fixtures/test-image.jpg') });
  });
  await mount(page, { src: './test-image.jpg' });

  // switch to the slow photo, then straight away to a plain white image
  await page.evaluate(() => {
    const el = document.querySelector('ascii-img')!;
    el.setAttribute('src', './slow.jpg');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    el.setAttribute('src', canvas.toDataURL());
  });
  const chars = async () => [...new Set((await art(page)).replace(/\n/g, ''))].join('');
  await expect.poll(chars).toBe('@');

  // now let the photo arrive; there's no event for "the component ignored it",
  // so give it time to load before checking
  const slowLoaded = page.waitForEvent('requestfinished', (r) => r.url().endsWith('slow.jpg'));
  releaseSlow();
  await slowLoaded;
  await page.waitForTimeout(500);
  expect(await chars()).toBe('@');

  // and it must still be the white image after the next re-render
  await page.locator('#container').evaluate((el) => (el.style.width = '600px'));
  await expect.poll(() => fit(page)).toEqual({ fits: true, fills: true });
  expect(await chars()).toBe('@');
});

// the component stores large images scaled down; averaging fewer pixels per
// character shifts a few characters one step up or down the brightness scale,
// but the art should be nearly identical

test('art from a large photo matches the full-size photo', async ({ page }) => {
  await mount(page, { src: './notATree.jpg' });

  expect(await matchWithFullSize(page)).toBeGreaterThan(0.9);
});

test('raising max-cols keeps the art matching the full-size photo', async ({ page }) => {
  // stored at 60 cols x 4px = 240px wide, too few pixels for more columns
  await mount(page, { 'max-cols': '60', src: './notATree.jpg' });

  await page.locator('ascii-img').evaluate((el) => el.setAttribute('max-cols', '300'));
  await expect.poll(async () => (await art(page)).indexOf('\n')).toBeGreaterThan(60);

  expect(await matchWithFullSize(page)).toBeGreaterThan(0.9);
});
