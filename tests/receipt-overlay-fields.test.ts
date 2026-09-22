import { describe, expect, it } from "vitest";

import {
  adaptDateToOriginal,
  formatMoneyLikeOriginal,
  planReceiptReplacements,
  replaceMaskedLast4,
  type OcrWord,
} from "../src/lib/media/receipt-fields";

function w(text: string, x0: number, y0: number, x1: number, y1: number, line: number): OcrWord {
  return { text, x0, y0, x1, y1, line, conf: 90 };
}

describe("receipt overlay field planning", () => {
  it("formats amount like $ 2,850.00 MN", () => {
    expect(formatMoneyLikeOriginal("$ 2,850.00 MN", 77953, "MXN")).toBe("$ 77,953.00 MN");
    expect(formatMoneyLikeOriginal("$650.00", 850, "MXN")).toBe("$850.00");
    expect(formatMoneyLikeOriginal("$ 77,632 MXN", 650, "MXN")).toBe("$ 650.00 MXN");
    expect(formatMoneyLikeOriginal("612 MXN", 850, "MXN")).toBe("850 MXN");
    expect(formatMoneyLikeOriginal("+17,583 MXN", 36417, "MXN")).toBe("+36,417 MXN");
  });

  it("keeps mask and replaces last 4 digits", () => {
    expect(replaceMaskedLast4("****8815", "4821")).toBe("****4821");
    expect(replaceMaskedLast4("•6967", "1234")).toBe("•1234");
  });

  it("adapts date to slash layout", () => {
    expect(adaptDateToOriginal("09/08/2026 - 11:37:28", "15 de agosto de 2026", "18:42")).toBe(
      "15/08/2026 - 18:42:00",
    );
  });

  it("stamps amount, names and last-4 on a Mercado-like layout", () => {
    const words: OcrWord[] = [
      w("Comprobante", 20, 20, 200, 48, 0),
      w("$", 40, 80, 60, 120, 1),
      w("77,632", 62, 80, 180, 120, 1),
      w("MXN", 184, 80, 240, 120, 1),
      w("De", 40, 160, 70, 180, 2),
      w("Nancy", 80, 160, 150, 180, 2),
      w("Veronica", 155, 160, 250, 180, 2),
      w("Maya", 255, 160, 320, 180, 2),
      w("Para", 40, 210, 90, 230, 3),
      w("Pamela", 100, 210, 180, 230, 3),
      w("Arriaga", 185, 210, 270, 230, 3),
      w("CLABE", 40, 250, 100, 268, 4),
      w("****8193", 110, 250, 200, 268, 4),
      w("13/08/2026", 40, 300, 140, 318, 5),
      w("19:51", 150, 300, 200, 318, 5),
    ];
    const boxes = planReceiptReplacements(
      words,
      {
        amount: 650,
        currency: "MXN",
        senderName: "Carlos Perez",
        recipientName: "Maya Nancy",
        accountLastDigits: "4821",
        date: "16 de agosto de 2026",
        time: "10:05",
        role: "manager",
      },
      400,
    );
    const kinds = boxes.map((b) => b.kind);
    expect(kinds).toContain("amount");
    expect(kinds).toContain("name");
    expect(kinds).toContain("digits");
    expect(boxes.find((b) => b.kind === "amount")?.text).toMatch(/650/);
    expect(boxes.some((b) => b.text.includes("Maya Nancy") || b.text.includes("Carlos Perez"))).toBe(
      true,
    );
    expect(boxes.find((b) => b.kind === "digits")?.text).toBe("****4821");
  });

  it("stamps MONTO + PAGO TOTAL on OXXO thermal layout, not COMISION", () => {
    const words: OcrWord[] = [
      w("Caja", 20, 40, 60, 56, 0),
      w("#1", 65, 40, 90, 56, 0),
      w("08/08/2026", 100, 40, 200, 56, 0),
      w("13:02", 210, 40, 260, 56, 0),
      w("TARJETA", 20, 80, 100, 96, 1),
      w("SPIN", 105, 80, 150, 96, 1),
      w("************4122", 160, 80, 320, 96, 1),
      w("MONTO", 20, 120, 90, 140, 2),
      w("M.N.", 100, 120, 140, 140, 2),
      w("$", 150, 120, 165, 140, 2),
      w("650.00", 170, 120, 250, 140, 2),
      w("COMISION", 20, 150, 110, 168, 3),
      w("DEPOSITO", 115, 150, 200, 168, 3),
      w("$", 210, 150, 225, 168, 3),
      w("10.34", 230, 150, 290, 168, 3),
      w("IVA", 20, 175, 55, 190, 4),
      w("DE", 60, 175, 85, 190, 4),
      w("COMISION", 90, 175, 180, 190, 4),
      w("$", 200, 175, 215, 190, 4),
      w("1.66", 220, 175, 270, 190, 4),
      w("TOTAL", 20, 200, 80, 218, 5),
      w("COMISION", 85, 200, 175, 218, 5),
      w("$", 200, 200, 215, 218, 5),
      w("12.00", 220, 200, 280, 218, 5),
      w("PAGO", 20, 230, 70, 250, 6),
      w("TOTAL", 75, 230, 140, 250, 6),
      w("$", 160, 230, 175, 250, 6),
      w("662.00", 180, 230, 270, 250, 6),
    ];
    const boxes = planReceiptReplacements(
      words,
      {
        amount: 9999,
        currency: "MXN",
        senderName: "Test Client",
        recipientName: "Anastasia Manager",
        accountLastDigits: "7777",
        date: "19/09/2026",
        time: "02:35",
        role: "client",
      },
      400,
    );
    const amountTexts = boxes.filter((b) => b.kind === "amount").map((b) => b.text);
    expect(amountTexts.some((t) => /9,?999\.00/.test(t))).toBe(true);
    expect(amountTexts.some((t) => /10,?011\.00/.test(t))).toBe(true); // 9999 + 12
    expect(boxes.find((b) => b.kind === "digits")?.text).toMatch(/7777/);
    expect(boxes.find((b) => b.kind === "date")?.text).toMatch(/19\/09\/2026/);
    expect(boxes.every((b) => b.kind !== "name")).toBe(true);
    expect(amountTexts.filter((t) => /9,?999\.00/.test(t)).length).toBeGreaterThanOrEqual(1);
    expect(amountTexts.filter((t) => /10,?011\.00/.test(t)).length).toBeGreaterThanOrEqual(1);
  });
});
