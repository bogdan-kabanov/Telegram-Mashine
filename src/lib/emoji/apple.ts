/**
 * Client-safe Apple emoji helpers (no Node fs).
 * Browser preview loads PNGs via /api/emoji/:code.
 */

/** Emoji + ZWJ sequences (💙, 👨‍👩‍👧, flags, etc.). */
export const EMOJI_RE =
  /(?:\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*)|\p{Regional_Indicator}{2}/gu;

export function emojiToAppleCode(emoji: string): string {
  const parts: string[] = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    if (cp === 0xfe0f) continue; // variation selector-16
    parts.push(cp.toString(16));
  }
  return parts.join("-");
}

/** Browser / React: served by /api/emoji/[code]. */
export function appleEmojiUrl(emoji: string): string {
  return `/api/emoji/${emojiToAppleCode(emoji)}`;
}

/** Split plain text into text / emoji parts for React rendering. */
export function splitAppleEmojiParts(text: string): Array<{ type: "text" | "emoji"; value: string }> {
  const parts: Array<{ type: "text" | "emoji"; value: string }> = [];
  let last = 0;
  for (const match of text.matchAll(EMOJI_RE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push({ type: "emoji", value: match[0]! });
    last = start + match[0]!.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}
