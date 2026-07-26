import { z } from "zod";

const aiModeSchema = z.enum(["off", "fallback", "always"]);

export const aiSettingsSchema = z.object({
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  OPENAI_IMAGE_MODEL: z.string().min(1).default("gpt-image-1"),
  OPENAI_RECEIPT_IMAGE_MODEL: z.string().min(1).default("gpt-image-1"),
  /** Dialog texts via OpenAI. off = script/templates only (free). */
  AI_DIALOG: z.enum(["off", "on"]).default("on"),
  AI_CLIENT_PHOTOS: aiModeSchema.default("fallback"),
  AI_RECEIPTS: aiModeSchema.default("fallback"),
  AI_MEDIA: aiModeSchema.default("fallback"),
});

export type AiSettings = z.infer<typeof aiSettingsSchema>;

export type AiSettingsPublic = Omit<AiSettings, "OPENAI_API_KEY"> & {
  hasApiKey: boolean;
  apiKeySource: "settings" | "env" | "none";
  apiKeyHint: string | null;
};

export const CHAT_MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "gpt-4o-mini — дёшево, диалоги" },
  { value: "gpt-4o", label: "gpt-4o — качественнее" },
  { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
  { value: "gpt-4.1", label: "gpt-4.1" },
  { value: "o4-mini", label: "o4-mini" },
] as const;

export const IMAGE_MODEL_OPTIONS = [
  { value: "gpt-image-1", label: "gpt-image-1 — рекомендуется" },
  { value: "dall-e-3", label: "dall-e-3 (может быть недоступна)" },
  { value: "dall-e-2", label: "dall-e-2" },
] as const;

export const RECEIPT_MODEL_OPTIONS = [
  { value: "gpt-image-1", label: "gpt-image-1 — edit по шаблону" },
] as const;

export const AI_MODE_OPTIONS = [
  { value: "off", label: "Выкл" },
  { value: "fallback", label: "Если нет в медиатеке (fallback)" },
  { value: "always", label: "Всегда генерировать" },
] as const;

export const AI_DIALOG_OPTIONS = [
  { value: "on", label: "Вкл (OpenAI тексты)" },
  { value: "off", label: "Выкл — скрипт, без API $" },
] as const;

export function maskApiKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-4)}`;
}
