import { describe, expect, it } from "vitest";

import { chatHandleText } from "../src/modules/chat-renderer/template";

describe("chatHandleText", () => {
  it("returns handle as typed without auto @ prefix", () => {
    expect(chatHandleText("Online", "fallback")).toBe("Online");
  });

  it("keeps @ when user typed it", () => {
    expect(chatHandleText("@Grisel_A", "fallback")).toBe("@Grisel_A");
  });

  it("trims whitespace and preserves inner text", () => {
    expect(chatHandleText("  Online  ", "fallback")).toBe("Online");
    expect(chatHandleText("  @Demo_RU  ", "fallback")).toBe("@Demo_RU");
  });

  it("falls back when handle is empty", () => {
    expect(chatHandleText("", "был(а) недавно")).toBe("был(а) недавно");
    expect(chatHandleText("   ", "был(а) недавно")).toBe("был(а) недавно");
    expect(chatHandleText(undefined, "был(а) недавно")).toBe("был(а) недавно");
  });
});
