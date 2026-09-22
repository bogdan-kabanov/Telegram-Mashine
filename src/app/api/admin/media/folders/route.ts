import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { bootstrapApp } from "@/lib/bootstrap";
import { getEnv } from "@/lib/schemas/env";
import { MEDIA_TYPE_DIRS } from "@/lib/media/types";

export const dynamic = "force-dynamic";

function libraryRoot(): string {
  return path.resolve(getEnv().DATA_DIR, "media/library");
}

function safeSegment(raw: string): string {
  const s = raw.replace(/[\\/]/g, "").replace(/\.\./g, "").trim();
  if (!s || s === "." || s === "..") throw new Error("Invalid folder name");
  return s;
}

/** Nested folder under a scope, e.g. "bets/okx". */
function safeFolderPath(raw: string): string {
  const parts = raw
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .map(safeSegment);
  if (!parts.length) throw new Error("Invalid folder path");
  return parts.join("/");
}

/** Resolve a library-relative path; rejects escapes outside media/library. */
function resolveLibraryPath(stored: string): string {
  const cleaned = stored.replace(/^(\.\/)?/, "").replace(/\\/g, "/");
  if (!cleaned.startsWith("data/media/library/")) {
    throw new Error("Path must be under data/media/library");
  }
  if (cleaned.includes("..")) throw new Error("Invalid path");
  const abs = path.resolve(getEnv().DATA_DIR, cleaned.replace(/^data\//, ""));
  const root = libraryRoot();
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path escapes library root");
  }
  return abs;
}

function listFilesInDir(
  scope: string,
  folderRel: string,
): Array<{ name: string; path: string; size: number }> {
  const dir = path.join(libraryRoot(), scope, ...folderRel.split("/"));
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((f) => f.isFile())
    .map((f) => {
      const abs = path.join(dir, f.name);
      const st = statSync(abs);
      const rel = path
        .join("data/media/library", scope, folderRel, f.name)
        .replace(/\\/g, "/");
      return { name: f.name, path: rel, size: st.size };
    });
}

/**
 * List folders under a scope. For `_shared`, also lists one nesting level
 * (e.g. bets/okx) so shared pools are first-class.
 */
function listFolders(scope: string): Array<{
  scope: string;
  name: string;
  path: string;
  files: Array<{ name: string; path: string; size: number }>;
  kind?: string;
}> {
  const root = path.join(libraryRoot(), scope);
  if (!existsSync(root)) return [];
  const out: Array<{
    scope: string;
    name: string;
    path: string;
    files: Array<{ name: string; path: string; size: number }>;
    kind?: string;
  }> = [];

  for (const ent of readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
    const topAbs = path.join(root, ent.name);
    const nested = readdirSync(topAbs, { withFileTypes: true }).filter(
      (d) => d.isDirectory() && !d.name.startsWith("."),
    );
    const topFiles = listFilesInDir(scope, ent.name);

    if (scope === "_shared" && nested.length > 0) {
      // Category folder: bets / receipts / conditions — expose children.
      for (const child of nested) {
        const name = `${ent.name}/${child.name}`;
        out.push({
          scope,
          name,
          path: path.join("data/media/library", scope, name).replace(/\\/g, "/"),
          files: listFilesInDir(scope, name),
          kind: ent.name,
        });
      }
      // Also keep files directly in category if any.
      if (topFiles.length > 0) {
        out.push({
          scope,
          name: ent.name,
          path: path.join("data/media/library", scope, ent.name).replace(/\\/g, "/"),
          files: topFiles,
          kind: ent.name,
        });
      }
    } else {
      out.push({
        scope,
        name: ent.name,
        path: path.join("data/media/library", scope, ent.name).replace(/\\/g, "/"),
        files: topFiles,
        kind: ent.name,
      });
    }
  }
  return out;
}

/** Copy project bet packs into shared pool `_shared/bets/{label}`. */
function promoteProjectBetsToShared(projectId: string, label?: string): number {
  const dataDir = path.resolve(getEnv().DATA_DIR);
  const destName = safeSegment(label || projectId);
  const dest = path.join(libraryRoot(), "_shared", "bets", destName);
  mkdirSync(dest, { recursive: true });
  let copied = 0;
  const sources = [
    path.join(dataDir, "media/bets", projectId),
    path.join(dataDir, "media/library", projectId, "bets"),
  ];
  const IMAGE = /\.(png|jpe?g|webp)$/i;
  for (const src of sources) {
    if (!existsSync(src)) continue;
    for (const name of readdirSync(src)) {
      if (!IMAGE.test(name)) continue;
      const from = path.join(src, name);
      const to = path.join(dest, name);
      if (existsSync(to)) continue;
      if (!statSync(from).isFile()) continue;
      copyFileSync(from, to);
      copied++;
    }
  }
  return copied;
}

function importTypedIntoLibrary(): number {
  const dataDir = path.resolve(getEnv().DATA_DIR);
  let imported = 0;
  const mediaRoot = path.join(dataDir, "media");
  const lib = libraryRoot();
  mkdirSync(lib, { recursive: true });

  const IMAGE_EXT = /\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i;

  const copyOne = (from: string, to: string): boolean => {
    if (!existsSync(from) || !statSync(from).isFile()) return false;
    if (existsSync(to)) return false;
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
    return true;
  };

  const walkFiles = (dir: string): string[] => {
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".")) continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...walkFiles(abs));
      else if (ent.isFile() && IMAGE_EXT.test(ent.name)) out.push(abs);
    }
    return out;
  };

  const into = (scope: string, folder: string, files: Array<{ from: string; name: string }>) => {
    const destDir = path.join(lib, scope, folder);
    mkdirSync(destDir, { recursive: true });
    for (const f of files) {
      if (copyOne(f.from, path.join(destDir, f.name))) imported++;
    }
  };

  // Shared stickers
  {
    const src = path.join(mediaRoot, "stickers");
    into(
      "_shared",
      "stickers",
      walkFiles(src).map((from) => ({ from, name: path.basename(from) })),
    );
  }

  // story_photos/{legend|pool}
  {
    const src = path.join(mediaRoot, "story_photos");
    if (existsSync(src)) {
      for (const ent of readdirSync(src, { withFileTypes: true })) {
        if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
        const dir = path.join(src, ent.name);
        into(
          "_shared",
          `story_photos__${ent.name}`,
          walkFiles(dir).map((from) => ({ from, name: path.basename(from) })),
        );
      }
    }
  }

  // wallpapers/{project}.jpg
  {
    const src = path.join(mediaRoot, "wallpapers");
    if (existsSync(src)) {
      for (const ent of readdirSync(src, { withFileTypes: true })) {
        if (!ent.isFile() || !IMAGE_EXT.test(ent.name)) continue;
        const projectId = path.basename(ent.name, path.extname(ent.name));
        into(projectId, "wallpaper", [{ from: path.join(src, ent.name), name: ent.name }]);
      }
    }
  }

  const PROJECT_FOLDERS: Array<{ src: string; folder: string }> = [
    { src: "bets", folder: "bets" },
    { src: "conditions", folder: "conditions" },
    { src: "avatars", folder: "avatars" },
    { src: "video_notes", folder: "video_notes" },
    { src: "receipt_templates", folder: "receipt_templates" },
  ];

  for (const { src: srcName, folder } of PROJECT_FOLDERS) {
    const src = path.join(mediaRoot, srcName);
    if (!existsSync(src)) continue;
    for (const ent of readdirSync(src, { withFileTypes: true })) {
      if (ent.name.startsWith(".")) continue;
      if (ent.isDirectory()) {
        const projectId = ent.name;
        const projectDir = path.join(src, projectId);
        // Bets go to shared pools so many projects can pick the same folder.
        if (srcName === "bets") {
          into(
            "_shared",
            path.join("bets", projectId),
            walkFiles(projectDir).map((from) => ({
              from,
              name: path.basename(from),
            })),
          );
        } else {
          into(
            projectId,
            folder,
            walkFiles(projectDir).map((from) => ({
              from,
              name: path.relative(projectDir, from).replace(/[\\/]/g, "__"),
            })),
          );
        }
      } else if (ent.isFile() && IMAGE_EXT.test(ent.name) && srcName === "avatars") {
        into("_shared", "avatars", [{ from: path.join(src, ent.name), name: ent.name }]);
      }
    }
  }

  // Also mirror MEDIA_TYPE_DIRS leftovers (legacy)
  for (const [typeKey, rel] of Object.entries(MEDIA_TYPE_DIRS)) {
    const abs = path.join(dataDir, rel);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      // already covered by PROJECT_FOLDERS for known names
      void typeKey;
      void abs;
      void entry;
    }
  }

  writeFileSync(
    path.join(lib, ".import-stamp"),
    `${new Date().toISOString()}\nimported=${imported}\n`,
  );
  return imported;
}

export async function GET(request: NextRequest) {
  try {
    await bootstrapApp();
    mkdirSync(libraryRoot(), { recursive: true });
    const projectId = request.nextUrl.searchParams.get("projectId");
    const shared = request.nextUrl.searchParams.get("shared") !== "0";

    const folders = [
      ...(projectId ? listFolders(safeSegment(projectId)) : []),
      ...(shared ? listFolders("_shared") : []),
    ];

    return NextResponse.json({ ok: true, folders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await bootstrapApp();
    mkdirSync(libraryRoot(), { recursive: true });

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const scope = safeSegment(String(form.get("scope") || "_shared"));
      const folder = safeFolderPath(String(form.get("folder") || "uploads"));
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file required" }, { status: 400 });
      }
      const dir = path.join(libraryRoot(), scope, ...folder.split("/"));
      mkdirSync(dir, { recursive: true });
      const ext = path.extname(file.name) || ".bin";
      const filename = `${randomUUID()}${ext}`;
      const abs = path.join(dir, filename);
      const buf = Buffer.from(await file.arrayBuffer());
      writeFileSync(abs, buf);
      const rel = path.join("data/media/library", scope, folder, filename).replace(/\\/g, "/");
      return NextResponse.json({ ok: true, path: rel, filename });
    }

    const body = (await request.json()) as {
      action?: string;
      scope?: string;
      folder?: string;
      path?: string;
      projectId?: string;
      label?: string;
    };

    if (body.action === "mkdir") {
      const scope = safeSegment(body.scope || "_shared");
      const folder = safeFolderPath(body.folder || "");
      const dir = path.join(libraryRoot(), scope, ...folder.split("/"));
      mkdirSync(dir, { recursive: true });
      return NextResponse.json({
        ok: true,
        path: path.join("data/media/library", scope, folder).replace(/\\/g, "/"),
      });
    }

    if (body.action === "promote-bets-shared") {
      const projectId = safeSegment(body.projectId || "");
      const copied = promoteProjectBetsToShared(projectId, body.label);
      return NextResponse.json({
        ok: true,
        copied,
        folder: `bets/${body.label || projectId}`,
        message: `Скопировано ${copied} файлов в _shared/bets/${body.label || projectId}`,
      });
    }

    if (body.action === "delete-file") {
      if (!body.path) {
        return NextResponse.json({ error: "path required" }, { status: 400 });
      }
      const abs = resolveLibraryPath(body.path);
      if (!existsSync(abs) || !statSync(abs).isFile()) {
        return NextResponse.json({ error: "file not found" }, { status: 404 });
      }
      unlinkSync(abs);
      return NextResponse.json({ ok: true, deleted: body.path });
    }

    if (body.action === "delete-folder") {
      const scope = safeSegment(body.scope || "");
      const folder = safeFolderPath(body.folder || "");
      const dir = path.join(libraryRoot(), scope, ...folder.split("/"));
      const root = libraryRoot();
      const rel = path.relative(root, dir);
      if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
        return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
      }
      if (!existsSync(dir) || !statSync(dir).isDirectory()) {
        return NextResponse.json({ error: "folder not found" }, { status: 404 });
      }
      rmSync(dir, { recursive: true, force: true });
      return NextResponse.json({
        ok: true,
        deleted: path.join("data/media/library", scope, folder).replace(/\\/g, "/"),
      });
    }

    if (body.action === "import-typed") {
      const imported = importTypedIntoLibrary();
      return NextResponse.json({
        ok: true,
        imported,
        message: `Импортировано файлов в library: ${imported}`,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
