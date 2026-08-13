import { describe, expect, it } from "vitest";

import {
  isStandaloneLegend,
  legendIdFromCircleTag,
  resolveStandaloneLegendId,
  STANDALONE_LEGEND_ID,
  STANDALONE_LEGEND_ID_RU,
} from "@/lib/legends/standalone";

describe("standalone legends", () => {
  it("detects standalone legend ids", () => {
    expect(isStandaloneLegend(STANDALONE_LEGEND_ID)).toBe(true);
    expect(isStandaloneLegend(STANDALONE_LEGEND_ID_RU)).toBe(true);
    expect(isStandaloneLegend("standalone")).toBe(true);
    expect(isStandaloneLegend("medical_debt")).toBe(false);
  });

  it("maps circle folder to dialog legend", () => {
    expect(legendIdFromCircleTag("medical_debt", "es-MX")).toBe("medical_debt");
    expect(legendIdFromCircleTag("standalone", "es-MX")).toBe(STANDALONE_LEGEND_ID);
    expect(legendIdFromCircleTag(null, "ru-RU")).toBe(STANDALONE_LEGEND_ID_RU);
    expect(resolveStandaloneLegendId("es-AR")).toBe(STANDALONE_LEGEND_ID);
  });
});
