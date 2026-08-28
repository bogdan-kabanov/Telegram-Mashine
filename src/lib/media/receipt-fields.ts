export type ReceiptRole = "client" | "manager";

export type OcrWord = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  line: number;
  conf?: number;
};

export type OverlayBox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  text: string;
  align: "left" | "right" | "center";
  kind: "amount" | "name" | "date" | "time" | "digits" | "deposit" | "profit";
};

export type OverlayFieldValues = {
  amount: number;
  currency: string;
  senderName: string;
  recipientName: string;
  accountLastDigits: string;
  date: string;
  time: string;
  role: ReceiptRole;
};

const MONEY_CORE =
  /\$?\s*\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\$?\s*\d+[.,]\d{2}|\$\s*\d{3,}/;

const SLASH_DATE = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;
const LONG_DATE =
  /\b(?:lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)?\s*\d{1,2}\s+(?:de\s+)?[a-záéíóúñ]+(?:\s+del?)?\s+\d{4}\b/i;
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b/;

const LABEL_SENDER = /^(de|desde|origen|cuenta de origen)\b/i;
const LABEL_RECIPIENT =
  /^(para|a\b|beneficiari|alias|nombre del beneficiario|nombre)\b/i;

const NOT_A_NAME =
  /banorte|mercado|bbva|visa|spin|oxxo|hey banco|compartamos|citibanamex|naranja|albo|banco|wallet|transfer|comprobante|exitosa|envi[eé]|monto|cuenta|clabe|fecha|hora|concepto|referencia|folio|operaci|n[oó]mina|importe|rastreo|consulta|estatus|favoritos|compartir|volver/i;

const MONTHS_ES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

export function unionBox(words: OcrWord[]): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.min(...words.map((w) => w.x0)),
    y0: Math.min(...words.map((w) => w.y0)),
    x1: Math.max(...words.map((w) => w.x1)),
    y1: Math.max(...words.map((w) => w.y1)),
  };
}

function lineGroups(words: OcrWord[]): OcrWord[][] {
  const byLine = new Map<number, OcrWord[]>();
  for (const w of words) {
    const list = byLine.get(w.line) ?? [];
    list.push(w);
    byLine.set(w.line, list);
  }
  return [...byLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, list]) => list.sort((a, b) => a.x0 - b.x0));
}

function lineText(words: OcrWord[]): string {
  return words.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim();
}

function isPersonName(text: string): boolean {
  const cleaned = text.replace(/[.,;:]+$/g, "").trim();
  if (cleaned.length < 5 || NOT_A_NAME.test(cleaned)) return false;
  const parts = cleaned.split(/\s+/);
  if (parts.length < 2 || parts.length > 5) return false;
  return parts.every((p) => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]{1,24}$/.test(p));
}

export function formatMoneyLikeOriginal(original: string, amount: number, currency: string): string {
  const prefix = original.match(/^[^\d]*/)?.[0] ?? "";
  const suffix = original.match(/[^\d.,]+$/)?.[0] ?? "";
  const body = original.slice(prefix.length, suffix ? original.length - suffix.length : original.length);
  const european = /\d\.\d{3}/.test(body) || (/\d,\d{2}$/.test(body) && !/\d,\d{3}/.test(body));
  // Keep cents only when the original already has them, or MXN amounts that use `$`.
  // Bet cards like `612 MXN` / `+17,583 MXN` must stay integer.
  const keepDecimals = /[.,]\d{2}$/.test(body.trim()) || (currency === "MXN" && /\$/.test(original));
  const decimals = keepDecimals && currency !== "ARS" && currency !== "VES" ? 2 : 0;
  const abs = Math.abs(amount);
  const [intRaw, frac = ""] = abs.toFixed(decimals).split(".");
  const thousand = european ? "." : ",";
  const decimal = european ? "," : ".";
  const grouped = (intRaw ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, thousand);
  const number = decimals > 0 && frac ? `${grouped}${decimal}${frac}` : grouped;
  const dollar = prefix.includes("$") || original.includes("$") ? prefix || "$" : prefix;
  return `${dollar}${number}${suffix}`.replace(/\s+/g, (m) => (original.includes(" ") ? m : ""));
}

export function replaceMaskedLast4(original: string, digits: string): string {
  const tail = digits.replace(/\D/g, "").slice(-4).padStart(4, "0");
  if (/\d{4}\s*$/.test(original)) return original.replace(/\d{4}\s*$/, tail);
  return `${original.replace(/\d+$/, "")}${tail}`;
}

function parseLongEsDate(date: string): { d: number; m: number; y: number } | null {
  const slash = date.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    return { d: Number(slash[1]), m: Number(slash[2]), y: Number(slash[3]) < 100 ? 2000 + Number(slash[3]) : Number(slash[3]) };
  }
  const long = date.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+de)?\s+(\d{4})/i);
  if (long) {
    const m = MONTHS_ES[long[2]!.toLowerCase()];
    if (!m) return null;
    return { d: Number(long[1]), m, y: Number(long[3]) };
  }
  const short = date.match(/(\d{1,2})\s+([a-záéíóúñ]+)\s+(?:del?\s+)?(\d{4})/i);
  if (short) {
    const m = MONTHS_ES[short[2]!.toLowerCase()];
    if (!m) return null;
    return { d: Number(short[1]), m, y: Number(short[3]) };
  }
  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function adaptDateToOriginal(original: string, date: string, time: string): string {
  const parsed = parseLongEsDate(date);
  const timeCore = time.match(/\d{1,2}:\d{2}(?::\d{2})?/)?.[0] ?? time;
  const withSeconds = TIME_RE.exec(original)?.[0]?.length === 8 ? `${timeCore.length === 5 ? `${timeCore}:00` : timeCore}` : timeCore;

  if (SLASH_DATE.test(original) && parsed) {
    const slash = `${pad2(parsed.d)}/${pad2(parsed.m)}/${parsed.y}`;
    let next = original.replace(SLASH_DATE, slash);
    if (TIME_RE.test(next)) next = next.replace(TIME_RE, withSeconds);
    return next;
  }
  if (LONG_DATE.test(original)) {
    let next = original.replace(LONG_DATE, date);
    if (TIME_RE.test(next)) next = next.replace(TIME_RE, withSeconds);
    return next;
  }
  if (TIME_RE.test(original) && !SLASH_DATE.test(original) && original.length < 16) {
    return original.replace(TIME_RE, withSeconds);
  }
  return date;
}

function boxAlign(box: { x0: number; x1: number }, imageWidth: number): OverlayBox["align"] {
  const mid = (box.x0 + box.x1) / 2;
  if (mid > imageWidth * 0.62) return "right";
  if (box.x0 > imageWidth * 0.22 && box.x1 < imageWidth * 0.78 && mid > imageWidth * 0.38 && mid < imageWidth * 0.62) {
    return "center";
  }
  return "left";
}

function mergeNeighbors(words: OcrWord[], start: number, pred: (w: OcrWord) => boolean): OcrWord[] {
  const out = [words[start]!];
  for (let i = start + 1; i < words.length; i++) {
    const prev = out[out.length - 1]!;
    const cur = words[i]!;
    if (cur.line !== prev.line) break;
    if (cur.x0 - prev.x1 > Math.max(18, (prev.x1 - prev.x0) * 0.8)) break;
    if (!pred(cur)) break;
    out.push(cur);
  }
  return out;
}

/**
 * Map OCR words to cover+stamp boxes on the original screenshot.
 */
export function planReceiptReplacements(
  words: OcrWord[],
  fields: OverlayFieldValues,
  imageWidth: number,
): OverlayBox[] {
  const usable = words.filter((w) => (w.conf ?? 80) >= 40 && w.text.trim());
  const boxes: OverlayBox[] = [];
  const used = new Set<OcrWord>();
  const digits = fields.accountLastDigits.replace(/\D/g, "").slice(-4).padStart(4, "0");

  const take = (group: OcrWord[], text: string, kind: OverlayBox["kind"]) => {
    if (group.length === 0 || group.some((w) => used.has(w))) return;
    group.forEach((w) => used.add(w));
    const box = unionBox(group);
    boxes.push({ ...box, text, kind, align: boxAlign(box, imageWidth) });
  };

  // Amount: tallest money-like run
  const moneyRuns: OcrWord[][] = [];
  for (let i = 0; i < usable.length; i++) {
    const w = usable[i]!;
    if (used.has(w)) continue;
    const joined = mergeNeighbors(usable, i, (n) => /[\d$.,MNXmn]|MXN|ARS|VES/.test(n.text));
    const text = lineText(joined);
    if (MONEY_CORE.test(text) && /\d/.test(text)) moneyRuns.push(joined);
  }
  moneyRuns.sort((a, b) => {
    const ha = unionBox(a).y1 - unionBox(a).y0;
    const hb = unionBox(b).y1 - unionBox(b).y0;
    return hb - ha;
  });
  const amountRun = moneyRuns[0];
  if (amountRun) {
    take(amountRun, formatMoneyLikeOriginal(lineText(amountRun), fields.amount, fields.currency), "amount");
  }

  // Last 4 on masked account tokens
  for (const w of usable) {
    if (used.has(w)) continue;
    const t = w.text;
    if (
      (/\d{4}$/.test(t) && /(\*{2,}|•+|·+|x{2,})/i.test(t)) ||
      /^\*{2,}\d{4}$/.test(t) ||
      /^[•·]+\d{4}$/.test(t)
    ) {
      take([w], replaceMaskedLast4(t, digits), "digits");
    }
  }

  const lines = lineGroups(usable);
  for (const line of lines) {
    const free = line.filter((w) => !used.has(w));
    if (free.length === 0) continue;
    const text = lineText(free);

    if (SLASH_DATE.test(text) || LONG_DATE.test(text)) {
      take(free, adaptDateToOriginal(text, fields.date, fields.time), "date");
      continue;
    }
    if (TIME_RE.test(text) && text.length <= 18 && !/\d{4}/.test(text.replace(TIME_RE, ""))) {
      take(free, adaptDateToOriginal(text, fields.date, fields.time), "time");
    }
  }

  const pageH = Math.max(...usable.map((w) => w.y1), 1);
  const nameBoxes: Array<{ group: OcrWord[]; role: "sender" | "recipient" | "unknown" }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const free = line.filter((w) => !used.has(w));
    if (free.length === 0) continue;
    const text = lineText(line);
    const freeText = lineText(free);
    let role: "sender" | "recipient" | "unknown" = "unknown";
    if (LABEL_SENDER.test(text) || LABEL_SENDER.test(freeText)) role = "sender";
    if (LABEL_RECIPIENT.test(text) || LABEL_RECIPIENT.test(freeText)) role = "recipient";
    if (/concepto/i.test(text)) role = "recipient";

    const afterLabel = freeText
      .replace(/^(de|desde|para|a|origen|destino|beneficiario|alias|nombre)[:\s]*/i, "")
      .replace(/^.*concepto[^:]*:\s*/i, "")
      .trim();
    if (isPersonName(afterLabel) && afterLabel !== freeText) {
      const nameWords = free.filter(
        (w) =>
          !LABEL_SENDER.test(w.text) &&
          !LABEL_RECIPIENT.test(w.text) &&
          !/concepto|transferencia|transfer/i.test(w.text),
      );
      if (nameWords.length) nameBoxes.push({ group: nameWords, role: role === "unknown" ? "recipient" : role });
      continue;
    }
    if (isPersonName(freeText)) {
      nameBoxes.push({ group: free, role });
      continue;
    }
    const next = lines[i + 1];
    if (role !== "unknown" && next) {
      const nextFree = next.filter((w) => !used.has(w));
      const nextText = lineText(nextFree);
      if (isPersonName(nextText)) {
        nameBoxes.push({ group: nextFree, role });
      }
    }
  }

  const bigEnough = (group: OcrWord[]) => {
    const box = unionBox(group);
    return box.y1 - box.y0 >= 14 && box.x1 - box.x0 >= 36;
  };

  const sender = nameBoxes.find((n) => n.role === "sender" && bigEnough(n.group));
  const recipient = nameBoxes.find((n) => n.role === "recipient" && bigEnough(n.group));
  const unknown = nameBoxes.filter(
    (n) =>
      n.role === "unknown" &&
      bigEnough(n.group) &&
      unionBox(n.group).y0 > pageH * 0.3,
  );

  if (sender) take(sender.group, fields.senderName, "name");
  if (recipient) take(recipient.group, fields.recipientName, "name");

  if (!recipient && !sender && unknown.length === 1) {
    take(unknown[0]!.group, fields.recipientName, "name");
  } else {
    const leftover = unknown.filter((n) => n.group.every((w) => !used.has(w)));
    if (leftover[0] && !sender) take(leftover[0].group, fields.senderName, "name");
    if (leftover[1] && !recipient) take(leftover[1].group, fields.recipientName, "name");
    else if (leftover[0] && sender && !recipient) take(leftover[0].group, fields.recipientName, "name");
  }

  return boxes;
}

export type BetOverlayValues = {
  deposit: number;
  profit: number;
  currency: string;
  name?: string;
};

const LABEL_DEPOSIT = /dep[oó]sito|apuesta actual|apuesta\b|stake|entrada|cuota/i;
const LABEL_PROFIT = /ganancia|profit|ganado|premio|payout|ganancias/i;
const CRYPTO_OR_PAIR = /usdt|ton\b|sol\b|xrp|neo|doge|btc|eth|bnb|okx/i;
const NOT_A_BET_NAME =
  /vs\.?|united|city|arsenal|chelsea|madrid|barcelona|brighton|manchester|apuesta|dep[oó]sito|ganancia|usdt|ton|sol|xrp|datos|proporcionados/i;

const BET_MONEY =
  /[+$]?\s*\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|[+$]?\s*\d+[.,]\d{2}|[+$]?\s*\d{2,7}(?:\s*(?:MXN|ARS|VES|MN|RUB))?/;

export function parseLooseMoney(text: string): number | null {
  const m = text.replace(/[^\d.,]/g, "");
  if (!m) return null;
  if (/\d\.\d{3}/.test(m) && !/\.\d{2}$/.test(m)) {
    const n = Number(m.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (/\d,\d{3}/.test(m)) {
    const n = Number(m.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(m.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function formatBetMoney(original: string, amount: number, currency: string, role: "deposit" | "profit"): string {
  let formatted = formatMoneyLikeOriginal(original, amount, currency);
  if (role === "profit" && amount > 0 && !/^\s*[+\-]/.test(formatted)) {
    if (/^\s*\+/.test(original) || LABEL_PROFIT.test(original)) {
      formatted = `+${formatted.replace(/^\s+/, "")}`;
    }
  }
  return formatted;
}

function runLooksLikeMoney(text: string, value: number): boolean {
  if (!/\d/.test(text) || !BET_MONEY.test(text.replace(/\s+/g, " "))) return false;
  if (CRYPTO_OR_PAIR.test(text) && !/(MXN|ARS|VES|RUB|\bMN\b)/i.test(text)) return false;
  if (value >= 2020 && value <= 2035 && Number.isInteger(value) && !/(MXN|ARS|VES)/i.test(text)) return false;
  if (/(MXN|ARS|VES|RUB|\bMN\b)/i.test(text)) return true;
  return value >= 100;
}

function classifyBetRun(words: OcrWord[], run: OcrWord[]): "deposit" | "profit" | "unknown" {
  const joined = lineText(run);
  if (/^\s*\+/.test(joined) || LABEL_PROFIT.test(joined)) return "profit";
  const line = words.filter((w) => w.line === run[0]!.line);
  const lineJoined = lineText(line);
  if (LABEL_DEPOSIT.test(lineJoined)) return "deposit";
  if (LABEL_PROFIT.test(lineJoined)) return "profit";
  const prev = words.filter((w) => w.line === run[0]!.line - 1);
  const prevText = lineText(prev);
  if (LABEL_DEPOSIT.test(prevText)) return "deposit";
  if (LABEL_PROFIT.test(prevText)) return "profit";
  return "unknown";
}

type BetMoneyRun = {
  group: OcrWord[];
  value: number;
  role: "deposit" | "profit" | "unknown";
};

function runCenterY(run: BetMoneyRun): number {
  const box = unionBox(run.group);
  return (box.y0 + box.y1) / 2;
}

/** OKX cards: deposit row sits above profit. Fix value-only heuristics when labels are missing. */
function reconcileDepositProfitRuns(
  depositRun: BetMoneyRun | undefined,
  profitRun: BetMoneyRun | undefined,
): [BetMoneyRun | undefined, BetMoneyRun | undefined] {
  if (!depositRun || !profitRun || depositRun === profitRun) {
    return [depositRun, profitRun];
  }
  if (depositRun.role === "deposit" || profitRun.role === "profit") {
    return [depositRun, profitRun];
  }
  if (runCenterY(depositRun) > runCenterY(profitRun)) {
    return [profitRun, depositRun];
  }
  return [depositRun, profitRun];
}

/**
 * Stamp deposit / profit (and optional name) onto a betting screenshot.
 * Never invents a new layout — only covers existing glyphs.
 */
export function planBetReplacements(
  words: OcrWord[],
  fields: BetOverlayValues,
  imageWidth: number,
): OverlayBox[] {
  const usable = words.filter((w) => (w.conf ?? 80) >= 35 && w.text.trim());
  const boxes: OverlayBox[] = [];
  const used = new Set<OcrWord>();

  const take = (group: OcrWord[], text: string, kind: OverlayBox["kind"]) => {
    if (group.length === 0 || group.some((w) => used.has(w))) return;
    group.forEach((w) => used.add(w));
    const box = unionBox(group);
    boxes.push({ ...box, text, kind, align: boxAlign(box, imageWidth) });
  };

  const moneyRuns: BetMoneyRun[] = [];
  for (let i = 0; i < usable.length; i++) {
    const w = usable[i]!;
    if (used.has(w)) continue;
    if (!/^[$+]?\d/.test(w.text) && w.text !== "+" && w.text !== "$") continue;
    const joined = mergeNeighbors(usable, i, (n) => /[\d$.,+\-MNXmn]|MXN|ARS|VES|RUB/.test(n.text));
    const text = lineText(joined);
    const value = parseLooseMoney(text);
    if (value == null || !runLooksLikeMoney(text, value)) continue;
    if (moneyRuns.some((r) => r.group.some((g) => joined.includes(g)))) continue;
    moneyRuns.push({ group: joined, value, role: classifyBetRun(usable, joined) });
  }

  moneyRuns.sort((a, b) => b.value - a.value);
  const withCurrency = moneyRuns.filter((r) =>
    /(MXN|ARS|VES|RUB|\bMN\b)/i.test(lineText(r.group)),
  );
  const ranked = withCurrency.length >= 1 ? withCurrency : moneyRuns;

  const pageText = lineText(usable);
  const hasDepositLabel = LABEL_DEPOSIT.test(pageText);
  const hasProfitLabel = LABEL_PROFIT.test(pageText);
  if (hasDepositLabel && hasProfitLabel && ranked.length < 2) {
    return [];
  }

  let depositRun = ranked.find((r) => r.role === "deposit");
  let profitRun = ranked.find((r) => r.role === "profit");
  const unlabeled = ranked.filter((r) => r.role === "unknown");

  if (!profitRun && unlabeled[0]) {
    profitRun = unlabeled[0];
  }
  if (!depositRun) {
    const rest = unlabeled.filter((r) => r !== profitRun);
    if (rest.length > 0) {
      rest.sort((a, b) => a.value - b.value);
      depositRun = rest[0];
    }
  }
  if (depositRun && profitRun && depositRun === profitRun) {
    const other = ranked.find((r) => r !== depositRun);
    if (other && other.value < depositRun.value) {
      profitRun = depositRun;
      depositRun = other;
    } else if (other) {
      profitRun = other;
    }
  }
  [depositRun, profitRun] = reconcileDepositProfitRuns(depositRun, profitRun);

  const expectedMoneyFields =
    ranked.length >= 2 ? 2 : ranked.length === 1 ? 1 : 0;

  if (profitRun) {
    take(
      profitRun.group,
      formatBetMoney(lineText(profitRun.group), fields.profit, fields.currency, "profit"),
      "profit",
    );
  }
  if (depositRun && depositRun !== profitRun) {
    take(
      depositRun.group,
      formatBetMoney(lineText(depositRun.group), fields.deposit, fields.currency, "deposit"),
      "deposit",
    );
  }

  if (expectedMoneyFields >= 2) {
    const stampedMoney = boxes.filter((b) => b.kind === "deposit" || b.kind === "profit").length;
    if (stampedMoney < 2) {
      return [];
    }
  }

  const name = fields.name?.trim();
  if (name) {
    const pageH = Math.max(...usable.map((w) => w.y1), 1);
    const lines = lineGroups(usable);
    for (const line of lines) {
      const free = line.filter((w) => !used.has(w));
      if (free.length === 0) continue;
      const text = lineText(free);
      if (!isPersonName(text) || NOT_A_BET_NAME.test(text)) continue;
      const box = unionBox(free);
      if (box.y0 > pageH * 0.28) continue;
      take(free, name, "name");
      break;
    }
  }

  return boxes;
}
