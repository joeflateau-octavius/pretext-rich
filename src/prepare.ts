import {
  prepareWithSegments,
  layoutNextLine,
  walkLineRanges,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";

import type { InlineRun, PreparedItem, PreparedRuns } from "./types.js";

const LINE_START_CURSOR: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
const UNBOUNDED_WIDTH = 100_000;

// ── Collapsed space width cache ──────────────────────────────────────

const collapsedSpaceWidthCache = new Map<string, number>();

function measureSingleLineWidth(prepared: PreparedTextWithSegments): number {
  let maxWidth = 0;
  walkLineRanges(prepared, UNBOUNDED_WIDTH, (line) => {
    if (line.width > maxWidth) maxWidth = line.width;
  });
  return maxWidth;
}

function measureCollapsedSpaceWidth(font: string): number {
  const cached = collapsedSpaceWidthCache.get(font);
  if (cached !== undefined) return cached;

  const joinedWidth = measureSingleLineWidth(prepareWithSegments("A A", font));
  const compactWidth = measureSingleLineWidth(prepareWithSegments("AA", font));
  const collapsedWidth = Math.max(0, joinedWidth - compactWidth);
  collapsedSpaceWidthCache.set(font, collapsedWidth);
  return collapsedWidth;
}

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

// ── prepareRuns ──────────────────────────────────────────────────────

/**
 * Prepare a list of inline runs for layout.
 *
 * This performs one-time text segmentation and measurement.
 * The returned PreparedRuns can be reused across multiple
 * layoutRuns / measureHeight calls with different widths.
 */
export function prepareRuns(runs: InlineRun[]): PreparedRuns {
  const items: PreparedItem[] = [];
  let pendingGap = 0;

  // We need a "default" gap width. Use the first text run's font,
  // or fall back to a sensible default.
  let defaultFont: string | null = null;
  for (const run of runs) {
    if (run.kind === "text") {
      defaultFont = run.font;
      break;
    }
  }

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

        // 2. Find natural (shrink-wrap) inner width from prepared items
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

        const inlineBoundaryGap = measureCollapsedSpaceWidth(run.font);
        pendingGap = hasTrailingWhitespace ? inlineBoundaryGap : 0;

        if (trimmedText.length === 0) break;

        const chromeWidth = run.chromeWidth ?? 0;
        const prepared = prepareWithSegments(trimmedText, run.font);
        const wholeLine = layoutNextLine(
          prepared,
          LINE_START_CURSOR,
          UNBOUNDED_WIDTH
        );
        if (wholeLine === null) break;

        const leadingGap =
          carryGap > 0 || hasLeadingWhitespace ? inlineBoundaryGap : 0;

        items.push({
          kind: "text",
          runIndex: index,
          font: run.font,
          chromeWidth,
          endCursor: wholeLine.end,
          fullText: wholeLine.text,
          fullWidth: wholeLine.width,
          leadingGap,
          prepared,
        });
        break;
      }
    }
  }

  return { _items: items };
}
