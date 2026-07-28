/** Mexican chat style: people rarely type inverted ¿ ¡ (AI/translators overuse them). */
export function stripInvertedPunctuation(text: string): string {
  return text.replace(/[¿¡]/g, "");
}

const FEMALE_NAME_HINTS =
  /a$|ia$|na$|ra$|la$|sa$|ta$|da|ela|isa|ana|maria|sofia|valeria|nancy|maya|luna|carmen|rosa|lucia|paola|andrea|gabriela|fernanda|alejandra|daniela|camila|isabel|laura|monica|patricia|veronica|adriana|carolina|jessica|jennifer|grisel|melissa|francesca|emma|martina|camila|valentina|mariana|olga|анна|мария|елена|ольга|наталья|ирина|татьяна|светлана|екатерина|юлия|алина|дария|софия/i;

export function guessClientGender(clientName?: string): "woman" | "man" {
  if (!clientName) return "woman";
  const first = clientName.trim().split(/\s+/)[0] ?? "";
  return FEMALE_NAME_HINTS.test(first) ? "woman" : "man";
}

/** Fake MX debit card for the lead after we ask for payout details. */
export function generateClientCardNumber(): string {
  const parts = Array.from({ length: 4 }, () =>
    String(Math.floor(1000 + Math.random() * 9000)),
  );
  return parts.join(" ");
}
