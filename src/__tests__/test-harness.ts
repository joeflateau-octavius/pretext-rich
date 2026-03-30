/**
 * Test harness: re-implements the core prepare/layout algorithm
 * using mock measurement functions. This tests the ALGORITHM,
 * not the integration with @chenglou/pretext.
 *
 * The logic mirrors src/prepare.ts and src/layout.ts exactly.
 */

import {
  mockMeasureText,
  mockMeasureCollapsedSpaceWidth,
  mockPrepare,
  mockLayoutNextLine,
  mockMeasureSingleLineWidth,
  type MockCursor,
  type MockPrepared,
} from "./mock-pretext.js";

// ── Input types (same as src/types.ts) ───────────────────────────────

export type InlineRun =
  | { kind: "text"; text: string; font: string; chromeWidth?: number }
  | {
      kind: "box";
      width: number;
      height?: number;
      marginLeft?: number;
      marginRight?: number;
    }
  | {
      kind: "composite";
      runs: InlineRun[];
      chromeWidth?: number;
      chromeHeight?: number;
      marginLeft?: number;
      marginRight?: number;
      maxWidth?: number;
    };

// ── Output types ─────────────────────────────────────────────────────

export type LineFragment =
  | { kind: "text"; text: string; font: string; leadingGap: number; x: number }
  | {
      kind: "box";
      runIndex: number;
      leadingGap: number;
      x: number;
      width: number;
      height: number;
    }
  | {
      kind: "composite";
      runIndex: number;
      leadingGap: number;
      x: number;
      width: number;
      height: number;
      innerWidth: number;
      innerLayout: RichLayout;
      chromeWidth: number;
      chromeHeight: number;
      marginLeft: number;
      marginRight: number;
    };

export type RichLine = {
  fragments: LineFragment[];
  height: number;
};

export type RichLayout = {
  lines: RichLine[];
  totalHeight: number;
};

// ── Internal prepared items ──────────────────────────────────────────

type PreparedTextItem = {
  kind: "text";
  runIndex: number;
  font: string;
  chromeWidth: number;
  endCursor: MockCursor;
  fullText: string;
  fullWidth: number;
  leadingGap: number;
  prepared: MockPrepared;
};

type PreparedBoxItem = {
  kind: "box";
  runIndex: number;
  leadingGap: number;
  width: number;
  contentWidth: number;
  height: number;
  marginLeft: number;
  marginRight: number;
};

type PreparedCompositeItem = {
  kind: "composite";
  runIndex: number;
  leadingGap: number;
  preparedInnerRuns: PreparedRuns;
  naturalInnerWidth: number;
  chromeWidth: number;
  chromeHeight: number;
  marginLeft: number;
  marginRight: number;
  maxWidth?: number;
};

type PreparedItem = PreparedTextItem | PreparedBoxItem | PreparedCompositeItem;

type PreparedRuns = {
  _items: PreparedItem[];
};

// ── Natural width from prepared items ────────────────────────────────

function computeNaturalWidth(items: PreparedItem[]): number {
  let totalWidth = 0;
  for (const item of items) {
    const gap = totalWidth > 0 ? item.leadingGap : 0;

    let itemWidth: number;
    switch (item.kind) {
      case "text":
        itemWidth = item.fullWidth + item.chromeWidth;
        break;
      case "box":
        itemWidth = item.width;
        break;
      case "composite":
        itemWidth =
          item.naturalInnerWidth +
          item.chromeWidth +
          item.marginLeft +
          item.marginRight;
        break;
    }

    totalWidth += gap + itemWidth;
  }
  return totalWidth;
}

const DEFAULT_INNER_LINE_HEIGHT = 20;

// ── prepareRuns (mirrors src/prepare.ts) ─────────────────────────────

export function prepareRuns(runs: InlineRun[]): PreparedRuns {
  const items: PreparedItem[] = [];
  let pendingGap = 0;

  for (let index = 0; index < runs.length; index++) {
    const run = runs[index]!;

    switch (run.kind) {
      case "box": {
        const height = run.height ?? 0;
        const marginLeft = run.marginLeft ?? 0;
        const marginRight = run.marginRight ?? 0;
        items.push({
          kind: "box",
          runIndex: index,
          leadingGap: pendingGap,
          width: run.width + marginLeft + marginRight,
          contentWidth: run.width,
          height,
          marginLeft,
          marginRight,
        });
        pendingGap = 0;
        break;
      }

      case "composite": {
        const chromeWidth = run.chromeWidth ?? 0;
        const chromeHeight = run.chromeHeight ?? 0;
        const marginLeft = run.marginLeft ?? 0;
        const marginRight = run.marginRight ?? 0;

        // 1. Recursively prepare inner runs (measure text, but NO layout)
        const innerPrepared = prepareRuns(run.runs);

        // 2. Find natural (shrink-wrap) inner width
        const naturalInnerWidth = computeNaturalWidth(innerPrepared._items);

        // Store prepared inner runs — layout happens at layout-time
        items.push({
          kind: "composite",
          runIndex: index,
          leadingGap: pendingGap,
          preparedInnerRuns: innerPrepared,
          naturalInnerWidth,
          chromeWidth,
          chromeHeight,
          marginLeft,
          marginRight,
          maxWidth: run.maxWidth,
        });
        pendingGap = 0;
        break;
      }

      case "text": {
        const carryGap = pendingGap;
        const hasLeadingWhitespace = /^\s/.test(run.text);
        const hasTrailingWhitespace = /\s$/.test(run.text);
        const trimmedText = run.text.trim();

        const inlineBoundaryGap = mockMeasureCollapsedSpaceWidth(run.font);
        pendingGap = hasTrailingWhitespace ? inlineBoundaryGap : 0;

        if (trimmedText.length === 0) break;

        const chromeWidth = run.chromeWidth ?? 0;
        const prepared = mockPrepare(trimmedText, run.font);

        // Measure full width (equivalent to layoutNextLine with UNBOUNDED)
        const fullWidth = mockMeasureSingleLineWidth(trimmedText);
        const endCursor: MockCursor = { charIndex: trimmedText.length };

        const leadingGap =
          carryGap > 0 || hasLeadingWhitespace ? inlineBoundaryGap : 0;

        items.push({
          kind: "text",
          runIndex: index,
          font: run.font,
          chromeWidth,
          endCursor,
          fullText: trimmedText,
          fullWidth,
          leadingGap,
          prepared,
        });
        break;
      }
    }
  }

  return { _items: items };
}

// ── layoutRuns (mirrors src/layout.ts) ───────────────────────────────

function cursorsMatch(a: MockCursor, b: MockCursor): boolean {
  return a.charIndex === b.charIndex;
}

const LINE_START_CURSOR: MockCursor = { charIndex: 0 };

export function layoutRuns(
  prepared: PreparedRuns,
  containerWidth: number,
  lineHeight: number
): RichLayout {
  const items = prepared._items;
  const lines: RichLine[] = [];
  const safeWidth = Math.max(1, containerWidth);

  let itemIndex = 0;
  let textCursor: MockCursor | null = null;

  while (itemIndex < items.length) {
    const fragments: LineFragment[] = [];
    let lineWidth = 0;
    let remainingWidth = safeWidth;
    let maxBoxHeight = 0;

    lineLoop: while (itemIndex < items.length) {
      const item = items[itemIndex]!;

      switch (item.kind) {
        case "box": {
          const leadingGap = fragments.length === 0 ? 0 : item.leadingGap;
          const totalWidth = leadingGap + item.width;

          if (fragments.length > 0 && totalWidth > remainingWidth) break lineLoop;

          if (item.height > maxBoxHeight) maxBoxHeight = item.height;

          fragments.push({
            kind: "box",
            runIndex: item.runIndex,
            leadingGap,
            x: lineWidth,
            width: item.contentWidth,
            height: item.height,
          });
          lineWidth += totalWidth;
          remainingWidth = Math.max(0, safeWidth - lineWidth);
          itemIndex++;
          textCursor = null;
          continue;
        }

        case "composite": {
          const leadingGap = fragments.length === 0 ? 0 : item.leadingGap;

          // Compute effective inner width based on whether maxWidth is set
          let effectiveInnerWidth: number;
          if (item.maxWidth !== undefined) {
            // Responsive: fill available space, capped by maxWidth
            const availableInner = Math.max(0,
              Math.max(0, remainingWidth - leadingGap) - item.chromeWidth - item.marginLeft - item.marginRight
            );
            effectiveInnerWidth = Math.min(item.maxWidth, availableInner);
          } else {
            // Atomic: use natural shrink-wrap width (chips, mentions)
            effectiveInnerWidth = item.naturalInnerWidth;
          }

          // Recursively layout inner content at layout-time
          const innerLayout = layoutRuns(item.preparedInnerRuns, effectiveInnerWidth, lineHeight);

          const compositeWidth = effectiveInnerWidth + item.chromeWidth + item.marginLeft + item.marginRight;
          const compositeHeight = innerLayout.totalHeight + item.chromeHeight;

          const totalWidth = leadingGap + compositeWidth;

          if (fragments.length > 0 && totalWidth > remainingWidth) break lineLoop;

          if (compositeHeight > maxBoxHeight) maxBoxHeight = compositeHeight;

          fragments.push({
            kind: "composite",
            runIndex: item.runIndex,
            leadingGap,
            x: lineWidth,
            width: compositeWidth,
            height: compositeHeight,
            innerWidth: effectiveInnerWidth,
            innerLayout,
            chromeWidth: item.chromeWidth,
            chromeHeight: item.chromeHeight,
            marginLeft: item.marginLeft,
            marginRight: item.marginRight,
          });
          lineWidth += totalWidth;
          remainingWidth = Math.max(0, safeWidth - lineWidth);
          itemIndex++;
          textCursor = null;
          continue;
        }

        case "text": {
          // Skip completed items
          if (
            textCursor !== null &&
            cursorsMatch(textCursor, item.endCursor)
          ) {
            itemIndex++;
            textCursor = null;
            continue;
          }

          const leadingGap = fragments.length === 0 ? 0 : item.leadingGap;
          const reservedWidth = leadingGap + item.chromeWidth;

          if (fragments.length > 0 && reservedWidth >= remainingWidth)
            break lineLoop;

          // Fast path: whole text fits
          if (textCursor === null) {
            const fullWidth = leadingGap + item.fullWidth + item.chromeWidth;
            if (fullWidth <= remainingWidth) {
              fragments.push({
                kind: "text",
                text: item.fullText,
                font: item.font,
                leadingGap,
                x: lineWidth,
              });
              lineWidth += fullWidth;
              remainingWidth = Math.max(0, safeWidth - lineWidth);
              itemIndex++;
              continue;
            }
          }

          // Slow path: break text
          const startCursor = textCursor ?? LINE_START_CURSOR;
          const line = mockLayoutNextLine(
            item.prepared,
            startCursor,
            Math.max(1, remainingWidth - reservedWidth)
          );

          if (line === null) {
            itemIndex++;
            textCursor = null;
            continue;
          }

          // Zero-progress guard
          if (cursorsMatch(startCursor, line.end)) {
            itemIndex++;
            textCursor = null;
            continue;
          }

          fragments.push({
            kind: "text",
            text: line.text,
            font: item.font,
            leadingGap,
            x: lineWidth,
          });
          lineWidth += leadingGap + line.width + item.chromeWidth;
          remainingWidth = Math.max(0, safeWidth - lineWidth);

          // Did we consume the entire text run?
          if (cursorsMatch(line.end, item.endCursor)) {
            itemIndex++;
            textCursor = null;
            continue;
          }

          // Partial: save cursor and break to next line
          textCursor = line.end;
          break lineLoop;
        }
      }
    }

    if (fragments.length === 0) break;
    lines.push({
      fragments,
      height: Math.max(lineHeight, maxBoxHeight),
    });
  }

  let totalHeight = 0;
  for (const line of lines) {
    totalHeight += line.height;
  }

  return { lines, totalHeight };
}

export function measureHeight(
  prepared: PreparedRuns,
  containerWidth: number,
  lineHeight: number
): number {
  return layoutRuns(prepared, containerWidth, lineHeight).totalHeight;
}
