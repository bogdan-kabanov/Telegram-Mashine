import path from "path";
import { describe, expect, it } from "vitest";

import { pickReceiptTemplate } from "../src/lib/openai/receipts";
import type { ProjectConfig } from "../src/lib/schemas/projects";

const dataDir = path.resolve(process.cwd(), "data");

const nancyLike = {
  id: "nancy",
  receiptTemplates: {
    client: ["01_banorte.jpg", "02_mercado.jpg", "03_spin.jpg"],
    manager: ["01_banorte.jpg", "02_mercado.jpg"],
  },
} as ProjectConfig;

const griselLike = {
  id: "grisel",
  receiptTemplates: {
    client: ["01_mercado.jpg", "02_compartamos.jpg"],
    manager: ["02_compartamos.jpg"],
  },
} as ProjectConfig;

describe("receipt template roles", () => {
  it("nancy manager never gets the 3rd (spin) template", () => {
    const picks = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const picked = pickReceiptTemplate({ project: nancyLike, role: "manager", dataDir });
      expect(picked).not.toBeNull();
      picks.add(picked!.filename);
    }
    expect(picks.has("03_spin.jpg")).toBe(false);
    expect(picks.size).toBeGreaterThan(0);
  });

  it("grisel manager only gets the 2nd template", () => {
    const picks = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const picked = pickReceiptTemplate({ project: griselLike, role: "manager", dataDir });
      expect(picked).not.toBeNull();
      picks.add(picked!.filename);
    }
    expect([...picks]).toEqual(["02_compartamos.jpg"]);
  });

  it("nancy client can use all three templates", () => {
    const picks = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const picked = pickReceiptTemplate({ project: nancyLike, role: "client", dataDir });
      expect(picked).not.toBeNull();
      picks.add(picked!.filename);
    }
    expect(picks.has("01_banorte.jpg")).toBe(true);
    expect(picks.has("02_mercado.jpg")).toBe(true);
    expect(picks.has("03_spin.jpg")).toBe(true);
  });
});
