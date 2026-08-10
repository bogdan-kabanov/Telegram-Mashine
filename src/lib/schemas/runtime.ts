import { z } from "zod";

import { generatedDialogSchema, reviewRenderMediaSchema } from "./dialog";

export const botStatusSchema = z.enum(["running", "paused", "stopped", "error"]);

export const runtimeStateSchema = z.object({
  status: botStatusSchema,
  lastStartedAt: z.string().datetime().nullable(),
  lastPausedAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  totalReviewsGenerated: z.number().int().min(0),
  totalReviewsPublished: z.number().int().min(0),
  currentPhase: z.enum(["idle", "phase_1", "phase_2", "generating"]).default("idle"),
  updatedAt: z.string().datetime(),
});

export const logEntrySchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().datetime(),
  level: z.enum(["info", "warn", "error", "debug"]),
  module: z.string().min(1),
  message: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export const reviewPackageSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  scenarioId: z.string().min(1),
  amountPackId: z.string().min(1),
  clientName: z.string().min(1),
  createdAt: z.string().datetime(),
  phase: z.enum(["partial", "complete"]),
  reviewType: z.enum(["small", "big", "unique_circle"]).default("big"),
  pinVideoNote: z.boolean().default(false),
  screenshots: z.array(z.string()),
  media: z.array(
    z.object({
      type: z.enum(["receipt", "bet", "video_note", "conditions", "voice", "photo"]),
      path: z.string(),
    }),
  ),
  publishedAt: z.string().datetime().nullable(),
  /** Full dialog for preview / edit / re-render (optional on older packages). */
  dialog: generatedDialogSchema.optional(),
  /** Media paths for ChatRenderer re-render. */
  renderMedia: reviewRenderMediaSchema.optional(),
  /** Operator RU translations keyed by message id (does not affect screenshots). */
  dialogTranslations: z.record(z.string()).optional(),
});

export type BotStatus = z.infer<typeof botStatusSchema>;
export type RuntimeState = z.infer<typeof runtimeStateSchema>;
export type LogEntry = z.infer<typeof logEntrySchema>;
export type ReviewPackage = z.infer<typeof reviewPackageSchema>;
