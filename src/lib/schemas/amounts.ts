import { z } from "zod";

export const amountPackSchema = z.object({
  id: z.string().min(1),
  deposit: z.number().positive(),
  profit1: z.number().positive(),
  profit2: z.number().positive(),
  profitFinal: z.number().positive(),
  currency: z.string().length(3),
});

export const amountsConfigSchema = z.object({
  packs: z.array(amountPackSchema).min(1),
  accountLastDigits: z.object({
    min: z.number().int().min(1000).max(9999),
    max: z.number().int().min(1000).max(9999),
  }),
});

export type AmountPack = z.infer<typeof amountPackSchema>;
export type AmountsConfig = z.infer<typeof amountsConfigSchema>;
