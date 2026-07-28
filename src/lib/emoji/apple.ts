/**
 * Client-safe Apple emoji helpers (no Node fs).
 * Browser preview loads PNGs via /api/emoji/:code.
 */

/** Emoji + ZWJ sequences (💙, 👨‍👩‍👧, flags, etc.). */
export const EMOJI_RE =
  /(?:\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*)|\p{Regional_Indicator}{2}/gu;

function toHex(codepoints: number[]): string {
  return codepoints.map((cp) => cp.toString(16)).join("-");
}

/**
 * Filenames in emoji-datasource-apple often keep FE0F (e.g. 2764-fe0f.png for ❤️).
 * Return candidates most → least likely.
 */
export function appleEmojiCodeCandidates(emoji: string): string[] {
  const raw: number[] = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    raw.push(cp);
  }
  if (raw.length === 0) return [];

  const stripped = raw.filter((cp) => cp !== 0xfe0f);
  const out: string[] = [];
  const push = (codes: number[]) => {
    if (codes.length === 0) return;
    const hex = toHex(codes);
    if (!out.includes(hex)) out.push(hex);
  };

  push(stripped);
  push(raw);

  // Insert FE0F after non-ZWJ / non-flag bases (covers ❤️, ⬆️, ❤️‍🔥, 👮‍♂️).
  const insertSlots: number[] = [];
  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i]!;
    const isZwj = c === 0x200d;
    const isFlag = c >= 0x1f1e6 && c <= 0x1f1ff;
    if (!isZwj && !isFlag) insertSlots.push(i);
  }
  if (insertSlots.length > 0 && insertSlots.length <= 6) {
    const n = insertSlots.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      const built: number[] = [];
      for (let i = 0; i < stripped.length; i++) {
        built.push(stripped[i]!);
        const slot = insertSlots.indexOf(i);
        if (slot >= 0 && mask & (1 << slot)) built.push(0xfe0f);
      }
      push(built);
    }
  }

  return out;
}

/** Preferred code (stripped) — used for URL paths; resolve file via candidates on server. */
export function emojiToAppleCode(emoji: string): string {
  return appleEmojiCodeCandidates(emoji)[0] ?? "";
}

/** Browser / React: served by /api/emoji/[code]. */
export function appleEmojiUrl(emoji: string): string {
  const code = emojiToAppleCode(emoji);
  return `/api/emoji/${code}`;
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
