/**
 * Ensures media directories exist. Does NOT create colored placeholder bets/conditions —
 * upload real assets via /admin/media.
 *
 * Usage: npm run seed:media
 */
import { mkdirSync, existsSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, "data");

const dirs = [
  "media/bets",
  "media/conditions",
  "media/wallpapers",
  "media/avatars",
  "media/stickers",
  "media/story_photos",
  "media/video_notes",
  "media/receipt_templates",
  "media/capturas",
  "media/receipts",
];

let created = 0;
for (const rel of dirs) {
  const dir = path.join(dataDir, rel);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    created++;
    console.log("mkdir", path.relative(root, dir));
  }
  const keep = path.join(dir, ".gitkeep");
  if (!existsSync(keep)) {
    writeFileSync(keep, "");
  }
}

console.log(
  `Seed done. New dirs: ${created}. Upload bets/conditions/circles via /admin/media. Wallpapers & receipt templates live under data/media/.`,
);
