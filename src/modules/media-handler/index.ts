import { randomUUID } from "crypto";
import { existsSync, statSync } from "fs";
import path from "path";
import { and, eq, sql } from "drizzle-orm";

import { pickNextInRotation, sortPathsStable } from "@/lib/media-rotation";
import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { overlayReceiptTemplate } from "@/lib/media/overlay-receipt";
import {
  assertNotReceiptTemplatePath,
  writeSlipSourceMeta,
} from "@/lib/media/slip-source";
import {
  generateAiReceipt,
  getAiReceiptsMode,
  materializeReceiptTemplate,
} from "@/lib/openai/receipts";
import { createLogger } from "@/lib/runtime/manager";
import { isStandaloneLegend } from "@/lib/legends/standalone";
import type { ProjectConfig } from "@/lib/schemas/projects";
import { getFileStore } from "@/lib/storage/file-store";
import { bankIdToCapturaStyle, renderCapturaPng, type CapturaBankStyle } from "./captura";
import { bankIdToReceiptStyle, renderReceiptPng, type ReceiptBankStyle } from "./receipt";

const logger = createLogger("media-handler");

export type SlipSource = "ai" | "overlay" | "template" | "html";

export type MediaType =
  | "video_note"
  | "bet"
  | "conditions"
  | "wallpaper"
  | "sticker"
  | "story_photo"
  | "avatar"
  | "voice"
  | "receipt"
  | "captura";

export interface MediaAsset {
  id: string;
  type: MediaType;
  filename: string;
  path: string;
  projectId?: string | null;
  legendId?: string | null;
}

const MEDIA_DIRS: Record<Exclude<MediaType, "receipt" | "captura">, string> = {
  video_note: "media/video_notes",
  bet: "media/bets",
  conditions: "media/conditions",
  wallpaper: "media/wallpapers",
  sticker: "media/stickers",
  story_photo: "media/story_photos",
  avatar: "media/avatars",
  voice: "media/voices",
};

function isValidMediaFile(filename: string, filePath: string): boolean {
  if (filename.startsWith(".")) return false;
  if (filename === ".gitkeep") return false;
  if (filePath.includes(".gitkeep")) return false;
  if (!/\.(jpg|jpeg|png|webp|gif|mp4|mov|ogg|opus|m4a|mp3)$/i.test(filename) && !/\.(jpg|jpeg|png|webp|gif|mp4|mov|ogg|opus|m4a|mp3)$/i.test(filePath)) {
    return false;
  }
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  if (!existsSync(resolved)) {
    const dataDir = process.env.DATA_DIR ?? "./data";
    const alt = path.resolve(dataDir, filePath.replace(/^data[\\/]/, ""));
    if (!existsSync(alt)) return false;
    try {
      return statSync(alt).size >= 512;
    } catch {
      return false;
    }
  }
  try {
    return statSync(resolved).size >= 512;
  } catch {
    return false;
  }
}

/** legendId from path: story_photos/{id}/… or video_notes/{project}/{id}/… */
function legendIdFromPath(filePath: string): string | null {
  const norm = filePath.replace(/\\/g, "/");
  const story = norm.match(/story_photos\/([^/]+)\//);
  if (story) return story[1] === "pool" ? null : story[1]!;
  const circle = norm.match(/video_notes\/[^/]+\/([^/]+)\//);
  return circle?.[1] ?? null;
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

export class MediaHandler {
  private readonly store = getFileStore();

  isValidFile(filePath: string, minBytes = 512): boolean {
    if (!filePath || filePath.includes(".gitkeep")) return false;
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    if (!existsSync(resolved)) return false;
    try {
      const stat = statSync(resolved);
      return stat.size >= minBytes && /\.(jpg|jpeg|png|webp|gif|mp4|mov|ogg|opus|m4a|mp3)$/i.test(path.basename(resolved));
    } catch {
      return false;
    }
  }

  async listMedia(type: MediaType, projectId?: string): Promise<MediaAsset[]> {
    const db = getDb();
    const conditions = projectId
      ? and(eq(mediaAssets.type, type), eq(mediaAssets.projectId, projectId))
      : eq(mediaAssets.type, type);

    const dbAssets = await db.select().from(mediaAssets).where(conditions);

    const fromDb = dbAssets
      .filter((a) => isValidMediaFile(a.filename, a.path))
      .map((a) => ({
        id: a.id,
        type: type as MediaType,
        filename: a.filename,
        path: a.path,
        projectId: a.projectId,
        legendId: legendIdFromPath(a.path),
      }));

    if (fromDb.length > 0) return fromDb;

    const dir = MEDIA_DIRS[type as Exclude<MediaType, "receipt" | "captura">];
    if (!dir) return [];

    // Prefer project subfolder: media/bets/nancy/...
    const relativeDir = projectId && type !== "sticker" && type !== "story_photo" ? `${dir}/${projectId}` : dir;
    const files = (await this.store.listFiles(relativeDir)).filter((f) =>
      isValidMediaFile(f, `data/${relativeDir}/${f}`),
    );

    // Wallpapers are flat files named {projectId}.ext
    if (type === "wallpaper" && projectId) {
      const all = (await this.store.listFiles(dir)).filter((f) =>
        isValidMediaFile(f, `data/${dir}/${f}`),
      );
      const match = all.filter((f) => path.parse(f).name === projectId);
      return match.map((filename) => ({
        id: randomUUID(),
        type,
        filename,
        path: `data/${dir}/${filename}`,
        projectId,
      }));
    }

    return files.map((filename) => ({
      id: randomUUID(),
      type,
      filename,
      path: `data/${relativeDir}/${filename}`,
      projectId: projectId ?? null,
    }));
  }

  async pickRandom(type: MediaType, projectId?: string): Promise<MediaAsset | null> {
    const assets = await this.listMedia(type, projectId);
    if (assets.length === 0) {
      await logger.warn(`No media found for type: ${type}`, { projectId });
      return null;
    }
    return assets[Math.floor(Math.random() * assets.length)] ?? null;
  }

  async pickRandomFromDb(type: string, projectId?: string): Promise<MediaAsset | null> {
    const db = getDb();
    const conditions = projectId
      ? and(eq(mediaAssets.type, type), eq(mediaAssets.projectId, projectId))
      : eq(mediaAssets.type, type);

    const rows = await db
      .select()
      .from(mediaAssets)
      .where(conditions)
      .orderBy(sql`RANDOM()`)
      .limit(20);

    const valid = rows.filter((r) => isValidMediaFile(r.filename, r.path));
    const pick = valid[Math.floor(Math.random() * valid.length)];

    if (pick) {
      return {
        id: pick.id,
        type: pick.type as MediaType,
        filename: pick.filename,
        path: pick.path,
        projectId: pick.projectId,
        legendId: legendIdFromPath(pick.path),
      };
    }

    return this.pickRandom(type as MediaType, projectId);
  }

  /**
   * Pick a video circle for a review (sequential 1→N→1 per project + legend filter).
   * Only the same legend or standalone/untagged — never another legend's circle.
   */
  async pickVideoNote(
    projectId: string,
    legendId?: string | null,
    options?: { preferStandalone?: boolean },
  ): Promise<MediaAsset | null> {
    const assets = await this.listMedia("video_note", projectId);
    if (assets.length === 0) {
      return this.pickVideoNoteSequentialFromDb(projectId, legendId, options);
    }

    const standalone = assets.filter(
      (a) => a.legendId === "standalone" || a.legendId == null || a.legendId === "",
    );
    const tagged =
      legendId && !options?.preferStandalone && !isStandaloneLegend(legendId)
        ? assets.filter((a) => a.legendId === legendId)
        : [];

    const pool = options?.preferStandalone || isStandaloneLegend(legendId ?? "")
      ? standalone
      : [...tagged, ...standalone];

    const unique: MediaAsset[] = [];
    const seen = new Set<string>();
    for (const a of pool) {
      if (seen.has(a.path)) continue;
      seen.add(a.path);
      unique.push(a);
    }

    if (unique.length === 0) {
      await logger.warn("No video circle for legend — upload one in media library", {
        projectId,
        legendId,
      });
      return null;
    }

    const sorted = sortPathsStable(unique.map((a) => a.path));
    const poolKey = `video_note:${projectId}:${legendId ?? "any"}`;
    const pickPath = await pickNextInRotation({ poolKey, paths: sorted });
    const pick = unique.find((a) => a.path === pickPath) ?? unique[0] ?? null;

    if (pick && legendId && pick.legendId && pick.legendId !== legendId && pick.legendId !== "standalone") {
      await logger.warn("Video circle legend mismatch skipped", {
        wanted: legendId,
        got: pick.legendId,
      });
    }
    return pick;
  }

  private async pickVideoNoteSequentialFromDb(
    projectId: string,
    legendId?: string | null,
    options?: { preferStandalone?: boolean },
  ): Promise<MediaAsset | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.type, "video_note"), eq(mediaAssets.projectId, projectId)));

    const assets = rows
      .filter((r) => isValidMediaFile(r.filename, r.path))
      .map((r) => ({
        id: r.id,
        type: "video_note" as const,
        filename: r.filename,
        path: r.path,
        projectId: r.projectId,
        legendId: legendIdFromPath(r.path),
      }));

    if (assets.length === 0) return null;

    const standalone = assets.filter(
      (a) => a.legendId === "standalone" || a.legendId == null || a.legendId === "",
    );
    const tagged =
      legendId && !options?.preferStandalone && !isStandaloneLegend(legendId)
        ? assets.filter((a) => a.legendId === legendId)
        : [];
    const pool =
      options?.preferStandalone || isStandaloneLegend(legendId ?? "")
        ? standalone
        : [...tagged, ...standalone];
    if (pool.length === 0) return null;

    const poolKey = `video_note:${projectId}:${legendId ?? "any"}`;
    const pickPath = await pickNextInRotation({ poolKey, paths: pool.map((a) => a.path) });
    return pool.find((a) => a.path === pickPath) ?? pool[0] ?? null;
  }

  async pickStoryPhoto(legendId: string): Promise<MediaAsset | null> {
    const db = getDb();
    const rows = await db.select().from(mediaAssets).where(eq(mediaAssets.type, "story_photo"));

    const tagged = rows.filter(
      (r) =>
        isValidMediaFile(r.filename, r.path) &&
        (r.path.includes(`story_photos/${legendId}`) || r.path.includes(`story_photos\\${legendId}`)),
    );

    if (tagged.length > 0) {
      const poolKey = `story_photo:legend:${legendId}`;
      const pickPath = await pickNextInRotation({
        poolKey,
        paths: tagged.map((r) => r.path),
      });
      const pick = tagged.find((r) => r.path === pickPath) ?? tagged[0]!;
      return {
        id: pick.id,
        type: "story_photo",
        filename: pick.filename,
        path: pick.path,
        projectId: pick.projectId,
        legendId,
      };
    }

    const dir = `media/story_photos/${legendId}`;
    const files = (await this.store.listFiles(dir)).filter((f) =>
      isValidMediaFile(f, this.store.resolve(`${dir}/${f}`)),
    );
    if (files.length === 0) return null;

    const poolKey = `story_photo:legend:${legendId}`;
    const relPaths = files.map((f) => `data/${dir}/${f}`);
    const pickPath = await pickNextInRotation({ poolKey, paths: relPaths });
    const file = pickPath ? path.basename(pickPath) : files[0]!;
    if (!file) return null;

    const filePath = `data/${dir}/${file}`;
    return {
      id: randomUUID(),
      type: "story_photo",
      filename: file,
      path: filePath,
      legendId,
    };
  }

  /** Client voice message from library — sequential rotation. */
  async pickVoice(): Promise<MediaAsset | null> {
    const assets = await this.listMedia("voice");
    if (assets.length === 0) return null;
    const pickPath = await pickNextInRotation({
      poolKey: "voice:global",
      paths: assets.map((a) => a.path),
    });
    return assets.find((a) => a.path === pickPath) ?? assets[0] ?? null;
  }

  async pickSticker(projectId?: string): Promise<MediaAsset | null> {
    const fromDb = await this.pickRandomFromDb("sticker", projectId);
    if (fromDb) return fromDb;
    return this.pickRandom("sticker", projectId);
  }

  /**
   * Pick from library, or generate via AI when AI_MEDIA=fallback/always.
   */
  async resolveProjectImage(
    type: "bet" | "conditions" | "sticker" | "avatar",
    params: {
      projectId: string;
      projectName?: string;
      locale?: string;
      currency?: string;
      clientName?: string;
      reviewId?: string | null;
    },
  ): Promise<MediaAsset | null> {
    const { getAiMediaMode, generateSceneMedia } = await import("@/lib/openai/scene-media");
    const mode = getAiMediaMode();

    if (mode !== "always") {
      const existing =
        type === "sticker"
          ? await this.pickSticker(params.projectId)
          : await this.pickRandomFromDb(type, params.projectId);
      if (existing) return existing;
      if (mode === "off" || type === "bet") return null;
    }
    if (type === "bet") return null;

    const generated = await generateSceneMedia({
      kind: type,
      projectId: type === "sticker" ? null : params.projectId,
      ...(params.projectName ? { projectName: params.projectName } : {}),
      ...(params.locale ? { locale: params.locale } : {}),
      ...(params.currency ? { currency: params.currency } : {}),
      ...(params.clientName ? { clientName: params.clientName } : {}),
      ...(params.reviewId !== undefined ? { reviewId: params.reviewId } : {}),
    });
    if (!generated) return null;

    return {
      id: generated.assetId,
      type,
      filename: generated.filename,
      path: generated.path,
      projectId: type === "sticker" ? null : params.projectId,
    };
  }

  async generateReceipt(params: {
    amount: number;
    currency: string;
    senderName: string;
    recipientName: string;
    bankId: string;
    bankName: string;
    accountLastDigits: string;
    date: string;
    time?: string;
    /** Project-level style overrides bank mapping when set. */
    style?: ReceiptBankStyle;
    project?: ProjectConfig;
    /** Prefer this template filename under receipt_templates/{projectId}/ */
    templateFilename?: string;
  }): Promise<{ id: string; path: string; source: SlipSource }> {
    const id = randomUUID();
    const outputDir = this.store.resolve("media/receipts");
    const outputPath = path.join(outputDir, `${id}.png`);
    assertNotReceiptTemplatePath(outputPath);
    const time = params.time ?? "12:00";
    const mode = getAiReceiptsMode();
    const tplOpts = params.templateFilename ? { templateFilename: params.templateFilename } : {};

    const remember = (template: string, role: "client" | "manager") => {
      if (!params.project) return;
      writeSlipSourceMeta(outputPath, {
        template,
        projectId: params.project.id,
        role,
      });
    };

    const tryOverlay = async () => {
      if (!params.project) return null;
      return overlayReceiptTemplate({
        project: params.project,
        role: "manager",
        amount: params.amount,
        currency: params.currency,
        senderName: params.senderName,
        recipientName: params.recipientName,
        accountLastDigits: params.accountLastDigits,
        date: params.date,
        time,
        outputPath,
        ...tplOpts,
      });
    };

    const tryAi = async () => {
      if (!params.project || mode === "off") return null;
      return generateAiReceipt({
        project: params.project,
        role: "manager",
        amount: params.amount,
        currency: params.currency,
        senderName: params.senderName,
        recipientName: params.recipientName,
        accountLastDigits: params.accountLastDigits,
        date: params.date,
        time,
        bankName: params.bankName,
        preferMedium: "paper",
        ...tplOpts,
        outputPath,
      });
    };

    // AI only when enabled — OCR overlay disabled (it paints gray plaques / wrong fee lines).
    if (mode !== "off") {
      const ai = await tryAi();
      if (ai) {
        remember(ai.template, "manager");
        await logger.info("Receipt rewritten by AI image edit (from pristine template)", {
          id,
          template: ai.template,
          model: ai.model,
          medium: ai.medium,
        });
        return { id, path: outputPath, source: "ai" };
      }
      await logger.warn("AI receipt edit failed — skipping OCR overlay", {
        id,
        mode,
        projectId: params.project?.id,
      });
    } else {
      const overlay = await tryOverlay();
      if (overlay) {
        remember(overlay.template, "manager");
        await logger.info("Receipt stamped on pristine screenshot (AI off)", {
          id,
          template: overlay.template,
          fields: overlay.fields,
        });
        return { id, path: outputPath, source: "overlay" };
      }
    }

    // Prefer real bank screenshots from фит over HTML stubs when AI is geo-blocked.
    if (params.project) {
      const fromTemplate = await materializeReceiptTemplate({
        project: params.project,
        role: "manager",
        outputPath,
      });
      if (fromTemplate) {
        remember(fromTemplate.template, "manager");
        await logger.info("Receipt generated", {
          id,
          path: outputPath,
          bankId: params.bankId,
          source: "template",
          template: fromTemplate.template,
        });
        return { id, path: outputPath, source: "template" };
      }
    }

    await renderReceiptPng(
      {
        amount: params.amount,
        currency: params.currency,
        senderName: params.senderName,
        recipientName: params.recipientName,
        bankName: params.bankName,
        bankStyle: params.style ?? bankIdToReceiptStyle(params.bankId),
        accountLastDigits: params.accountLastDigits,
        date: params.date,
        time,
        reference: id.slice(0, 8).toUpperCase(),
      },
      outputPath,
    );

    await logger.info("Receipt generated", { id, path: outputPath, bankId: params.bankId, source: "html" });
    return { id, path: outputPath, source: "html" };
  }

  async generateCaptura(params: {
    amount: number;
    currency: string;
    senderName: string;
    recipientLabel: string;
    clabe: string;
    bankId: string;
    bankName: string;
    date: string;
    time?: string;
    style?: CapturaBankStyle;
    project?: ProjectConfig;
    accountLastDigits?: string;
    templateFilename?: string;
  }): Promise<{ id: string; path: string; source: SlipSource }> {
    const id = randomUUID();
    const outputDir = this.store.resolve("media/capturas");
    const outputPath = path.join(outputDir, `${id}.png`);
    assertNotReceiptTemplatePath(outputPath);
    const time = params.time ?? "12:00";
    const digits =
      params.accountLastDigits ??
      params.clabe.replace(/\D/g, "").slice(-4).padStart(4, "0");
    const mode = getAiReceiptsMode();
    const tplOpts = params.templateFilename ? { templateFilename: params.templateFilename } : {};

    const remember = (template: string) => {
      if (!params.project) return;
      writeSlipSourceMeta(outputPath, {
        template,
        projectId: params.project.id,
        role: "client",
      });
    };

    const tryOverlay = async () => {
      if (!params.project) return null;
      return overlayReceiptTemplate({
        project: params.project,
        role: "client",
        amount: params.amount,
        currency: params.currency,
        senderName: params.senderName,
        recipientName: params.recipientLabel,
        accountLastDigits: digits,
        date: params.date,
        time,
        outputPath,
        preferMedium: "paper",
        ...tplOpts,
      });
    };

    const tryAi = async () => {
      if (!params.project || mode === "off") return null;
      return generateAiReceipt({
        project: params.project,
        role: "client",
        amount: params.amount,
        currency: params.currency,
        senderName: params.senderName,
        recipientName: params.recipientLabel,
        accountLastDigits: digits,
        date: params.date,
        time,
        bankName: params.bankName,
        clabe: params.clabe,
        preferMedium: "paper",
        ...tplOpts,
        outputPath,
      });
    };

    // AI only when enabled — OCR overlay disabled (wrong fee lines + gray plaques).
    if (mode !== "off") {
      const ai = await tryAi();
      if (ai) {
        remember(ai.template);
        await logger.info("Captura rewritten by AI image edit (from pristine template)", {
          id,
          template: ai.template,
          model: ai.model,
          medium: ai.medium,
        });
        return { id, path: outputPath, source: "ai" };
      }
      await logger.warn("AI captura edit failed — skipping OCR overlay", {
        id,
        mode,
        projectId: params.project?.id,
      });
    } else {
      const overlay = await tryOverlay();
      if (overlay) {
        remember(overlay.template);
        await logger.info("Captura stamped on pristine screenshot (AI off)", {
          id,
          template: overlay.template,
          fields: overlay.fields,
        });
        return { id, path: outputPath, source: "overlay" };
      }
    }

    if (params.project) {
      const fromTemplate = await materializeReceiptTemplate({
        project: params.project,
        role: "client",
        outputPath,
      });
      if (fromTemplate) {
        remember(fromTemplate.template);
        await logger.info("Captura generated", {
          id,
          path: outputPath,
          bankId: params.bankId,
          source: "template",
          template: fromTemplate.template,
        });
        return { id, path: outputPath, source: "template" };
      }
    }

    await renderCapturaPng(
      {
        amount: params.amount,
        currency: params.currency,
        senderName: params.senderName,
        recipientLabel: params.recipientLabel,
        clabe: params.clabe,
        bankName: params.bankName,
        bankStyle: params.style ?? bankIdToCapturaStyle(params.bankId),
        date: params.date,
        time,
        reference: id.slice(0, 8).toUpperCase(),
      },
      outputPath,
    );

    await logger.info("Captura generated", { id, path: outputPath, bankId: params.bankId, source: "html" });
    return { id, path: outputPath, source: "html" };
  }
}

let instance: MediaHandler | null = null;

export function getMediaHandler(): MediaHandler {
  if (!instance) instance = new MediaHandler();
  return instance;
}
