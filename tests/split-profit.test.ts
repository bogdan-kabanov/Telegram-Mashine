import { describe, expect, it } from "vitest";

import {
  betDepositForSlot,
  betDepositsForPack,
  betProfitForSlot,
  inferDefaultDeposit,
  splitProfitProgression,
} from "../src/lib/amounts/split-profit";

describe("splitProfitProgression", () => {
  it("splits total profit across three bets that sum to total", () => {
    const split = splitProfitProgression({ profitFinal: 10_000 });
    expect(split.profitFinal).toBe(10_000);
    expect(split.profit1).toBe(2_500);
    expect(split.profit2).toBe(3_500);
    expect(split.profit3).toBe(4_000);
    expect(split.profit1 + split.profit2 + split.profit3).toBe(10_000);
    expect(split.profit1).toBeLessThan(split.profit2);
    expect(split.profit2).toBeLessThan(split.profit3);
  });

  it("splits 125000 example correctly", () => {
    const split = splitProfitProgression({ profitFinal: 125_000 });
    expect(split.profit1).toBe(31_250);
    expect(split.profit2).toBe(43_750);
    expect(split.profit3).toBe(50_000);
    expect(split.profit1 + split.profit2 + split.profit3).toBe(125_000);
    expect(split.deposit).toBe(2_500);
    expect(split.deposit1).toBe(2_500);
    expect(split.deposit2).toBe(33_750);
    expect(split.deposit3).toBe(77_500);
  });

  it("splits 100000 example for custom constructor totals", () => {
    const split = splitProfitProgression({ profitFinal: 100_000 });
    expect(split.profit1).toBe(25_000);
    expect(split.profit2).toBe(35_000);
    expect(split.profit3).toBe(40_000);
    expect(split.profit1 + split.profit2 + split.profit3).toBe(100_000);
    expect(split.deposit).toBe(2_000);
    expect(split.deposit1).toBe(2_000);
    expect(split.deposit2).toBe(27_000);
    expect(split.deposit3).toBe(62_000);
  });

  it("uses explicit deposit when provided", () => {
    const split = splitProfitProgression({ profitFinal: 5000, deposit: 800 });
    expect(split.deposit).toBe(800);
  });

  it("handles small totals", () => {
    const split = splitProfitProgression({ profitFinal: 10 });
    expect(split.profitFinal).toBe(10);
    expect(split.profit1).toBeGreaterThan(0);
    expect(split.profit2).toBeGreaterThan(split.profit1);
    expect(split.profit1 + split.profit2 + split.profit3).toBe(10);
  });

  it("infers default deposit as ~2% of profit with nice rounding", () => {
    expect(inferDefaultDeposit(10_000)).toBe(200);
    expect(inferDefaultDeposit(125_000)).toBe(2_500);
    expect(inferDefaultDeposit(10)).toBe(1);
  });
});

describe("betDepositForSlot", () => {
  it("uses reinvestment: each bet stakes prior winnings", () => {
    const amounts = { deposit: 612, profit1: 17_583, profit2: 36_417 };
    expect(betDepositForSlot(amounts, 1)).toBe(612);
    expect(betDepositForSlot(amounts, 2)).toBe(18_195);
    expect(betDepositForSlot(amounts, 3)).toBe(54_612);
  });

  it("returns explicit deposit1/2/3 when set", () => {
    const amounts = {
      deposit: 500,
      deposit1: 500,
      deposit2: 700,
      deposit3: 800,
      profit1: 100,
      profit2: 200,
    };
    expect(betDepositsForPack(amounts)).toEqual([500, 700, 800]);
  });
});

describe("betProfitForSlot", () => {
  it("returns explicit profit3 for custom split amounts", () => {
    expect(
      betProfitForSlot({ profit1: 100, profit2: 200, profit3: 300, profitFinal: 600 }, 3),
    ).toBe(300);
  });

  it("falls back to profitFinal for legacy amount packs", () => {
    expect(
      betProfitForSlot({ profit1: 17_583, profit2: 36_417, profit3: 0, profitFinal: 77_953 }, 3),
    ).toBe(77_953);
  });
});
