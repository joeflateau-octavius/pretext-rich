import { expect, test } from '@playwright/test';

const CHAT_WIDTHS = [240, 320, 480, 680];

async function openDemo(page: import('@playwright/test').Page) {
  await page.goto('/docs/index.html');
  await page.locator('#app').waitFor({ state: 'visible' });
}

async function setChatWidth(page: import('@playwright/test').Page, width: number) {
  await page.locator('#widthSlider').evaluate((el, value) => {
    const input = el as HTMLInputElement;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, width);
  await expect(page.locator('#widthValue')).toHaveText(`${width}px`);
}

test('no horizontal overflow in chat container across widths', async ({ page }) => {
  await openDemo(page);

  const render = page.locator('#chatRender');

  for (const width of CHAT_WIDTHS) {
    await setChatWidth(page, width);

    const box = await render.boundingBox();
    expect(box).toBeTruthy();

    const containerMetrics = await render.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));

    expect(containerMetrics.scrollWidth).toBeLessThanOrEqual(containerMetrics.clientWidth + 1);

    const lineBounds = await page.locator('#chatRender .render-line').evaluateAll((lines) =>
      lines.map((line) => {
        const rect = (line as HTMLElement).getBoundingClientRect();
        return { right: rect.right };
      }),
    );

    for (const line of lineBounds) {
      expect(line.right).toBeLessThanOrEqual((box?.x ?? 0) + (box?.width ?? 0) + 1);
    }
  }
});

test('mention chip geometry is stable across widths', async ({ page }) => {
  await openDemo(page);

  type Geometry = {
    paddingLeft: number;
    paddingRight: number;
    chromeWidth: number;
    avatarWidth: number;
    avatarHeight: number;
  };

  const geometries: Geometry[] = [];

  for (const width of CHAT_WIDTHS) {
    await setChatWidth(page, width);

    const geometry = await page.locator('#chatRender [data-kind="mention-chip"]').first().evaluate((chip) => {
      const style = getComputedStyle(chip as HTMLElement);
      const avatar = chip.querySelector('.avatar-circle') as HTMLElement;
      const avatarRect = avatar.getBoundingClientRect();

      return {
        paddingLeft: parseFloat(style.paddingLeft),
        paddingRight: parseFloat(style.paddingRight),
        chromeWidth: parseFloat((chip as HTMLElement).dataset.chromeWidth || '0'),
        avatarWidth: avatarRect.width,
        avatarHeight: avatarRect.height,
      };
    });

    geometries.push(geometry);
  }

  const baseline = geometries[0];
  for (const g of geometries) {
    expect(Math.abs(g.paddingLeft - g.paddingRight)).toBeLessThanOrEqual(0.1);
    expect(g.paddingLeft).toBeCloseTo(g.chromeWidth / 2, 1);

    expect(g.paddingLeft).toBeCloseTo(baseline.paddingLeft, 1);
    expect(g.paddingRight).toBeCloseTo(baseline.paddingRight, 1);
    expect(g.avatarWidth).toBeCloseTo(baseline.avatarWidth, 1);
    expect(g.avatarHeight).toBeCloseTo(baseline.avatarHeight, 1);
  }
});

test('emoji inline box size is stable across widths', async ({ page }) => {
  await openDemo(page);

  const sizes: Array<{ width: number; height: number; flexShrink: string }> = [];

  for (const width of CHAT_WIDTHS) {
    await setChatWidth(page, width);
    const size = await page.locator('#chatRender [data-kind="inline-box"]').first().evaluate((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      const style = getComputedStyle(el as HTMLElement);
      return {
        width: rect.width,
        height: rect.height,
        flexShrink: style.flexShrink,
      };
    });
    sizes.push(size);
  }

  const baseline = sizes[0];
  for (const size of sizes) {
    expect(size.width).toBeCloseTo(baseline.width, 1);
    expect(size.height).toBeCloseTo(baseline.height, 1);
    expect(size.flexShrink).toBe('0');
  }
});

test('nested layout section renders without overflow', async ({ page }) => {
  await openDemo(page);

  const nestedRenderAreas = page.locator('#demo-nested .nested-render-area');
  const count = await nestedRenderAreas.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const area = nestedRenderAreas.nth(i);
    const areaBox = await area.boundingBox();
    expect(areaBox).toBeTruthy();

    const metrics = await area.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);

    const lineRights = await area.locator('.render-line').evaluateAll((lines) =>
      lines.map((line) => (line as HTMLElement).getBoundingClientRect().right),
    );

    for (const right of lineRights) {
      expect(right).toBeLessThanOrEqual((areaBox?.x ?? 0) + (areaBox?.width ?? 0) + 1);
    }
  }
});

test('international section keeps CJK/emoji glyphs and is visible', async ({ page }) => {
  await openDemo(page);

  const intlTexts = await page.locator('#demo-intl .intl-text').allInnerTexts();
  expect(intlTexts.length).toBeGreaterThan(0);

  const containsNonLatin = intlTexts.some((t) => /[\u0600-\u06FF\u3040-\u30FF\u3400-\u9FFF\u{1F300}-\u{1FAFF}]/u.test(t));
  expect(containsNonLatin).toBeTruthy();

  for (const text of intlTexts) {
    expect(text.includes('\uFFFD')).toBeFalsy();
  }

  await expect(page.locator('#demo-intl')).toBeVisible();
  await page.locator('#demo-intl').screenshot({ path: test.info().outputPath('international-smoke.png') });
});
