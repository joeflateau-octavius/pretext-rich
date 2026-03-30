import { layoutNextLine, type LayoutCursor } from "@chenglou/pretext";

import type {
  LineFragment,
  PreparedItem,
  PreparedRuns,
  RichLayout,
  RichLine,
} from "./types.js";

const LINE_START_CURSOR: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };

function cursorsMatch(a: LayoutCursor, b: LayoutCursor): boolean {
  return a.segmentIndex === b.segmentIndex && a.graphemeIndex === b.graphemeIndex;
}

/**
 * Lay out prepared runs into positioned lines at the given container width.
 *
 * @param prepared  - The prepared runs from `prepareRuns()`
 * @param containerWidth - Available width in pixels
 * @param lineHeight - Base line height in pixels (box height may exceed this)
 * @returns Full layout with positioned fragments
 */
export function layoutRuns(
  prepared: PreparedRuns,
  containerWidth: number,
  lineHeight: number
): RichLayout {
  const items = prepared._items;
  const lines: RichLine[] = [];
  const safeWidth = Math.max(1, containerWidth);

  let itemIndex = 0;
  let textCursor: LayoutCursor | null = null;

  while (itemIndex < items.length) {
    const fragments: LineFragment[] = [];
    let lineWidth = 0;
    let remainingWidth = safeWidth;
    let maxBoxHeight = 0;

    lineLoop: while (itemIndex < items.length) {
      const item: PreparedItem = items[itemIndex]!;

      switch (item.kind) {
        case "box": {
          const leadingGap = fragments.length === 0 ? 0 : item.leadingGap;
          const totalWidth = leadingGap + item.width;

          // If it doesn't fit and we're not at line start, break to next line
          if (fragments.length > 0 && totalWidth > remainingWidth) break lineLoop;

          // Track tallest box on this line
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

          // If it doesn't fit and we're not at line start, break to next line
          if (fragments.length > 0 && totalWidth > remainingWidth) break lineLoop;

          // Track tallest item on this line
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
          // Skip completed items (cursor already at end)
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

          // Not enough room for even the chrome? Break line.
          if (fragments.length > 0 && reservedWidth >= remainingWidth)
            break lineLoop;

          // Fast path: whole text fits on the remaining line
          if (textCursor === null) {
            const fullWidth = leadingGap + item.fullWidth + item.chromeWidth;
            if (fullWidth <= remainingWidth) {
              fragments.push({
                kind: "text",
                text: item.fullText,
                font: item.font,
                leadingGap,
                x: lineWidth,
                textWidth: item.fullWidth,
                chromeWidth: item.chromeWidth,
              });
              lineWidth += fullWidth;
              remainingWidth = Math.max(0, safeWidth - lineWidth);
              itemIndex++;
              continue;
            }
          }

          // Slow path: break text at available width
          const startCursor = textCursor ?? LINE_START_CURSOR;
          const line = layoutNextLine(
            item.prepared,
            startCursor,
            Math.max(1, remainingWidth - reservedWidth)
          );

          if (line === null) {
            itemIndex++;
            textCursor = null;
            continue;
          }

          // Zero-progress guard: skip item if cursor didn't advance
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
            textWidth: line.width,
            chromeWidth: item.chromeWidth,
          });
          lineWidth += leadingGap + line.width + item.chromeWidth;
          remainingWidth = Math.max(0, safeWidth - lineWidth);

          // Did we consume the entire text run?
          if (cursorsMatch(line.end, item.endCursor)) {
            itemIndex++;
            textCursor = null;
            continue;
          }

          // Partial: save cursor position and break to next line
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

/**
 * Measure the total height that the runs will occupy at a given width.
 *
 * This is a convenience wrapper around layoutRuns that discards the
 * fragment details and returns only the total height.
 */
export function measureHeight(
  prepared: PreparedRuns,
  containerWidth: number,
  lineHeight: number
): number {
  return layoutRuns(prepared, containerWidth, lineHeight).totalHeight;
}
