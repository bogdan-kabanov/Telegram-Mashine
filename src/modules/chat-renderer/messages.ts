import type { DialogMessage } from "@/lib/schemas";
import { computeMessageTimes } from "@/lib/format";
import type { RenderMessage } from "./template";

const MESSAGES_PER_SCREEN = 6;
const PAGE_OVERLAP = 1;

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
  const times = computeMessageTimes(messages);

  return messages.map((msg, index) => {
    let content = msg.content;
    let type: RenderMessage["type"] =
      msg.type === "text" ? "text" : msg.type === "sticker" ? "sticker" : "image";
    const imageUrl = resolveImageUrl(msg, mediaAssets);

    if (msg.type === "conditions" || msg.type === "bet" || msg.type === "receipt" || msg.type === "captura") {
      content = imageUrl ? "__image__" : msg.type;
      type = imageUrl ? "image" : "text";
    } else if (msg.type === "sticker") {
      content = imageUrl ? "__sticker__" : "sticker";
      type = imageUrl ? "sticker" : "text";
    } else if (msg.type === "image") {
      content = imageUrl ? "__image__" : msg.content;
      type = imageUrl ? "image" : "text";
    } else if (msg.type !== "text") {
      type = "image";
    }

    return {
      id: msg.id,
      role: msg.role,
      type,
      content,
      time: times[index] ?? "17:08",
      read: msg.role === "manager",
      ...(imageUrl ? { imageUrl } : {}),
    };
  });
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

/** Split dialog into screens — each page shows the next chunk (with 1-msg overlap), not a duplicate prefix. */
export function paginateMessages(messages: RenderMessage[]): RenderMessage[][] {
  if (messages.length === 0) return [[]];
  if (messages.length <= MESSAGES_PER_SCREEN) return [messages];

  const pages: RenderMessage[][] = [];
  let start = 0;

  while (start < messages.length) {
    const end = Math.min(start + MESSAGES_PER_SCREEN, messages.length);
    pages.push(messages.slice(start, end));
    if (end >= messages.length) break;
    start += MESSAGES_PER_SCREEN - PAGE_OVERLAP;
  }

  return pages;
}
