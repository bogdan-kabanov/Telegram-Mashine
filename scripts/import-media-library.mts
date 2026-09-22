/**
 * Copy typed media castes into data/media/library/{scope}/{folder}/…
 * Run: npx tsx scripts/import-media-library.mts
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";

const ROOT = path.resolve("data/media");
const LIB = path.join(ROOT, "library");

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i;

function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

function copyFile(from: string, to: string): boolean {
  if (!existsSync(from) || !statSync(from).isFile()) return false;
  if (existsSync(to)) return false;
  ensureDir(path.dirname(to));
  copyFileSync(from, to);
  return true;
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(abs));
    else if (ent.isFile() && IMAGE_EXT.test(ent.name)) out.push(abs);
  }
  return out;
}

let imported = 0;
const report: string[] = [];

function copyInto(scope: string, folder: string, files: Array<{ from: string; name: string }>) {
  const destDir = path.join(LIB, scope, folder);
  ensureDir(destDir);
  let n = 0;
  for (const f of files) {
    const to = path.join(destDir, f.name);
    if (copyFile(f.from, to)) {
      imported++;
      n++;
    }
  }
  if (n > 0) report.push(`${scope}/${folder}: +${n}`);
}

// --- shared stickers ---
{
  const src = path.join(ROOT, "stickers");
  const files = walkFiles(src).map((from) => ({ from, name: path.basename(from) }));
  copyInto("_shared", "stickers", files);
}

// --- story_photos/{legend|pool} → _shared/story_photos__{name} ---
{
  const src = path.join(ROOT, "story_photos");
  if (existsSync(src)) {
    for (const ent of readdirSync(src, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
      const dir = path.join(src, ent.name);
      const files = walkFiles(dir).map((from) => ({ from, name: path.basename(from) }));
      copyInto("_shared", `story_photos__${ent.name}`, files);
    }
  }
}

// --- wallpapers/{project}.jpg → {project}/wallpaper/ ---
{
  const src = path.join(ROOT, "wallpapers");
  if (existsSync(src)) {
    for (const ent of readdirSync(src, { withFileTypes: true })) {
      if (!ent.isFile() || !IMAGE_EXT.test(ent.name)) continue;
      const projectId = path.basename(ent.name, path.extname(ent.name));
      copyInto(projectId, "wallpaper", [
        { from: path.join(src, ent.name), name: ent.name },
      ]);
    }
  }
}

// --- project-scoped: bets, conditions, avatars, video_notes, receipt_templates ---
const PROJECT_FOLDERS: Array<{ src: string; folder: string }> = [
  { src: "bets", folder: "bets" },
  { src: "conditions", folder: "conditions" },
  { src: "avatars", folder: "avatars" },
  { src: "video_notes", folder: "video_notes" },
  { src: "receipt_templates", folder: "receipt_templates" },
];

for (const { src: srcName, folder } of PROJECT_FOLDERS) {
  const src = path.join(ROOT, srcName);
  if (!existsSync(src)) continue;
  for (const ent of readdirSync(src, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    if (ent.isDirectory()) {
      const projectId = ent.name;
      const projectDir = path.join(src, projectId);
      const files = walkFiles(projectDir).map((from) => {
        const rel = path.relative(projectDir, from).replace(/[\\/]/g, "__");
        return { from, name: rel };
      });
      copyInto(projectId, folder, files);
    } else if (ent.isFile() && IMAGE_EXT.test(ent.name) && srcName === "avatars") {
      // flat avatar files
      copyInto("_shared", "avatars", [{ from: path.join(src, ent.name), name: ent.name }]);
    }
  }
}

ensureDir(LIB);
writeFileSync(
  path.join(LIB, ".import-stamp"),
  `${new Date().toISOString()}\nimported=${imported}\n${report.join("\n")}\n`,
  "utf-8",
);

console.log(`Imported ${imported} files into data/media/library`);
for (const line of report) console.log(" ", line);
