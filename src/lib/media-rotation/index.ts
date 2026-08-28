import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { mediaRotationCursors } from "@/lib/db/schema";

export function normalizeMediaPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Stable filename order — same convention as bet packs. */
export function sortPathsStable(paths: string[]): string[] {
  const unique = [...new Set(paths.map(normalizeMediaPath))];
  return unique.sort((a, b) => {
    const baseA = a.split("/").pop() ?? a;
    const baseB = b.split("/").pop() ?? b;
    const byName = baseA.localeCompare(baseB, undefined, { numeric: true });
    if (byName !== 0) return byName;
    return a.localeCompare(b);
  });
}

export function pickNextInSortedCycle(sortedPaths: string[], lastPath: string | null): string | null {
  if (sortedPaths.length === 0) return null;
  if (!lastPath) return sortedPaths[0]!;
  const normLast = normalizeMediaPath(lastPath);
  const idx = sortedPaths.findIndex((p) => normalizeMediaPath(p) === normLast);
  const nextIdx = idx >= 0 ? (idx + 1) % sortedPaths.length : 0;
  return sortedPaths[nextIdx]!;
}

export async function getRotationCursor(poolKey: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ lastMediaPath: mediaRotationCursors.lastMediaPath })
    .from(mediaRotationCursors)
    .where(eq(mediaRotationCursors.poolKey, poolKey))
    .limit(1);
  return rows[0]?.lastMediaPath ?? null;
}

export async function setRotationCursor(poolKey: string, mediaPath: string): Promise<void> {
  const db = getDb();
  const updatedAt = new Date().toISOString();
  await db
    .insert(mediaRotationCursors)
    .values({
      poolKey,
      lastMediaPath: normalizeMediaPath(mediaPath),
      updatedAt,
    })
    .onConflictDoUpdate({
      target: mediaRotationCursors.poolKey,
      set: {
        lastMediaPath: normalizeMediaPath(mediaPath),
        updatedAt,
      },
    });
}

/**
 * Strict 1→N→1 walk for any media pool (photos, circles, voices).
 * Tracks position per poolKey in media_rotation_cursors.
 */
export async function pickNextInRotation(params: {
  poolKey: string;
  paths: string[];
}): Promise<string | null> {
  const sorted = sortPathsStable(params.paths.filter(Boolean));
  if (sorted.length === 0) return null;
  const last = await getRotationCursor(params.poolKey);
  const pick = pickNextInSortedCycle(sorted, last);
  if (pick) await setRotationCursor(params.poolKey, pick);
  return pick;
}
