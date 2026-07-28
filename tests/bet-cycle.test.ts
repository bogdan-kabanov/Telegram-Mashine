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
  maxDailyReviewsForProject,
  parseBetPackNumber,
  pickSequentialBets,
} from "../src/lib/bet-cycle";
import {
  findAmountPackForBetPack,
  resolveBetPackNumber,
  type AmountPack,
} from "../src/lib/schemas/amounts";
import type { ScheduleConfig } from "../src/lib/schemas";
import {
  messageVisualWeight,
  paginateMessages,
} from "../src/modules/chat-renderer/messages";
import type { RenderMessage } from "../src/modules/chat-renderer/template";

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
    } satisfies ScheduleConfig;

    expect(maxDailyReviewsForProject(schedule, "nancy")).toBe(3);
    expect(maxDailyReviewsForProject(schedule, "grisel")).toBe(1);
    // 9 unique / (3 reviews * 3 bets) = 1 day capacity
    expect(Math.floor(9 / (maxDailyReviewsForProject(schedule, "nancy") * 3))).toBe(1);
  });
});

describe("amount ↔ bet pack 1:1", () => {
  it("resolves betPack from field or id suffix", () => {
    expect(resolveBetPackNumber({ id: "nancy_03", betPack: 3, deposit: 1, profit1: 1, profit2: 1, profitFinal: 1, currency: "MXN" })).toBe(3);
    expect(resolveBetPackNumber({ id: "melissa_12", deposit: 1, profit1: 1, profit2: 1, profitFinal: 1, currency: "ARS" })).toBe(12);
    expect(parseBetPackNumber("pack07_2.jpg")).toBe(7);
  });

  it("finds amount pack for a bet pack number", () => {
    const packs: AmountPack[] = [
      { id: "nancy_01", projectId: "nancy", betPack: 1, deposit: 100, profit1: 1, profit2: 2, profitFinal: 3, currency: "MXN" },
      { id: "nancy_02", projectId: "nancy", betPack: 2, deposit: 200, profit1: 1, profit2: 2, profitFinal: 3, currency: "MXN" },
    ];
    expect(findAmountPackForBetPack(packs, 2)?.id).toBe("nancy_02");
    expect(findAmountPackForBetPack(packs, 3)?.id).toBe("nancy_01"); // wrap
  });
});

describe("weight-aware pagination", () => {
  it("isolates heavy images so screens are not half-empty / cut off", () => {
    const messages: RenderMessage[] = [
      { id: "1", role: "manager", type: "text", content: "hola", time: "12:00" },
      {
        id: "2",
        role: "manager",
        type: "image",
        content: "__image__",
        time: "12:01",
        mediaKind: "conditions",
        imageUrl: "data:image/png;base64,xx",
      },
      { id: "3", role: "client", type: "text", content: "ok", time: "12:02" },
      {
        id: "4",
        role: "manager",
        type: "image",
        content: "__image__",
        time: "12:03",
        mediaKind: "bet",
        imageUrl: "data:image/png;base64,yy",
      },
      { id: "5", role: "client", type: "text", content: "bien", time: "12:04" },
    ];

    expect(messageVisualWeight(messages[1]!)).toBeGreaterThanOrEqual(4);
    const pages = paginateMessages(messages, 9);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    // Every message appears on at least one page
    const ids = new Set(pages.flat().map((m) => m.id));
    expect(ids.size).toBe(messages.length);
  });
});

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
        // Touch empty files so listMedia disk fallback still works if used
        const abs = path.join(dataDir, "media/bets/nancy");
        mkdirSync(abs, { recursive: true });
        writeFileSync(path.join(abs, filename), Buffer.alloc(600, 1));
      }

      const first = await pickSequentialBets({ projectId: "nancy", count: 3, reviewId: "r1" });
      expect(first.map((b) => b.filename)).toEqual(["pack01_1.png", "pack01_2.png", "pack01_3.png"]);

      const second = await pickSequentialBets({ projectId: "nancy", count: 3, reviewId: "r2" });
      expect(second.map((b) => b.filename)).toEqual(["pack02_1.png", "pack02_2.png", "pack02_3.png"]);

      // All recently used — may refill from start but still returns 3
      const third = await pickSequentialBets({ projectId: "nancy", count: 3, reviewId: "r3" });
      expect(third).toHaveLength(3);
      expect(third.map((b) => b.filename)).toEqual(["pack01_1.png", "pack01_2.png", "pack01_3.png"]);
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
