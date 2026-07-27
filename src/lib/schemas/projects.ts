import { z } from "zod";

export const projectThemeSchema = z.object({
  incomingBubble: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  outgoingBubble: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  outgoingBubbleAlt: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  headerBg: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#F7F7F7"),
  /** Optional second stop for header gradient (Telegram-like). */
  headerBgEnd: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  statusBarStyle: z.enum(["light", "dark"]).default("light"),
});

/** HTML fallback style when AI receipt generation is unavailable. */
export const receiptStyleSchema = z.enum([
  "spin",
  "mercado_pago",
  "okx",
  "bbva",
  "generic",
]);

/** Reference JPG/PNG filenames under data/media/receipt_templates/{projectId}/ */
export const receiptTemplatesSchema = z.object({
  /** Captura (client → manager deposit proof). */
  client: z.array(z.string().min(1)).min(1),
  /** Receipt (manager → client payout proof). */
  manager: z.array(z.string().min(1)).min(1),
});

export const projectConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  locale: z.string().min(2),
  currency: z.string().length(3),
  managerName: z.string().min(1),
  managerHandle: z.string().min(1),
  managerAvatarPath: z.string().optional(),
  /** Client photo in chat header (from media library). */
  clientAvatarPath: z.string().optional(),
  wallpaperPath: z.string().optional(),
  conditionsImagePath: z.string().optional(),
  /**
   * Exact manager message(s) for the conditions stage (Vlad copy).
   * When set, these replace AI-generated conditions text.
   * Image still sent separately if conditionsImagePath / media exists.
   */
  conditionsTexts: z.array(z.string().min(1)).optional(),
  /**
   * Exact captions after bet_1 / bet_2 / bet_3 screenshots (Vlad copy).
   * Supports {{profit1}}, {{profit2}}, {{profitFinal}}, {{deposit}},
   * {{commission}}, {{clientShare}} (Francesca 10%/90%).
   */
  betCaptionTemplates: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]).optional(),
  /** Telegram addtheme id (t.me/addtheme/...). */
  telegramThemeId: z.string().optional(),
  /** Preferred HTML fallback look (overrides bank mapping when set). */
  receiptStyle: receiptStyleSchema.optional(),
  capturaStyle: receiptStyleSchema.optional(),
  /** Per-role AI reference templates (Vlad rules: which slips client vs manager may use). */
  receiptTemplates: receiptTemplatesSchema.optional(),
  theme: projectThemeSchema,
  depositMessageTemplate: z.string().min(1),
  completionMessageTemplate: z.string().min(1),
  payoutMessageTemplate: z.string().min(1),
  twoPhaseReview: z.boolean().default(false),
  phaseDelayMinutes: z.number().int().positive().optional(),
});

export const projectsConfigSchema = z.object({
  projects: z.array(projectConfigSchema).min(1),
});

export type ProjectTheme = z.infer<typeof projectThemeSchema>;
export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type ProjectsConfig = z.infer<typeof projectsConfigSchema>;
export type ReceiptTemplates = z.infer<typeof receiptTemplatesSchema>;
