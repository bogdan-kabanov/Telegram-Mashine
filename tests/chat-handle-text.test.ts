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
    managerHandle: "@Maya_Nancy",
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

  it("shows locale presence under the name, not @handle", () => {
    const html = buildChatHtml({
      project: baseProject,
      clientName: "тест",
      messages: [{ id: "1", role: "client", type: "text", content: "hi", time: "12:00" }],
    });
    expect(html).toContain('class="nav-status">был(а) недавно</div>');
    expect(html).not.toContain('class="nav-status">@Maya_Nancy</div>');
    expect(html).not.toContain('class="nav-status">@');
    expect(html).toContain(".nav-status::before");
    expect(html).toMatch(/\.nav-status::before,\s*\n\s*\.nav-status::after \{\s*content: none;/);
    expect(html).toMatch(/\.nav-status \{[^}]*min-width: min-content;/s);
  });

  it("uses Spanish presence for es locale", () => {
    const html = buildChatHtml({
      project: { ...baseProject, locale: "es", managerHandle: "@Demo_ES" },
      clientName: "тест",
      messages: [{ id: "1", role: "client", type: "text", content: "hi", time: "12:00" }],
    });
    expect(html).toContain('class="nav-status">últ. vez recientemente</div>');
    expect(html).not.toContain('class="nav-status">@Demo_ES</div>');
  });

  it("allows explicit statusText override", () => {
    const html = buildChatHtml({
      project: baseProject,
      clientName: "тест",
      messages: [{ id: "1", role: "client", type: "text", content: "hi", time: "12:00" }],
      statusText: "в сети",
    });
    expect(html).toContain('class="nav-status">в сети</div>');
  });
});
