import { eq } from "drizzle-orm";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

import { getDb } from "@/lib/db";
import { mediaAssets, usedClientPhotos } from "@/lib/db/schema";
import { pickNextInRotation, normalizeMediaPath } from "@/lib/media-rotation";

function isImageFile(filename: string): boolean {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(filename) && !filename.startsWith(".");
}

function resolveExisting(filePath: string): string | null {
  if (!filePath) return null;
  if (path.isAbsolute(filePath) && existsSync(filePath)) return filePath;
  const fromCwd = path.resolve(filePath);
  if (existsSync(fromCwd)) return fromCwd;
  const dataDir = process.env.DATA_DIR ?? "./data";
  const stripped = filePath.replace(/^(\.\/)?data[\\/]/, "");
  const fromData = path.resolve(dataDir, stripped);
  if (existsSync(fromData)) return fromData;
  return null;
}

function isUsableImage(filePath: string): boolean {
  const resolved = resolveExisting(filePath);
  if (!resolved) return false;
  try {
    return statSync(resolved).size >= 512;
  } catch {
    return false;
  }
}

async function listUsedPaths(): Promise<Set<string>> {
  const db = getDb();
  const rows = await db.select({ mediaPath: usedClientPhotos.mediaPath }).from(usedClientPhotos);
  return new Set(rows.map((r) => normalizeMediaPath(r.mediaPath)));
}

/** Collect client story photos from DB + filesystem (shared pool). */
export async function listAvailableClientPhotos(): Promise<string[]> {
  const db = getDb();
  const dataDir = process.env.DATA_DIR ?? "./data";
  const paths = new Set<string>();

  const dbRows = await db.select().from(mediaAssets).where(eq(mediaAssets.type, "story_photo"));
  for (const row of dbRows) {
    if (isUsableImage(row.path)) paths.add(normalizeMediaPath(row.path));
  }

  const root = path.resolve(dataDir, "media/story_photos");
  if (existsSync(root)) {
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!isImageFile(entry.name)) continue;
        if (!isUsableImage(full)) continue;
        const relFromData = normalizeMediaPath(path.relative(path.resolve(dataDir), full));
        paths.add(`data/${relFromData}`);
      }
    };
    walk(root);
  }

  return [...paths];
}

export async function markClientPhotoUsed(params: {
  mediaPath: string;
  projectId: string;
  reviewId?: string | null;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(usedClientPhotos)
    .values({
      id: randomUUID(),
      mediaPath: normalizeMediaPath(params.mediaPath),
      projectId: params.projectId,
      reviewId: params.reviewId ?? null,
      usedAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
}

function poolKeyForPhoto(photoPath: string): string {
  const norm = normalizeMediaPath(photoPath);
  const legend = norm.match(/story_photos\/([^/]+)\//)?.[1];
  if (legend && legend !== "pool") return `story_photo:legend:${legend}`;
  return "story_photo:pool";
}

async function pickSequentialClientPhoto(params: {
  projectId: string;
  reviewId?: string | null;
  candidates?: string[];
}): Promise<{ path: string; filename: string; source: "pool" } | null> {
  const all = params.candidates ?? (await listAvailableClientPhotos());
  if (all.length === 0) return null;

  const byPool = new Map<string, string[]>();
  for (const p of all) {
    const key = poolKeyForPhoto(p);
    const list = byPool.get(key) ?? [];
    list.push(p);
    byPool.set(key, list);
  }

  const poolKey = byPool.has("story_photo:pool") ? "story_photo:pool" : [...byPool.keys()][0]!;
  const poolPaths = byPool.get(poolKey) ?? all;
  const pick = await pickNextInRotation({ poolKey, paths: poolPaths });
  if (!pick) return null;

  await markClientPhotoUsed({
    mediaPath: pick,
    projectId: params.projectId,
    ...(params.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
  });

  return { path: pick, filename: path.basename(pick), source: "pool" };
}

/** Pick the next client photo in sequential cycle 1→N→1 (per pool). */
export async function pickUniqueClientPhoto(params: {
  projectId: string;
  reviewId?: string | null;
}): Promise<{ path: string; filename: string; source: "pool" } | null> {
  return pickSequentialClientPhoto(params);
}

/** Any usable story photo — walks sequentially; prefers unused when available. */
export async function pickAvailableClientPhoto(params?: {
  excludePaths?: string[];
  preferUnused?: boolean;
  projectId?: string;
  reviewId?: string | null;
}): Promise<{ path: string; filename: string; source: "pool" } | null> {
  const exclude = new Set((params?.excludePaths ?? []).map(normalizeMediaPath));
  const all = (await listAvailableClientPhotos()).filter((p) => !exclude.has(normalizeMediaPath(p)));
  if (all.length === 0) return null;

  let candidates = all;
  if (params?.preferUnused !== false) {
    const used = await listUsedPaths();
    const unused = all.filter((p) => !used.has(normalizeMediaPath(p)));
    if (unused.length > 0) candidates = unused;
  }

  return pickSequentialClientPhoto({
    projectId: params?.projectId ?? "unknown",
    ...(params?.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
    candidates,
  });
}

export async function resolveClientPhoto(params: {
  projectId: string;
  reviewId?: string | null;
  clientName?: string;
  hint?: string;
  locale?: string;
}): Promise<{ path: string; filename: string; source: "pool" | "ai" } | null> {
  const { getAiClientPhotoMode, generateClientPhoto } = await import("@/lib/openai/images");
  const mode = getAiClientPhotoMode();

  if (mode !== "always") {
    const fromPool = await pickUniqueClientPhoto({
      projectId: params.projectId,
      ...(params.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
    });
    if (fromPool) return fromPool;
  }

  if (mode !== "off") {
    const generated = await generateClientPhoto({
      projectId: params.projectId,
      ...(params.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
      ...(params.clientName ? { clientName: params.clientName } : {}),
      ...(params.hint ? { hint: params.hint } : {}),
      ...(params.locale ? { locale: params.locale } : {}),
      saveToPool: true,
    });
    if (generated) {
      await markClientPhotoUsed({
        mediaPath: generated.path,
        projectId: params.projectId,
        ...(params.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
      });
      return { path: generated.path, filename: generated.filename, source: "ai" };
    }
  }

  const reused = await pickAvailableClientPhoto({
    projectId: params.projectId,
    ...(params.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
    preferUnused: false,
  });
  if (!reused) return null;

  await markClientPhotoUsed({
    mediaPath: reused.path,
    projectId: params.projectId,
    ...(params.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
  });
  return reused;
}

export async function countUnusedClientPhotos(): Promise<{ total: number; unused: number }> {
  const used = await listUsedPaths();
  const all = await listAvailableClientPhotos();
  return { total: all.length, unused: all.filter((p) => !used.has(normalizeMediaPath(p))).length };
}
