/**
 * Server-only: embed Apple emoji PNGs as data URIs for Playwright file:// HTML.
 */

import { existsSync, readFileSync } from "fs";
import path from "path";

import { appleEmojiUrl, emojiToAppleCode, EMOJI_RE } from "@/lib/emoji/apple";

const APPLE_EMOJI_DIR = path.join(
  process.cwd(),
  "node_modules",
  "emoji-datasource-apple",
  "img",
  "apple",
  "64",
);

const dataUriCache = new Map<string, string>();

export function appleEmojiFilePath(code: string): string {
  return path.join(APPLE_EMOJI_DIR, `${code}.png`);
}

/** Server / Playwright: embed PNG so file:// HTML does not need network. */
export function appleEmojiDataUri(emoji: string): string | null {
  const code = emojiToAppleCode(emoji);
  const cached = dataUriCache.get(code);
  if (cached) return cached;

  const file = appleEmojiFilePath(code);
  if (!existsSync(file)) return null;

  const uri = `data:image/png;base64,${readFileSync(file).toString("base64")}`;
  dataUriCache.set(code, uri);
  return uri;
}

export function appleEmojiImgHtml(emoji: string): string {
  const src = appleEmojiDataUri(emoji) ?? appleEmojiUrl(emoji);
  const alt = emoji
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<img class="apple-emoji" src="${src}" alt="${alt}" draggable="false" />`;
}

/** Escape text for HTML, keep newlines as <br>, swap emoji for Apple PNGs. */
export function formatChatTextHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const withEmoji = escaped.replace(EMOJI_RE, (match) => appleEmojiImgHtml(match));
  return withEmoji.replace(/\n/g, "<br>");
}
