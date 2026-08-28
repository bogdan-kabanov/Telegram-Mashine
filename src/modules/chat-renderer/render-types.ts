export interface RenderMessage {
  id: string;
  role: "client" | "manager";
  type: "text" | "image" | "sticker" | "voice";
  content: string;
  time: string;
  read?: boolean;
  imageUrl?: string;
  /** Voice duration label e.g. "0:12" */
  voiceDuration?: string;
  /** Stage delay from dialog — used to re-clock slides without rebuilding HTML. */
  delayMinutes?: number;
  /** Distinguishes conditions / bets / receipts for sizing. */
  mediaKind?: "conditions" | "bet" | "receipt" | "captura" | "story";
  /** Library slot for live regenerate (bet1 / storyPhoto / …). */
  mediaSlot?: string;
}
