import { existsSync } from "fs";
import path from "path";
import sharp from "sharp";

/**
 * Crop near-white / empty margins from bank slip images (AI often letterboxes).
 * Local CPU only — no OpenAI calls.
 *
 * Writes a sibling `*.trim.png` (or same ext) and returns that path when cropped.
 */
export async function trimWhitespaceImage(
  inputPath: string,
  options?: { threshold?: number; padding?: number },
): Promise<{ path: string; trimmed: boolean }> {
  const threshold = options?.threshold ?? 22;
  const padding = options?.padding ?? 6;

  if (!existsSync(inputPath)) {
    return { path: inputPath, trimmed: false };
  }

  const ext = path.extname(inputPath) || ".png";
  const outPath = inputPath.replace(new RegExp(`${ext.replace(".", "\\.")}$`, "i"), `.trim${ext}`);

  if (existsSync(outPath)) {
    try {
      const [src, dst] = await Promise.all([sharp(inputPath).metadata(), sharp(outPath).metadata()]);
      if (
        (dst.width ?? 0) > 0 &&
        ((dst.width ?? 0) < (src.width ?? 0) || (dst.height ?? 0) < (src.height ?? 0))
      ) {
        return { path: outPath, trimmed: true };
      }
    } catch {
      // regenerate
    }
  }

  try {
    const before = await sharp(inputPath).metadata();
    const trimmedBuf = await sharp(inputPath)
      .trim({ threshold })
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer();

    const after = await sharp(trimmedBuf).metadata();
    const shrunk =
      (before.width ?? 0) - (after.width ?? 0) > 8 ||
      (before.height ?? 0) - (after.height ?? 0) > 8;

    if (!shrunk) {
      return { path: inputPath, trimmed: false };
    }

    await sharp(trimmedBuf).toFile(outPath);
    return { path: outPath, trimmed: true };
  } catch {
    return { path: inputPath, trimmed: false };
  }
}

/** Overwrite file with trimmed version. */
export async function trimWhitespaceInPlace(
  filePath: string,
  options?: { threshold?: number; padding?: number },
): Promise<boolean> {
  const threshold = options?.threshold ?? 22;
  const padding = options?.padding ?? 6;
  if (!existsSync(filePath)) return false;

  try {
    const before = await sharp(filePath).metadata();
    const buf = await sharp(filePath)
      .trim({ threshold })
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer();
    const after = await sharp(buf).metadata();
    const shrunk =
      (before.width ?? 0) - (after.width ?? 0) > 8 ||
      (before.height ?? 0) - (after.height ?? 0) > 8;
    if (!shrunk) return false;
    await sharp(buf).toFile(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Make near-white / light-gray pixels transparent (Telegram stickers).
 * Writes sibling `*.alpha.png` when changed.
 */
export async function removeWhiteBackgroundImage(
  inputPath: string,
  options?: { threshold?: number },
): Promise<{ path: string; changed: boolean }> {
  const threshold = options?.threshold ?? 245;
  if (!existsSync(inputPath)) {
    return { path: inputPath, changed: false };
  }

  const outPath = inputPath.replace(/\.(png|jpe?g|webp)$/i, ".alpha.png");
  if (existsSync(outPath)) {
    return { path: outPath, changed: true };
  }

  try {
    const { data, info } = await sharp(inputPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = Buffer.from(data);
    let cleared = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i]!;
      const g = pixels[i + 1]!;
      const b = pixels[i + 2]!;
      if (r >= threshold && g >= threshold && b >= threshold) {
        pixels[i + 3] = 0;
        cleared += 1;
      }
    }

    if (cleared < 40) {
      return { path: inputPath, changed: false };
    }

    // Drop empty margins after keying white → transparent
    const keyed = await sharp(pixels, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer();

    const trimmed = await sharp(keyed)
      .trim({ threshold: 8 })
      .png()
      .toBuffer();

    await sharp(trimmed).toFile(outPath);
    return { path: outPath, changed: true };
  } catch {
    return { path: inputPath, changed: false };
  }
}

/** Overwrite sticker file with transparent background. */
export async function removeWhiteBackgroundInPlace(
  filePath: string,
  options?: { threshold?: number },
): Promise<boolean> {
  const result = await removeWhiteBackgroundImage(filePath, options);
  if (!result.changed || result.path === filePath) return false;
  try {
    const buf = await sharp(result.path).png().toBuffer();
    await sharp(buf).toFile(filePath);
    return true;
  } catch {
    return false;
  }
}
