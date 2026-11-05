import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

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

test('fits and fills its container as the container resizes', async ({ page }) => {
  // window error events, which is how browsers report ResizeObserver loops
  await page.addInitScript(() => {
    const errors: string[] = ((window as any).errors = []);
    window.addEventListener('error', (e) => errors.push(e.message));
  });
  await page.goto('/tests/fixtures/index.html');
  const container = page.locator('#container');

  // 200px is below the min-cols floor (80 cols at 8px), where the font scales down
  for (const width of [1200, 800, 400, 200, 800, 1200]) {
    await container.evaluate((el, w) => (el.style.width = `${w}px`), width);
    await expect.poll(() => fit(page), { message: `at ${width}px` }).toEqual({ fits: true, fills: true });
  }

  expect(await page.evaluate(() => (window as any).errors)).toEqual([]);
});

// how frameworks (React, Vue, ...) create elements; src is set before the
// element is on the page
test('renders when created from JS', async ({ page }) => {
  await page.goto('/tests/fixtures/index.html');
  await page.evaluate(() => {
    document.querySelector('ascii-img')!.remove();
    const el = document.createElement('ascii-img');
    el.setAttribute('src', './test-image.jpg');
    document.querySelector('#container')!.append(el);
  });

  await expect.poll(() => fit(page)).toEqual({ fits: true, fills: true });
});

test('shows the latest src when an earlier image finishes loading last', async ({ page }) => {
  // slow.jpg is the test photo, held back until we release it
  let releaseSlow!: () => void;
  const slow = new Promise<void>((resolve) => (releaseSlow = resolve));
  await page.route('**/slow.jpg', async (route) => {
    await slow;
    await route.fulfill({ path: path.join(__dirname, 'fixtures/test-image.jpg') });
  });

  await page.goto('/tests/fixtures/index.html');
  await expect.poll(() => fit(page)).toEqual({ fits: true, fills: true });

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
  const artChars = () =>
    page.evaluate(() => {
      const text = document.querySelector('ascii-img')!.shadowRoot!.querySelector('pre')!.textContent!;
      return [...new Set(text.replace(/\n/g, ''))].join('');
    });
  await expect.poll(artChars).toBe('@');

  // now let the photo arrive; there's no event for "the component ignored it",
  // so give it time to load before checking
  const slowLoaded = page.waitForEvent('requestfinished', (r) => r.url().endsWith('slow.jpg'));
  releaseSlow();
  await slowLoaded;
  await page.waitForTimeout(500);
  expect(await artChars()).toBe('@');

  // and it must still be the white image after the next re-render
  await page.locator('#container').evaluate((el) => (el.style.width = '600px'));
  await expect.poll(() => fit(page)).toEqual({ fits: true, fills: true });
  expect(await artChars()).toBe('@');
});

test('keeps the image proportions', async ({ page }) => {
  await page.goto('/tests/fixtures/index.html');
  await expect.poll(() => fit(page)).toEqual({ fits: true, fills: true });

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

test('does not make a narrow page scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/tests/fixtures/index.html');
  await expect.poll(() => fit(page)).toEqual({ fits: true, fills: true });

  const { scrollWidth, clientWidth } = await page.evaluate(() => {
    const { scrollWidth, clientWidth } = document.documentElement;
    return { scrollWidth, clientWidth };
  });
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
