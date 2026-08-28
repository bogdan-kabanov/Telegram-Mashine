const TZ = "America/Mexico_City";

export interface TimeZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getTimeZoneParts(timeZone: string, date = new Date()): TimeZoneParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    dayOfWeek: WEEKDAY_MAP[get("weekday")] ?? 0,
  };
}

export function getMexicoCityParts(date = new Date()): TimeZoneParts {
  return getTimeZoneParts(TZ, date);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function zonedMinuteKey(p: TimeZoneParts): number {
  return (((p.year * 12 + p.month) * 32 + p.day) * 24 + p.hour) * 60 + p.minute;
}

/** `YYYY-MM-DDTHH:mm` wall clock in the given IANA timezone (for datetime-local inputs). */
export function formatDateTimeLocal(date: Date, timeZone: string): string {
  const p = getTimeZoneParts(timeZone, date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}

/**
 * Interpret `YYYY-MM-DDTHH:mm` as a wall clock in `timeZone` (not the browser's TZ).
 */
export function dateFromZonedLocal(local: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local.trim());
  if (!m) {
    const parsed = new Date(local);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const want = (((year * 12 + month) * 32 + day) * 24 + hour) * 60 + minute;
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let lo = guess - 16 * 3600_000;
  let hi = guess + 16 * 3600_000;
  for (let i = 0; i < 48; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const k = zonedMinuteKey(getTimeZoneParts(timeZone, new Date(mid)));
    if (k === want) {
      let t = mid - 90_000;
      for (let j = 0; j < 180; j++) {
        const d = new Date(t);
        if (zonedMinuteKey(getTimeZoneParts(timeZone, d)) === want) {
          d.setUTCSeconds(0, 0);
          return d;
        }
        t += 1000;
      }
      return new Date(mid);
    }
    if (k < want) lo = mid + 1;
    else hi = mid - 1;
  }
  return new Date(guess);
}

/** 24-hour `HH:mm` in the given IANA timezone. */
export function formatClockTime(timeZone: string, date = new Date()): string {
  const p = getTimeZoneParts(timeZone, date);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function formatLocalDate(
  date: Date,
  options: { timeZone: string; locale: string; dateFormat?: string },
): string {
  const { timeZone, locale, dateFormat = "" } = options;
  if (/dd\/MM\/yyyy/i.test(dateFormat)) {
    const p = getTimeZoneParts(timeZone, date);
    return `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}/${p.year}`;
  }

  const localeTag = locale.toLowerCase().startsWith("ru") ? "ru-RU" : locale || "es-MX";
  return date.toLocaleDateString(localeTag, {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatLocalDateTime(
  date: Date,
  options: { timeZone: string; locale: string; dateFormat?: string },
): { date: string; time: string } {
  return {
    date: formatLocalDate(date, options),
    time: formatClockTime(options.timeZone, date),
  };
}

export function formatMexicoDateTime(date = new Date()): { date: string; time: string } {
  return formatLocalDateTime(date, {
    timeZone: TZ,
    locale: "es-MX",
    dateFormat: "d 'de' MMMM yyyy",
  });
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
