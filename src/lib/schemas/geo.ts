import { z } from "zod";

export const geoLocaleSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(1),
  timezone: z.string().min(1),
  currency: z.string().length(3),
  /** ISO country for banks.json filtering (MX / AR / VE / RU). */
  bankCountry: z.string().length(2),
  dateFormat: z.string().min(1),
  timeFormat: z.string().min(1),
});

export const geoConfigSchema = z.object({
  defaultLocale: z.string().min(2),
  locales: z.array(geoLocaleSchema),
  clientNamePools: z.record(z.string(), z.array(z.string().min(1))),
});

export type GeoLocale = z.infer<typeof geoLocaleSchema>;
export type GeoConfig = z.infer<typeof geoConfigSchema>;
