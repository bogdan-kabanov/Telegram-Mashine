export interface RenderMessage {
  id: string;
  role: "client" | "manager";
  type: "text" | "image" | "sticker";
  content: string;
  time: string;
  read?: boolean;
  imageUrl?: string;
  /** Distinguishes conditions / bets / receipts for sizing. */
  mediaKind?: "conditions" | "bet" | "receipt" | "captura" | "story";
}
