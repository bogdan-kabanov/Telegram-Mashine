import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

import { resetDbForTests } from "../src/lib/db";
import { resolveClientPhoto } from "../src/lib/client-photos";

const generateClientPhoto = vi.fn();

vi.mock("../src/lib/openai/images", () => ({
  getAiClientPhotoMode: () => process.env.AI_CLIENT_PHOTOS ?? "fallback",
  generateClientPhoto: (...args: unknown[]) => generateClientPhoto(...args),
  isAiClientPhotoEnabled: () => true,
}));

describe("resolveClientPhoto AI fallback", () => {
  afterEach(() => {
    generateClientPhoto.mockReset();
    vi.unstubAllEnvs();
  });

  it("falls back to AI when pool is empty and mode is fallback", async () => {
    const tmpRoot = path.join(os.tmpdir(), `bot-ai-photos-ai-${randomUUID()}`);
    const dataDir = path.join(tmpRoot, "data");
    mkdirSync(path.join(dataDir, "media/story_photos/pool"), { recursive: true });

    process.env.DATA_DIR = dataDir;
    process.env.AI_CLIENT_PHOTOS = "fallback";
    resetDbForTests();

    const aiPath = `data/media/story_photos/pool/ai_test.png`;
    generateClientPhoto.mockImplementation(async () => {
      const abs = path.join(dataDir, "media/story_photos/pool/ai_test.png");
      writeFileSync(abs, Buffer.alloc(600, 2));
      return {
        path: aiPath,
        filename: "ai_test.png",
        assetId: randomUUID(),
      };
    });

    try {
      const photo = await resolveClientPhoto({
        projectId: "nancy",
        reviewId: "r-ai",
        clientName: "María",
      });

      expect(photo).not.toBeNull();
      expect(photo!.source).toBe("ai");
      expect(photo!.path).toBe(aiPath);
      expect(generateClientPhoto).toHaveBeenCalledOnce();
    } finally {
      resetDbForTests();
      try {
        rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("uses pool first in fallback mode", async () => {
    const tmpRoot = path.join(os.tmpdir(), `bot-ai-photos-pool-${randomUUID()}`);
    const dataDir = path.join(tmpRoot, "data");
    const pool = path.join(dataDir, "media/story_photos/pool");
    mkdirSync(pool, { recursive: true });
    writeFileSync(path.join(pool, "real.jpg"), Buffer.alloc(600, 1));

    process.env.DATA_DIR = dataDir;
    process.env.AI_CLIENT_PHOTOS = "fallback";
    resetDbForTests();

    try {
      const photo = await resolveClientPhoto({ projectId: "nancy", reviewId: "r1" });
      expect(photo).not.toBeNull();
      expect(photo!.source).toBe("pool");
      expect(generateClientPhoto).not.toHaveBeenCalled();
    } finally {
      resetDbForTests();
      try {
        rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("reuses a used pool photo when unique is exhausted and AI fails", async () => {
    const tmpRoot = path.join(os.tmpdir(), `bot-ai-photos-reuse-${randomUUID()}`);
    const dataDir = path.join(tmpRoot, "data");
    const pool = path.join(dataDir, "media/story_photos/pool");
    mkdirSync(pool, { recursive: true });
    writeFileSync(path.join(pool, "only.jpg"), Buffer.alloc(600, 1));

    process.env.DATA_DIR = dataDir;
    process.env.AI_CLIENT_PHOTOS = "fallback";
    resetDbForTests();
    generateClientPhoto.mockResolvedValue(null);

    try {
      const first = await resolveClientPhoto({ projectId: "nancy", reviewId: "r1" });
      expect(first).not.toBeNull();
      expect(first!.source).toBe("pool");

      const second = await resolveClientPhoto({ projectId: "grisel", reviewId: "r2" });
      expect(second).not.toBeNull();
      expect(second!.path).toBe(first!.path);
      expect(second!.source).toBe("pool");
    } finally {
      resetDbForTests();
      try {
        rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
});
