import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

import { resetDbForTests, getDb } from "../src/lib/db";
import { mediaAssets } from "../src/lib/db/schema";
import { BET_REUSE_DAYS, BET_REUSE_DAYS_DEFAULT, pickSequentialBets } from "../src/lib/bet-cycle";
import {
  messageVisualWeight,
  paginateMessages,
} from "../src/modules/chat-renderer/messages";
import type { RenderMessage } from "../src/modules/chat-renderer/template";

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
        const filename = `${String(i).padStart(2, "0")}_bet.png`;
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
      expect(first.map((b) => b.filename)).toEqual(["01_bet.png", "02_bet.png", "03_bet.png"]);

      const second = await pickSequentialBets({ projectId: "nancy", count: 3, reviewId: "r2" });
      expect(second.map((b) => b.filename)).toEqual(["04_bet.png", "05_bet.png", "06_bet.png"]);

      // All recently used — may refill from start but still returns 3
      const third = await pickSequentialBets({ projectId: "nancy", count: 3, reviewId: "r3" });
      expect(third).toHaveLength(3);
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
