import { expect, test } from '@playwright/test';

const CHAT_WIDTHS = [240, 320, 480, 510, 680];

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

async function setTagWidth(page: import('@playwright/test').Page, width: number) {
  await page.locator('#tagWidthSlider').evaluate((el, value) => {
    const input = el as HTMLInputElement;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, width);
  await expect(page.locator('#tagWidthValue')).toHaveText(`${width}px`);
}

test('no horizontal overflow in chat shell/rail across widths', async ({ page }) => {
  await openDemo(page);

  const shell = page.locator('#chatRender');
  const rail = page.locator('#chatRenderContent');

  for (const width of CHAT_WIDTHS) {
    await setChatWidth(page, width);

    const railBox = await rail.boundingBox();
    expect(railBox).toBeTruthy();

    const shellMetrics = await shell.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));

    expect(shellMetrics.scrollWidth).toBeLessThanOrEqual(shellMetrics.clientWidth + 1);

    const lineRights = await page.locator('#chatRenderContent .render-line').evaluateAll((lines) =>
      lines.map((line) => {
        const lineRect = (line as HTMLElement).getBoundingClientRect();
        const children = Array.from(line.children) as HTMLElement[];
        const rightmostChild = children.reduce((max, child) => Math.max(max, child.getBoundingClientRect().right), lineRect.left);
        return { lineRight: lineRect.right, rightmostChild };
      }),
    );

    for (const { lineRight, rightmostChild } of lineRights) {
      expect(lineRight).toBeLessThanOrEqual((railBox?.x ?? 0) + (railBox?.width ?? 0) + 1);
      expect(rightmostChild).toBeLessThanOrEqual((railBox?.x ?? 0) + (railBox?.width ?? 0) + 1);
    }
  }
});

test('chat does not overflow at width 510', async ({ page }) => {
  await openDemo(page);
  await setChatWidth(page, 510);

  const shellMetrics = await page.locator('#chatRender').evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(shellMetrics.scrollWidth).toBeLessThanOrEqual(shellMetrics.clientWidth + 1);

  const rail = page.locator('#chatRenderContent');
  const railMetrics = await rail.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(railMetrics.scrollWidth).toBeLessThanOrEqual(railMetrics.clientWidth + 1);

  const railRight = await rail.evaluate((el) => el.getBoundingClientRect().right);
  const rightmostPerLine = await page.locator('#chatRenderContent .render-line').evaluateAll((lines) =>
    lines.map((line) => {
      const lineEl = line as HTMLElement;
      const children = Array.from(lineEl.children) as HTMLElement[];
      return children.reduce((max, child) => Math.max(max, child.getBoundingClientRect().right), lineEl.getBoundingClientRect().left);
    }),
  );

  for (const right of rightmostPerLine) {
    expect(right).toBeLessThanOrEqual(railRight + 1);
  }
});

test('nested status tag chips respect allocated composite width and rail bounds', async ({ page }) => {
  await openDemo(page);

  for (const width of [260, 320, 420, 510]) {
    await setTagWidth(page, width);

    const chipMetrics = await page.locator('#tagRenderContent [data-kind="tag-chip"]').evaluateAll((chips) =>
      chips.map((chip) => {
        const el = chip as HTMLElement;
        const rail = el.closest('.render-content') as HTMLElement;
        const line = el.closest('.render-line') as HTMLElement;
        const rect = el.getBoundingClientRect();
        const railRect = rail.getBoundingClientRect();
        const lineRect = line.getBoundingClientRect();
        const expectedOuterWidth = parseFloat(el.dataset.expectedOuterWidth || '0');
        const renderedOuterWidth = rect.width;
        return {
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          right: rect.right,
          railRight: railRect.right,
          lineRight: lineRect.right,
          renderedOuterWidth,
          expectedOuterWidth,
        };
      }),
    );

    expect(chipMetrics.length).toBeGreaterThan(0);

    for (const chip of chipMetrics) {
      expect(chip.scrollWidth).toBeLessThanOrEqual(chip.clientWidth + 1);
      expect(chip.right).toBeLessThanOrEqual(chip.railRight + 1);
      expect(chip.right).toBeLessThanOrEqual(chip.lineRight + 1);
      expect(chip.renderedOuterWidth).toBeCloseTo(chip.expectedOuterWidth, 1);
    }
  }
});

test('status tag chips do not overflow their own boxes', async ({ page }) => {
  await openDemo(page);

  for (const width of [260, 320, 420]) {
    await setTagWidth(page, width);

    const chipMetrics = await page.locator('#tagRenderContent [data-kind="tag-chip"]').evaluateAll((chips) =>
      chips.map((chip) => {
        const el = chip as HTMLElement;
        const rail = el.closest('.render-content') as HTMLElement | null;
        const chipRect = el.getBoundingClientRect();
        const railRect = rail?.getBoundingClientRect();
        return {
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          right: chipRect.right,
          railRight: railRect?.right ?? Number.POSITIVE_INFINITY,
        };
      }),
    );

    expect(chipMetrics.length).toBeGreaterThan(0);

    for (const chip of chipMetrics) {
      expect(chip.scrollWidth).toBeLessThanOrEqual(chip.clientWidth + 1);
      expect(chip.right).toBeLessThanOrEqual(chip.railRight + 1);
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

test('nested layout section renders without shell/rail overflow', async ({ page }) => {
  await openDemo(page);

  const nestedRenderAreas = page.locator('#demo-nested .nested-render-area');
  const count = await nestedRenderAreas.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const area = nestedRenderAreas.nth(i);
    const rail = area.locator('.render-content').first();

    const railBox = await rail.boundingBox();
    expect(railBox).toBeTruthy();

    const metrics = await area.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);

    const lineRights = await rail.locator('.render-line').evaluateAll((lines) =>
      lines.map((line) => (line as HTMLElement).getBoundingClientRect().right),
    );

    for (const right of lineRights) {
      expect(right).toBeLessThanOrEqual((railBox?.x ?? 0) + (railBox?.width ?? 0) + 1);
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
