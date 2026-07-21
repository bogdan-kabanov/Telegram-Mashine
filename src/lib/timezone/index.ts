const TZ = "America/Mexico_City";

export function getMexicoCityParts(date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    dayOfWeek: weekdayMap[get("weekday")] ?? 0,
  };
}

export function formatMexicoDateTime(date = new Date()): { date: string; time: string } {
  return {
    date: date.toLocaleDateString("es-MX", {
      timeZone: TZ,
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("es-MX", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export function getMexicoMinutesSinceMidnight(date = new Date()): number {
  const p = getMexicoCityParts(date);
  return p.hour * 60 + p.minute;
}

export function getMexicoDateKey(date = new Date()): string {
  const p = getMexicoCityParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function getMexicoWeekKey(date = new Date()): string {
  const p = getMexicoCityParts(date);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

export function isMexicoSlotDue(
  hour: number,
  minute: number,
  now = new Date(),
  windowMinutes = 2,
): boolean {
  const current = getMexicoMinutesSinceMidnight(now);
  const target = hour * 60 + minute;
  return current >= target && current < target + windowMinutes;
}

/** Next occurrence of hour:minute in America/Mexico_City after `from`. */
export function getNextMexicoSlotDate(hour: number, minute: number, from = new Date()): Date {
  let probe = new Date(from.getTime() + 60_000);
  for (let i = 0; i < 60 * 48; i++) {
    const p = getMexicoCityParts(probe);
    if (p.hour === hour && p.minute === minute && probe.getTime() > from.getTime()) {
      return probe;
    }
    probe = new Date(probe.getTime() + 60_000);
  }
  return new Date(from.getTime() + 86_400_000);
}
