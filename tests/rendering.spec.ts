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

// ═══════════════════════════════════════════════════════════════════
// RESPONSIVE COMPOSITE (QUOTE BLOCK) TESTS
// ═══════════════════════════════════════════════════════════════════

async function setQuoteWidth(page: import('@playwright/test').Page, width: number) {
  await page.locator('#quoteWidthSlider').evaluate((el, value) => {
    const input = el as HTMLInputElement;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, width);
  await expect(page.locator('#quoteWidthValue')).toHaveText(`${width}px`);
}

function getQuoteMetrics(page: import('@playwright/test').Page) {
  return page.locator('#quoteRenderContent [data-kind="generic-composite"]').first().evaluate((el) => {
    const rect = (el as HTMLElement).getBoundingClientRect();
    const innerLines = el.querySelectorAll('.quote-inner-line');
    return {
      outerWidth: rect.width,
      outerHeight: rect.height,
      innerLineCount: innerLines.length,
    };
  });
}

test('quote block expands when container widens', async ({ page }) => {
  await openDemo(page);

  // Set narrow width first
  await setQuoteWidth(page, 400);
  const narrow = await getQuoteMetrics(page);

  // Widen the container
  await setQuoteWidth(page, 600);
  const wide = await getQuoteMetrics(page);

  // Quote should be wider at 600px than at 400px
  expect(wide.outerWidth).toBeGreaterThan(narrow.outerWidth);
});

test('quote block shrinks when container narrows', async ({ page }) => {
  await openDemo(page);

  // Set wide first
  await setQuoteWidth(page, 600);
  const wide = await getQuoteMetrics(page);

  // Narrow the container
  await setQuoteWidth(page, 250);
  const narrow = await getQuoteMetrics(page);

  // Quote should be narrower at 250px than at 600px
  expect(narrow.outerWidth).toBeLessThan(wide.outerWidth);
});

test('quote block maxWidth cap is respected', async ({ page }) => {
  await openDemo(page);

  // The quote has maxWidth: 280, chromeWidth: 24
  // So the outer width should never exceed 280 + 24 = 304px
  await setQuoteWidth(page, 800);
  const metrics = await getQuoteMetrics(page);

  // Max outer width = maxWidth(280) + chromeWidth(24) = 304
  expect(metrics.outerWidth).toBeLessThanOrEqual(304 + 1);
});

test('quote inner content wraps correctly at different widths', async ({ page }) => {
  await openDemo(page);

  // At narrow width, inner text should wrap to more lines
  await setQuoteWidth(page, 250);
  const narrow = await getQuoteMetrics(page);

  // At wider width, fewer lines
  await setQuoteWidth(page, 600);
  const wide = await getQuoteMetrics(page);

  // Narrow should have more inner lines than wide (or at least equal)
  expect(narrow.innerLineCount).toBeGreaterThanOrEqual(wide.innerLineCount);
  // With enough text in the quote, narrow should have strictly more lines
  expect(narrow.innerLineCount).toBeGreaterThan(wide.innerLineCount);
});

test('quote block height reflects inner content line count', async ({ page }) => {
  await openDemo(page);

  // At narrow width
  await setQuoteWidth(page, 250);
  const narrow = await getQuoteMetrics(page);

  // At wide width
  await setQuoteWidth(page, 600);
  const wide = await getQuoteMetrics(page);

  // More inner lines = taller quote
  expect(narrow.outerHeight).toBeGreaterThan(wide.outerHeight);
});

// ═══════════════════════════════════════════════════════════════════

test('chat does not overflow at width 407', async ({ page }) => {
  await openDemo(page);
  
  // Test at width 393 which has max overflow
  await setChatWidth(page, 393);
  
  const details = await page.locator('#chatRenderContent').evaluate(el => {
    const railRect = el.getBoundingClientRect();
    const lines = el.querySelectorAll('.render-line');
    const result: any[] = [];
    lines.forEach((line, li) => {
      const children = Array.from(line.children) as HTMLElement[];
      children.forEach((child, ci) => {
        const childRect = child.getBoundingClientRect();
        result.push({
          line: li,
          child: ci,
          className: child.className,
          text: child.textContent?.substring(0, 30),
          left: childRect.left - railRect.left,
          width: childRect.width,
          right: childRect.right - railRect.left,
          railWidth: railRect.width,
          overflow: childRect.right - railRect.right,
          style_left: (child as HTMLElement).style.left,
        });
      });
    });
    return result;
  });

  const codeMetrics = await page.locator('#chatRenderContent .frag-code').first().evaluate((el) => {
    const cs = getComputedStyle(el as HTMLElement);
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    ctx.font = '13px JetBrains Mono';
    const w1 = ctx.measureText('config.').width;
    ctx.font = cs.font;
    const w2 = ctx.measureText('config.').width;
    const textNode = (el as HTMLElement).textContent || '';
    return {
      font: cs.font,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      padL: cs.paddingLeft,
      padR: cs.paddingRight,
      canvasWidthDirect: w1,
      canvasWidthComputedFont: w2,
      textNode,
      domWidth: (el as HTMLElement).getBoundingClientRect().width,
    };
  });

  console.log('All fragments:', JSON.stringify(details, null, 2));
  console.log('Code metrics:', JSON.stringify(codeMetrics, null, 2));
  expect(details.filter((d: any) => d.overflow > 1).length).toBe(0);
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
