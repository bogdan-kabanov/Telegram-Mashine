import { z } from "zod";

export const amountPackSchema = z.object({
  id: z.string().min(1),
  /** When set, pack is only used by this project (Vlad: own amount pool per manager). */
  projectId: z.string().min(1).optional(),
  /**
   * 1-based bet image pack index (`packNN_1/2/3.jpg`).
   * When set (or inferred from id suffix `_NN`), dialog amounts stay 1:1 with those screenshots.
   */
  betPack: z.number().int().positive().optional(),
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

/** Explicit `betPack` or trailing `_NN` in id (e.g. nancy_03 → 3). */
export function resolveBetPackNumber(pack: AmountPack): number | null {
  if (typeof pack.betPack === "number" && pack.betPack > 0) {
    return Math.floor(pack.betPack);
  }
  const m = pack.id.match(/_(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Amount row bound to a bet image pack; falls back to modular wrap if counts differ. */
export function findAmountPackForBetPack(
  packs: AmountPack[],
  betPack: number,
): AmountPack | null {
  if (packs.length === 0 || betPack < 1) return null;
  const exact = packs.find((p) => resolveBetPackNumber(p) === betPack);
  if (exact) return exact;
  const indexed = packs
    .map((p) => ({ p, n: resolveBetPackNumber(p) }))
    .filter((x): x is { p: AmountPack; n: number } => x.n != null)
    .sort((a, b) => a.n - b.n);
  if (indexed.length === 0) {
    return packs[(betPack - 1) % packs.length] ?? null;
  }
  return indexed[(betPack - 1) % indexed.length]!.p;
}
