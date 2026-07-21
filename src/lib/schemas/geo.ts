import { z } from "zod";

export const geoConfigSchema = z.object({
  defaultLocale: z.string().min(2),
  locales: z.array(
    z.object({
      code: z.string().min(2),
      name: z.string().min(1),
      timezone: z.string().min(1),
      currency: z.string().length(3),
      dateFormat: z.string().min(1),
      timeFormat: z.string().min(1),
    }),
  ),
  clientNamePools: z.record(z.string(), z.array(z.string().min(1))),
});

export type GeoConfig = z.infer<typeof geoConfigSchema>;
