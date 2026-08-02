import sharp from "sharp";

/**
 * Pre-blur a wallpaper data-URI for frosted glass pills.
 * CSS `filter: blur()` is often flat/missing in Playwright headless screenshots;
 * baking blur into the image is reliable.
 */
export async function blurWallpaperDataUri(
  dataUri: string,
  options?: { width?: number; height?: number; sigma?: number },
): Promise<string | null> {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUri);
  if (!match?.[2]) return null;

  const width = options?.width ?? 390;
  const height = options?.height ?? 844;
  // sharp blur sigma ≈ CSS blur radius / 2 for similar look
  const sigma = options?.sigma ?? 22;

  try {
    const input = Buffer.from(match[2], "base64");
    const out = await sharp(input)
      .rotate()
      .resize(width, height, { fit: "cover", position: "centre" })
      .blur(sigma)
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Average wallpaper color for bubble-tail knockouts (avoids re-embedding huge data-URIs in CSS). */
export async function averageWallpaperColor(dataUri: string): Promise<string | null> {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUri);
  if (!match?.[2]) return null;
  try {
    const input = Buffer.from(match[2], "base64");
    const { data, info } = await sharp(input)
      .rotate()
      .resize(16, 16, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let r = 0;
    let g = 0;
    let b = 0;
    const n = info.width * info.height;
    for (let i = 0; i < data.length; i += info.channels) {
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
    }
    return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  } catch {
    return null;
  }
}

/**
 * Compact wallpaper tile for ::after ear knockouts (CSS background, phone-sized).
 * Keeps Kraft dual-pseudo without a solid-color square on patterned wallpapers.
 */
export async function wallpaperCutoutDataUri(dataUri: string): Promise<string | null> {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUri);
  if (!match?.[2]) return null;
  try {
    const input = Buffer.from(match[2], "base64");
    const out = await sharp(input)
      .rotate()
      .resize(390, 844, { fit: "cover", position: "centre" })
      .jpeg({ quality: 62, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}
