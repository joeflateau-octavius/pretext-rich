import type { InlineRun } from "./types.js";

/**
 * Create a chip-style composite run containing a single text run.
 *
 * @param text - The chip label text
 * @param font - Font string for measurement
 * @param options - Optional chrome/margin overrides
 */
export function makeChip(
  text: string,
  font: string,
  options?: {
    chromeWidth?: number;    // default 8 (4px each side)
    marginLeft?: number;     // default 0
    marginRight?: number;    // default 0
    height?: number;         // ignored (height is computed from content)
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

/**
 * Create a mention chip with an avatar box followed by a name label.
 *
 * @param name - Display name (e.g. "@Sarah")
 * @param font - Font string for measurement
 * @param options - Optional avatar/chrome/margin overrides
 */
export function makeMentionChip(
  name: string,
  font: string,
  options?: {
    avatarWidth?: number;    // default 20
    chromeWidth?: number;    // default 10
    marginLeft?: number;     // default 2
    marginRight?: number;    // default 2
  }
): InlineRun {
  const avatarWidth = options?.avatarWidth ?? 20;
  return {
    kind: "composite",
    runs: [
      { kind: "box", width: avatarWidth, height: avatarWidth },  // avatar circle
      { kind: "text", text: name, font },
    ],
    chromeWidth: options?.chromeWidth ?? 10,
    marginLeft: options?.marginLeft ?? 2,
    marginRight: options?.marginRight ?? 2,
  };
}
