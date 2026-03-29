# pretext-rich

Rich text inline layout engine built on [`@chenglou/pretext`](https://github.com/chenglou/pretext).

Given a list of inline "runs" (styled text, chips, inline boxes), computes:

1. **Exact height** the content occupies at a given container width
2. **Full line layout** — array of lines, each with positioned fragments — for rendering to DOM, Canvas, or SVG

No DOM reads. No `getBoundingClientRect`. Pure arithmetic after a one-time prepare phase.

## Install

```bash
npm install pretext-rich @chenglou/pretext
```

## Quick start

```typescript
import { prepareRuns, layoutRuns, measureHeight } from "pretext-rich";
import type { InlineRun } from "pretext-rich";

const runs: InlineRun[] = [
  { kind: "text", text: "Hello ", font: "16px sans-serif" },
  { kind: "text", text: "@world", font: "bold 16px sans-serif" },
  { kind: "box", width: 24, height: 24 }, // inline avatar
  { kind: "text", text: " — welcome!", font: "16px sans-serif" },
];

// 1. Prepare once (segments + measures text)
const prepared = prepareRuns(runs);

// 2. Layout at any width (pure arithmetic, ~0.0002ms)
const layout = layoutRuns(prepared, 400, 24);
console.log(layout.lines.length, layout.totalHeight);

// 3. Or just measure height
const height = measureHeight(prepared, 400, 24);
```

## API

### `prepareRuns(runs: InlineRun[]): PreparedRuns`

Prepare inline runs for layout. Performs one-time text segmentation, measurement, and whitespace analysis. The returned `PreparedRuns` is reusable across multiple `layoutRuns` / `measureHeight` calls with different container widths.

### `layoutRuns(prepared: PreparedRuns, containerWidth: number, lineHeight: number): RichLayout`

Lay out prepared runs into positioned lines. Returns a `RichLayout` with all fragment positions computed.

### `measureHeight(prepared: PreparedRuns, containerWidth: number, lineHeight: number): number`

Convenience wrapper — returns only the total pixel height.

## Types

### Input

```typescript
type InlineRun =
  | { kind: "text"; text: string; font: string; chromeWidth?: number }
  | { kind: "box"; width: number; height?: number };
```

- **`text`** — A styled text span. `font` is a CSS font shorthand. `chromeWidth` adds extra pixel padding (e.g. code spans with padding/border).
- **`box`** — An opaque inline box with fixed pixel `width` and optional `height`.

### Output

```typescript
type LineFragment =
  | { kind: "text"; text: string; font: string; leadingGap: number; x: number }
  | { kind: "box"; runIndex: number; leadingGap: number; x: number; width: number; height: number };

type RichLine = {
  fragments: LineFragment[];
  height: number; // max(lineHeight, tallest box on this line)
};

type RichLayout = {
  lines: RichLine[];
  totalHeight: number;
};
```

### Fragment positioning

Each fragment has an `x` (cumulative width before it) and a `leadingGap` (collapsed whitespace in pixels). To render on Canvas:

```typescript
ctx.font = frag.font;
ctx.fillText(frag.text, frag.x + frag.leadingGap, y);
```

For DOM rendering, apply `marginLeft` equal to `leadingGap`:

```typescript
span.style.marginLeft = `${frag.leadingGap}px`;
```

## Virtual list pattern

For long documents, combine with a virtual list. Since `measureHeight` is pure arithmetic (~0.0002ms per call), you can measure every block cheaply:

```typescript
const blocks: PreparedRuns[] = messages.map((m) => prepareRuns(m.runs));

// On resize: remeasure all heights
const heights = blocks.map((b) => measureHeight(b, containerWidth, lineHeight));

// Feed heights into your virtual list (react-window, tanstack-virtual, etc.)
// Only call layoutRuns() for visible blocks
```

## How it works

1. **Prepare phase** — Each text run is trimmed, measured for collapsed whitespace gaps (`measureCollapsedSpaceWidth`), and prepared via `prepareWithSegments()`. Box runs record their fixed dimensions.

2. **Layout phase** — A greedy line-breaking loop walks items, fitting as many as possible into each line's remaining width. Text runs use `layoutNextLine()` from pretext for word-level breaking, resuming from a saved cursor when text wraps mid-run. Box items that don't fit trigger a line break (unless they're at line start, where they're forced in).

3. **No space characters** — Inter-run whitespace is always a pixel `leadingGap`, never inserted space characters. This matches how CSS inline layout collapses whitespace between inline elements.

## Testing

- `npm test` runs fast unit tests that validate algorithmic invariants in the layout math.
- `npm run test:render` runs Playwright browser tests against `docs/index.html` to validate real rendering fidelity (geometry, overflow, and glyph rendering).

## License

MIT
