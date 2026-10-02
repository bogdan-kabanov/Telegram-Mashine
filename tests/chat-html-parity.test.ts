import { describe, expect, it } from "vitest";

import { buildChatHtml, type RenderChatParams, type RenderMessage } from "../src/modules/chat-renderer/template";
import type { ProjectConfig } from "../src/lib/schemas/projects";

function project(): ProjectConfig {
  return {
    id: "nancy",
    name: "Nancy",
    locale: "es-MX",
    currency: "MXN",
    managerName: "Nancy",
    managerHandle: "@nancy",
    twoPhaseReview: false,
    depositMessageTemplate: "x",
    completionMessageTemplate: "x",
    payoutMessageTemplate: "x",
    theme: {
      incomingBubble: "#fff",
      outgoingBubble: "#eeffde",
      accentColor: "#34C759",
      headerBg: "#F7F7F7",
      statusBarStyle: "light",
    },
  } as ProjectConfig;
}

function messages(): RenderMessage[] {
  return [
    {
      id: "1",
      role: "client",
      type: "text",
      content: "Hola",
      time: "12:00",
      delayMinutes: 0,
    },
    {
      id: "2",
      role: "manager",
      type: "text",
      content: "Listo",
      time: "12:01",
      delayMinutes: 1,
      read: true,
    },
  ];
}

function stripInteractive(html: string): string {
  return html
    .replace(/\s*data-live-[a-z-]+="[^"]*"/g, "")
    .replace(/\bis-live-media\b/g, "")
    .replace(/\sclass="([^"]*)"/g, (_, cls: string) => {
      const cleaned = cls.replace(/\s+/g, " ").trim();
      return cleaned ? ` class="${cleaned}"` : "";
    })
    .replace(/ class=""/g, "")
    .replace(/\s+is-live\b/g, "")
    .replace(/<body class="">/g, "<body>")
    .replace(/\s+/g, " ");
}

describe("chat html interactive parity", () => {
  it("livePreview does not change nav glass / scroll-down visibility classes", () => {
    const base: RenderChatParams = {
      project: project(),
      clientName: "Carlos",
      messages: messages(),
      statusBarTime: "12:01",
      clockTimeZone: "America/Mexico_City",
    };
    const plain = buildChatHtml(base);
    const live = buildChatHtml({ ...base, livePreview: true });

    expect(plain.includes("scroll-down is-visible")).toBe(false);
    expect(live.includes("scroll-down is-visible")).toBe(false);
    // Same frost chrome (not liveGlass-only tint) in header
    expect(plain.includes("glass-frost")).toBe(true);
    expect(live.includes("glass-frost")).toBe(true);

    const a = stripInteractive(plain);
    const b = stripInteractive(live);
    // Interactive mode adds body.is-live for JS hooks — chrome pixels stay shared.
    expect(live.includes('class="is-live"') || live.includes("class=\"is-live\"")).toBe(true);
    expect(a.includes("nav-glass")).toBe(true);
    expect(b.includes("nav-glass")).toBe(true);
  });
});
