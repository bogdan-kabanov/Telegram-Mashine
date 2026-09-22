import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const dataDir = path.resolve("data");
const lib = path.join(dataDir, "media/library/_shared/bets");
mkdirSync(lib, { recursive: true });
const IMAGE = /\.(png|jpe?g|webp)$/i;
const projects = ["nancy", "grisel", "melissa", "paola", "francesca", "demo-ru"];
let total = 0;
for (const id of projects) {
  const dest = path.join(lib, id);
  mkdirSync(dest, { recursive: true });
  for (const src of [
    path.join(dataDir, "media/bets", id),
    path.join(dataDir, "media/library", id, "bets"),
  ]) {
    if (!existsSync(src)) continue;
    for (const name of readdirSync(src)) {
      if (!IMAGE.test(name)) continue;
      const from = path.join(src, name);
      const to = path.join(dest, name);
      if (!statSync(from).isFile() || existsSync(to)) continue;
      copyFileSync(from, to);
      total++;
    }
  }
  console.log(id, "files in shared:", readdirSync(dest).length);
}
console.log("copied", total);

const cfgPath = path.resolve("config/projects.json");
const cfg = JSON.parse(readFileSync(cfgPath, "utf8")) as {
  projects: Array<{ id: string; mediaFolders?: { bets?: string[] } }>;
};
for (const p of cfg.projects) {
  if (existsSync(path.join(lib, p.id))) {
    p.mediaFolders = { ...(p.mediaFolders ?? {}), bets: [`bets/${p.id}`] };
  }
}
writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
console.log(
  "assigned",
  cfg.projects.map((p) => ({ id: p.id, bets: p.mediaFolders?.bets })),
);
