import {
  prepareWithSegments,
  layoutNextLine,
  walkLineRanges,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";

import type { InlineRun, PreparedItem, PreparedRuns, RichLayout } from "./types.js";
import { layoutRuns } from "./layout.js";

const LINE_START_CURSOR: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
const UNBOUNDED_WIDTH = 100_000;
const DEFAULT_INNER_LINE_HEIGHT = 20;

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
    const itemWidth = item.kind === "text"
      ? item.fullWidth + item.chromeWidth
      : item.width;
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

        // 1. Recursively prepare inner runs
        const innerPrepared = prepareRuns(run.runs);

        // 2. Find natural (shrink-wrap) inner width from prepared items
        const naturalWidth = computeNaturalWidth(innerPrepared._items);

        // Apply maxWidth constraint
        const innerWidth = run.maxWidth !== undefined
          ? Math.min(naturalWidth, run.maxWidth)
          : naturalWidth;

        // 3. Layout inner content at the determined width
        const innerLayout = layoutRuns(innerPrepared, innerWidth, DEFAULT_INNER_LINE_HEIGHT);

        // 4. Compute total dimensions
        const totalWidth = innerWidth + chromeWidth + marginLeft + marginRight;
        const totalHeight = innerLayout.totalHeight + chromeHeight;

        items.push({
          kind: "composite",
          runIndex: index,
          leadingGap: pendingGap,
          width: totalWidth,
          height: totalHeight,
          innerWidth,
          innerLayout,
          chromeWidth,
          chromeHeight,
          marginLeft,
          marginRight,
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
