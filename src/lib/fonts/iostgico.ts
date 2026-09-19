import { existsSync, readFileSync } from "fs";
import path from "path";

/** Telegram iOS UI Kit icon font (Private Use Area). */
export const IOSTGICO = {
  paperclip: 0xf0e9,
  /** Circular sticker with folded corner (Telegram input). */
  sticker: 0xf05a,
  microphone: 0xf044,
  chevronBack: 0xf200,
} as const;

export type IostgicoName = keyof typeof IOSTGICO;

/**
 * Monochrome glyf-only copy (COLR/CPAL stripped) so CSS `color` works.
 * Source color font kept as iostgico.ttf for reference.
 */
export function iostgicoFontPath(): string {
  return path.resolve(process.cwd(), "assets/fonts/iostgico/iostgico-mono.ttf");
}

let cachedDataUrl: string | null = null;

function iostgicoDataUrl(): string {
  if (cachedDataUrl) return cachedDataUrl;
  const full = iostgicoFontPath();
  if (!existsSync(full)) {
    throw new Error(`Missing iostgico mono font file: ${full}`);
  }
  cachedDataUrl = `data:font/ttf;base64,${readFileSync(full).toString("base64")}`;
  return cachedDataUrl;
}

/**
 * @font-face with base64 src so icons work in:
 * - Playwright file:// screenshots
 * - admin live iframe srcDoc (browsers block file:// fonts)
 *
 * Uses monochrome TTF so CSS `color` tints glyphs (COLR #008bff ignored).
 */
export function iostgicoFontFaceCss(): string {
  const url = iostgicoDataUrl();
  return `@font-face {
      font-family: "iostgico";
      font-style: normal;
      font-weight: 400;
      font-display: block;
      src: url("${url}") format("truetype");
    }`;
}

/** HTML span for a chat-screenshot icon glyph. */
export function iostgicoIconHtml(name: IostgicoName, className = ""): string {
  const cp = IOSTGICO[name];
  const cls = className ? `tg-ico ${className}` : "tg-ico";
  return `<span class="${cls}" aria-hidden="true">${String.fromCodePoint(cp)}</span>`;
}
