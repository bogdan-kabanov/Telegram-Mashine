import { getCachedAppConfig, loadAppConfig } from "@/lib/config/loader";
import type { Currency, GeoConfig, GeoLocale } from "@/lib/schemas";

export interface LocaleClockConfig {
  locale: string;
  timeZone: string;
  dateFormat: string;
}

const FALLBACK_CLOCK: Record<string, { timeZone: string; dateFormat: string }> = {
  "es-MX": { timeZone: "America/Mexico_City", dateFormat: "d 'de' MMMM yyyy" },
  "es-AR": { timeZone: "America/Argentina/Buenos_Aires", dateFormat: "d 'de' MMMM yyyy" },
  "es-VE": { timeZone: "America/Caracas", dateFormat: "dd/MM/yyyy" },
  "ru-RU": { timeZone: "Europe/Moscow", dateFormat: "d MMMM yyyy" },
};

export interface LocaleProfile {
  locale: string;
  name: string;
  timezone: string;
  currency: string;
  bankCountry: string;
  dateFormat: string;
  timeFormat: string;
  currencyMeta: Currency | null;
}

export function resolveLocaleProfileFromConfig(geo: GeoConfig, locale: string): GeoLocale {
  const code = locale.trim();
  const entry = geo.locales.find((l) => l.code === code);
  if (!entry) {
    const known = geo.locales.map((l) => l.code).join(", ");
    throw new Error(`Unknown locale "${code}". Known: ${known}`);
  }
  return entry;
}

export async function resolveLocaleProfile(locale: string): Promise<LocaleProfile> {
  const config = await loadAppConfig();
  const entry = resolveLocaleProfileFromConfig(config.geo, locale);
  const currencyMeta =
    config.currencies.currencies.find((c) => c.code === entry.currency) ?? null;
  return {
    locale: entry.code,
    name: entry.name,
    timezone: entry.timezone,
    currency: entry.currency,
    bankCountry: entry.bankCountry,
    dateFormat: entry.dateFormat,
    timeFormat: entry.timeFormat,
    currencyMeta,
  };
}

export function listLocalesFromConfig(geo: GeoConfig): Array<{
  code: string;
  name: string;
  currency: string;
  bankCountry: string;
}> {
  return geo.locales.map((l) => ({
    code: l.code,
    name: l.name,
    currency: l.currency,
    bankCountry: l.bankCountry,
  }));
}

/** Timezone + date pattern for chat bubbles, status bar, and bank slips. */
export function localeClockConfig(locale: string | null | undefined): LocaleClockConfig {
  const code = (locale ?? "es-MX").trim() || "es-MX";
  const cached = getCachedAppConfig()?.geo.locales.find((l) => l.code === code);
  if (cached) {
    return { locale: cached.code, timeZone: cached.timezone, dateFormat: cached.dateFormat };
  }
  const fallback = FALLBACK_CLOCK[code] ?? FALLBACK_CLOCK["es-MX"]!;
  return { locale: code, timeZone: fallback.timeZone, dateFormat: fallback.dateFormat };
}
