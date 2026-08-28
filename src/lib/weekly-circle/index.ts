import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { mediaAssets, usedWeeklyCircles } from "@/lib/db/schema";
import { pickNextInRotation, sortPathsStable } from "@/lib/media-rotation";
import { getMediaHandler, type MediaAsset } from "@/modules/media-handler";

export async function isWeeklyCircleUsed(mediaPath: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select()
    .from(usedWeeklyCircles)
    .where(eq(usedWeeklyCircles.mediaPath, mediaPath))
    .limit(1);
  return rows.length > 0;
}

export async function markWeeklyCircleUsed(params: {
  mediaPath: string;
  projectId: string;
  weekKey: string;
  messageId?: number | null;
}): Promise<string> {
  const db = getDb();
  const id = randomUUID();
  await db
    .insert(usedWeeklyCircles)
    .values({
      id,
      mediaPath: params.mediaPath,
      projectId: params.projectId,
      weekKey: params.weekKey,
      messageId: params.messageId != null ? String(params.messageId) : null,
      pinnedAt: params.messageId != null ? new Date().toISOString() : null,
      usedAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
  return id;
}

export async function markWeeklyCirclePinned(mediaPath: string, messageId: number): Promise<void> {
  const db = getDb();
  await db
    .update(usedWeeklyCircles)
    .set({
      messageId: String(messageId),
      pinnedAt: new Date().toISOString(),
    })
    .where(eq(usedWeeklyCircles.mediaPath, mediaPath));
}

/**
 * Pick a video note not yet used for weekly unique circles; recycle pool when exhausted.
 * Within each pass, walks circles sequentially (standalone first).
 */
export async function pickUniqueWeeklyCircle(projectId?: string): Promise<MediaAsset | null> {
  const handler = getMediaHandler();
  const assets = projectId
    ? await handler.listMedia("video_note", projectId)
    : await handler.listMedia("video_note");
  if (assets.length === 0) {
    return handler.pickRandom("video_note", projectId);
  }

  const standalone = assets.filter(
    (a) => a.legendId === "standalone" || a.legendId == null || a.legendId === "",
  );
  const ordered = [...standalone, ...assets.filter((a) => !standalone.includes(a))];
  const sorted = sortPathsStable(ordered.map((a) => a.path));

  for (const path of sorted) {
    const asset = ordered.find((a) => a.path === path)!;
    if (!(await isWeeklyCircleUsed(asset.path))) {
      return asset;
    }
  }

  const db = getDb();
  await db.delete(usedWeeklyCircles);
  const poolKey = `video_note:weekly:${projectId ?? "all"}`;
  const pickPath = await pickNextInRotation({ poolKey, paths: sorted });
  return ordered.find((a) => a.path === pickPath) ?? ordered[0] ?? null;
}

export async function pickUnusedVideoNoteFromDb(projectId?: string): Promise<MediaAsset | null> {
  const db = getDb();
  const rows = await db.select().from(mediaAssets).where(eq(mediaAssets.type, "video_note"));
  const used = await db.select({ path: usedWeeklyCircles.mediaPath }).from(usedWeeklyCircles);
  const usedSet = new Set(used.map((u) => u.path));

  const candidates = rows.filter((r) => {
    if (usedSet.has(r.path)) return false;
    if (projectId && r.projectId && r.projectId !== projectId) return false;
    return true;
  });

  if (candidates.length === 0) return pickUniqueWeeklyCircle(projectId);

  const poolKey = `video_note:weekly:${projectId ?? "all"}`;
  const pickPath = await pickNextInRotation({
    poolKey,
    paths: candidates.map((c) => c.path),
  });
  const pick = candidates.find((c) => c.path === pickPath) ?? candidates[0]!;

  return {
    id: pick.id,
    type: "video_note",
    filename: pick.filename,
    path: pick.path,
    projectId: pick.projectId,
  };
}
