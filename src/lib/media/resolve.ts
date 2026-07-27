import { existsSync, readFileSync } from "fs";
import path from "path";
import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

export function fileToDataUri(filePath: string): string | null {
  const resolved = resolveMediaFilePath(filePath);
  if (!resolved || !existsSync(resolved)) return null;
  const buffer = readFileSync(resolved);
  const mime = getMimeType(resolved);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/** Resolve absolute/cwd/DATA_DIR-relative media paths (Docker-safe). */
export function resolveMediaFilePath(filePath: string): string | null {
  if (!filePath) return null;
  if (path.isAbsolute(filePath) && existsSync(filePath)) return filePath;

  const fromCwd = path.resolve(filePath);
  if (existsSync(fromCwd)) return fromCwd;

  const dataDir = process.env.DATA_DIR ?? "./data";
  const stripped = filePath.replace(/^(\.\/)?data[\\/]/, "");
  const fromData = path.resolve(dataDir, stripped);
  if (existsSync(fromData)) return fromData;

  // DB rows sometimes store "data/media/..." while cwd is /app
  const alt = path.resolve(dataDir, filePath.replace(/^[\\/]/, ""));
  if (existsSync(alt)) return alt;

  return fromCwd;
}

export async function resolveClientAvatarForProject(
  projectId: string,
  preferredPath?: string | null,
): Promise<string | null> {
  if (preferredPath) {
    const preferred = fileToDataUri(preferredPath);
    if (preferred) return preferred;
  }

  const db = getDb();
  const assets = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.projectId, projectId), eq(mediaAssets.type, "avatar")))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(1);

  if (assets[0]) {
    return fileToDataUri(assets[0].path);
  }

  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const dataUri = fileToDataUri(path.join(process.env.DATA_DIR ?? "data", "media/avatars", `${projectId}${ext}`));
    if (dataUri) return dataUri;
  }

  return fileToDataUri(path.join(process.env.DATA_DIR ?? "data", "media/avatars/preview-default.png"));
}

export async function pickRandomClientAvatar(
  projectId: string,
  preferredPath?: string | null,
): Promise<{
  dataUri: string | null;
  filePath: string | null;
}> {
  if (preferredPath) {
    const dataUri = fileToDataUri(preferredPath);
    if (dataUri) return { dataUri, filePath: preferredPath };
  }

  const db = getDb();
  const assets = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.projectId, projectId), eq(mediaAssets.type, "avatar")))
    .orderBy(sql`RANDOM()`)
    .limit(1);

  if (assets[0]) {
    return { dataUri: fileToDataUri(assets[0].path), filePath: assets[0].path };
  }

  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const filePath = path.join(process.env.DATA_DIR ?? "data", "media/avatars", `${projectId}${ext}`);
    const dataUri = fileToDataUri(filePath);
    if (dataUri) return { dataUri, filePath };
  }

  const fallback = path.join(process.env.DATA_DIR ?? "data", "media/avatars/preview-default.png");
  return { dataUri: fileToDataUri(fallback), filePath: fallback };
}

export async function resolveWallpaperForProject(
  projectId: string,
  configPath?: string,
): Promise<string | null> {
  // Prefer the project's selected wallpaper (admin preview / settings).
  if (configPath) {
    const preferred = fileToDataUri(configPath);
    if (preferred) return preferred;
  }

  const db = getDb();
  const assets = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.projectId, projectId), eq(mediaAssets.type, "wallpaper")))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(1);

  if (assets[0]) {
    const dataUri = fileToDataUri(assets[0].path);
    if (dataUri) return dataUri;
  }

  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const dataUri = fileToDataUri(path.join(process.env.DATA_DIR ?? "data", "media/wallpapers", `${projectId}${ext}`));
    if (dataUri) return dataUri;
  }

  return null;
}

export async function resolveImageForRender(
  filePath: string | null | undefined,
  options?: { trimWhitespace?: boolean; removeWhiteBackground?: boolean },
): Promise<string | null> {
  if (!filePath) return null;

  let pathToLoad = filePath;
  const resolved = resolveMediaFilePath(filePath);

  if (options?.removeWhiteBackground && resolved) {
    try {
      const { removeWhiteBackgroundImage } = await import("@/lib/media/trim-image");
      const keyed = await removeWhiteBackgroundImage(resolved, { threshold: 242 });
      pathToLoad = keyed.path;
    } catch {
      pathToLoad = filePath;
    }
  }

  if (options?.trimWhitespace) {
    try {
      const { trimWhitespaceImage } = await import("@/lib/media/trim-image");
      const base = resolveMediaFilePath(pathToLoad) ?? resolved;
      if (base) {
        const trimmed = await trimWhitespaceImage(base, { threshold: 22, padding: 6 });
        pathToLoad = trimmed.path;
      }
    } catch {
      // keep pathToLoad
    }
  }

  return fileToDataUri(pathToLoad);
}

export async function pickRandomMediaFromDb(
  type: string,
  projectId?: string,
): Promise<{ path: string; dataUri: string | null } | null> {
  const db = getDb();
  const conditions = projectId
    ? and(eq(mediaAssets.type, type), eq(mediaAssets.projectId, projectId))
    : eq(mediaAssets.type, type);

  const assets = await db
    .select()
    .from(mediaAssets)
    .where(conditions)
    .orderBy(sql`RANDOM()`)
    .limit(1);

  if (assets[0]) {
    return { path: assets[0].path, dataUri: fileToDataUri(assets[0].path) };
  }
  return null;
}
