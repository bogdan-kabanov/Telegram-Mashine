import type { AmountPack } from "@/lib/schemas/amounts";
import type { Currency } from "@/lib/schemas/currencies";
import { getCachedAppConfig } from "@/lib/config/loader";
import { localeClockConfig } from "@/lib/i18n/locale-profile";
import { formatClockTime, formatLocalDate } from "@/lib/timezone";

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

export type MessageClockOptions = {
  now?: Date;
  timeZone?: string;
  locale?: string;
  dateFormat?: string;
};

export type DateTimeStamp = { date: string; time: string };

export type MessageClock = {
  times: string[];
  lastTime: string;
  stampAt: (index: number) => DateTimeStamp;
  stampAtDelay: (delayMinutes: number) => DateTimeStamp;
  stampForType: (messages: Array<{ type: string }>, type: string) => DateTimeStamp | null;
};

function monotonicDelays(messages: Array<{ delayMinutes: number }>): number[] {
  let cursor = 0;
  return messages.map((msg, index) => {
    const target = Math.max(0, msg.delayMinutes);
    // Never go backwards — AI stage delays can be non-monotonic vs message order.
    cursor = index === 0 ? target : Math.max(cursor, target);
    return cursor;
  });
}

/**
 * One shared clock for bubbles, status bar, and bank slips.
 * Last message = `now` in the project timezone; earlier turns walk back by delayMinutes.
 */
export function buildMessageClock(
  messages: Array<{ delayMinutes: number }>,
  options: MessageClockOptions = {},
): MessageClock {
  const now = options.now ?? new Date();
  const localeCfg = localeClockConfig(options.locale);
  const timeZone = options.timeZone ?? localeCfg.timeZone;
  const locale = options.locale ?? localeCfg.locale;
  const dateFormat = options.dateFormat ?? localeCfg.dateFormat;
  const delays = monotonicDelays(messages);
  const lastDelay = delays.at(-1) ?? 0;

  const stampForWhen = (when: Date): DateTimeStamp => ({
    date: formatLocalDate(when, { timeZone, locale, dateFormat }),
    time: formatClockTime(timeZone, when),
  });

  const whenForDelay = (delay: number): Date =>
    new Date(now.getTime() - (lastDelay - Math.max(0, delay)) * 60_000);

  const stamps = delays.map((delay) => stampForWhen(whenForDelay(delay)));
  const nowStamp = stampForWhen(now);

  const stampAt = (index: number): DateTimeStamp => {
    if (index < 0 || index >= stamps.length) return nowStamp;
    return stamps[index]!;
  };

  return {
    times: stamps.map((s) => s.time),
    lastTime: stamps.at(-1)?.time ?? nowStamp.time,
    stampAt,
    stampAtDelay: (delayMinutes: number) => stampForWhen(whenForDelay(delayMinutes)),
    stampForType: (typed, type) => {
      const index = typed.findIndex((m) => m.type === type);
      return index >= 0 ? stampAt(index) : null;
    },
  };
}

export function computeMessageTimes(
  messages: Array<{ delayMinutes: number }>,
  nowOrOptions?: Date | MessageClockOptions,
): string[] {
  const options: MessageClockOptions =
    nowOrOptions instanceof Date ? { now: nowOrOptions } : (nowOrOptions ?? {});
  return buildMessageClock(messages, options).times;
}

export function formatStatusBarTime(date = new Date(), timeZone?: string): string {
  return formatClockTime(timeZone ?? localeClockConfig("es-MX").timeZone, date);
}
