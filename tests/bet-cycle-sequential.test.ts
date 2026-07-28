import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

import { resetDbForTests, getDb } from "../src/lib/db";
import { mediaAssets } from "../src/lib/db/schema";
import {
  BET_REUSE_DAYS,
  BET_REUSE_DAYS_DEFAULT,
  pickSequentialBets,
} from "../src/lib/bet-cycle";

describe("sequential bet cycle", () => {
  it("walks bets 1→N and avoids reuse inside the cooldown window", async () => {
    const tmpRoot = path.join(os.tmpdir(), `bot-ai-bets-${randomUUID()}`);
    const dataDir = path.join(tmpRoot, "data");
    mkdirSync(dataDir, { recursive: true });

    const prevDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = dataDir;
    resetDbForTests();

    try {
      const db = getDb();
      const now = new Date().toISOString();
      for (let i = 1; i <= 6; i++) {
        const pack = Math.ceil(i / 3);
        const slot = ((i - 1) % 3) + 1;
        const filename = `pack${String(pack).padStart(2, "0")}_${slot}.png`;
        const mediaPath = `data/media/bets/nancy/${filename}`;
        await db.insert(mediaAssets).values({
          id: randomUUID(),
          projectId: "nancy",
          type: "bet",
          filename,
          path: mediaPath,
          mimeType: "image/png",
          createdAt: now,
        });
        const abs = path.join(dataDir, "media/bets/nancy");
        mkdirSync(abs, { recursive: true });
        writeFileSync(path.join(abs, filename), Buffer.alloc(600, 1));
      }

      const first = await pickSequentialBets({ projectId: "nancy", count: 3, reviewId: "r1" });
      expect(first.map((b) => b.filename)).toEqual([
        "pack01_1.png",
        "pack01_2.png",
        "pack01_3.png",
      ]);

      const second = await pickSequentialBets({ projectId: "nancy", count: 3, reviewId: "r2" });
      expect(second.map((b) => b.filename)).toEqual([
        "pack02_1.png",
        "pack02_2.png",
        "pack02_3.png",
      ]);

      const third = await pickSequentialBets({ projectId: "nancy", count: 3, reviewId: "r3" });
      expect(third).toHaveLength(3);
      expect(third.map((b) => b.filename)).toEqual([
        "pack01_1.png",
        "pack01_2.png",
        "pack01_3.png",
      ]);
      expect(BET_REUSE_DAYS).toBe(BET_REUSE_DAYS_DEFAULT);
      expect(BET_REUSE_DAYS_DEFAULT).toBe(5);
    } finally {
      if (prevDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = prevDataDir;
      resetDbForTests();
      try {
        rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        // ignore Windows locks
      }
    }
  });
});
