/** Operator-defined amounts decoupled from config/amounts.json bet packs. */

export type CustomAmounts = {
  /** Initial bank transfer to OKX — also the stake on bet 1. */
  deposit: number;
  /** Per-bet OKX stake (reinvestment model). Optional — computed when omitted. */
  deposit1?: number;
  deposit2?: number;
  deposit3?: number;
  profit1: number;
  profit2: number;
  /** Third bet screenshot profit — portion of total, not the cumulative total. */
  profit3: number;
  /** Total earned across all bets (sum of profit1+profit2+profit3). Used in dialog / payout. */
  profitFinal: number;
};

/** Progressive split shares that sum to 1 (25% → 35% → 40%). */
const PROGRESSION = [0.25, 0.35, 0.4] as const;

function roundMoney(n: number): number {
  return Math.max(1, Math.round(n));
}

/** Round deposit to a "nice" figure for bank / OKX screenshots. */
function roundNiceDeposit(n: number): number {
  const v = Math.max(1, n);
  if (v < 50) return Math.round(v);
  if (v < 500) return Math.round(v / 10) * 10;
  if (v < 5_000) return Math.round(v / 50) * 50;
  if (v < 50_000) return Math.round(v / 100) * 100;
  return Math.round(v / 250) * 250;
}

/**
 * Default deposit ≈2% of total profit, clamped to 1–5% after nice rounding.
 * E.g. 125000 → 2500 MXN; 10000 → 200.
 */
export function inferDefaultDeposit(profitFinal: number): number {
  if (!Number.isFinite(profitFinal) || profitFinal <= 0) return 1;

  const target = profitFinal * 0.02;
  const min = profitFinal * 0.01;
  const max = profitFinal * 0.05;

  let deposit = roundNiceDeposit(target);
  const minNice = roundNiceDeposit(min);
  const maxNice = roundNiceDeposit(max);

  deposit = Math.max(minNice, Math.min(maxNice, deposit));
  return Math.max(1, deposit);
}

/** Profit shown on a bet screenshot (slot 1–3). */
export function betProfitForSlot(
  amounts: Pick<CustomAmounts, "profit1" | "profit2" | "profit3" | "profitFinal">,
  slot: 1 | 2 | 3,
): number {
  if (slot === 1) return amounts.profit1;
  if (slot === 2) return amounts.profit2;
  if (amounts.profit3 > 0) return amounts.profit3;
  // Legacy amount packs: profitFinal was the bet-3 screenshot value.
  return amounts.profitFinal;
}

type BetDepositInput = Pick<
  CustomAmounts,
  "deposit" | "deposit1" | "deposit2" | "deposit3" | "profit1" | "profit2"
>;

/**
 * OKX stake per bet — reinvestment story: each next bet stakes prior winnings.
 * Bet1 = initial deposit, bet2 = deposit + profit1, bet3 = deposit + profit1 + profit2.
 */
export function betDepositsForPack(amounts: BetDepositInput): [number, number, number] {
  const d1 = amounts.deposit1 ?? amounts.deposit;
  const d2 = amounts.deposit2 ?? roundMoney(amounts.deposit + amounts.profit1);
  const d3 = amounts.deposit3 ?? roundMoney(amounts.deposit + amounts.profit1 + amounts.profit2);
  return [d1, d2, d3];
}

/** OKX stake shown on a bet screenshot (slot 1–3). */
export function betDepositForSlot(amounts: BetDepositInput, slot: 1 | 2 | 3): number {
  const [d1, d2, d3] = betDepositsForPack(amounts);
  if (slot === 1) return d1;
  if (slot === 2) return d2;
  return d3;
}

/**
 * Split total profit across three bet screenshots.
 * profit1 + profit2 + profit3 = profitFinal (total).
 * Example: profitFinal=125000 → 31250 + 43750 + 50000 = 125000.
 */
export function splitProfitProgression(params: {
  profitFinal: number;
  deposit?: number | undefined;
}): CustomAmounts {
  const total = roundMoney(params.profitFinal);
  const deposit =
    params.deposit != null && params.deposit > 0
      ? roundMoney(params.deposit)
      : inferDefaultDeposit(total);

  const profit1 = roundMoney(total * PROGRESSION[0]);
  const profit2 = roundMoney(total * PROGRESSION[1]);
  // Remainder goes to bet3 so the three portions always sum exactly to total.
  const profit3 = Math.max(1, total - profit1 - profit2);

  const [deposit1, deposit2, deposit3] = betDepositsForPack({
    deposit,
    profit1,
    profit2,
  });

  return { deposit, deposit1, deposit2, deposit3, profit1, profit2, profit3, profitFinal: total };
}
