import { describe, expect, it } from "vitest";

import {
  buildClientPhotoPrompt,
  detectClientPhotoScene,
} from "@/lib/openai/images";

describe("client story photo prompts", () => {
  it("defaults to hospital relative scene without hint", () => {
    expect(detectClientPhotoScene()).toBe("hospital_relative");
    expect(detectClientPhotoScene("")).toBe("hospital_relative");
  });

  it("detects sick father / hospital stories", () => {
    expect(
      detectClientPhotoScene(
        "Mi padre necesita una operación y medicamentos muy caros, pero nuestra familia no dispone de tanto dinero",
      ),
    ).toBe("hospital_relative");
    expect(
      detectClientPhotoScene("Отец в больнице, нужна срочная операция и лекарства"),
    ).toBe("hospital_relative");
  });

  it("builds a hospital-bed prompt, not a casual selfie", () => {
    const prompt = buildClientPhotoPrompt({
      hint: "Mi padre está enfermo en el hospital y necesita una operación",
      locale: "es-MX",
    });
    expect(prompt.toLowerCase()).toMatch(/hospital/);
    expect(prompt.toLowerCase()).not.toMatch(/mirror selfie/);
    expect(prompt.toLowerCase()).toMatch(/bed|ecg|iv drip|bandage|electrode|monitoring/);
  });
});
