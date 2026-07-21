import { z } from "zod";

export const currencySchema = z.object({
  code: z.string().length(3),
  symbol: z.string().min(1),
  name: z.string().min(1),
  decimals: z.number().int().min(0).max(4),
  format: z.object({
    thousandSeparator: z.string(),
    decimalSeparator: z.string(),
    symbolPosition: z.enum(["before", "after"]),
  }),
});

export const currenciesConfigSchema = z.object({
  default: z.string().length(3),
  currencies: z.array(currencySchema).min(1),
});

export type Currency = z.infer<typeof currencySchema>;
export type CurrenciesConfig = z.infer<typeof currenciesConfigSchema>;
