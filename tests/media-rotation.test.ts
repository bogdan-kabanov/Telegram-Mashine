import { describe, expect, it } from "vitest";

import { pickNextInSortedCycle, sortPathsStable } from "../src/lib/media-rotation";

describe("media rotation", () => {
  it("walks paths 1→N→1 in stable filename order", () => {
    const paths = sortPathsStable([
      "data/media/voices/b.ogg",
      "data/media/voices/a.ogg",
      "data/media/voices/c.ogg",
    ]);
    expect(paths).toEqual([
      "data/media/voices/a.ogg",
      "data/media/voices/b.ogg",
      "data/media/voices/c.ogg",
    ]);

    expect(pickNextInSortedCycle(paths, null)).toBe("data/media/voices/a.ogg");
    expect(pickNextInSortedCycle(paths, "data/media/voices/a.ogg")).toBe(
      "data/media/voices/b.ogg",
    );
    expect(pickNextInSortedCycle(paths, "data/media/voices/c.ogg")).toBe(
      "data/media/voices/a.ogg",
    );
  });
});
