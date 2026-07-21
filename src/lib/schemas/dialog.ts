import { z } from "zod";

export const messageRoleSchema = z.enum(["client", "manager"]);

export const messageTypeSchema = z.enum([
  "text",
  "image",
  "captura",
  "sticker",
  "voice",
  "video_note",
  "receipt",
  "conditions",
  "bet",
]);

export const dialogMessageSchema = z.object({
  id: z.string().min(1),
  role: messageRoleSchema,
  type: messageTypeSchema,
  content: z.string(),
  delayMinutes: z.number().int().min(0).default(0),
  metadata: z.record(z.unknown()).optional(),
});

export const dialogScriptSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  legendId: z.string().min(1),
  stage: z.enum([
    "greeting",
    "trust_building",
    "conditions",
    "deposit",
    "bet_1",
    "bet_2",
    "bet_3",
    "completion",
    "payout",
    "gratitude",
  ]),
  messages: z.array(dialogMessageSchema),
});

export const clientLegendSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  locale: z.string().min(2),
  openingPhrase: z.string().min(1).optional(),
  problem: z.string().min(1),
  motivation: z.string().min(1),
  gratitudePhrases: z.array(z.string().min(1)).min(1),
  doubtPhrases: z.array(z.string().min(1)).min(1),
  /** Insert client photo after this problem sentence (0-based). Default: after first sentence. */
  photoAfterProblemIndex: z.number().int().min(0).optional(),
});

export const scenarioSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  legendIds: z.array(z.string().min(1)).min(1),
  enabled: z.boolean().default(true),
});

export type MessageRole = z.infer<typeof messageRoleSchema>;
export type MessageType = z.infer<typeof messageTypeSchema>;
export type DialogMessage = z.infer<typeof dialogMessageSchema>;
export type DialogScript = z.infer<typeof dialogScriptSchema>;
export type ClientLegend = z.infer<typeof clientLegendSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
