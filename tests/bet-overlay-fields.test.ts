import { describe, expect, it } from "vitest";

import {
  planBetReplacements,
  type OcrWord,
} from "../src/lib/media/receipt-fields";

function w(text: string, x0: number, y0: number, x1: number, y1: number, line: number): OcrWord {
  return { text, x0, y0, x1, y1, line, conf: 90 };
}

describe("bet overlay field planning", () => {
  it("stamps deposit and profit on an OKX-like card", () => {
    const words: OcrWord[] = [
      w("Maya", 280, 12, 330, 32, 0),
      w("Nancy", 334, 12, 400, 32, 0),
      w("USDT", 80, 80, 150, 110, 1),
      w("/", 154, 80, 168, 110, 1),
      w("TON", 172, 80, 230, 110, 1),
      w("Depósito:", 40, 140, 140, 162, 2),
      w("612", 220, 138, 280, 164, 2),
      w("MXN", 284, 138, 340, 164, 2),
      w("Ganancia:", 40, 180, 150, 204, 3),
      w("+17,583", 200, 176, 310, 208, 3),
      w("MXN", 314, 176, 370, 208, 3),
    ];
    const boxes = planBetReplacements(
      words,
      { deposit: 850, profit: 36417, currency: "MXN", name: "Carlos Perez" },
      420,
    );
    expect(boxes.find((b) => b.kind === "deposit")?.text).toBe("850 MXN");
    expect(boxes.find((b) => b.kind === "profit")?.text).toBe("+36,417 MXN");
    expect(boxes.find((b) => b.kind === "name")?.text).toBe("Carlos Perez");
    expect(boxes.every((b) => !/USDT|TON/.test(b.text))).toBe(true);
  });

  it("maps unlabeled amounts: smaller deposit, larger profit", () => {
    const words: OcrWord[] = [
      w("700", 40, 80, 90, 104, 0),
      w("MXN", 94, 80, 140, 104, 0),
      w("19,768", 40, 130, 130, 160, 1),
      w("MXN", 134, 130, 180, 160, 1),
    ];
    const boxes = planBetReplacements(
      words,
      { deposit: 640, profit: 16890, currency: "MXN" },
      400,
    );
    expect(boxes.find((b) => b.kind === "deposit")?.text).toBe("640 MXN");
    expect(boxes.find((b) => b.kind === "profit")?.text).toMatch(/16,890/);
  });

  it("uses vertical order when unlabeled amounts would swap deposit and profit", () => {
    const words: OcrWord[] = [
      w("38,301", 40, 120, 130, 150, 0),
      w("MXN", 134, 120, 180, 150, 0),
      w("35,000", 40, 170, 130, 200, 1),
      w("MXN", 134, 170, 180, 200, 1),
    ];
    const boxes = planBetReplacements(
      words,
      { deposit: 2000, profit: 35000, currency: "MXN" },
      400,
    );
    expect(boxes.find((b) => b.kind === "deposit")?.text).toBe("2,000 MXN");
    expect(boxes.find((b) => b.kind === "profit")?.text).toMatch(/35,000/);
  });

  it("returns empty plan when deposit and profit labels exist but OCR finds one amount", () => {
    const words: OcrWord[] = [
      w("Depósito:", 40, 120, 140, 142, 0),
      w("38,301", 200, 118, 310, 148, 0),
      w("MXN", 314, 118, 360, 148, 0),
      w("Ganancia:", 40, 170, 150, 194, 1),
    ];
    const boxes = planBetReplacements(
      words,
      { deposit: 2000, profit: 35000, currency: "MXN" },
      400,
    );
    expect(boxes).toEqual([]);
  });
});
