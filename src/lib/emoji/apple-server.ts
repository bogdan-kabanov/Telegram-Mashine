/**
 * Server-only: embed Apple emoji PNGs as data URIs for Playwright file:// HTML.
 */

import { existsSync, readFileSync } from "fs";
import path from "path";

import { appleEmojiCodeCandidates, EMOJI_RE } from "@/lib/emoji/apple";

const EMOJI_DIR_CANDIDATES = [
  // Docker / production copy (see Dockerfile)
  path.join(process.cwd(), "assets", "emoji", "apple", "64"),
  path.join(process.cwd(), "node_modules", "emoji-datasource-apple", "img", "apple", "64"),
];

function resolveEmojiDir(): string {
  for (const dir of EMOJI_DIR_CANDIDATES) {
    if (existsSync(dir)) return dir;
  }
  return EMOJI_DIR_CANDIDATES[0]!;
}

const dataUriCache = new Map<string, string>();

export function appleEmojiFilePath(code: string): string {
  return path.join(resolveEmojiDir(), `${code.toLowerCase()}.png`);
}

function resolveExistingEmojiFile(emoji: string): { code: string; file: string } | null {
  for (const code of appleEmojiCodeCandidates(emoji)) {
    const file = appleEmojiFilePath(code);
    if (existsSync(file)) return { code, file };
  }
  return null;
}

/** Server / Playwright: embed PNG so file:// HTML does not need network. */
export function appleEmojiDataUri(emoji: string): string | null {
  const hit = resolveExistingEmojiFile(emoji);
  if (!hit) return null;

  const cached = dataUriCache.get(hit.code);
  if (cached) return cached;

  const uri = `data:image/png;base64,${readFileSync(hit.file).toString("base64")}`;
  dataUriCache.set(hit.code, uri);
  return uri;
}

export function appleEmojiImgHtml(emoji: string): string {
  const src = appleEmojiDataUri(emoji);
  // Never fall back to /api/... in Playwright file:// HTML — broken icons.
  if (!src) {
    return emoji
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
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

/** Admin preview: try FE0F variants when looking up a code from the URL. */
export function resolveAppleEmojiFileFromCode(code: string): string | null {
  const normalized = code.toLowerCase();
  const direct = appleEmojiFilePath(normalized);
  if (existsSync(direct)) return direct;

  // Rebuild candidates from hex code as if it were an emoji sequence
  const parts = normalized.split("-").map((h) => Number.parseInt(h, 16));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  const pseudo = String.fromCodePoint(...parts);
  const hit = resolveExistingEmojiFile(pseudo);
  return hit?.file ?? null;
}
