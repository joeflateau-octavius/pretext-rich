import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  prepareRuns,
  layoutRuns,
  measureHeight,
  type InlineRun,
  type RichLayout,
} from "./test-harness.js";
import { mockMeasureText } from "./mock-pretext.js";

// ── Constants ────────────────────────────────────────────────────────
// With mock: non-space char = 8px, space = 4px
const CHAR = 8;
const SPACE = 4;
const FONT = "16px sans-serif";
const LH = 24; // default line height
const INNER_LH = 20; // default inner line height for composites

function layout(runs: InlineRun[], containerWidth: number, lineHeight = LH): RichLayout {
  return layoutRuns(prepareRuns(runs), containerWidth, lineHeight);
}

function lineCount(runs: InlineRun[], containerWidth: number, lineHeight = LH): number {
  return layout(runs, containerWidth, lineHeight).lines.length;
}

function height(runs: InlineRun[], containerWidth: number, lineHeight = LH): number {
  return measureHeight(prepareRuns(runs), containerWidth, lineHeight);
}

// ── Helper: makeChip (mirrors src/helpers.ts) ────────────────────────

function makeChip(
  text: string,
  font: string,
  options?: {
    chromeWidth?: number;
    marginLeft?: number;
    marginRight?: number;
  }
): InlineRun {
  return {
    kind: "composite",
    runs: [{ kind: "text", text, font }],
    chromeWidth: options?.chromeWidth ?? 8,
    marginLeft: options?.marginLeft ?? 0,
    marginRight: options?.marginRight ?? 0,
  };
}

function makeMentionChip(
  name: string,
  font: string,
  options?: {
    avatarWidth?: number;
    chromeWidth?: number;
    marginLeft?: number;
    marginRight?: number;
  }
): InlineRun {
  const avatarWidth = options?.avatarWidth ?? 20;
  return {
    kind: "composite",
    runs: [
      { kind: "box", width: avatarWidth, height: avatarWidth },
      { kind: "text", text: name, font },
    ],
    chromeWidth: options?.chromeWidth ?? 10,
    marginLeft: options?.marginLeft ?? 2,
    marginRight: options?.marginRight ?? 2,
  };
}

// ═════════════════════════════════════════════════════════════════════
// BASIC TEXT LAYOUT
// ═════════════════════════════════════════════════════════════════════

describe("Basic text layout", () => {
  it("single short run fits on one line", () => {
    // "Hello" = 5 chars × 8px = 40px
    const result = layout([{ kind: "text", text: "Hello", font: FONT }], 100);
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0]!.fragments.length, 1);
    const frag = result.lines[0]!.fragments[0]!;
    assert.equal(frag.kind, "text");
    if (frag.kind === "text") {
      assert.equal(frag.text, "Hello");
      assert.equal(frag.x, 0);
    }
  });

  it("single long run wraps to two lines", () => {
    // "abcdefghij" = 10 chars × 8px = 80px. Container = 50px.
    const result = layout([{ kind: "text", text: "abcdefghij", font: FONT }], 50);
    assert.equal(result.lines.length, 2);
  });

  it("text at exactly containerWidth → 1 line", () => {
    // "abcde" = 5 × 8 = 40px. Container = 40px.
    const result = layout([{ kind: "text", text: "abcde", font: FONT }], 40);
    assert.equal(result.lines.length, 1);
  });

  it("text at containerWidth + 1 char → 2 lines", () => {
    // "abcdef" = 6 × 8 = 48px. Container = 40px.
    const result = layout([{ kind: "text", text: "abcdef", font: FONT }], 40);
    assert.equal(result.lines.length, 2);
  });

  it("text with spaces wraps at word boundary", () => {
    // "abc def ghi" = 3*8 + 4 + 3*8 + 4 + 3*8 = 24+4+24+4+24 = 80px
    // Container = 60px. "abc def" = 24+4+24 = 52px fits. "ghi" on line 2.
    const result = layout([{ kind: "text", text: "abc def ghi", font: FONT }], 60);
    assert.equal(result.lines.length, 2);
    if (result.lines[0]!.fragments[0]!.kind === "text") {
      assert.equal(result.lines[0]!.fragments[0]!.text, "abc def");
    }
  });

  it("everything fits on one line with very large container", () => {
    const result = layout(
      [{ kind: "text", text: "Hello world this is a long text", font: FONT }],
      10000
    );
    assert.equal(result.lines.length, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════
// CHROME WIDTH
// ═════════════════════════════════════════════════════════════════════

describe("chromeWidth", () => {
  it("text with chromeWidth reduces available space", () => {
    // "abcdefghij" = 80px. chromeWidth = 12. Total = 92px.
    // Container = 90px → doesn't fit on one line.
    const result = layout(
      [{ kind: "text", text: "abcdefghij", font: FONT, chromeWidth: 12 }],
      90
    );
    assert.equal(result.lines.length, 2);
  });

  it("text with chromeWidth fits when container accommodates it", () => {
    // "abcde" = 40px + chrome 12 = 52px. Container = 52px → fits.
    const result = layout(
      [{ kind: "text", text: "abcde", font: FONT, chromeWidth: 12 }],
      52
    );
    assert.equal(result.lines.length, 1);
  });

  it("chromeWidth = 0 is the default", () => {
    const a = layout([{ kind: "text", text: "Hello", font: FONT }], 100);
    const b = layout([{ kind: "text", text: "Hello", font: FONT, chromeWidth: 0 }], 100);
    assert.deepEqual(a, b);
  });

  it("chromeWidth is accounted for on every line the run appears", () => {
    // "abc def ghi" with chromeWidth=12 in 60px container
    const result = layout(
      [{ kind: "text", text: "abc def ghi", font: FONT, chromeWidth: 12 }],
      60
    );
    // With chrome 12, available text width = 60 - 12 = 48px on each line
    // "abc def" text = 52px > 48px, so breaks after "abc" (24px <= 48px)
    // Line 2: "def ghi" text = 52px > 48px, breaks after "def"
    // Line 3: "ghi" = 24px fits
    assert.equal(result.lines.length, 3);
  });
});

// ═════════════════════════════════════════════════════════════════════
// LEADING GAPS (INTER-RUN SPACING)
// ═════════════════════════════════════════════════════════════════════

describe("Leading gaps (inter-run spacing)", () => {
  it("run ending with space + next run → gap = space width", () => {
    // "abc " + "def" → gap = 4px between them
    const result = layout(
      [
        { kind: "text", text: "abc ", font: FONT },
        { kind: "text", text: "def", font: FONT },
      ],
      200
    );
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0]!.fragments.length, 2);
    const frag1 = result.lines[0]!.fragments[1]!;
    if (frag1.kind === "text") {
      assert.equal(frag1.leadingGap, SPACE);
    }
  });

  it("run ending without space + next run → gap = 0", () => {
    // "abc" + "def" → no gap
    const result = layout(
      [
        { kind: "text", text: "abc", font: FONT },
        { kind: "text", text: "def", font: FONT },
      ],
      200
    );
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0]!.fragments.length, 2);
    const frag1 = result.lines[0]!.fragments[1]!;
    if (frag1.kind === "text") {
      assert.equal(frag1.leadingGap, 0);
    }
  });

  it("leading whitespace on second run creates gap", () => {
    // "abc" + " def" → gap = 4px
    const result = layout(
      [
        { kind: "text", text: "abc", font: FONT },
        { kind: "text", text: " def", font: FONT },
      ],
      200
    );
    assert.equal(result.lines.length, 1);
    const frag1 = result.lines[0]!.fragments[1]!;
    if (frag1.kind === "text") {
      assert.equal(frag1.leadingGap, SPACE);
    }
  });

  it("gap is 0 at start of each new line", () => {
    // Two runs that don't fit on one line
    const result = layout(
      [
        { kind: "text", text: "abcde ", font: FONT },
        { kind: "text", text: "fghij", font: FONT },
      ],
      50
    );
    assert.equal(result.lines.length, 2);
    // First fragment on line 2 should have leadingGap = 0 (it's at line start)
    const line2Frag = result.lines[1]!.fragments[0]!;
    if (line2Frag.kind === "text") {
      assert.equal(line2Frag.leadingGap, 0);
    }
  });

  it("first fragment on first line has leadingGap = 0", () => {
    const result = layout([{ kind: "text", text: "Hello", font: FONT }], 100);
    const frag = result.lines[0]!.fragments[0]!;
    if (frag.kind === "text") {
      assert.equal(frag.leadingGap, 0);
    }
  });

  it("runs A + B combined fit on one line with gap", () => {
    // "abc " + "de" → 24 + 4(gap) + 16 = 44px. Container = 50px.
    const result = layout(
      [
        { kind: "text", text: "abc ", font: FONT },
        { kind: "text", text: "de", font: FONT },
      ],
      50
    );
    assert.equal(result.lines.length, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════
// BOX RUNS
// ═════════════════════════════════════════════════════════════════════

describe("Box runs", () => {
  it("box fits at end of line with text before it", () => {
    const result = layout(
      [
        { kind: "text", text: "abc ", font: FONT },
        { kind: "box", width: 20 },
      ],
      50
    );
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0]!.fragments.length, 2);
  });

  it("box too wide for remaining space → moves to next line", () => {
    // "abcde" = 40px, box = 20px. With gap = 4px → 40 + 4 + 20 = 64px > 50px
    const result = layout(
      [
        { kind: "text", text: "abcde ", font: FONT },
        { kind: "box", width: 20 },
      ],
      50
    );
    assert.equal(result.lines.length, 2);
    assert.equal(result.lines[1]!.fragments[0]!.kind, "box");
  });

  it("box at line start is forced in even if too wide", () => {
    const result = layout([{ kind: "box", width: 200 }], 50);
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0]!.fragments[0]!.kind, "box");
  });

  it("box wider than containerWidth occupies its own line", () => {
    const result = layout(
      [
        { kind: "text", text: "Hi ", font: FONT },
        { kind: "box", width: 200 },
        { kind: "text", text: "bye", font: FONT },
      ],
      50
    );
    assert.equal(result.lines.length, 3);
  });

  it("box height > lineHeight → line.height = box.height", () => {
    const result = layout([{ kind: "box", width: 20, height: 48 }], 100, 24);
    assert.equal(result.lines[0]!.height, 48);
  });

  it("box height < lineHeight → line.height = lineHeight", () => {
    const result = layout([{ kind: "box", width: 20, height: 10 }], 100, 24);
    assert.equal(result.lines[0]!.height, 24);
  });

  it("box height = 0 (default) → line.height = lineHeight", () => {
    const result = layout([{ kind: "box", width: 20 }], 100, 24);
    assert.equal(result.lines[0]!.height, 24);
  });

  it("two boxes side by side fitting on one line", () => {
    const result = layout(
      [
        { kind: "box", width: 20 },
        { kind: "box", width: 20 },
      ],
      50
    );
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0]!.fragments.length, 2);
  });
});

// ═════════════════════════════════════════════════════════════════════
// BOX MARGINS
// ═════════════════════════════════════════════════════════════════════

describe("Box margins", () => {
  it("marginLeft + marginRight increase effective width", () => {
    const result = layout(
      [{ kind: "box", width: 20, marginLeft: 5, marginRight: 5 }],
      100
    );
    assert.equal(result.lines.length, 1);
    const frag = result.lines[0]!.fragments[0]!;
    if (frag.kind === "box") {
      assert.equal(frag.width, 20);
    }
  });

  it("box with margins doesn't fit → wraps to next line", () => {
    const result = layout(
      [
        { kind: "text", text: "abcde ", font: FONT },
        { kind: "box", width: 10, marginLeft: 4, marginRight: 4 },
      ],
      50
    );
    assert.equal(result.lines.length, 2);
  });

  it("margins default to 0", () => {
    const a = layout([{ kind: "box", width: 30 }], 100);
    const b = layout([{ kind: "box", width: 30, marginLeft: 0, marginRight: 0 }], 100);
    assert.deepEqual(a, b);
  });
});

// ═════════════════════════════════════════════════════════════════════
// COMPOSITE RUNS
// ═════════════════════════════════════════════════════════════════════

describe("Composite runs", () => {
  it("simple composite: single text run inside, width = text + chromeWidth", () => {
    // "Joe" = 3 × 8 = 24px. chromeWidth = 12. Total = 24 + 12 = 36px.
    const result = layout(
      [{ kind: "composite", runs: [{ kind: "text", text: "Joe", font: FONT }], chromeWidth: 12 }],
      100
    );
    assert.equal(result.lines.length, 1);
    const frag = result.lines[0]!.fragments[0]!;
    assert.equal(frag.kind, "composite");
    if (frag.kind === "composite") {
      assert.equal(frag.width, 36); // 24 inner + 12 chrome + 0 margins
      assert.equal(frag.innerWidth, 24);
      assert.equal(frag.chromeWidth, 12);
    }
  });

  it("composite with maxWidth: inner content wraps, outer box has correct height", () => {
    // "abc def" = 24 + 4 + 24 = 52px natural inner width
    // maxWidth = 30 → inner lays out at 30px
    // "abc" = 24px fits on line 1, "def" = 24px on line 2
    // Inner height = 2 × LH(24) = 48px (inner uses same lineHeight as outer)
    // chromeHeight = 6 → total height = 54px
    const result = layout(
      [{
        kind: "composite",
        runs: [{ kind: "text", text: "abc def", font: FONT }],
        chromeHeight: 6,
        maxWidth: 30,
      }],
      200
    );
    assert.equal(result.lines.length, 1);
    const frag = result.lines[0]!.fragments[0]!;
    if (frag.kind === "composite") {
      // Inner width = min(52, 30) = 30
      assert.equal(frag.innerWidth, 30);
      // Inner layout: 2 lines × 24px = 48px + 6px chrome = 54px
      assert.equal(frag.height, 54);
      assert.equal(frag.innerLayout.lines.length, 2);
    }
  });

  it("composite doesn't break (atomic): wraps to next line", () => {
    // "Hello " = 40px text. Composite "Joe" = 24 + 12 chrome = 36px.
    // With gap = 4px → 40 + 4 + 36 = 80px > 50px container
    const result = layout(
      [
        { kind: "text", text: "Hello ", font: FONT },
        { kind: "composite", runs: [{ kind: "text", text: "Joe", font: FONT }], chromeWidth: 12 },
      ],
      50
    );
    assert.equal(result.lines.length, 2);
    assert.equal(result.lines[1]!.fragments[0]!.kind, "composite");
  });

  it("composite at line start: forced in even if wider than container", () => {
    // Composite wider than container, but it's the first item → force it
    const result = layout(
      [{ kind: "composite", runs: [{ kind: "text", text: "abcdefghijklmnop", font: FONT }], chromeWidth: 12 }],
      50
    );
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0]!.fragments[0]!.kind, "composite");
  });

  it("composite height: chromeHeight adds to inner layout height", () => {
    // "Hi" = 16px. Inner layout = 1 line × 24px (uses outer lineHeight) = 24px. chromeHeight = 10.
    // Total height = 34px > LH=24 → line height = 34
    const result = layout(
      [{ kind: "composite", runs: [{ kind: "text", text: "Hi", font: FONT }], chromeHeight: 10 }],
      100,
      24
    );
    assert.equal(result.lines[0]!.height, 34);
  });

  it("composite margins: marginLeft + marginRight add to effective layout width", () => {
    // "Joe" = 24px. chromeWidth = 8. margins = 4+4.
    // Total width = 24 + 8 + 4 + 4 = 40px.
    const result = layout(
      [{
        kind: "composite",
        runs: [{ kind: "text", text: "Joe", font: FONT }],
        chromeWidth: 8,
        marginLeft: 4,
        marginRight: 4,
      }],
      100
    );
    assert.equal(result.lines.length, 1);
    const frag = result.lines[0]!.fragments[0]!;
    if (frag.kind === "composite") {
      assert.equal(frag.width, 40); // 24 + 8 + 4 + 4
      assert.equal(frag.marginLeft, 4);
      assert.equal(frag.marginRight, 4);
    }
  });

  it("composite with margins wraps when space is tight", () => {
    // "abcde " = 40px. Composite = 24 inner + 8 chrome + 4+4 margins = 40px.
    // With gap = 4px → 40 + 4 + 40 = 84px > 50px
    const result = layout(
      [
        { kind: "text", text: "abcde ", font: FONT },
        {
          kind: "composite",
          runs: [{ kind: "text", text: "Joe", font: FONT }],
          chromeWidth: 8,
          marginLeft: 4,
          marginRight: 4,
        },
      ],
      50
    );
    assert.equal(result.lines.length, 2);
  });

  it("empty composite (no inner runs) produces zero-sized fragment", () => {
    const result = layout(
      [{ kind: "composite", runs: [], chromeWidth: 8 }],
      100
    );
    // No inner items → innerWidth = 0, width = 0 + 8 = 8, height = 0 (empty layout)
    assert.equal(result.lines.length, 1);
    const frag = result.lines[0]!.fragments[0]!;
    if (frag.kind === "composite") {
      assert.equal(frag.innerWidth, 0);
      assert.equal(frag.width, 8); // just chrome
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// COMPOSITE: makeChip HELPER
// ═════════════════════════════════════════════════════════════════════

describe("makeChip helper", () => {
  it("makeChip produces correct composite run", () => {
    const chip = makeChip("tag", FONT);
    assert.equal(chip.kind, "composite");
    if (chip.kind === "composite") {
      assert.equal(chip.runs.length, 1);
      assert.equal(chip.chromeWidth, 8);
    }
  });

  it("makeChip layout: width = text + chromeWidth", () => {
    // "tag" = 3×8 = 24px + 8 chrome = 32px total
    const result = layout([makeChip("tag", FONT)], 100);
    assert.equal(result.lines.length, 1);
    const frag = result.lines[0]!.fragments[0]!;
    if (frag.kind === "composite") {
      assert.equal(frag.width, 32);
    }
  });

  it("makeChip with custom chromeWidth", () => {
    const result = layout([makeChip("tag", FONT, { chromeWidth: 16 })], 100);
    const frag = result.lines[0]!.fragments[0]!;
    if (frag.kind === "composite") {
      assert.equal(frag.width, 40); // 24 + 16
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// COMPOSITE: makeMentionChip HELPER (AVATAR CHIP)
// ═════════════════════════════════════════════════════════════════════

describe("makeMentionChip helper (avatar chip)", () => {
  it("mention chip with avatar fits on one line with preceding text", () => {
    // makeMentionChip("@Sarah", FONT, { avatarWidth: 20, chromeWidth: 10, marginLeft: 2, marginRight: 2 })
    // Inner runs: box(20) + text("@Sarah" = 6×8 = 48px)
    // Natural inner width: box(20) + gap(0, box has no trailing space) + text(48) = 68px
    // Wait: box leadingGap = pendingGap from prior items. First item (box) has pendingGap=0.
    // Second item (text "@Sarah"): carryGap=0, no leading whitespace → leadingGap=0.
    // So: natural width = 20 + 0 + 48 = 68px inner
    // Total chip width = 68 + 10(chrome) + 2 + 2(margins) = 82px
    //
    // "Check with " text: trimmed = "Check with" → "Check" = 5×8=40, space=4, "with"=4×8=32
    // "Check with" = 40+4+32 = 76px. Trailing space → gap=4px.
    // Total line: 76 + 4(gap) + 82(chip) = 162px. Container=200 → fits!
    const mentionChip = makeMentionChip("@Sarah", FONT, {
      avatarWidth: 20,
      chromeWidth: 10,
      marginLeft: 2,
      marginRight: 2,
    });
    const result = layout(
      [
        { kind: "text", text: "Check with ", font: FONT },
        mentionChip,
      ],
      200
    );
    assert.equal(result.lines.length, 1);

    // Verify composite fragment
    const frag = result.lines[0]!.fragments[1]!;
    assert.equal(frag.kind, "composite");
    if (frag.kind === "composite") {
      assert.equal(frag.innerWidth, 68);
      assert.equal(frag.width, 82); // 68 + 10 + 2 + 2
      assert.equal(frag.chromeWidth, 10);
      assert.equal(frag.marginLeft, 2);
      assert.equal(frag.marginRight, 2);
    }
  });

  it("mention chip wraps to next line when container is tight", () => {
    // Same chip: 82px total. "Check with " text = 76px + gap 4px.
    // 76 + 4 + 82 = 162px > 160px → chip wraps to line 2
    const mentionChip = makeMentionChip("@Sarah", FONT, {
      avatarWidth: 20,
      chromeWidth: 10,
      marginLeft: 2,
      marginRight: 2,
    });
    const result = layout(
      [
        { kind: "text", text: "Check with ", font: FONT },
        mentionChip,
      ],
      160
    );
    assert.equal(result.lines.length, 2);
    assert.equal(result.lines[0]!.fragments[0]!.kind, "text");
    assert.equal(result.lines[1]!.fragments[0]!.kind, "composite");
    // Composite on line 2 starts at x=0 with leadingGap=0
    const chipFrag = result.lines[1]!.fragments[0]!;
    if (chipFrag.kind === "composite") {
      assert.equal(chipFrag.x, 0);
      assert.equal(chipFrag.leadingGap, 0);
    }
  });

  it("mention chip with text before and after — all fit on one line", () => {
    // "Check with " (76px) + gap(4) + chip(82px) + gap(0, composite has no trailing space) + " now" (leadingGap=4, "now"=24px)
    // Wait: composite doesn't set pendingGap. After composite, pendingGap=0.
    // " now" has leading whitespace → leadingGap = 4px. trimmed = "now" = 24px.
    // Total: 76 + 4 + 82 + 4 + 24 = 190px. Container = 200 → fits on 1 line!
    const mentionChip = makeMentionChip("@Sarah", FONT, {
      avatarWidth: 20,
      chromeWidth: 10,
      marginLeft: 2,
      marginRight: 2,
    });
    const result = layout(
      [
        { kind: "text", text: "Check with ", font: FONT },
        mentionChip,
        { kind: "text", text: " now", font: FONT },
      ],
      200
    );
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0]!.fragments.length, 3);
  });

  it("mention chip with text wraps to 2 lines at 160px", () => {
    // "Check with " (76px) + gap(4) + chip(82px) = 162 > 160 → chip wraps
    // Line 1: "Check with" (76px)
    // Line 2: chip(82px) + " now" → leadingGap=4, "now"=24 → 82+4+24=110 < 160 → fits
    // Total: 2 lines
    const mentionChip = makeMentionChip("@Sarah", FONT, {
      avatarWidth: 20,
      chromeWidth: 10,
      marginLeft: 2,
      marginRight: 2,
    });
    const result = layout(
      [
        { kind: "text", text: "Check with ", font: FONT },
        mentionChip,
        { kind: "text", text: " now", font: FONT },
      ],
      160
    );
    assert.equal(result.lines.length, 2);
    // Line 1: text "Check with"
    assert.equal(result.lines[0]!.fragments.length, 1);
    if (result.lines[0]!.fragments[0]!.kind === "text") {
      assert.equal(result.lines[0]!.fragments[0]!.text, "Check with");
    }
    // Line 2: composite + text "now"
    assert.equal(result.lines[1]!.fragments.length, 2);
    assert.equal(result.lines[1]!.fragments[0]!.kind, "composite");
    if (result.lines[1]!.fragments[1]!.kind === "text") {
      assert.equal(result.lines[1]!.fragments[1]!.text, "now");
    }
  });

  it("mention chip inner layout contains avatar box and text", () => {
    const mentionChip = makeMentionChip("@Sarah", FONT);
    const result = layout([mentionChip], 200);
    const frag = result.lines[0]!.fragments[0]!;
    if (frag.kind === "composite") {
      // Inner layout should have 1 line with box + text fragments
      assert.equal(frag.innerLayout.lines.length, 1);
      assert.equal(frag.innerLayout.lines[0]!.fragments.length, 2);
      assert.equal(frag.innerLayout.lines[0]!.fragments[0]!.kind, "box");
      assert.equal(frag.innerLayout.lines[0]!.fragments[1]!.kind, "text");
    }
  });

  it("default makeMentionChip dimensions", () => {
    // Defaults: avatarWidth=20, chromeWidth=10, marginLeft=2, marginRight=2
    // "@Sarah" = 48px. Inner = 20 + 48 = 68px.
    // Total = 68 + 10 + 2 + 2 = 82px.
    const chip = makeMentionChip("@Sarah", FONT);
    const result = layout([chip], 200);
    const frag = result.lines[0]!.fragments[0]!;
    if (frag.kind === "composite") {
      assert.equal(frag.width, 82);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// MIXED SCENARIOS
// ═════════════════════════════════════════════════════════════════════

describe("Mixed scenarios", () => {
  it("text → composite → text across line boundaries", () => {
    // "Hello " = 40px. Composite "X" = 8+8chrome = 16px. " world" = 40px.
    // Container = 60px.
    // Line 1: "Hello" (40) + gap(4) + composite(16) = 60px fits in 60px
    // Line 2: "world" = 40px
    const result = layout(
      [
        { kind: "text", text: "Hello ", font: FONT },
        { kind: "composite", runs: [{ kind: "text", text: "X", font: FONT }], chromeWidth: 8 },
        { kind: "text", text: " world", font: FONT },
      ],
      60
    );
    assert.equal(result.lines.length, 2);
  });

  it("two boxes side by side fitting on one line", () => {
    const result = layout(
      [
        { kind: "box", width: 20 },
        { kind: "box", width: 20 },
      ],
      50
    );
    assert.equal(result.lines.length, 1);
  });

  it("text wraps mid-word with resume on next line", () => {
    const result = layout([{ kind: "text", text: "abcdefghij", font: FONT }], 50);
    assert.equal(result.lines.length, 2);
    if (result.lines[0]!.fragments[0]!.kind === "text") {
      assert.equal(result.lines[0]!.fragments[0]!.text.length, 6);
    }
  });

  it("empty string run → skip, no fragment emitted", () => {
    const result = layout(
      [
        { kind: "text", text: "", font: FONT },
        { kind: "text", text: "Hello", font: FONT },
      ],
      100
    );
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0]!.fragments.length, 1);
  });

  it("whitespace-only run → contributes gap to next run but no fragment", () => {
    const result = layout(
      [
        { kind: "text", text: "abc", font: FONT },
        { kind: "text", text: "   ", font: FONT },
        { kind: "text", text: "def", font: FONT },
      ],
      200
    );
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0]!.fragments.length, 2);
    const frag2 = result.lines[0]!.fragments[1]!;
    if (frag2.kind === "text") {
      assert.equal(frag2.leadingGap, SPACE);
    }
  });

  it("box between text runs", () => {
    const result = layout(
      [
        { kind: "text", text: "Hi ", font: FONT },
        { kind: "box", width: 16, height: 16 },
        { kind: "text", text: " there", font: FONT },
      ],
      200
    );
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0]!.fragments.length, 3);
  });
});

// ═════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
  it("containerWidth = 0 → does not infinite loop, returns something", () => {
    const result = layout([{ kind: "text", text: "Hello", font: FONT }], 0);
    assert.ok(result.lines.length > 0);
  });

  it("all runs are empty strings → zero lines", () => {
    const result = layout(
      [
        { kind: "text", text: "", font: FONT },
        { kind: "text", text: "", font: FONT },
      ],
      100
    );
    assert.equal(result.lines.length, 0);
    assert.equal(result.totalHeight, 0);
  });

  it("single character wider than containerWidth → appears on its own line", () => {
    const result = layout([{ kind: "text", text: "W", font: FONT }], 4);
    assert.equal(result.lines.length, 1);
    if (result.lines[0]!.fragments[0]!.kind === "text") {
      assert.equal(result.lines[0]!.fragments[0]!.text, "W");
    }
  });

  it("very large containerWidth → everything on one line", () => {
    const result = layout(
      [{ kind: "text", text: "Hello world foo bar baz qux quux", font: FONT }],
      100_000
    );
    assert.equal(result.lines.length, 1);
  });

  it("only boxes, no text", () => {
    const result = layout(
      [
        { kind: "box", width: 10 },
        { kind: "box", width: 10 },
        { kind: "box", width: 10 },
      ],
      100
    );
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0]!.fragments.length, 3);
  });

  it("single box exactly equal to container width", () => {
    const result = layout([{ kind: "box", width: 50 }], 50);
    assert.equal(result.lines.length, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════
// HEIGHT CALCULATION
// ═════════════════════════════════════════════════════════════════════

describe("Height calculation", () => {
  it("N lines at lineHeight=24 → totalHeight = N * 24", () => {
    const result = layout(
      [{ kind: "text", text: "abc def ghi jkl", font: FONT }],
      40,
      24
    );
    const n = result.lines.length;
    assert.equal(result.totalHeight, n * 24);
  });

  it("line with box(height=48) + lineHeight=24 → that line.height = 48", () => {
    const result = layout(
      [
        { kind: "text", text: "Hi ", font: FONT },
        { kind: "box", width: 10, height: 48 },
      ],
      200,
      24
    );
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0]!.height, 48);
    assert.equal(result.totalHeight, 48);
  });

  it("mixed box heights across lines", () => {
    const result = layout(
      [
        { kind: "text", text: "Hi ", font: FONT },
        { kind: "box", width: 200, height: 48 },
        { kind: "text", text: "bye", font: FONT },
      ],
      50,
      24
    );
    assert.equal(result.lines.length, 3);
    assert.equal(result.lines[0]!.height, 24);
    assert.equal(result.lines[1]!.height, 48);
    assert.equal(result.lines[2]!.height, 24);
    assert.equal(result.totalHeight, 24 + 48 + 24);
  });

  it("measureHeight matches layoutRuns totalHeight", () => {
    const runs: InlineRun[] = [
      { kind: "text", text: "Hello world this is a test", font: FONT },
      { kind: "box", width: 30, height: 40 },
      makeChip("tag", FONT),
    ];
    const prepared = prepareRuns(runs);
    const full = layoutRuns(prepared, 80, 24);
    const h = measureHeight(prepared, 80, 24);
    assert.equal(h, full.totalHeight);
  });
});

// ═════════════════════════════════════════════════════════════════════
// X-POSITION TRACKING
// ═════════════════════════════════════════════════════════════════════

describe("X-position tracking", () => {
  it("fragments have correct x positions", () => {
    const result = layout(
      [
        { kind: "text", text: "abc ", font: FONT },
        { kind: "text", text: "de", font: FONT },
      ],
      100
    );
    assert.equal(result.lines[0]!.fragments[0]!.x, 0);
    assert.equal(result.lines[0]!.fragments[1]!.x, 24);
  });

  it("box x includes preceding text", () => {
    const result = layout(
      [
        { kind: "text", text: "abc ", font: FONT },
        { kind: "box", width: 10 },
      ],
      100
    );
    const boxFrag = result.lines[0]!.fragments[1]!;
    assert.equal(boxFrag.x, 24);
  });

  it("first fragment on new line starts at x=0", () => {
    const result = layout(
      [
        { kind: "text", text: "abcde ", font: FONT },
        { kind: "text", text: "fghij", font: FONT },
      ],
      50
    );
    if (result.lines.length >= 2) {
      assert.equal(result.lines[1]!.fragments[0]!.x, 0);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// MOCK MEASUREMENT SANITY
// ═════════════════════════════════════════════════════════════════════

describe("Mock measurement sanity", () => {
  it("measures non-space chars at 8px", () => {
    assert.equal(mockMeasureText("abc"), 24);
  });

  it("measures spaces at 4px", () => {
    assert.equal(mockMeasureText("a b"), 20); // 8+4+8
  });

  it("measures empty string as 0", () => {
    assert.equal(mockMeasureText(""), 0);
  });
});
