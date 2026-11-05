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
