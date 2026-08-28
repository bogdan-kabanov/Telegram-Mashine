import { describe, expect, it } from "vitest";

import {
  maxDailyReviewsForProject,
  parseBetPackNumber,
} from "../src/lib/bet-cycle";
import {
  findAmountPackForBetPack,
  resolveBetPackNumber,
  type AmountPack,
} from "../src/lib/schemas/amounts";
import type { ScheduleConfig } from "../src/lib/schemas/schedule";

describe("bet reuse capacity formula", () => {
  it("takes the worst week slot count for a project", () => {
    const schedule = {
      timezone: "America/Mexico_City",
      postsPerDay: 15,
      phaseDelayMinutes: 90,
      betReuseDays: 5,
      cycleWeeks: 3,
      weeks: [
        {
          label: "A",
          slots: [
            { id: "1", hour: 7, minute: 0, reviewType: "small", projectId: "nancy" },
            { id: "2", hour: 8, minute: 0, reviewType: "small", projectId: "nancy" },
            { id: "3", hour: 9, minute: 0, reviewType: "small", projectId: "grisel" },
          ],
        },
        {
          label: "B",
          slots: [
            { id: "1", hour: 7, minute: 0, reviewType: "small", projectId: "nancy" },
            { id: "2", hour: 8, minute: 0, reviewType: "small", projectId: "nancy" },
            { id: "3", hour: 9, minute: 0, reviewType: "small", projectId: "nancy" },
          ],
        },
      ],
      weeklyUniqueCircle: { dayOfWeek: 1, hour: 12, minute: 0 },
      clientVoiceChance: 0.25,
    } satisfies ScheduleConfig;

    expect(maxDailyReviewsForProject(schedule, "nancy")).toBe(3);
    expect(maxDailyReviewsForProject(schedule, "grisel")).toBe(1);
    expect(Math.floor(9 / (maxDailyReviewsForProject(schedule, "nancy") * 3))).toBe(1);
  });
});

describe("amount ↔ bet pack 1:1", () => {
  it("resolves betPack from field or id suffix", () => {
    expect(
      resolveBetPackNumber({
        id: "nancy_03",
        betPack: 3,
        deposit: 1,
        profit1: 1,
        profit2: 1,
        profitFinal: 1,
        currency: "MXN",
      }),
    ).toBe(3);
    expect(
      resolveBetPackNumber({
        id: "melissa_12",
        deposit: 1,
        profit1: 1,
        profit2: 1,
        profitFinal: 1,
        currency: "ARS",
      }),
    ).toBe(12);
    expect(parseBetPackNumber("pack07_2.jpg")).toBe(7);
  });

  it("finds amount pack for a bet pack number", () => {
    const packs: AmountPack[] = [
      {
        id: "nancy_01",
        projectId: "nancy",
        betPack: 1,
        deposit: 100,
        profit1: 1,
        profit2: 2,
        profitFinal: 3,
        currency: "MXN",
      },
      {
        id: "nancy_02",
        projectId: "nancy",
        betPack: 2,
        deposit: 200,
        profit1: 1,
        profit2: 2,
        profitFinal: 3,
        currency: "MXN",
      },
    ];
    expect(findAmountPackForBetPack(packs, 2)?.id).toBe("nancy_02");
    expect(findAmountPackForBetPack(packs, 3)?.id).toBe("nancy_01");
  });
});
