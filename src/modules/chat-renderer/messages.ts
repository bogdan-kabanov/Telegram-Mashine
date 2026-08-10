import type { DialogMessage } from "@/lib/schemas/dialog";
import { computeMessageTimes } from "@/lib/format";
import type { RenderMessage } from "./render-types";

export type { RenderMessage } from "./render-types";
export {
  TARGET_SCREENSHOTS,
  messageVisualWeight,
  messagesPerScreenForCount,
  paginateMessages,
} from "./pagination";

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

      if (needsMedia && !imageUrl) {
        // Never silently drop the client's story photo — leave a visible gap warning
        // only for other media; story images stay as a text stub so pagination still
        // includes the turn (operator sees something went wrong in-chat).
        if (msg.type === "image") {
          return {
            id: msg.id,
            role: msg.role,
            type: "text" as const,
            content: "📷",
            delayMinutes: msg.delayMinutes,
            read: msg.role === "manager",
          };
        }
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
    if (msg.content === "bet_3") return mediaAssets.bet3 ?? undefined;
    return undefined;
  }
  if (msg.type === "receipt") return mediaAssets.receipt ?? undefined;
  return undefined;
}
