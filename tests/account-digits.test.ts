import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

describe("account last-4 uniqueness", () => {
  let dataDir: string;
  let prevDataDir: string | undefined;

  beforeEach(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), "bot-ai-digits-"));
    prevDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = dataDir;
    const { resetDbForTests } = await import("../src/lib/db/index");
    resetDbForTests();
  });

  afterEach(async () => {
    const { resetDbForTests } = await import("../src/lib/db/index");
    resetDbForTests();
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("never reuses digits within range", async () => {
    const { pickUniqueAccountDigits, isAccountDigitsUsed } = await import(
      "../src/lib/account-digits/index"
    );

    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const digits = await pickUniqueAccountDigits({
        min: 1000,
        max: 1019,
        projectId: "nancy",
      });
      expect(seen.has(digits)).toBe(false);
      seen.add(digits);
      expect(await isAccountDigitsUsed(digits)).toBe(true);
    }

    await expect(
      pickUniqueAccountDigits({ min: 1000, max: 1019, projectId: "grisel" }),
    ).rejects.toThrow(/exhausted/i);
  });
});
