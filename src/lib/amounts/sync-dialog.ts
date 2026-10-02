import { betProfitForSlot } from "@/lib/amounts/split-profit";
import { formatAmount, injectTemplate } from "@/lib/format";
import type { ProjectConfig } from "@/lib/schemas/projects";
import type { DialogMessage } from "@/lib/schemas/dialog";
import type { GeneratedDialog } from "@/modules/dialog-generator";

/** Single source of truth for chat texts + captura/bets/receipt stamps. */
export type AmountSnapshot = {
  deposit: number;
  profit1: number;
  profit2: number;
  profit3: number;
  profitFinal: number;
  payoutAmount: number;
  commission: number;
  clientShare: number;
  currency: string;
  clabe?: string;
  bankName?: string;
};

export type AmountDisplayVars = Record<string, string | number>;

function roundMoney(n: number): number {
  return Math.round(n);
}

export function buildAmountSnapshot(params: {
  deposit: number;
  profit1: number;
  profit2: number;
  profitFinal: number;
  profit3?: number;
  payoutAmount?: number;
  currency: string;
  /** e.g. Francesca 0.1 */
  commissionRate?: number;
  clabe?: string;
  bankName?: string;
}): AmountSnapshot {
  const profit3 =
    params.profit3 != null && params.profit3 > 0
      ? params.profit3
      : betProfitForSlot(
          {
            profit1: params.profit1,
            profit2: params.profit2,
            profit3: 0,
            profitFinal: params.profitFinal,
          },
          3,
        );
  const rate = params.commissionRate ?? 0;
  const commission = rate > 0 ? roundMoney(params.profitFinal * rate) : 0;
  const clientShare = rate > 0 ? params.profitFinal - commission : params.profitFinal;
  const payoutAmount =
    params.payoutAmount != null && params.payoutAmount > 0 ? params.payoutAmount : clientShare;

  return {
    deposit: params.deposit,
    profit1: params.profit1,
    profit2: params.profit2,
    profit3,
    profitFinal: params.profitFinal,
    payoutAmount,
    commission,
    clientShare,
    currency: params.currency,
    ...(params.clabe ? { clabe: params.clabe } : {}),
    ...(params.bankName ? { bankName: params.bankName } : {}),
  };
}

export function snapshotFromDialog(
  dialog: {
    deposit: number;
    profit1: number;
    profit2: number;
    profit3?: number;
    profitFinal: number;
    payoutAmount: number;
    clabe?: string;
  },
  project: Pick<ProjectConfig, "currency" | "id">,
  bankName?: string,
): AmountSnapshot {
  const commissionRate = project.id === "francesca" ? 0.1 : 0;
  return buildAmountSnapshot({
    deposit: dialog.deposit,
    profit1: dialog.profit1,
    profit2: dialog.profit2,
    profitFinal: dialog.profitFinal,
    ...(dialog.profit3 != null ? { profit3: dialog.profit3 } : {}),
    payoutAmount: dialog.payoutAmount,
    currency: project.currency,
    commissionRate,
    ...(dialog.clabe ? { clabe: dialog.clabe } : {}),
    ...(bankName ? { bankName } : {}),
  });
}

export function buildAmountDisplayVars(snapshot: AmountSnapshot): AmountDisplayVars {
  const currency = snapshot.currency;
  const bank = snapshot.bankName ?? "Spin";
  return {
    bankName: bank,
    bank,
    clabe: snapshot.clabe ?? "",
    deposit: formatAmount(snapshot.deposit, currency),
    profit1: formatAmount(snapshot.profit1, currency),
    profit2: formatAmount(snapshot.profit2, currency),
    profit3: formatAmount(snapshot.profit3, currency),
    profitFinal: formatAmount(snapshot.profitFinal, currency),
    commission: formatAmount(snapshot.commission, currency),
    clientShare: formatAmount(snapshot.clientShare, currency),
    payout: formatAmount(snapshot.payoutAmount, currency),
    currency,
  };
}

/** Canonical numeric values that may appear in chat copy / slips. */
export function snapshotAmountSet(snapshot: AmountSnapshot): Set<number> {
  return new Set(
    [
      snapshot.deposit,
      snapshot.profit1,
      snapshot.profit2,
      snapshot.profit3,
      snapshot.profitFinal,
      snapshot.payoutAmount,
      snapshot.commission,
      snapshot.clientShare,
    ].filter((n) => n > 0),
  );
}

/**
 * Parse money-like tokens from free text into absolute numeric values.
 * Tolerates `$4,500`, `4500`, `4.500,00`, spaces. Skips CLABE-length digit runs.
 */
export function extractMoneyMentions(text: string): number[] {
  const out: number[] = [];
  const re =
    /(?:\$|€|₽|Bs\.?\s*)\s*(\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{2})?|\d+[.,]\d{2}|\d{3,7})|\b(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d+[.,]\d{2})\b|\b(\d{3,5})\b(?!\d)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\s/g, "");
    if (!raw) continue;
    // Skip CLABE / long account fragments
    if (/^\d{8,}$/.test(raw)) continue;
    let normalized = raw;
    if (/\d\.\d{3}/.test(raw) || (/\d,\d{2}$/.test(raw) && !/\d,\d{3}/.test(raw))) {
      normalized = raw.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = raw.replace(/,/g, "");
    }
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 100) continue;
    out.push(Math.round(n));
  }
  return out;
}

function amountsClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1;
}

function mentionMatchesSnapshot(value: number, allowed: Set<number>): boolean {
  for (const a of allowed) {
    if (amountsClose(value, a)) return true;
  }
  return false;
}

export type AmountConsistencyResult = {
  ok: boolean;
  issues: string[];
};

/** Soft check: every large money mention in text messages must match the snapshot. */
export function assertDialogAmountsConsistent(
  dialog: Pick<
    GeneratedDialog,
    "messages" | "deposit" | "profit1" | "profit2" | "profit3" | "profitFinal" | "payoutAmount"
  > & { clabe?: string },
  project: Pick<ProjectConfig, "currency" | "id">,
): AmountConsistencyResult {
  const snapshot = snapshotFromDialog(dialog, project);
  const allowed = snapshotAmountSet(snapshot);
  const issues: string[] = [];

  for (const msg of dialog.messages) {
    if (msg.type !== "text" || !msg.content?.trim()) continue;
    const mentions = extractMoneyMentions(msg.content);
    for (const value of mentions) {
      if (!mentionMatchesSnapshot(value, allowed)) {
        issues.push(
          `Message ${msg.id} mentions ${value} which is not in amount snapshot (${[...allowed].join(", ")})`,
        );
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

function looksLikeDepositTemplate(content: string, filled: string): boolean {
  if (!filled.trim()) return false;
  if (content === filled) return true;
  // Same skeleton: strip digits/money tokens and compare
  const strip = (s: string) =>
    s
      .replace(/(?:\$|€|₽)?\s*\d[\d.,\s]*/g, "#")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  return strip(content) === strip(filled) || content.includes(filled.slice(0, 40));
}

/**
 * Re-apply project manager templates from the current snapshot so bubble
 * amounts stay in sync after captura/receipt/bet amount edits.
 */
export function reinjectTemplatedMessages(
  dialog: GeneratedDialog,
  project: ProjectConfig,
  snapshot?: AmountSnapshot,
): GeneratedDialog {
  const snap =
    snapshot ??
    snapshotFromDialog(dialog, project);
  const vars = buildAmountDisplayVars(snap);
  const depositFilled = injectTemplate(project.depositMessageTemplate, vars).trim();
  const completionFilled = injectTemplate(project.completionMessageTemplate, vars).trim();
  const payoutFilled = injectTemplate(project.payoutMessageTemplate, vars).trim();

  let depositDone = false;
  let completionDone = false;
  let payoutDone = false;

  const messages: DialogMessage[] = dialog.messages.map((msg) => {
    if (msg.role !== "manager" || msg.type !== "text") return msg;
    const content = msg.content ?? "";

    if (!depositDone && looksLikeDepositTemplate(content, depositFilled)) {
      depositDone = true;
      return { ...msg, content: depositFilled };
    }
    if (!completionDone && looksLikeDepositTemplate(content, completionFilled)) {
      completionDone = true;
      return { ...msg, content: completionFilled };
    }
    if (!payoutDone && looksLikeDepositTemplate(content, payoutFilled)) {
      payoutDone = true;
      return { ...msg, content: payoutFilled };
    }

    // Fallback: replace known formatted amounts in free text with snapshot strings
    let next = content;
    const pairs: Array<[number, string]> = [
      [dialog.deposit, String(vars.deposit)],
      [dialog.profit1, String(vars.profit1)],
      [dialog.profit2, String(vars.profit2)],
      [dialog.profitFinal, String(vars.profitFinal)],
      [dialog.payoutAmount, String(vars.payout)],
    ];
    for (const [oldNum, newStr] of pairs) {
      if (oldNum === snap.deposit && newStr === String(vars.deposit) && oldNum === dialog.deposit) {
        // still replace using formatted old value
      }
      const oldFmt = formatAmount(oldNum, snap.currency);
      if (oldFmt && oldFmt !== newStr && next.includes(oldFmt)) {
        next = next.split(oldFmt).join(newStr);
      }
    }
    return next === content ? msg : { ...msg, content: next };
  });

  // If templates weren't matched (AI paraphrased), force-replace first manager
  // messages that still contain the old deposit / payout formatted amounts.
  if (!depositDone || !completionDone || !payoutDone) {
    // already attempted string replace above
  }

  return {
    ...dialog,
    deposit: snap.deposit,
    profit1: snap.profit1,
    profit2: snap.profit2,
    ...(snap.profit3 != null ? { profit3: snap.profit3 } : {}),
    profitFinal: snap.profitFinal,
    payoutAmount: snap.payoutAmount,
    messages,
  };
}

/** Apply a single-slot amount override and rebuild dependent snapshot fields. */
export function applyAmountOverride(
  dialog: GeneratedDialog,
  project: ProjectConfig,
  slot: "captura" | "receipt" | "bet1" | "bet2" | "bet3",
  amount: number,
): GeneratedDialog {
  let next: GeneratedDialog = { ...dialog };
  if (slot === "captura") {
    next = { ...next, deposit: amount };
  } else if (slot === "receipt") {
    next = { ...next, payoutAmount: amount };
  } else if (slot === "bet1") {
    next = { ...next, profit1: amount };
  } else if (slot === "bet2") {
    next = { ...next, profit2: amount };
  } else {
    next = {
      ...next,
      profit3: amount,
      profitFinal: next.profit1 + next.profit2 + amount,
    };
  }
  const snap = snapshotFromDialog(next, project);
  // Receipt override must update payout copy (templates often use {{clientShare}}).
  const displaySnap =
    slot === "receipt"
      ? { ...snap, clientShare: amount, payoutAmount: amount }
      : snap;
  return reinjectTemplatedMessages(
    {
      ...next,
      deposit: displaySnap.deposit,
      profit1: displaySnap.profit1,
      profit2: displaySnap.profit2,
      profitFinal: displaySnap.profitFinal,
      payoutAmount: displaySnap.payoutAmount,
      ...(displaySnap.profit3 != null ? { profit3: displaySnap.profit3 } : {}),
    },
    project,
    displaySnap,
  );
}
