import { loadAppConfig } from "@/lib/config/loader";
import type { Currency, GeoConfig, GeoLocale } from "@/lib/schemas";

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
