import type { LayoutCursor, PreparedTextWithSegments } from "@chenglou/pretext";

// ── Input types ──────────────────────────────────────────────────────

/** A single inline run: either styled text or a fixed-width box. */
export type InlineRun =
  | { kind: "text"; text: string; font: string; chromeWidth?: number }
  | { kind: "box"; width: number; height?: number };

// ── Output types ─────────────────────────────────────────────────────

/** A positioned fragment within a laid-out line. */
export type LineFragment =
  | {
      kind: "text";
      text: string;
      font: string;
      leadingGap: number;
      x: number;
    }
  | {
      kind: "box";
      runIndex: number;
      leadingGap: number;
      x: number;
      width: number;
      height: number;
    };

/** A single laid-out line with its fragments and computed height. */
export type RichLine = {
  fragments: LineFragment[];
  height: number;
};

/** The full layout result: all lines plus total height. */
export type RichLayout = {
  lines: RichLine[];
  totalHeight: number;
};

// ── Internal types ───────────────────────────────────────────────────

/** @internal Prepared text inline item. */
export type PreparedTextItem = {
  kind: "text";
  runIndex: number;
  font: string;
  chromeWidth: number;
  endCursor: LayoutCursor;
  fullText: string;
  fullWidth: number;
  leadingGap: number;
  prepared: PreparedTextWithSegments;
};

/** @internal Prepared box inline item. */
export type PreparedBoxItem = {
  kind: "box";
  runIndex: number;
  leadingGap: number;
  width: number;
  height: number;
};

/** @internal A single prepared inline item. */
export type PreparedItem = PreparedTextItem | PreparedBoxItem;

/** Opaque prepared state returned by prepareRuns. */
export type PreparedRuns = {
  /** @internal */
  readonly _items: PreparedItem[];
};
