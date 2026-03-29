/**
 * Mock measurement layer for deterministic testing.
 *
 * Font metric model:
 *   - Each non-space character = 8px wide
 *   - Each space character = 4px wide
 *
 * This lets us compute exact expected widths and verify line-breaking arithmetic
 * without needing OffscreenCanvas or any DOM environment.
 */

// ── Mock types matching pretext's interface ──────────────────────────

export type MockCursor = {
  charIndex: number;
};

export type MockLayoutLine = {
  text: string;
  width: number;
  start: MockCursor;
  end: MockCursor;
};

export type MockPrepared = {
  text: string;
  font: string;
};

// ── Measurement ──────────────────────────────────────────────────────

const CHAR_WIDTH = 8;
const SPACE_WIDTH = 4;

export function mockMeasureText(text: string): number {
  let w = 0;
  for (const ch of text) w += ch === " " ? SPACE_WIDTH : CHAR_WIDTH;
  return w;
}

export function mockMeasureCollapsedSpaceWidth(_font: string): number {
  return SPACE_WIDTH;
}

// ── Mock prepareWithSegments ─────────────────────────────────────────

export function mockPrepare(text: string, font: string): MockPrepared {
  return { text, font };
}

// ── Mock layoutNextLine ──────────────────────────────────────────────

/**
 * Break text starting at `start.charIndex` to fit within `maxWidth`.
 * Uses greedy word-wrap: tries to fit whole words, breaks mid-word if a single word is too wide.
 */
export function mockLayoutNextLine(
  prepared: MockPrepared,
  start: MockCursor,
  maxWidth: number
): MockLayoutLine | null {
  const text = prepared.text;
  if (start.charIndex >= text.length) return null;

  const remaining = text.slice(start.charIndex);
  const fullWidth = mockMeasureText(remaining);

  // Fast path: everything fits
  if (fullWidth <= maxWidth) {
    return {
      text: remaining,
      width: fullWidth,
      start: { charIndex: start.charIndex },
      end: { charIndex: text.length },
    };
  }

  // Try to break at word boundaries (spaces)
  let bestBreak = -1;
  let widthSoFar = 0;

  for (let i = 0; i < remaining.length; i++) {
    const ch = remaining[i]!;
    const chWidth = ch === " " ? SPACE_WIDTH : CHAR_WIDTH;

    if (widthSoFar + chWidth > maxWidth) {
      // Can't fit this character
      break;
    }

    widthSoFar += chWidth;

    // Track word boundaries (break AFTER a space, before next word)
    if (ch === " ") {
      bestBreak = i + 1;
    }
  }

  // If we found a word boundary, break there
  if (bestBreak > 0) {
    const lineText = remaining.slice(0, bestBreak).trimEnd();
    return {
      text: lineText,
      width: mockMeasureText(lineText),
      start: { charIndex: start.charIndex },
      end: { charIndex: start.charIndex + bestBreak },
    };
  }

  // No word boundary found — break mid-word (forced break)
  // Must make progress: at least one character
  let chars = 0;
  let w = 0;
  for (let i = 0; i < remaining.length; i++) {
    const ch = remaining[i]!;
    const chWidth = ch === " " ? SPACE_WIDTH : CHAR_WIDTH;
    if (w + chWidth > maxWidth && chars > 0) break;
    w += chWidth;
    chars++;
  }

  const lineText = remaining.slice(0, chars);
  return {
    text: lineText,
    width: mockMeasureText(lineText),
    start: { charIndex: start.charIndex },
    end: { charIndex: start.charIndex + chars },
  };
}

// ── Mock walkLineRanges (for measureSingleLineWidth) ─────────────────

export function mockMeasureSingleLineWidth(text: string): number {
  return mockMeasureText(text);
}
