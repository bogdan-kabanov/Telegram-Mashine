import { describe, expect, it } from "vitest";

import {
  messageVisualWeight,
  paginateMessages,
} from "../src/modules/chat-renderer/pagination";
import type { RenderMessage } from "../src/modules/chat-renderer/render-types";

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
    const ids = new Set(pages.flat().map((m) => m.id));
    expect(ids.size).toBe(messages.length);
  });
});
