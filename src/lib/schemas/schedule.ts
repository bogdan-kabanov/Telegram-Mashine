import { z } from "zod";

export const scheduleSlotSchema = z.object({
  id: z.string().min(1),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  reviewType: z.enum(["small", "big", "unique_circle"]),
  projectId: z.string().min(1),
});

export const scheduleWeekSchema = z.object({
  label: z.string().min(1).optional(),
  slots: z.array(scheduleSlotSchema).min(1),
});

export const scheduleConfigSchema = z
  .object({
    timezone: z.string().min(1),
    postsPerDay: z.number().int().positive(),
    phaseDelayMinutes: z.number().int().positive(),
    /**
     * Days before the same bet screenshot may be reused.
     * 0 = no cooldown (only sequential pack walk 1→N→1).
     * Default 5 ≈ Vlad’s pack cycle length.
     */
    /** Real max is dynamic (unique bets ÷ daily usage); 365 is a sanity ceiling. */
    betReuseDays: z.number().int().min(0).max(365).default(5),
    /** Length of the rotating schedule cycle (TZ: 3 weeks). */
    cycleWeeks: z.number().int().min(1).max(12).default(3),
    /** Mexico-local YYYY-MM-DD of any day in cycle week 0 (Monday of that week is used). */
    cycleEpochDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** Flat slots (week 0 / legacy). Used when `weeks` is absent. */
    slots: z.array(scheduleSlotSchema).optional(),
    /** Three-week (or N-week) rotating slot sets. */
    weeks: z.array(scheduleWeekSchema).optional(),
    weeklyUniqueCircle: z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
      /** Prefer this project for weekly unique circle; else rotate. */
      projectId: z.string().min(1).optional(),
    }),
    /**
     * Probability (0–1) that a client voice message appears in a review dialog.
     * Requires voice files in data/media/voices/.
     */
    clientVoiceChance: z.number().min(0).max(1).default(0.25),
  })
  .superRefine((data, ctx) => {
    const hasWeeks = Boolean(data.weeks && data.weeks.length > 0);
    const hasSlots = Boolean(data.slots && data.slots.length > 0);
    if (!hasWeeks && !hasSlots) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "schedule.json must define either `weeks` or `slots`",
        path: ["slots"],
      });
    }
  });

export type ScheduleSlot = z.infer<typeof scheduleSlotSchema>;
export type ScheduleWeek = z.infer<typeof scheduleWeekSchema>;
export type ScheduleConfig = z.infer<typeof scheduleConfigSchema>;
