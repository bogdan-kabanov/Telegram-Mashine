import { statSync } from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

import { overlayReceiptTemplate } from "../src/lib/media/overlay-receipt";
import type { ProjectConfig } from "../src/lib/schemas/projects";

const nancy = {
  id: "nancy",
  locale: "es-MX",
  receiptTemplates: {
    client: ["01_banorte.jpg"],
    manager: ["01_banorte.jpg"],
  },
} as ProjectConfig;

describe("receipt overlay on real template", () => {
  it(
    "stamps new amount onto the Banorte screenshot",
    async () => {
      const outputPath = path.join(os.tmpdir(), "receipt-overlay-out.png");
      const result = await overlayReceiptTemplate({
        project: nancy,
        role: "manager",
        amount: 77953,
        currency: "MXN",
        senderName: "Carlos Perez",
        recipientName: "Maya Nancy",
        accountLastDigits: "4821",
        date: "16 de agosto de 2026",
        time: "10:05",
        outputPath,
        dataDir: path.resolve(process.cwd(), "data"),
      });
      expect(result).not.toBeNull();
      expect(result?.fields.length).toBeGreaterThan(0);
      expect(statSync(outputPath).size).toBeGreaterThan(20_000);
    },
    120_000,
  );
});
