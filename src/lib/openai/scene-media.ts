import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { createLogger } from "@/lib/runtime/manager";
import { getEnv } from "@/lib/schemas/env";
import { isOpenAIConfigured } from "./client";
import { generateImagePngBase64 } from "./generate-image";

const logger = createLogger("openai-scene-media");

export type AiMediaMode = "off" | "fallback" | "always";
export type SceneMediaKind = "bet" | "conditions" | "sticker" | "avatar" | "wallpaper";

export function getAiMediaMode(): AiMediaMode {
  return getEnv().AI_MEDIA;
}

export function isAiMediaEnabled(): boolean {
  return getAiMediaMode() !== "off" && isOpenAIConfigured();
}

const FEMALE_NAME_HINTS =
  /a$|ia$|na$|ra$|la$|sa$|ta$|da|ela|isa|ana|maria|sofia|valeria|nancy|maya|luna|carmen|rosa|lucia|paola|andrea|gabriela|fernanda|alejandra|daniela|camila|isabel|laura|monica|patricia|veronica|adriana|carolina|jessica|jennifer|grisel|melissa|francesca/i;

function guessGender(clientName?: string): "woman" | "man" {
  if (!clientName) return Math.random() < 0.55 ? "woman" : "man";
  const first = clientName.trim().split(/\s+/)[0] ?? "";
  return FEMALE_NAME_HINTS.test(first) ? "woman" : "man";
}

function regionLabel(locale?: string): string {
  const loc = (locale ?? "es-MX").toLowerCase();
  if (loc.startsWith("ru")) return "Russian";
  if (loc.startsWith("es-ar") || loc.includes("ar")) return "Argentine";
  return "Mexican";
}

function uiLanguage(locale?: string): string {
  const loc = (locale ?? "es-MX").toLowerCase();
  if (loc.startsWith("ru")) return "Russian";
  return "Spanish";
}

function buildPrompt(kind: SceneMediaKind, params: {
  projectName?: string;
  clientName?: string;
  locale?: string;
  currency?: string;
  amountHint?: string;
}): string {
  const locale = params.locale ?? "es-MX";
  const currency = params.currency ?? "MXN";
  const project = params.projectName ?? "proyecto";
  const language = uiLanguage(locale);
  const region = regionLabel(locale);

  if (kind === "bet") {
    const odds = (1.4 + Math.random() * 2.4).toFixed(2);
    const stake = params.amountHint ?? `${500 + Math.floor(Math.random() * 2500)} ${currency}`;
    return [
      "Photorealistic smartphone screenshot of a sports betting / trading mobile app.",
      `Locale UI in ${language} (${locale}), currency ${currency}.`,
      `Visible stake around ${stake}, odds ~${odds}, green profit accent.`,
      "Clean modern fintech UI, status bar, no watermarks, no logos of real banned brands,",
      "looks like a real phone screenshot sent in Telegram chat, portrait 9:16 framing.",
    ].join(" ");
  }

  if (kind === "conditions") {
    return [
      `Photorealistic image of work conditions / terms card for a ${region} money project «${project}».`,
      `Text language ${language} (${locale}), readable short bullet rules on a clean flyer or phone note.`,
      "Include deposit mention, payout mention, simple steps 1-2-3, soft professional design.",
      "Looks like a real JPEG/PNG sent in Telegram (not a UI mock with browser chrome).",
      "No watermarks, no QR spam, portrait orientation.",
    ].join(" ");
  }

  if (kind === "sticker") {
    return [
      "Cute Telegram-style sticker with TRUE TRANSPARENT background (alpha PNG),",
      "NO white, gray, or solid backdrop — only the character on transparency,",
      "single cartoon character giving thumbs up or celebrating money success,",
      "thick outline, sticker pack aesthetic, centered, no text, square composition.",
    ].join(" ");
  }

  if (kind === "wallpaper") {
    return [
      `Photorealistic Telegram chat wallpaper for manager brand «${project}»,`,
      "vertical phone wallpaper, soft lifestyle photo with subtle money/success vibe,",
      "not too busy so chat bubbles stay readable, no huge text overlays, high quality.",
    ].join(" ");
  }

  // avatar
  const gender = guessGender(params.clientName);
  const age = 22 + Math.floor(Math.random() * 16);
  return [
    `Photorealistic close-up portrait selfie of a ${region} ${gender}, about ${age} years old,`,
    "neutral background, natural lighting, looking at camera, bust crop for chat avatar,",
    "casual clothes, no text, no watermark, square framing.",
  ].join(" ");
}

async function generatePngBase64(prompt: string): Promise<string> {
  const { b64, model } = await generateImagePngBase64(prompt);
  await logger.info("Scene image OK", { model });
  return b64;
}

function relativeDirFor(kind: SceneMediaKind, projectId?: string | null): string {
  if (kind === "sticker") return "media/stickers";
  if (kind === "wallpaper") return "media/wallpapers";
  if (kind === "avatar") return projectId ? `media/avatars/${projectId}` : "media/avatars";
  if (kind === "bet") return projectId ? `media/bets/${projectId}` : "media/bets";
  return projectId ? `media/conditions/${projectId}` : "media/conditions";
}

/**
 * Generate bet / conditions / sticker / avatar via OpenAI Images and save to media library.
 */
export async function generateSceneMedia(params: {
  kind: SceneMediaKind;
  projectId?: string | null;
  projectName?: string;
  clientName?: string;
  locale?: string;
  currency?: string;
  amountHint?: string;
  reviewId?: string | null;
  /** Admin / explicit generate ignores AI_MEDIA=off when OpenAI is configured. */
  force?: boolean;
}): Promise<{ path: string; filename: string; assetId: string } | null> {
  if (params.kind === "bet") {
    throw new Error("Ставки не генерируются ИИ — суммы печатаются на готовом скрине.");
  }

  if (!isOpenAIConfigured()) {
    await logger.warn("OpenAI not configured — cannot generate scene media");
    return null;
  }

  if (!params.force && !isAiMediaEnabled()) {
    await logger.warn("AI_MEDIA is off — skip scene media generation", { kind: params.kind });
    return null;
  }

  const prompt = buildPrompt(params.kind, {
    ...(params.projectName ? { projectName: params.projectName } : {}),
    ...(params.clientName ? { clientName: params.clientName } : {}),
    ...(params.locale ? { locale: params.locale } : {}),
    ...(params.currency ? { currency: params.currency } : {}),
    ...(params.amountHint ? { amountHint: params.amountHint } : {}),
  });

  let b64: string;
  try {
    b64 = await generatePngBase64(prompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown image error";
    await logger.warn("Scene media generation failed", {
      error: message,
      kind: params.kind,
      model: getEnv().OPENAI_IMAGE_MODEL,
    });
    if (params.force) throw error;
    return null;
  }

  const env = getEnv();
  const relDir = relativeDirFor(params.kind, params.projectId);
  const filename =
    params.kind === "wallpaper" && params.projectId
      ? `${params.projectId}.png`
      : `ai_${params.kind}_${Date.now()}_${randomUUID().slice(0, 8)}.png`;
  const destDir = path.resolve(env.DATA_DIR, relDir);
  mkdirSync(destDir, { recursive: true });
  const absPath = path.join(destDir, filename);
  writeFileSync(absPath, Buffer.from(b64, "base64"));

  if (params.kind === "sticker") {
    try {
      const { removeWhiteBackgroundInPlace } = await import("@/lib/media/trim-image");
      await removeWhiteBackgroundInPlace(absPath, { threshold: 242 });
    } catch {
      // keep raw PNG
    }
  }

  const relativePath = `data/${relDir}/${filename}`.replace(/\\/g, "/");
  const assetId = randomUUID();
  const db = getDb();
  await db.insert(mediaAssets).values({
    id: assetId,
    projectId: params.kind === "sticker" ? null : (params.projectId ?? null),
    type: params.kind,
    filename,
    path: relativePath,
    mimeType: "image/png",
    createdAt: new Date().toISOString(),
  });

  if (params.kind === "wallpaper" && params.projectId) {
    const { updateProject } = await import("@/lib/config/writer");
    await updateProject(params.projectId, { wallpaperPath: relativePath });
  }
  if (params.kind === "conditions" && params.projectId) {
    const { updateProject } = await import("@/lib/config/writer");
    await updateProject(params.projectId, { conditionsImagePath: relativePath });
  }
  if (params.kind === "avatar" && params.projectId) {
    const { updateProject } = await import("@/lib/config/writer");
    await updateProject(params.projectId, { clientAvatarPath: relativePath });
  }

  await logger.info("AI scene media generated", {
    kind: params.kind,
    path: relativePath,
    projectId: params.projectId ?? null,
    reviewId: params.reviewId ?? null,
    model: env.OPENAI_IMAGE_MODEL,
  });

  return { path: relativePath, filename, assetId };
}
