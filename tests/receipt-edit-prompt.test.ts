import { describe, expect, it } from "vitest";

import { buildReceiptEditPrompt } from "../src/lib/openai/receipts";

describe("receipt AI edit prompt", () => {
  const prompt = buildReceiptEditPrompt({
    role: "manager",
    amount: 77953,
    currency: "MXN",
    locale: "es-MX",
    senderName: "Maya Nancy",
    recipientName: "Carlos",
    accountLastDigits: "4821",
    date: "15/08/2026",
    time: "18:42",
    bankName: "Banorte",
  });

  it("forces replacement of names, amount and last-4 digits", () => {
    expect(prompt).toMatch(/PLACEHOLDER TEXT and MUST be overwritten/i);
    expect(prompt).toMatch(/Maya Nancy/);
    expect(prompt).toMatch(/Carlos/);
    expect(prompt).toMatch(/4821/);
    expect(prompt).toMatch(/77[,.]?953/);
    expect(prompt).not.toMatch(/Keep the EXACT same app UI/);
  });

  it("does not tell the model to copy original personal fields", () => {
    expect(prompt.toLowerCase()).toMatch(/do not copy/);
    expect(prompt).toMatch(/REPLACE sender/i);
    expect(prompt).toMatch(/REPLACE recipient/i);
  });
});
