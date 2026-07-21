import { z } from "zod";

export const scheduleSlotSchema = z.object({
  id: z.string().min(1),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  reviewType: z.enum(["small", "big", "unique_circle"]),
  projectId: z.string().min(1),
});

export const scheduleConfigSchema = z.object({
  timezone: z.string().min(1),
  postsPerDay: z.number().int().positive(),
  phaseDelayMinutes: z.number().int().positive(),
  slots: z.array(scheduleSlotSchema),
  weeklyUniqueCircle: z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
});

export type ScheduleSlot = z.infer<typeof scheduleSlotSchema>;
export type ScheduleConfig = z.infer<typeof scheduleConfigSchema>;
