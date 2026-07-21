import { z } from "zod";

export const projectThemeSchema = z.object({
  incomingBubble: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  outgoingBubble: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  outgoingBubbleAlt: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  headerBg: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#F7F7F7"),
  statusBarStyle: z.enum(["light", "dark"]).default("dark"),
});

export const projectConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  locale: z.string().min(2),
  currency: z.string().length(3),
  managerName: z.string().min(1),
  managerHandle: z.string().min(1),
  managerAvatarPath: z.string().optional(),
  wallpaperPath: z.string().optional(),
  conditionsImagePath: z.string().optional(),
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
