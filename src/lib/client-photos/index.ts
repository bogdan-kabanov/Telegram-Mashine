import { eq } from "drizzle-orm";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

import { getDb } from "@/lib/db";
import { mediaAssets, usedClientPhotos } from "@/lib/db/schema";

function isImageFile(filename: string): boolean {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(filename) && !filename.startsWith(".");
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
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
  return new Set(rows.map((r) => normalizePath(r.mediaPath)));
}

/** Collect client story photos from DB + filesystem (shared pool). */
export async function listAvailableClientPhotos(): Promise<string[]> {
  const db = getDb();
  const dataDir = process.env.DATA_DIR ?? "./data";
  const paths = new Set<string>();

  const dbRows = await db.select().from(mediaAssets).where(eq(mediaAssets.type, "story_photo"));
  for (const row of dbRows) {
    if (isUsableImage(row.path)) paths.add(normalizePath(row.path));
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
        const relFromData = normalizePath(path.relative(path.resolve(dataDir), full));
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
      mediaPath: normalizePath(params.mediaPath),
      projectId: params.projectId,
      reviewId: params.reviewId ?? null,
      usedAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
}

/**
 * Pick a client photo that has never been used in any review.
 * Returns null if the pool is exhausted — operator must upload more photos
 * (or enable AI_CLIENT_PHOTOS and use resolveClientPhoto).
 */
export async function pickUniqueClientPhoto(params: {
  projectId: string;
  reviewId?: string | null;
}): Promise<{ path: string; filename: string; source: "pool" } | null> {
  const used = await listUsedPaths();
  const available = (await listAvailableClientPhotos()).filter((p) => !used.has(normalizePath(p)));

  if (available.length === 0) {
    return null;
  }

  const pick = available[Math.floor(Math.random() * available.length)]!;
  await markClientPhotoUsed({
    mediaPath: pick,
    projectId: params.projectId,
    ...(params.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
  });

  return { path: pick, filename: path.basename(pick), source: "pool" };
}

/**
 * Resolve a unique client photo from the pool and/or OpenAI Images.
 * Mode via AI_CLIENT_PHOTOS: off | fallback | always.
 */
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
    if (mode === "off") return null;
  }

  const generated = await generateClientPhoto({
    projectId: params.projectId,
    ...(params.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
    ...(params.clientName ? { clientName: params.clientName } : {}),
    ...(params.hint ? { hint: params.hint } : {}),
    ...(params.locale ? { locale: params.locale } : {}),
    saveToPool: true,
  });
  if (!generated) return null;

  await markClientPhotoUsed({
    mediaPath: generated.path,
    projectId: params.projectId,
    ...(params.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
  });

  return { path: generated.path, filename: generated.filename, source: "ai" };
}

export async function countUnusedClientPhotos(): Promise<{ total: number; unused: number }> {
  const used = await listUsedPaths();
  const all = await listAvailableClientPhotos();
  return { total: all.length, unused: all.filter((p) => !used.has(normalizePath(p))).length };
}
