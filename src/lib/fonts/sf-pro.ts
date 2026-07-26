import { existsSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";

const WEIGHTS = [
  { file: "SF-Pro-Text-Regular.otf", weight: 400 },
  { file: "SF-Pro-Text-Semibold.otf", weight: 600 },
  { file: "SF-Pro-Text-Bold.otf", weight: 700 },
] as const;

/** Absolute path to bundled SF Pro Text files. */
export function sfProFontsDir(): string {
  return path.resolve(process.cwd(), "assets/fonts/sf-pro");
}

/**
 * @font-face CSS with file:// URLs so Playwright Chromium on Windows/Linux
 * uses real SF Pro instead of Segoe UI / Arial fallbacks.
 */
export function sfProFontFaceCss(): string {
  const dir = sfProFontsDir();
  return WEIGHTS.map(({ file, weight }) => {
    const full = path.join(dir, file);
    if (!existsSync(full)) {
      throw new Error(`Missing SF Pro font file: ${full}`);
    }
    const url = pathToFileURL(full).href;
    return `@font-face {
      font-family: "SF Pro Text";
      font-style: normal;
      font-weight: ${weight};
      font-display: block;
      src: url("${url}") format("opentype");
    }`;
  }).join("\n");
}
