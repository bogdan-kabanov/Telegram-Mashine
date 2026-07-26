import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { createLogger } from "@/lib/runtime/manager";
import { getEnv } from "@/lib/schemas/env";
import { getOpenAIClient, isOpenAIConfigured } from "./client";
import { generateImagePngBase64 } from "./generate-image";

const logger = createLogger("openai-images");

const FEMALE_NAME_HINTS =
  /a$|ia$|na$|ra$|la$|sa$|ta$|da|ela|isa|ana|maria|sofia|valeria|nancy|maya|luna|carmen|rosa|lucia|paola|andrea|gabriela|fernanda|alejandra|daniela|camila|isabel|laura|monica|patricia|veronica|adriana|carolina|jessica|jennifer|grisel|melissa|francesca|анна|мария|елена|ольга|наталья|ирина|татьяна|светлана|екатерина|юлия|алина|дария|софия/i;

export type AiClientPhotoMode = "off" | "fallback" | "always";

export type ClientPhotoScene = "hospital_relative" | "hospital_self" | "injury_home" | "hardship_selfie";

export function getAiClientPhotoMode(): AiClientPhotoMode {
  return getEnv().AI_CLIENT_PHOTOS;
}

export function isAiClientPhotoEnabled(): boolean {
  return getAiClientPhotoMode() !== "off" && isOpenAIConfigured();
}

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

function isMedicalHint(hint: string): boolean {
  return /hospital|enferm|operaci|medic|cirug|c[aá]ncer|cancer|lesion|tratamiento|deuda m[eé]dica|urgenc|medicament|больн|операц|лекарств|лечен|ранен|травм|болезн|хирург|палат|реанимац|инсульт|инфаркт/i.test(
    hint,
  );
}

function relativeGenderFromHint(hint: string): "man" | "woman" {
  if (/madre|mam[aá]|mama|abuela|hermana|t[ií]a|esposa|wife|мать|мама|бабушк|сестр|жена|тётя|тетя/i.test(hint)) {
    return "woman";
  }
  if (/padre|pap[aá]|papa|abuelo|hermano|t[ií]o|esposo|husband|отец|папа|дедушк|брат|муж|дяд/i.test(hint)) {
    return "man";
  }
  return Math.random() < 0.65 ? "man" : "woman";
}

/** Pick a story-proof scene from legend/problem text. Medical → hospital photo by default. */
export function detectClientPhotoScene(hint?: string): ClientPhotoScene {
  const h = (hint ?? "").trim();
  if (!h) return "hospital_relative";

  const medical = isMedicalHint(h);
  const hasRelative =
    /padre|pap[aá]|mama|madre|abuel|herman|famili|espos|hijo|hija|отец|папа|мама|мать|бабушк|дедушк|семь|брат|сестр|муж|жена|сын|дочь/i.test(
      h,
    );

  if (medical && hasRelative) return "hospital_relative";
  if (medical && /me lesion|me lastim|me oper|я травм|я ран|мне нужн.*операц|yo estoy|estoy enfermo|болею|меня положили/i.test(h)) {
    return "hospital_self";
  }
  if (medical) return "hospital_relative";
  if (/lesion|lastim|fractur|yeso|cast|травм|перелом|гипс/i.test(h)) return "injury_home";
  return "hardship_selfie";
}

function pickHospitalVariant(patient: "man" | "woman", age: number, region: string): string {
  const variants = [
    [
      `Photorealistic candid smartphone photo of a ${region} ${patient} about ${age} years old lying flat on their back in a hospital bed.`,
      "Eyes closed or half-open, looks unwell/weak. White medical bandage wrapped around the forehead.",
      "Several white circular ECG electrode pads on the bare chest with thin gray wires.",
      "Plain off-white hospital wall behind, metal bed rail visible on one side.",
      "Framed from waist up, slightly low-resolution family phone photo, natural hospital lighting.",
    ].join(" "),
    [
      `Photorealistic smartphone photo of a sick ${region} ${patient} (~${age}) in a hospital bed under a thin blanket.`,
      "Pale face, IV drip line visible near the arm, hospital gown, tired expression.",
      "Clinical room, plain wall, no staff faces in frame.",
      "Looks like a real relative photo sent in a Telegram chat, mild phone compression.",
    ].join(" "),
    [
      `Candid phone photo of an ill ${region} ${patient} about ${age} lying in a hospital bed with monitoring pads on the chest.`,
      "Head resting on a pillow, eyes closed, bandage or gauze on the forehead, weak appearance.",
      "Hospital bed rails, sterile room, realistic skin texture, no beauty filters.",
    ].join(" "),
  ];
  return variants[Math.floor(Math.random() * variants.length)]!;
}

/**
 * Build OpenAI Images prompt for a unique client story photo.
 * Prefer hospital / illness proof shots when the legend is medical (product default).
 */
export function buildClientPhotoPrompt(params: {
  clientName?: string;
  hint?: string;
  locale?: string;
}): string {
  const region = regionLabel(params.locale);
  const hint = params.hint?.trim() ?? "";
  const scene = detectClientPhotoScene(hint);
  const storyLine = hint
    ? ` Story context to match: ${hint.slice(0, 220)}.`
    : " Story context: sick family member needs expensive surgery and medicine.";

  const common =
    "No logos, no watermarks, no text, no UI overlays, no timestamps. Single main subject. Looks like a real Telegram chat attachment.";

  if (scene === "hospital_relative" || scene === "hospital_self") {
    const patientGender =
      scene === "hospital_self" ? guessGender(params.clientName) : relativeGenderFromHint(hint);
    const age =
      scene === "hospital_self"
        ? 28 + Math.floor(Math.random() * 25)
        : 48 + Math.floor(Math.random() * 22);
    return `${pickHospitalVariant(patientGender, age, region)} ${common}${storyLine}`;
  }

  if (scene === "injury_home") {
    const gender = guessGender(params.clientName);
    const age = 25 + Math.floor(Math.random() * 20);
    return [
      `Photorealistic smartphone photo of a ${region} ${gender} about ${age} years old at home with a visible injury (bandage, cast, or braced limb).`,
      "Candid documentary style, not a polished selfie, slight phone noise.",
      common + storyLine,
    ].join(" ");
  }

  const gender = guessGender(params.clientName);
  const age = 22 + Math.floor(Math.random() * 18);
  return [
    `Photorealistic smartphone selfie of a worried ${region} ${gender}, about ${age} years old, indoor, plain background.`,
    "Tired/stressed expression matching a money hardship story, natural skin, realistic lighting.",
    common + storyLine,
  ].join(" ");
}

/**
 * Generate a unique client story photo via OpenAI Images and save it to the shared pool.
 */
export async function generateClientPhoto(params: {
  projectId?: string | null;
  reviewId?: string | null;
  clientName?: string;
  hint?: string;
  locale?: string;
  /** Save into pool (reusable until used) vs mark path only for immediate use. */
  saveToPool?: boolean;
}): Promise<{ path: string; filename: string; assetId: string } | null> {
  const client = getOpenAIClient();
  if (!client) {
    await logger.warn("OpenAI not configured — cannot generate client photo");
    return null;
  }

  const env = getEnv();
  const prompt = buildClientPhotoPrompt({
    ...(params.clientName ? { clientName: params.clientName } : {}),
    ...(params.hint ? { hint: params.hint } : {}),
    ...(params.locale ? { locale: params.locale } : {}),
  });

  try {
    const { b64, model } = await generateImagePngBase64(prompt);

    const dataDir = env.DATA_DIR;
    const folder = "pool";
    const filename = `ai_${Date.now()}_${randomUUID().slice(0, 8)}.png`;
    const destDir = path.resolve(dataDir, "media/story_photos", folder);
    mkdirSync(destDir, { recursive: true });
    const absPath = path.join(destDir, filename);
    writeFileSync(absPath, Buffer.from(b64, "base64"));

    const relativePath = `data/media/story_photos/${folder}/${filename}`;
    const assetId = randomUUID();

    if (params.saveToPool !== false) {
      const db = getDb();
      await db.insert(mediaAssets).values({
        id: assetId,
        projectId: params.projectId ?? null,
        type: "story_photo",
        filename,
        path: relativePath,
        mimeType: "image/png",
        createdAt: new Date().toISOString(),
      });
    }

    await logger.info("AI client photo generated", {
      path: relativePath,
      model,
      scene: detectClientPhotoScene(params.hint),
      reviewId: params.reviewId ?? null,
    });

    return { path: relativePath, filename, assetId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown image error";
    await logger.warn("AI client photo generation failed", { error: message });
    return null;
  }
}
