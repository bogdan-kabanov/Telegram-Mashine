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
});
