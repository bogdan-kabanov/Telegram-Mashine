import { describe, expect, it } from "vitest";
import { existsSync } from "fs";

import { appleEmojiCodeCandidates } from "../src/lib/emoji/apple";
import { appleEmojiDataUri, appleEmojiFilePath } from "../src/lib/emoji/apple-server";

describe("apple emoji codes", () => {
  it("resolves FE0F variants used in templates", () => {
    const cases = ["❤️", "⬆️", "❤️‍🔥", "👮‍♂️", "📈", "🩵", "💸"] as const;
    for (const emoji of cases) {
      const uri = appleEmojiDataUri(emoji);
      expect(uri, `data uri for ${emoji}`).toMatch(/^data:image\/png;base64,/);
      const hit = appleEmojiCodeCandidates(emoji).some((code) =>
        existsSync(appleEmojiFilePath(code)),
      );
      expect(hit, `file for ${emoji}`).toBe(true);
    }
  });
});
