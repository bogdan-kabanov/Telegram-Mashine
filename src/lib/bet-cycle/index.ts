import { randomUUID } from "crypto";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { and, desc, eq, gte } from "drizzle-orm";

import { loadAppConfig } from "@/lib/config/loader";
import { getDb } from "@/lib/db";
import { mediaAssets, usedBets } from "@/lib/db/schema";
import type { ScheduleConfig } from "@/lib/schemas";
/** Minimal asset shape used by bet cycling (avoids loading receipt/captura renderers). */
export interface MediaAsset {
  id: string;
  type: "bet";
  filename: string;
  path: string;
  projectId?: string | null;
  legendId?: string | null;
}

/** Fallback when schedule.json has no betReuseDays (Vlad ≈ 5-day pack cycle). */
export const BET_REUSE_DAYS_DEFAULT = 5;

/** Sanity ceiling for date-window queries (capacity may be lower). */
export const BET_REUSE_DAYS_HARD_MAX = 365;

/** @deprecated use getConfiguredBetReuseDays() — kept for tests/imports */
export const BET_REUSE_DAYS = BET_REUSE_DAYS_DEFAULT;

export type BetReuseProjectCapacity = {
  projectId: string;
  unique: number;
  dailyReviews: number;
  dailyBets: number;
  capacityDays: number;
};

export type BetReuseCapacity = {
  maxDays: number;
  byProject: BetReuseProjectCapacity[];
};

/** Max reviews/day for a project across schedule weeks (worst week). */
export function maxDailyReviewsForProject(schedule: ScheduleConfig, projectId: string): number {
  const weeks = schedule.weeks;
  if (weeks && weeks.length > 0) {
    return Math.max(
      0,
      ...weeks.map((w) => w.slots.filter((s) => s.projectId === projectId).length),
    );
  }
  return (schedule.slots ?? []).filter((s) => s.projectId === projectId).length;
}

/**
 * Max betReuseDays that unique pools can sustain without forced early reuse.
 * Global setting → capped by the weakest project.
 */
export async function getBetReuseCapacity(): Promise<BetReuseCapacity> {
  const config = await loadAppConfig();
  const byProject: BetReuseProjectCapacity[] = [];

  for (const project of config.projects.projects) {
    const dailyReviews = maxDailyReviewsForProject(config.schedule, project.id);
    if (dailyReviews <= 0) continue;

    const unique = (await listProjectBets(project.id)).length;
    const dailyBets = dailyReviews * 3;
    const capacityDays = Math.min(BET_REUSE_DAYS_HARD_MAX, Math.floor(unique / dailyBets));
    byProject.push({
      projectId: project.id,
      unique,
      dailyReviews,
      dailyBets,
      capacityDays,
    });
  }

  const maxDays =
    byProject.length === 0 ? 0 : Math.min(...byProject.map((p) => p.capacityDays));

  return { maxDays, byProject };
}

export async function getConfiguredBetReuseDays(): Promise<number> {
  try {
    const config = await loadAppConfig();
    const days = config.schedule.betReuseDays;
    if (typeof days === "number" && Number.isFinite(days) && days >= 0) {
      return Math.min(BET_REUSE_DAYS_HARD_MAX, Math.floor(days));
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

  const fromDb = sortBetsStable(
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
  if (fromDb.length > 0) return fromDb;

  // Disk fallback when media_assets is empty (fresh DB / Docker volume).
  const dataDir = process.env.DATA_DIR ?? "./data";
  const dir = path.resolve(dataDir, "media/bets", projectId);
  if (!existsSync(dir)) return [];
  try {
    const files = readdirSync(dir).filter((f) => isUsableBetFile(f, path.join(dir, f)));
    return sortBetsStable(
      files.map((filename) => ({
        id: randomUUID(),
        type: "bet" as const,
        filename,
        path: `data/media/bets/${projectId}/${filename}`,
        projectId,
      })),
    );
  } catch {
    return [];
  }
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

const PACK_FILE_RE = /^pack(\d+)_([123])\./i;

export function parseBetPackNumber(filename: string): number | null {
  const m = filename.match(PACK_FILE_RE);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseBetPackSlot(filename: string): number | null {
  const m = filename.match(PACK_FILE_RE);
  if (!m) return null;
  const n = Number(m[2]);
  return n === 1 || n === 2 || n === 3 ? n : null;
}

export type BetPackPick = {
  packNumber: number;
  assets: MediaAsset[];
};

/** Complete packs only: packNN_1 + _2 + _3 present and usable. */
export async function listCompleteBetPacks(projectId: string): Promise<BetPackPick[]> {
  const pool = await listProjectBets(projectId);
  const byPack = new Map<number, Map<number, MediaAsset>>();

  for (const asset of pool) {
    const pack = parseBetPackNumber(asset.filename);
    const slot = parseBetPackSlot(asset.filename);
    if (pack == null || slot == null) continue;
    let slots = byPack.get(pack);
    if (!slots) {
      slots = new Map();
      byPack.set(pack, slots);
    }
    if (!slots.has(slot)) slots.set(slot, asset);
  }

  const packs: BetPackPick[] = [];
  for (const packNumber of [...byPack.keys()].sort((a, b) => a - b)) {
    const slots = byPack.get(packNumber)!;
    const a1 = slots.get(1);
    const a2 = slots.get(2);
    const a3 = slots.get(3);
    if (!a1 || !a2 || !a3) continue;
    packs.push({ packNumber, assets: [a1, a2, a3] });
  }
  return packs;
}

/**
 * Use a specific numbered bet image pack (constructor amount-pack selection).
 * Marks the three screenshots as used, same as the sequential cycle.
 */
export async function pickBetPackByNumber(params: {
  projectId: string;
  packNumber: number;
  reviewId?: string | null;
}): Promise<BetPackPick | null> {
  if (params.packNumber < 1) return null;
  const packs = await listCompleteBetPacks(params.projectId);
  const chosen = packs.find((p) => p.packNumber === params.packNumber) ?? null;
  if (!chosen) return null;
  await markBetsUsed({
    projectId: params.projectId,
    ...(params.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
    paths: chosen.assets.map((a) => a.path),
  });
  return chosen;
}

/**
 * Next bet pack in cycle 1→N→1, aligned with amount `betPack`.
 * Always picks the next pack after the last used — strict order, no random skip.
 */
export async function pickNextBetPack(params: {
  projectId: string;
  reuseDays?: number;
  reviewId?: string | null;
}): Promise<BetPackPick | null> {
  const packs = await listCompleteBetPacks(params.projectId);
  if (packs.length === 0) return null;

  const db = getDb();
  const last = await db
    .select()
    .from(usedBets)
    .where(eq(usedBets.projectId, params.projectId))
    .orderBy(desc(usedBets.usedAt))
    .limit(1);

  let startIdx = 0;
  if (last[0]) {
    const lastPack =
      parseBetPackNumber(path.basename(last[0].mediaPath)) ??
      parseBetPackNumber(last[0].mediaPath);
    if (lastPack != null) {
      const idx = packs.findIndex((p) => p.packNumber === lastPack);
      if (idx >= 0) startIdx = (idx + 1) % packs.length;
    }
  }

  const chosen = packs[startIdx] ?? packs[0]!;

  await markBetsUsed({
    projectId: params.projectId,
    ...(params.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
    paths: chosen.assets.map((a) => a.path),
  });

  return chosen;
}

/**
 * Random complete bet pack, preferring packs outside cooldown.
 * Used when amounts are operator-defined and not tied to pack number.
 */
export async function pickRandomBetPack(params: {
  projectId: string;
  reuseDays?: number;
  reviewId?: string | null;
}): Promise<BetPackPick | null> {
  const reuseDays =
    params.reuseDays !== undefined ? params.reuseDays : await getConfiguredBetReuseDays();
  const packs = await listCompleteBetPacks(params.projectId);
  if (packs.length === 0) return null;

  const blocked = await recentBetPaths(params.projectId, reuseDays);
  const isFresh = (pack: BetPackPick) => pack.assets.every((a) => !blocked.has(a.path));
  const fresh = packs.filter(isFresh);
  const pool = fresh.length > 0 ? fresh : packs;
  const chosen = pool[Math.floor(Math.random() * pool.length)]!;

  await markBetsUsed({
    projectId: params.projectId,
    ...(params.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
    paths: chosen.assets.map((a) => a.path),
  });

  return chosen;
}

/**
 * Pick sequential bet screenshots (1 pack = 3 images) for a review.
 * Walks filename order; skips paths used within betReuseDays; wraps when needed.
 * Prefer {@link pickNextBetPack} when amounts are bound 1:1 to pack numbers.
 */
export async function pickSequentialBets(params: {
  projectId: string;
  count?: number;
  reuseDays?: number;
  reviewId?: string | null;
}): Promise<MediaAsset[]> {
  const pack = await pickNextBetPack(params);
  if (pack) {
    const count = params.count ?? 3;
    return pack.assets.slice(0, count);
  }

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
