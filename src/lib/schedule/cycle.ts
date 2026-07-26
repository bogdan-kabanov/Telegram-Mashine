import type { ScheduleConfig, ScheduleSlot } from "@/lib/schemas";
import { getMexicoCityParts, getMexicoWeekKey } from "@/lib/timezone";

/** Monday (Mexico) of the ISO week containing `date`. */
export function getMexicoWeekMondayKey(date = new Date()): string {
  const p = getMexicoCityParts(date);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 1 - dayNum);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Days between two YYYY-MM-DD keys (UTC date math). */
export function daysBetweenDateKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ta = Date.UTC(ay!, am! - 1, ad!);
  const tb = Date.UTC(by!, bm! - 1, bd!);
  return Math.floor((tb - ta) / 86_400_000);
}

/**
 * 0-based index inside the N-week rotation.
 * Epoch is the Monday of the week that starts cycle week 0.
 */
export function getCycleWeekIndex(
  date: Date,
  cycleWeeks: number,
  cycleEpochDate?: string,
): number {
  const weeks = Math.max(1, cycleWeeks);
  const currentMonday = getMexicoWeekMondayKey(date);
  const epochMonday = cycleEpochDate
    ? getMexicoWeekMondayKey(new Date(`${cycleEpochDate}T12:00:00Z`))
    : currentMonday;
  const weekDiff = Math.floor(daysBetweenDateKeys(epochMonday, currentMonday) / 7);
  return ((weekDiff % weeks) + weeks) % weeks;
}

export function getActiveScheduleSlots(config: ScheduleConfig, date = new Date()): ScheduleSlot[] {
  const cycleWeeks = config.cycleWeeks ?? 3;
  const weeks = config.weeks;

  if (weeks && weeks.length > 0) {
    const index = getCycleWeekIndex(date, Math.min(cycleWeeks, weeks.length), config.cycleEpochDate);
    return weeks[index]?.slots ?? weeks[0]!.slots;
  }

  return config.slots ?? [];
}

export function getActiveCycleWeekInfo(config: ScheduleConfig, date = new Date()): {
  weekIndex: number;
  label: string;
  isoWeek: string;
  slots: ScheduleSlot[];
} {
  const cycleWeeks = config.cycleWeeks ?? 3;
  const weeks = config.weeks;
  const weekIndex =
    weeks && weeks.length > 0
      ? getCycleWeekIndex(date, Math.min(cycleWeeks, weeks.length), config.cycleEpochDate)
      : 0;
  const slots = getActiveScheduleSlots(config, date);
  const label = weeks?.[weekIndex]?.label ?? `Неделя ${weekIndex + 1}`;

  return {
    weekIndex,
    label,
    isoWeek: getMexicoWeekKey(date),
    slots,
  };
}
