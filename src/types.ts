import type { LayoutCursor, PreparedTextWithSegments } from "@chenglou/pretext";

// ── Input types ──────────────────────────────────────────────────────

/** A single inline run: styled text, a fixed-width box, or a composite (recursive container). */
export type InlineRun =
  | {
      kind: "text";
      text: string;
      font: string;
      /** Total horizontal chrome in pixels (padding-left + padding-right).
       *  Layout adds this to the measured text width. Renderer must apply padding visually. */
      chromeWidth?: number;
    }
  | {
      kind: "box";
      /** Content width in pixels (NOT including margins). */
      width: number;
      height?: number;
      /** Extra left margin in pixels (default 0). Applied on top of any whitespace-derived leadingGap. */
      marginLeft?: number;
      /** Extra right margin in pixels (default 0). */
      marginRight?: number;
    }
  | {
      kind: "composite";
      /** Inner runs — recursively laid out. */
      runs: InlineRun[];
      /** Total horizontal padding (left+right combined), default 0. */
      chromeWidth?: number;
      /** Total vertical padding (top+bottom combined), default 0. */
      chromeHeight?: number;
      /** Outer left margin, default 0. */
      marginLeft?: number;
      /** Outer right margin, default 0. */
      marginRight?: number;
      /** If set, constrains inner layout to this width.
       *  If omitted, uses natural shrink-wrap width. */
      maxWidth?: number;
    };

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
  width: number; // content width + marginLeft + marginRight
  contentWidth: number; // content width only (for fragment output)
  height: number;
  marginLeft: number;
  marginRight: number;
};

/** @internal Prepared composite inline item. */
export type PreparedCompositeItem = {
  kind: "composite";
  runIndex: number;
  leadingGap: number;
  /** Prepared inner runs for layout-time recursive layout. */
  preparedInnerRuns: PreparedRuns;
  /** Natural (shrink-wrap) width of inner content before any constraints. */
  naturalInnerWidth: number;
  chromeWidth: number;
  chromeHeight: number;
  marginLeft: number;
  marginRight: number;
  maxWidth?: number;
};

/** @internal A single prepared inline item. */
export type PreparedItem = PreparedTextItem | PreparedBoxItem | PreparedCompositeItem;

/** Opaque prepared state returned by prepareRuns. */
export type PreparedRuns = {
  /** @internal */
  readonly _items: PreparedItem[];
};
