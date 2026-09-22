import { describe, expect, it } from "vitest";
import path from "path";
import sharp from "sharp";

import {
  buildReceiptEditPrompt,
  prepareReceiptEditCanvas,
  RECEIPT_EDIT_SIZE,
} from "../src/lib/openai/receipts";
import {
  assertNotReceiptTemplatePath,
  resolveTemplateFilenameForRegen,
  slipSourceMetaPath,
  writeSlipSourceMeta,
  readSlipSourceMeta,
} from "../src/lib/media/slip-source";

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

  it("forbids sticker overlays and demands in-place print matching", () => {
    expect(prompt).toMatch(/seamless in-painting/i);
    expect(prompt).toMatch(/FORBIDDEN: gray\/white bars/i);
    expect(prompt).toMatch(/soft blur blobs/i);
    expect(prompt).toMatch(/EXACT typeface/i);
    expect(prompt).toMatch(/AUTORIZACION/i);
    expect(prompt).toMatch(/SHARPNESS LOCK/i);
  });

  it("locks medium so paper is not replaced by a digital app UI", () => {
    const paper = buildReceiptEditPrompt({
      role: "client",
      amount: 2000,
      currency: "MXN",
      locale: "es-MX",
      senderName: "Lorena",
      recipientName: "Anastasia Manager",
      accountLastDigits: "4821",
      date: "19/09/2026",
      time: "02:35",
      medium: "paper",
      templateName: "04_spin_detail.jpg",
    });
    expect(paper).toMatch(/MEDIUM LOCK — PAPER PHOTO/i);
    expect(paper).toMatch(/Spin-by-OXXO/i);
    expect(paper).not.toMatch(/full-bleed mobile screenshot/i);
  });
});

describe("pristine template regen helpers", () => {
  const sample = path.resolve("data/media/receipt_templates/nancy/06_oxxo_papel.jpg");

  it("prepareReceiptEditCanvas never mutates the source file size on disk", async () => {
    const before = await sharp(sample).metadata();
    const prepared = await prepareReceiptEditCanvas(sample);
    const after = await sharp(sample).metadata();
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(prepared.width).toBe(RECEIPT_EDIT_SIZE.width);
    expect(prepared.height).toBe(RECEIPT_EDIT_SIZE.height);
  });

  it("refuses writes into receipt_templates", () => {
    expect(() =>
      assertNotReceiptTemplatePath("data/media/receipt_templates/nancy/06_oxxo_papel.jpg"),
    ).toThrow(/read-only/i);
  });

  it("resolves template filename from sidecar of a generated captura", () => {
    const out = path.resolve("data/media/capturas/__test_slip_source.png");
    writeSlipSourceMeta(out, {
      template: "06_oxxo_papel.jpg",
      projectId: "nancy",
      role: "client",
    });
    expect(readSlipSourceMeta(out)?.template).toBe("06_oxxo_papel.jpg");
    expect(
      resolveTemplateFilenameForRegen({ mediaPath: out }),
    ).toBe("06_oxxo_papel.jpg");
    expect(
      resolveTemplateFilenameForRegen({
        mediaPath: "data/media/receipt_templates/nancy/04_spin_detail.jpg",
      }),
    ).toBe("04_spin_detail.jpg");
    // cleanup sidecar only
    const meta = slipSourceMetaPath(out);
    try {
      require("fs").unlinkSync(meta);
    } catch {
      /* ignore */
    }
  });
});
