import { z } from "zod";

export const amountPackSchema = z.object({
  id: z.string().min(1),
  /** When set, pack is only used by this project (Vlad: own amount pool per manager). */
  projectId: z.string().min(1).optional(),
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

/** Prefer project-scoped packs; else currency match without projectId. */
export function selectAmountPacksForProject(
  packs: AmountPack[],
  projectId: string,
  currency: string,
): AmountPack[] {
  const scoped = packs.filter((p) => p.projectId === projectId);
  if (scoped.length > 0) return scoped;
  return packs.filter((p) => p.currency === currency && !p.projectId);
}
