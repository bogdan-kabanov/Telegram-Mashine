import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

import { resetDbForTests } from "../src/lib/db";
import {
  markClientPhotoUsed,
  pickUniqueClientPhoto,
  listAvailableClientPhotos,
} from "../src/lib/client-photos";
import {
  messagesPerScreenForCount,
  paginateMessages,
  TARGET_SCREENSHOTS,
} from "../src/modules/chat-renderer/messages";
import type { RenderMessage } from "../src/modules/chat-renderer/template";

describe("screenshot pagination ~10", () => {
  it("targets about 10 screens for a long dialog", () => {
    const count = 45;
    const per = messagesPerScreenForCount(count, TARGET_SCREENSHOTS);
    const messages: RenderMessage[] = Array.from({ length: count }, (_, i) => ({
      id: String(i),
      role: i % 2 === 0 ? "client" : "manager",
      type: "text",
      content: `msg ${i}`,
      time: "12:00",
    }));
    const pages = paginateMessages(messages);
    expect(per).toBeGreaterThanOrEqual(3);
    expect(per).toBeLessThanOrEqual(5);
    // Prefer fitting above the input bar over hitting exactly TARGET screens.
    expect(pages.length).toBeGreaterThanOrEqual(8);
    expect(pages.length).toBeLessThanOrEqual(18);
  });

  it("keeps short dialogs on one screen", () => {
    const messages: RenderMessage[] = Array.from({ length: 3 }, (_, i) => ({
      id: String(i),
      role: "client" as const,
      type: "text" as const,
      content: `m${i}`,
      time: "12:00",
    }));
    expect(paginateMessages(messages)).toHaveLength(1);
  });
});

describe("unique client photos", () => {
  it("never returns the same photo twice", async () => {
    const tmpRoot = path.join(os.tmpdir(), `bot-ai-photos-${randomUUID()}`);
    const dataDir = path.join(tmpRoot, "data");
    const pool = path.join(dataDir, "media/story_photos/pool");
    mkdirSync(pool, { recursive: true });
    const buf = Buffer.alloc(600, 1);
    writeFileSync(path.join(pool, "a.jpg"), buf);
    writeFileSync(path.join(pool, "b.jpg"), buf);

    const prevDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = dataDir;
    resetDbForTests();

    try {
      const first = await pickUniqueClientPhoto({ projectId: "nancy", reviewId: "r1" });
      const second = await pickUniqueClientPhoto({ projectId: "grisel", reviewId: "r2" });
      const third = await pickUniqueClientPhoto({ projectId: "melissa", reviewId: "r3" });

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(first!.path).not.toBe(second!.path);
      expect(third).toBeNull();

      const available = await listAvailableClientPhotos();
      expect(available.length).toBe(2);

      await markClientPhotoUsed({
        mediaPath: first!.path,
        projectId: "nancy",
        reviewId: randomUUID(),
      });
    } finally {
      if (prevDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = prevDataDir;
      resetDbForTests();
      try {
        rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        // OneDrive / Windows locks — ignore cleanup failures
      }
    }
  });
});
