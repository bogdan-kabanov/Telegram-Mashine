import { describe, expect, it } from "vitest";

import { planScrollPositions } from "@/modules/chat-renderer/scroll";

describe("planScrollPositions", () => {
  it("returns a single frame when content fits", () => {
    expect(planScrollPositions(0, 844)).toEqual([0]);
    expect(planScrollPositions(5, 844)).toEqual([0]);
  });

  it("keeps first and last scroll with overlap steps", () => {
    const positions = planScrollPositions(2000, 844, { overlapPx: 160 });
    expect(positions[0]).toBe(0);
    expect(positions[positions.length - 1]).toBe(2000);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]!).toBeGreaterThan(positions[i - 1]!);
    }
  });

  it("does not jump more than viewport minus overlap", () => {
    const overlap = 160;
    const clientHeight = 844;
    const positions = planScrollPositions(3000, clientHeight, { overlapPx: overlap });
    const maxStep = clientHeight - overlap;
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]! - positions[i - 1]!).toBeLessThanOrEqual(maxStep + 1);
    }
  });

  it("hard-caps at 10 screens for long chats", () => {
    const positions = planScrollPositions(20_000, 844, { targetScreens: 10, overlapPx: 160 });
    expect(positions.length).toBeLessThanOrEqual(10);
    expect(positions[0]).toBe(0);
    expect(positions[positions.length - 1]).toBe(20_000);
  });
});
