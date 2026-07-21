import { z } from "zod";

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
  screenshots: z.array(z.string()),
  media: z.array(
    z.object({
      type: z.enum(["receipt", "bet", "video_note", "conditions", "voice"]),
      path: z.string(),
    }),
  ),
  publishedAt: z.string().datetime().nullable(),
});

export type BotStatus = z.infer<typeof botStatusSchema>;
export type RuntimeState = z.infer<typeof runtimeStateSchema>;
export type LogEntry = z.infer<typeof logEntrySchema>;
export type ReviewPackage = z.infer<typeof reviewPackageSchema>;
