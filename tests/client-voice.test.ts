import { describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

type DialogMessage = {
  id: string;
  role: "client" | "manager";
  type: string;
  content: string;
  delayMinutes: number;
  metadata?: Record<string, unknown>;
};

function injectClientVoiceMessage(
  messages: DialogMessage[],
  chance: number,
  rng: () => number,
): DialogMessage[] {
  if (chance <= 0 || rng() >= chance) return messages;
  let insertIdx = messages.findIndex((m) => m.type === "conditions");
  if (insertIdx < 0) insertIdx = messages.length;
  const voiceMsg: DialogMessage = {
    id: randomUUID(),
    role: "client",
    type: "voice",
    content: "voice",
    delayMinutes: 2,
    metadata: { durationSec: 12 },
  };
  const result = [...messages];
  result.splice(insertIdx, 0, voiceMsg);
  return result;
}

describe("client voice injection", () => {
  const base: DialogMessage[] = [
    { id: "1", role: "client", type: "text", content: "hola", delayMinutes: 0 },
    { id: "2", role: "manager", type: "text", content: "ok", delayMinutes: 1 },
    { id: "3", role: "manager", type: "conditions", content: "conditions", delayMinutes: 2 },
  ];

  it("skips voice when chance is 0", () => {
    expect(injectClientVoiceMessage(base, 0, () => 0).some((m) => m.type === "voice")).toBe(false);
  });

  it("inserts voice before conditions when chance is 1", () => {
    const out = injectClientVoiceMessage(base, 1, () => 0);
    expect(out.some((m) => m.type === "voice")).toBe(true);
    expect(out.findIndex((m) => m.type === "voice")).toBe(2);
  });
});
