import { randomUUID } from "crypto";
import { existsSync, statSync } from "fs";
import path from "path";
import { and, desc, eq, gte } from "drizzle-orm";

import { loadAppConfig } from "@/lib/config/loader";
import { getDb } from "@/lib/db";
import { mediaAssets, usedBets } from "@/lib/db/schema";
import type { MediaAsset } from "@/modules/media-handler";

/** Fallback when schedule.json has no betReuseDays (Vlad ≈ 5-day pack cycle). */
export const BET_REUSE_DAYS_DEFAULT = 5;

/** @deprecated use getConfiguredBetReuseDays() — kept for tests/imports */
export const BET_REUSE_DAYS = BET_REUSE_DAYS_DEFAULT;

export async function getConfiguredBetReuseDays(): Promise<number> {
  try {
    const config = await loadAppConfig();
    const days = config.schedule.betReuseDays;
    if (typeof days === "number" && Number.isFinite(days) && days >= 0) {
      return Math.min(90, Math.floor(days));
    }
  } catch {
    // config not ready in isolated tests
  }
  return BET_REUSE_DAYS_DEFAULT;
}

function isUsableBetFile(filename: string, filePath: string): boolean {
  if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(filename)) return false;
  const dataDir = process.env.DATA_DIR ?? "./data";
  const candidates = [
    path.isAbsolute(filePath) ? filePath : path.resolve(filePath),
    path.resolve(dataDir, filePath.replace(/^data[\\/]/, "")),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      if (statSync(candidate).size >= 512) return true;
    } catch {
      // try next
    }
  }
  return false;
}

function sortBetsStable(assets: MediaAsset[]): MediaAsset[] {
  return [...assets].sort((a, b) => {
    const byName = a.filename.localeCompare(b.filename, undefined, { numeric: true });
    if (byName !== 0) return byName;
    return a.path.localeCompare(b.path);
  });
}

function cooldownMs(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}

async function listProjectBets(projectId: string): Promise<MediaAsset[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.type, "bet"), eq(mediaAssets.projectId, projectId)));

  return sortBetsStable(
    rows
      .filter((r) => isUsableBetFile(r.filename, r.path))
      .map((r) => ({
        id: r.id,
        type: "bet" as const,
        filename: r.filename,
        path: r.path,
        projectId: r.projectId,
      })),
  );
}

async function recentBetPaths(projectId: string, days: number): Promise<Set<string>> {
  if (days <= 0) return new Set();
  const db = getDb();
  const since = new Date(Date.now() - cooldownMs(days)).toISOString();
  const rows = await db
    .select({ path: usedBets.mediaPath })
    .from(usedBets)
    .where(and(eq(usedBets.projectId, projectId), gte(usedBets.usedAt, since)));
  return new Set(rows.map((r) => r.path));
}

export async function markBetsUsed(params: {
  projectId: string;
  reviewId?: string | null;
  paths: string[];
}): Promise<void> {
  if (params.paths.length === 0) return;
  const db = getDb();
  const usedAt = new Date().toISOString();
  for (const mediaPath of params.paths) {
    await db.insert(usedBets).values({
      id: randomUUID(),
      projectId: params.projectId,
      mediaPath,
      reviewId: params.reviewId ?? null,
      usedAt,
    });
  }
}

/**
 * Pick sequential bet screenshots (1 pack = 3 images) for a review.
 * Walks filename order; skips paths used within betReuseDays; wraps when needed.
 */
export async function pickSequentialBets(params: {
  projectId: string;
  count?: number;
  reuseDays?: number;
  reviewId?: string | null;
}): Promise<MediaAsset[]> {
  const count = params.count ?? 3;
  const reuseDays =
    params.reuseDays !== undefined ? params.reuseDays : await getConfiguredBetReuseDays();
  const pool = await listProjectBets(params.projectId);
  if (pool.length === 0) return [];

  const blocked = await recentBetPaths(params.projectId, reuseDays);

  const db = getDb();
  const last = await db
    .select()
    .from(usedBets)
    .where(eq(usedBets.projectId, params.projectId))
    .orderBy(desc(usedBets.usedAt))
    .limit(1);

  let startIndex = 0;
  if (last[0]) {
    const idx = pool.findIndex((a) => a.path === last[0]!.mediaPath);
    if (idx >= 0) startIndex = (idx + 1) % pool.length;
  }

  const picked: MediaAsset[] = [];
  const pickedPaths = new Set<string>();

  for (let i = 0; i < pool.length && picked.length < count; i++) {
    const asset = pool[(startIndex + i) % pool.length]!;
    if (blocked.has(asset.path) || pickedPaths.has(asset.path)) continue;
    picked.push(asset);
    pickedPaths.add(asset.path);
  }

  for (let i = 0; i < pool.length && picked.length < count; i++) {
    const asset = pool[(startIndex + i) % pool.length]!;
    if (pickedPaths.has(asset.path)) continue;
    picked.push(asset);
    pickedPaths.add(asset.path);
  }

  await markBetsUsed({
    projectId: params.projectId,
    ...(params.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
    paths: picked.map((p) => p.path),
  });

  return picked;
}
