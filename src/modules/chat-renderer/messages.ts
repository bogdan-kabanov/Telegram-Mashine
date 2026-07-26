import type { DialogMessage } from "@/lib/schemas";
import { computeMessageTimes } from "@/lib/format";
import type { RenderMessage } from "./template";

/** Target screenshots per full review (~9). */
export const TARGET_SCREENSHOTS = 9;
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

export interface DialogMediaAssets {
  sticker?: string | null;
  storyPhoto?: string | null;
  conditions?: string | null;
  bet1?: string | null;
  bet2?: string | null;
  bet3?: string | null;
  receipt?: string | null;
  captura?: string | null;
}

export function dialogToRenderMessages(
  messages: DialogMessage[],
  mediaAssets: DialogMediaAssets,
): RenderMessage[] {
  const prepared = messages
    .map((msg) => {
      const imageUrl = resolveImageUrl(msg, mediaAssets);
      const needsMedia =
        msg.type === "conditions" ||
        msg.type === "bet" ||
        msg.type === "receipt" ||
        msg.type === "captura" ||
        msg.type === "sticker" ||
        msg.type === "image";

      // Never leak placeholders like "conditions" / "bet" / "ai_xxxx" into the chat.
      if (needsMedia && !imageUrl) {
        return null;
      }

      let content = msg.content;
      let type: RenderMessage["type"] = "text";
      let mediaKind: RenderMessage["mediaKind"];

      if (msg.type === "conditions" || msg.type === "bet" || msg.type === "receipt" || msg.type === "captura") {
        content = "__image__";
        type = "image";
        mediaKind = msg.type;
      } else if (msg.type === "sticker") {
        content = "__sticker__";
        type = "sticker";
      } else if (msg.type === "image") {
        content = "__image__";
        type = "image";
        mediaKind = "story";
      } else {
        type = "text";
        content = msg.content;
      }

      return {
        id: msg.id,
        role: msg.role,
        type,
        content,
        delayMinutes: msg.delayMinutes,
        read: msg.role === "manager",
        ...(imageUrl ? { imageUrl } : {}),
        ...(mediaKind ? { mediaKind } : {}),
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  const times = computeMessageTimes(prepared);

  return prepared.map((msg, index) => ({
    id: msg.id,
    role: msg.role,
    type: msg.type,
    content: msg.content,
    time: times[index] ?? "17:08",
    read: msg.read,
    ...(msg.imageUrl ? { imageUrl: msg.imageUrl } : {}),
    ...(msg.mediaKind ? { mediaKind: msg.mediaKind } : {}),
  }));
}

function resolveImageUrl(
  msg: DialogMessage,
  mediaAssets: DialogMediaAssets,
): string | undefined {
  if (msg.type === "sticker") return mediaAssets.sticker ?? undefined;
  if (msg.type === "image") {
    if (msg.metadata?.legendId || msg.content) {
      return mediaAssets.storyPhoto ?? undefined;
    }
    if (msg.metadata?.imagePath) return String(msg.metadata.imagePath);
  }
  if (msg.type === "conditions") return mediaAssets.conditions ?? undefined;
  if (msg.type === "captura") return mediaAssets.captura ?? undefined;
  if (msg.type === "bet") {
    if (msg.content === "bet_1") return mediaAssets.bet1 ?? undefined;
    if (msg.content === "bet_2") return mediaAssets.bet2 ?? undefined;
    return mediaAssets.bet3 ?? undefined;
  }
  if (msg.type === "receipt") return mediaAssets.receipt ?? undefined;
  return undefined;
}

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

  // pages ≈ 1 + ceil((n - M) / (M - O))  → solve for M near target
  let best = MAX_MESSAGES_PER_SCREEN;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let m = MIN_MESSAGES_PER_SCREEN; m <= MAX_MESSAGES_PER_SCREEN; m++) {
    const step = Math.max(1, m - PAGE_OVERLAP);
    const pages =
      messageCount <= m ? 1 : 1 + Math.ceil((messageCount - m) / step);
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
      // Always include at least one message; allow a single heavy image alone.
      if (count === 1 && nextWeight >= MAX_WEIGHT_PER_SCREEN) break;
    }

    if (end <= start) end = Math.min(start + 1, messages.length);
    pages.push(messages.slice(start, end));
    if (end >= messages.length) break;
    start = Math.max(0, end - PAGE_OVERLAP);
  }

  return pages;
}
