import { describe, expect, it } from "vitest";

import { DialogClock, STAGE_ANCHOR, samplePreviewDelays } from "../src/lib/dialog/timing";
import { computeMessageTimes } from "../src/lib/format";

describe("DialogClock", () => {
  it("starts at zero and never goes backwards", () => {
    const clock = new DialogClock(() => 0.5);
    const delays: number[] = [];
    delays.push(clock.atStart("client"));
    delays.push(clock.clientBurst());
    delays.push(clock.next("manager"));
    delays.push(clock.next("client"));
    delays.push(clock.next("manager"));
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeGreaterThanOrEqual(delays[i - 1]!);
    }
  });

  it("manager does not reply instantly after client in active dialog", () => {
    const clock = new DialogClock(() => 0);
    clock.atStart("client");
    clock.clientBurst();
    const managerDelay = clock.next("manager");
    expect(managerDelay).toBeGreaterThanOrEqual(3);
  });

  it("jumps to stage anchor between phases", () => {
    const clock = new DialogClock(() => 0.5);
    clock.atStart("client");
    clock.setStage("trust_building");
    expect(clock.delayMinutes).toBe(STAGE_ANCHOR.trust_building);
  });

  it("keeps active conversation gaps under ~10 min between turns", () => {
    const clock = new DialogClock(() => 0.99);
    clock.setStage("trust_building");
    let prev = clock.delayMinutes;
    for (let i = 0; i < 8; i++) {
      const role = i % 2 === 0 ? "manager" : "client";
      const next = clock.next(role as "client" | "manager");
      expect(next - prev).toBeLessThanOrEqual(8);
      prev = next;
    }
  });

  it("bet reply waits 15+ minutes", () => {
    const clock = new DialogClock(() => 0.5);
    clock.setStage("bet_1");
    clock.next("manager");
    clock.managerBurst();
    const clientDelay = clock.next("client", "bet_reply");
    expect(clientDelay).toBeGreaterThanOrEqual(STAGE_ANCHOR.bet_1 + 15);
  });
});

describe("samplePreviewDelays", () => {
  it("produces monotonic delays for alternating roles", () => {
    const roles = ["client", "client", "client", "manager"] as const;
    const delays = samplePreviewDelays([...roles], () => 0.45);
    expect(delays[0]).toBe(0);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeGreaterThanOrEqual(delays[i - 1]!);
    }
    expect(delays.at(-1)).toBeGreaterThan(2);
  });

  it("integrates with computeMessageTimes without going backwards", () => {
    const delays = samplePreviewDelays(
      ["client", "client", "client", "manager"],
      () => 0.45,
    );
    const times = computeMessageTimes(
      delays.map((delayMinutes) => ({ delayMinutes })),
      { now: new Date("2026-01-15T18:00:00Z"), timeZone: "Europe/Moscow", locale: "ru-RU" },
    );
    for (let i = 1; i < times.length; i++) {
      expect(times[i]! >= times[i - 1]!).toBe(true);
    }
  });
});
