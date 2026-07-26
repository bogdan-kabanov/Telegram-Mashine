/**
 * Trim white margins on existing AI receipts/capturas — no OpenAI calls.
 * Usage: node scripts/trim-receipts.mjs
 */
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirs = [
  path.join(root, "data", "media", "receipts"),
  path.join(root, "data", "media", "capturas"),
];

async function trimFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!/\.(png|jpe?g|webp)$/i.test(ext)) return false;
  if (filePath.includes(".trim.")) return false;

  const before = await sharp(filePath).metadata();
  const buf = await sharp(filePath)
    .trim({ threshold: 22 })
    .extend({
      top: 6,
      bottom: 6,
      left: 6,
      right: 6,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  const after = await sharp(buf).metadata();
  const shrunk =
    (before.width ?? 0) - (after.width ?? 0) > 8 ||
    (before.height ?? 0) - (after.height ?? 0) > 8;
  if (!shrunk) {
    console.log("skip (no margins)", path.basename(filePath));
    return false;
  }
  await sharp(buf).toFile(filePath);
  console.log(
    "trimmed",
    path.basename(filePath),
    `${before.width}x${before.height} → ${after.width}x${after.height}`,
  );
  return true;
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

let n = 0;
for (const dir of dirs) {
  for (const file of listFiles(dir)) {
    try {
      if (await trimFile(file)) n += 1;
    } catch (e) {
      console.warn("fail", file, e instanceof Error ? e.message : e);
    }
  }
}
console.log(`Done. Trimmed ${n} file(s). Re-run a preview render (no AI) to see chat layout.`);
