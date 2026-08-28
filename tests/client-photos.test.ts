import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

import { resetDbForTests } from "../src/lib/db";
import {
  markClientPhotoUsed,
  pickUniqueClientPhoto,
  pickAvailableClientPhoto,
  listAvailableClientPhotos,
} from "../src/lib/client-photos";
import {
  dialogToRenderMessages,
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
  it("cycles photos 1→N→1 in filename order", async () => {
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
      expect(third).not.toBeNull();
      expect(first!.path).not.toBe(second!.path);
      expect(third!.path).toBe(first!.path);

      const available = await listAvailableClientPhotos();
      expect(available.length).toBe(2);

      await markClientPhotoUsed({
        mediaPath: first!.path,
        projectId: "nancy",
        reviewId: randomUUID(),
      });

      const reused = await pickAvailableClientPhoto();
      expect(reused).not.toBeNull();
      expect([first!.path, second!.path]).toContain(reused!.path);
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

  it("skips a missing file and picks another pool photo", async () => {
    const tmpRoot = path.join(os.tmpdir(), `bot-ai-photos-skip-${randomUUID()}`);
    const dataDir = path.join(tmpRoot, "data");
    const pool = path.join(dataDir, "media/story_photos/pool");
    mkdirSync(pool, { recursive: true });
    writeFileSync(path.join(pool, "good.jpg"), Buffer.alloc(600, 1));
    writeFileSync(path.join(pool, "gone.jpg"), Buffer.alloc(600, 1));

    const prevDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = dataDir;
    resetDbForTests();

    try {
      rmSync(path.join(pool, "gone.jpg"), { force: true });
      const pick = await pickAvailableClientPhoto({
        excludePaths: ["data/media/story_photos/pool/gone.jpg"],
      });
      expect(pick).not.toBeNull();
      expect(pick!.filename).toBe("good.jpg");
    } finally {
      if (prevDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = prevDataDir;
      resetDbForTests();
      try {
        rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
});

describe("story photo render messages", () => {
  it("never turns a missing photo into a camera-emoji text bubble", () => {
    const rendered = dialogToRenderMessages(
      [
        {
          id: "t1",
          role: "client",
          type: "text",
          content: "hola",
          delayMinutes: 0,
        },
        {
          id: "img",
          role: "client",
          type: "image",
          content: "hospital",
          delayMinutes: 1,
          metadata: { legendId: "hospital" },
        },
        {
          id: "t2",
          role: "client",
          type: "text",
          content: "help",
          delayMinutes: 1,
        },
      ],
      { storyPhoto: null },
    );

    expect(rendered.some((m) => m.content.includes("📷"))).toBe(false);
    expect(rendered.find((m) => m.id === "img")).toBeUndefined();
    expect(rendered.map((m) => m.id)).toEqual(["t1", "t2"]);
  });

  it("keeps a real image bubble when a story photo is available", () => {
    const rendered = dialogToRenderMessages(
      [
        {
          id: "img",
          role: "client",
          type: "image",
          content: "hospital",
          delayMinutes: 0,
          metadata: { legendId: "hospital" },
        },
      ],
      { storyPhoto: "data:image/jpeg;base64,abc" },
    );

    expect(rendered).toHaveLength(1);
    expect(rendered[0]!.type).toBe("image");
    expect(rendered[0]!.imageUrl).toBe("data:image/jpeg;base64,abc");
    expect(rendered[0]!.content).not.toContain("📷");
  });
});
