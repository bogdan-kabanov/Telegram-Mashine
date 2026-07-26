import { z } from "zod";

import { getAiSettingsEnvOverrides } from "@/lib/config/ai-settings";

export const envSchema = z.object({  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(8, "TELEGRAM_WEBHOOK_SECRET must be at least 8 chars"),
  TELEGRAM_ADMIN_IDS: z
    .string()
    .min(1)
    .transform((val) =>
      val
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => {
          const parsed = Number(id);
          if (!Number.isInteger(parsed)) {
            throw new Error(`Invalid admin ID: ${id}`);
          }
          return parsed;
        }),
    ),
  TELEGRAM_PUBLISH_CHANNEL_ID: z.string().min(1),
  APP_URL: z.string().url("APP_URL must be a valid URL"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_PATH: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  /** Images model for AI client photos / scene media (gpt-image-1 preferred). */
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-1"),
  /**
   * Model for bank receipt edits from reference templates.
   * Prefer gpt-image-1 (supports images.edit + reference fidelity).
   */
  OPENAI_RECEIPT_IMAGE_MODEL: z.string().default("gpt-image-1"),
  /**
   * AI client photos: off | fallback (when pool empty) | always (generate every review).
   * Requires OPENAI_API_KEY.
   */
  AI_CLIENT_PHOTOS: z.enum(["off", "fallback", "always"]).default("fallback"),
  /**
   * AI bank receipts from reference templates:
   * off = HTML Playwright only;
   * fallback = AI when templates+key exist, else HTML;
   * always = AI required (HTML only if AI fails).
   */
  AI_RECEIPTS: z.enum(["off", "fallback", "always"]).default("fallback"),
  /**
   * AI for bets / conditions / stickers / avatars:
   * off | fallback (when library empty) | always (generate fresh each review).
   * Video notes (кружки) are still upload-only — no image API for MP4.
   */
  AI_MEDIA: z.enum(["off", "fallback", "always"]).default("fallback"),
  /**
   * AI dialog generation (client/manager texts):
   * on = OpenAI full dialog bundle; off = local manager script only (no text API $).
   */
  AI_DIALOG: z.enum(["off", "on"]).default("on"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATA_DIR: z.string().default("./data"),
  CONFIG_DIR: z.string().default("./config"),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  // Runtime AI settings (admin panel) override .env values.
  const merged = { ...process.env, ...getAiSettingsEnvOverrides() };
  const result = envSchema.safeParse(merged);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Environment validation failed:\n${errors}`);
  }
  cachedEnv = result.data;
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}

export function getLocalAppUrl(): string {
  const env = getEnv();
  return `http://localhost:${env.PORT}`;
}
