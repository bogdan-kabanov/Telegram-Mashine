import { statSync } from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

import { overlayBetScreenshot } from "../src/lib/media/overlay-receipt";

describe("bet overlay on real screenshot", () => {
  it(
    "stamps new deposit and profit onto nancy pack01_1 without redrawing the card",
    async () => {
      const source = path.resolve(process.cwd(), "data/media/bets/nancy/pack01_1.jpg");
      const outputPath = path.join(os.tmpdir(), "bet-overlay-out.png");
      const result = await overlayBetScreenshot({
        imagePath: source,
        outputPath,
        deposit: 850,
        profit: 36417,
        currency: "MXN",
        name: "Carlos Perez",
        dataDir: path.resolve(process.cwd(), "data"),
      });
      expect(result).not.toBeNull();
      expect(result?.fields).toEqual(expect.arrayContaining(["deposit", "profit"]));
      expect(statSync(outputPath).size).toBeGreaterThan(20_000);
    },
    120_000,
  );
});
