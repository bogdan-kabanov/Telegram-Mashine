import type { AmountPack } from "@/lib/schemas/amounts";

export function formatAmount(value: number, currency = "MXN"): string {
  const formatted = value.toLocaleString("es-MX");
  return currency === "MXN" ? `${formatted}` : `${formatted} ${currency}`;
}

export function generateClabe(bankPrefix: string | undefined, lastDigits: string): string {
  const prefix = bankPrefix ?? "012";
  const middle = String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0");
  return `${prefix}${middle}${lastDigits}`.slice(0, 18);
}

export function randomAccountLastDigits(min: number, max: number): string {
  const value = Math.floor(Math.random() * (max - min + 1)) + min;
  return String(value);
}

export function injectTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}

export function buildDialogVars(params: {
  deposit: number;
  profitFinal: number;
  clabe: string;
  depositMessage: string;
  completionMessage: string;
  payoutMessage: string;
}): Record<string, string | number> {
  return {
    deposit: params.deposit,
    profitFinal: params.profitFinal,
    clabe: params.clabe,
    depositMessage: params.depositMessage,
    completionMessage: params.completionMessage,
    payoutMessage: params.payoutMessage,
  };
}

export function amountPackToVars(pack: AmountPack): Record<string, number> {
  return {
    deposit: pack.deposit,
    profit1: pack.profit1,
    profit2: pack.profit2,
    profitFinal: pack.profitFinal,
  };
}

import { getMexicoCityParts } from "@/lib/timezone";

export function computeMessageTimes(
  messages: Array<{ delayMinutes: number }>,
  _baseDate = new Date(),
): string[] {
  const baseMinutes = 17 * 60 + 8;

  return messages.map((msg) => {
    const total = baseMinutes + msg.delayMinutes;
    const h = Math.floor((total / 60) % 24)
      .toString()
      .padStart(2, "0");
    const m = (total % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  });
}

export function formatStatusBarTime(date = new Date()): string {
  const parts = getMexicoCityParts(date);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}
