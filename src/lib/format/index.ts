import type { AmountPack } from "@/lib/schemas/amounts";
import type { Currency } from "@/lib/schemas/currencies";
import { getCachedAppConfig } from "@/lib/config/loader";
import { getMexicoCityParts } from "@/lib/timezone";

const FALLBACK_CURRENCIES: Currency[] = [
  {
    code: "MXN",
    symbol: "$",
    name: "Peso Mexicano",
    decimals: 2,
    format: { thousandSeparator: ",", decimalSeparator: ".", symbolPosition: "before" },
  },
  {
    code: "ARS",
    symbol: "$",
    name: "Peso Argentino",
    decimals: 0,
    format: { thousandSeparator: ".", decimalSeparator: ",", symbolPosition: "before" },
  },
  {
    code: "VES",
    symbol: "Bs",
    name: "Bolívar",
    decimals: 2,
    format: { thousandSeparator: ".", decimalSeparator: ",", symbolPosition: "after" },
  },
  {
    code: "RUB",
    symbol: "₽",
    name: "Российский рубль",
    decimals: 0,
    format: { thousandSeparator: " ", decimalSeparator: ",", symbolPosition: "after" },
  },
];

function currencyRules(code: string): Currency {
  const fromConfig = getCachedAppConfig()?.currencies.currencies.find((c) => c.code === code);
  if (fromConfig) return fromConfig;
  return FALLBACK_CURRENCIES.find((c) => c.code === code) ?? FALLBACK_CURRENCIES[0]!;
}

function formatNumberWithSeparators(
  value: number,
  thousandSeparator: string,
  decimalSeparator: string,
  decimals: number,
): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const fixed = abs.toFixed(decimals);
  const [intRaw, frac = ""] = fixed.split(".");
  const intGrouped = (intRaw ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator);
  if (decimals <= 0 || !frac || Number(frac) === 0) {
    // Keep whole amounts clean (77,876) even when decimals config is 2
    if (decimals <= 0 || Number.isInteger(value)) return `${sign}${intGrouped}`;
  }
  return `${sign}${intGrouped}${decimalSeparator}${frac}`;
}

export function formatAmount(value: number, currency = "MXN"): string {
  const rules = currencyRules(currency);
  const number = formatNumberWithSeparators(
    value,
    rules.format.thousandSeparator,
    rules.format.decimalSeparator,
    rules.decimals,
  );

  // MXN: bare number (legacy chat copy). Other currencies follow currencies.json.
  if (currency === "MXN") return number;

  if (rules.format.symbolPosition === "before") {
    return `${rules.symbol}${number}`;
  }
  return `${number} ${rules.symbol}`;
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

export function computeMessageTimes(
  messages: Array<{ delayMinutes: number }>,
  _baseDate = new Date(),
): string[] {
  const baseMinutes = 17 * 60 + 8;
  let cursor = baseMinutes;

  return messages.map((msg, index) => {
    const target = baseMinutes + Math.max(0, msg.delayMinutes);
    // Never go backwards — AI stage delays can be non-monotonic vs message order.
    cursor = index === 0 ? target : Math.max(cursor, target);
    const h = Math.floor((cursor / 60) % 24)
      .toString()
      .padStart(2, "0");
    const m = (cursor % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  });
}

export function formatStatusBarTime(date = new Date()): string {
  const parts = getMexicoCityParts(date);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}
