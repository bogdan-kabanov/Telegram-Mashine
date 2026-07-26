import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

import {
  aiSettingsSchema,
  maskApiKey,
  type AiSettings,
  type AiSettingsPublic,
} from "./ai-settings-shared";

export type { AiSettings, AiSettingsPublic };
export {
  aiSettingsSchema,
  AI_MODE_OPTIONS,
  CHAT_MODEL_OPTIONS,
  IMAGE_MODEL_OPTIONS,
  RECEIPT_MODEL_OPTIONS,
  maskApiKey,
} from "./ai-settings-shared";

function settingsPath(): string {
  const configDir = process.env.CONFIG_DIR ?? "./config";
  return path.resolve(configDir, "ai-settings.json");
}

function readRawFile(): Record<string, unknown> | null {
  const file = settingsPath();
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function loadAiSettings(): AiSettings {
  const raw = readRawFile();
  if (!raw) return aiSettingsSchema.parse({});
  try {
    return aiSettingsSchema.parse(raw);
  } catch {
    return aiSettingsSchema.parse({});
  }
}

/** Flat env overrides applied on top of process.env in getEnv(). */
export function getAiSettingsEnvOverrides(): Record<string, string> {
  const raw = readRawFile();
  if (!raw) return {};
  const keys = [
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "OPENAI_IMAGE_MODEL",
    "OPENAI_RECEIPT_IMAGE_MODEL",
    "AI_DIALOG",
    "AI_CLIENT_PHOTOS",
    "AI_RECEIPTS",
    "AI_MEDIA",
  ] as const;
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return out;
}

/**
 * Save settings. OPENAI_API_KEY:
 * - omit / undefined → keep previously stored key
 * - "" → clear stored key (fall back to .env)
 * - non-empty → replace stored key
 */
export function saveAiSettings(patch: Record<string, unknown>): AiSettings {
  const current = loadAiSettings();
  const nextPatch = { ...patch };
  if (!Object.prototype.hasOwnProperty.call(patch, "OPENAI_API_KEY")) {
    delete nextPatch.OPENAI_API_KEY;
  } else if (typeof patch.OPENAI_API_KEY === "string") {
    nextPatch.OPENAI_API_KEY = patch.OPENAI_API_KEY.trim();
  }

  const next = aiSettingsSchema.parse({
    ...current,
    ...nextPatch,
    OPENAI_API_KEY:
      Object.prototype.hasOwnProperty.call(patch, "OPENAI_API_KEY")
        ? String(nextPatch.OPENAI_API_KEY ?? "").trim()
        : current.OPENAI_API_KEY ?? "",
  });

  const file = settingsPath();
  mkdirSync(path.dirname(file), { recursive: true });

  const toWrite: Record<string, unknown> = { ...next };
  if (!next.OPENAI_API_KEY) {
    delete toWrite.OPENAI_API_KEY;
  }

  writeFileSync(file, `${JSON.stringify(toWrite, null, 2)}\n`, "utf-8");
  return next;
}

export function effectiveAiSettingsFromEnv(env: {
  OPENAI_MODEL: string;
  OPENAI_IMAGE_MODEL: string;
  OPENAI_RECEIPT_IMAGE_MODEL: string;
  AI_DIALOG: "off" | "on";
  AI_CLIENT_PHOTOS: "off" | "fallback" | "always";
  AI_RECEIPTS: "off" | "fallback" | "always";
  AI_MEDIA: "off" | "fallback" | "always";
  OPENAI_API_KEY?: string | undefined;
}): AiSettingsPublic {
  const stored = loadAiSettings().OPENAI_API_KEY?.trim() ?? "";
  const envKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const effective = env.OPENAI_API_KEY?.trim() ?? "";

  let apiKeySource: AiSettingsPublic["apiKeySource"] = "none";
  if (stored) apiKeySource = "settings";
  else if (envKey) apiKeySource = "env";

  return {
    OPENAI_MODEL: env.OPENAI_MODEL,
    OPENAI_IMAGE_MODEL: env.OPENAI_IMAGE_MODEL,
    OPENAI_RECEIPT_IMAGE_MODEL: env.OPENAI_RECEIPT_IMAGE_MODEL,
    AI_DIALOG: env.AI_DIALOG,
    AI_CLIENT_PHOTOS: env.AI_CLIENT_PHOTOS,
    AI_RECEIPTS: env.AI_RECEIPTS,
    AI_MEDIA: env.AI_MEDIA,
    hasApiKey: Boolean(effective),
    apiKeySource,
    apiKeyHint: maskApiKey(stored || envKey),
  };
}
