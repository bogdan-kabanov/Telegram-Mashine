import type { RenderMessage } from "./render-types";

/** Target screenshots per full review — Telegram album max is 10. */
export const TARGET_SCREENSHOTS = 10;
/** Carry last N messages onto the next screen so clipped tails never vanish. */
const PAGE_OVERLAP = 2;
/** Soft floor so short dialogs don't become 1-msg pages. */
const MIN_MESSAGES_PER_SCREEN = 3;
const MAX_MESSAGES_PER_SCREEN = 5;
/**
 * Approximate visual weight — keep pages short enough to fit above the input bar
 * (phone 844px − header/input chrome ≈ 630px usable).
 */
const MAX_WEIGHT_PER_SCREEN = 7;

export function messageVisualWeight(msg: RenderMessage): number {
  if (msg.type === "image") {
    if (msg.mediaKind === "conditions") return 5;
    if (msg.mediaKind === "bet" || msg.mediaKind === "receipt" || msg.mediaKind === "captura") {
      return 4;
    }
    return 3;
  }
  if (msg.type === "sticker") return 2;
  const lines = msg.content.split("\n").length;
  const chars = msg.content.length;
  if (lines >= 4 || chars > 140) return 2;
  return 1;
}

/** Choose page size so a full dialog lands near TARGET_SCREENSHOTS. */
export function messagesPerScreenForCount(
  messageCount: number,
  targetScreens = TARGET_SCREENSHOTS,
): number {
  if (messageCount <= MIN_MESSAGES_PER_SCREEN) return MIN_MESSAGES_PER_SCREEN;
  if (targetScreens <= 1) return Math.min(MAX_MESSAGES_PER_SCREEN, messageCount);

  let best = MAX_MESSAGES_PER_SCREEN;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let m = MIN_MESSAGES_PER_SCREEN; m <= MAX_MESSAGES_PER_SCREEN; m++) {
    const step = Math.max(1, m - PAGE_OVERLAP);
    const pages = messageCount <= m ? 1 : 1 + Math.ceil((messageCount - m) / step);
    const diff = Math.abs(pages - targetScreens);
    if (diff < bestDiff || (diff === bestDiff && pages >= targetScreens)) {
      bestDiff = diff;
      best = m;
    }
  }

  return best;
}

/** Split dialog into screens — weight-aware so tall media doesn't leave empty gaps / cutoffs. */
export function paginateMessages(
  messages: RenderMessage[],
  targetScreens = TARGET_SCREENSHOTS,
): RenderMessage[][] {
  if (messages.length === 0) return [[]];

  const softCap = messagesPerScreenForCount(messages.length, targetScreens);
  if (messages.length <= softCap) {
    const totalWeight = messages.reduce((sum, m) => sum + messageVisualWeight(m), 0);
    if (totalWeight <= MAX_WEIGHT_PER_SCREEN + 2) return [messages];
  }

  const pages: RenderMessage[][] = [];
  let start = 0;

  while (start < messages.length) {
    let end = start;
    let weight = 0;
    let count = 0;

    while (end < messages.length) {
      const nextWeight = messageVisualWeight(messages[end]!);
      const wouldExceedWeight = count > 0 && weight + nextWeight > MAX_WEIGHT_PER_SCREEN;
      const wouldExceedCount = count >= softCap;
      if (wouldExceedWeight || wouldExceedCount) break;
      weight += nextWeight;
      count += 1;
      end += 1;
      if (count === 1 && nextWeight >= MAX_WEIGHT_PER_SCREEN) break;
    }

    if (end <= start) end = Math.min(start + 1, messages.length);
    pages.push(messages.slice(start, end));
    if (end >= messages.length) break;
    // Never rewind to the same start (overlap must not cancel progress).
    const overlapped = end - PAGE_OVERLAP;
    start = overlapped > start ? overlapped : end;
  }

  return pages;
}
