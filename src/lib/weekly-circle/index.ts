import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { mediaAssets, usedWeeklyCircles } from "@/lib/db/schema";
import { getMediaHandler, type MediaAsset } from "@/modules/media-handler";

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

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

/** Pick a video note not yet used for weekly unique circles; recycle pool when exhausted. */
export async function pickUniqueWeeklyCircle(projectId?: string): Promise<MediaAsset | null> {
  const handler = getMediaHandler();
  const assets = await handler.listMedia("video_note", projectId);
  if (assets.length === 0) {
    return handler.pickRandom("video_note", projectId);
  }

  const unused = shuffle(assets);
  for (const asset of unused) {
    if (!(await isWeeklyCircleUsed(asset.path))) {
      return asset;
    }
  }

  const db = getDb();
  await db.delete(usedWeeklyCircles);
  return unused[0] ?? null;
}

export async function pickUnusedVideoNoteFromDb(projectId?: string): Promise<MediaAsset | null> {
  const db = getDb();
  const rows = await db.select().from(mediaAssets).where(eq(mediaAssets.type, "video_note"));
  const used = await db.select({ path: usedWeeklyCircles.mediaPath }).from(usedWeeklyCircles);
  const usedSet = new Set(used.map((u) => u.path));

  const candidates = shuffle(
    rows.filter((r) => {
      if (usedSet.has(r.path)) return false;
      if (projectId && r.projectId && r.projectId !== projectId) return false;
      return true;
    }),
  );

  const pick = candidates[0];
  if (!pick) return pickUniqueWeeklyCircle(projectId);

  return {
    id: pick.id,
    type: "video_note",
    filename: pick.filename,
    path: pick.path,
    projectId: pick.projectId,
  };
}
