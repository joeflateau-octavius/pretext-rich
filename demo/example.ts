/**
 * Teams-like rich message demo.
 *
 * Demonstrates: body text + bold mention + code span + inline box,
 * laid out at a given container width.
 */

import { prepareRuns, layoutRuns, measureHeight } from "../src/index.js";
import type { InlineRun } from "../src/index.js";

const BODY_FONT = '500 17px "Helvetica Neue", Helvetica, Arial, sans-serif';
const BOLD_FONT = '700 17px "Helvetica Neue", Helvetica, Arial, sans-serif';
const CODE_FONT = '600 14px "SF Mono", ui-monospace, Menlo, Monaco, monospace';

// A Teams-like message with mixed styles and an inline avatar box
const runs: InlineRun[] = [
  { kind: "text", text: "Ship ", font: BODY_FONT },
  { kind: "text", text: "@maya", font: BOLD_FONT },
  { kind: "text", text: "'s ", font: BODY_FONT },
  { kind: "text", text: "rich-note", font: CODE_FONT, chromeWidth: 14 },
  { kind: "text", text: " card once ", font: BODY_FONT },
  { kind: "text", text: "pre-wrap", font: CODE_FONT, chromeWidth: 14 },
  { kind: "text", text: " lands. Status blocked by ", font: BODY_FONT },
  { kind: "box", width: 24, height: 24 }, // inline avatar
  { kind: "text", text: " vertical text research.", font: BODY_FONT },
];

// Prepare once
const prepared = prepareRuns(runs);

// Layout at different widths
for (const width of [600, 400, 250]) {
  const lineHeight = 34;
  const layout = layoutRuns(prepared, width, lineHeight);
  const height = measureHeight(prepared, width, lineHeight);

  console.log(`\n── Container width: ${width}px ──`);
  console.log(`Lines: ${layout.lines.length}, Total height: ${height}px`);

  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i]!;
    const frags = line.fragments
      .map((f) => {
        if (f.kind === "text") {
          return `"${f.text}" @${f.x.toFixed(1)}`;
        }
        return `[box ${f.width}×${f.height}] @${f.x.toFixed(1)}`;
      })
      .join(" | ");
    console.log(`  Line ${i + 1} (h=${line.height}): ${frags}`);
  }
}
