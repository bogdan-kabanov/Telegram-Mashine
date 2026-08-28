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
  voice?: string | null;
}

function formatVoiceDuration(seconds: number): string {
  const s = Math.max(1, Math.min(599, Math.floor(seconds)));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function dialogToRenderMessages(
  messages: DialogMessage[],
  mediaAssets: DialogMediaAssets,
  clock?: { now?: Date; timeZone?: string; locale?: string },
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
        return null;
      }
      if (msg.type === "voice" && !mediaAssets.voice) {
        return null;
      }

      let content = msg.content;
      let type: RenderMessage["type"] = "text";
      let mediaKind: RenderMessage["mediaKind"];
      const mediaSlot = mediaSlotFor(msg);

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
      } else if (msg.type === "voice") {
        content = "__voice__";
        type = "voice";
      } else {
        type = "text";
        content = msg.content;
      }

      const voiceDuration =
        msg.type === "voice"
          ? formatVoiceDuration(
              typeof msg.metadata?.durationSec === "number" ? msg.metadata.durationSec : 12,
            )
          : undefined;

      return {
        id: msg.id,
        role: msg.role,
        type,
        content,
        delayMinutes: msg.delayMinutes,
        read: msg.role === "manager",
        ...(imageUrl ? { imageUrl } : {}),
        ...(mediaKind ? { mediaKind } : {}),
        ...(mediaSlot ? { mediaSlot } : {}),
        ...(voiceDuration ? { voiceDuration } : {}),
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  const times = computeMessageTimes(prepared, clock);

  return prepared.map((msg, index) => ({
    id: msg.id,
    role: msg.role,
    type: msg.type,
    content: msg.content,
    time: times[index] ?? times.at(-1) ?? "12:00",
    read: msg.read,
    delayMinutes: msg.delayMinutes,
    ...(msg.imageUrl ? { imageUrl: msg.imageUrl } : {}),
    ...(msg.mediaKind ? { mediaKind: msg.mediaKind } : {}),
    ...(msg.mediaSlot ? { mediaSlot: msg.mediaSlot } : {}),
    ...(msg.voiceDuration ? { voiceDuration: msg.voiceDuration } : {}),
  }));
}

export function mediaSlotFor(msg: { type: string; content?: string }): string | undefined {
  if (msg.type === "image") return "storyPhoto";
  if (msg.type === "voice") return "voice";
  if (msg.type === "conditions") return "conditions";
  if (msg.type === "sticker") return "sticker";
  if (msg.type === "receipt") return "receipt";
  if (msg.type === "captura") return "captura";
  if (msg.type === "bet") {
    if (msg.content === "bet_1") return "bet1";
    if (msg.content === "bet_2") return "bet2";
    if (msg.content === "bet_3") return "bet3";
  }
  return undefined;
}

function resolveImageUrl(
  msg: DialogMessage,
  mediaAssets: DialogMediaAssets,
): string | undefined {
  if (msg.type === "sticker") return mediaAssets.sticker ?? undefined;
  if (msg.type === "image") {
    if (mediaAssets.storyPhoto) return mediaAssets.storyPhoto;
    if (msg.metadata?.imagePath) return String(msg.metadata.imagePath);
    return undefined;
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
