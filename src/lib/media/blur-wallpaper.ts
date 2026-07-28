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
