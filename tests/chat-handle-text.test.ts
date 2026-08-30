import { describe, expect, it } from "vitest";

import { chatHandleText, buildChatHtml } from "../src/modules/chat-renderer/template";
import type { ProjectConfig } from "../src/lib/schemas/projects";

describe("chatHandleText", () => {
  it("returns handle as typed without auto @ prefix", () => {
    expect(chatHandleText("Online", "fallback")).toBe("Online");
    expect(chatHandleText("в сети", "fallback")).toBe("в сети");
  });

  it("keeps @ when user typed it", () => {
    expect(chatHandleText("@Grisel_A", "fallback")).toBe("@Grisel_A");
  });

  it("trims whitespace and preserves inner text", () => {
    expect(chatHandleText("  Online  ", "fallback")).toBe("Online");
    expect(chatHandleText("  @Demo_RU  ", "fallback")).toBe("@Demo_RU");
    expect(chatHandleText("  в сети  ", "fallback")).toBe("в сети");
  });

  it("falls back when handle is empty", () => {
    expect(chatHandleText("", "был(а) недавно")).toBe("был(а) недавно");
    expect(chatHandleText("   ", "был(а) недавно")).toBe("был(а) недавно");
    expect(chatHandleText(undefined, "был(а) недавно")).toBe("был(а) недавно");
  });
});

describe("buildChatHtml status line", () => {
  const baseProject = {
    id: "t",
    name: "t",
    locale: "ru",
    currency: "MXN",
    managerName: "тест",
    managerHandle: "в сети",
    theme: {
      incomingBubble: "#fff",
      outgoingBubble: "#eeffde",
      accentColor: "#3390ec",
      statusBarStyle: "light" as const,
    },
    depositMessageTemplate: "x",
    completionMessageTemplate: "x",
    payoutMessageTemplate: "x",
  } as ProjectConfig;

  it("renders managerHandle exactly — no auto @, full status text", () => {
    const html = buildChatHtml({
      project: baseProject,
      clientName: "тест",
      messages: [{ id: "1", role: "client", type: "text", content: "hi", time: "12:00" }],
    });
    expect(html).toContain('class="nav-status">в сети</div>');
    expect(html).not.toContain('class="nav-status">@');
    expect(html).not.toContain("@в сети");
    expect(html).not.toContain(">@в<");
  });

  it("keeps user-typed @ in the status line", () => {
    const html = buildChatHtml({
      project: { ...baseProject, managerHandle: "@Maya_Nancy" },
      clientName: "тест",
      messages: [{ id: "1", role: "client", type: "text", content: "hi", time: "12:00" }],
    });
    expect(html).toContain('class="nav-status">@Maya_Nancy</div>');
  });
});
