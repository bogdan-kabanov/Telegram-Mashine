import { describe, expect, it } from "vitest";

import {
  applyAmountOverride,
  assertDialogAmountsConsistent,
  buildAmountDisplayVars,
  buildAmountSnapshot,
  extractMoneyMentions,
  reinjectTemplatedMessages,
  snapshotAmountSet,
} from "../src/lib/amounts/sync-dialog";
import type { GeneratedDialog } from "../src/modules/dialog-generator";
import type { ProjectConfig } from "../src/lib/schemas/projects";

function baseProject(over: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    id: "nancy",
    name: "Nancy",
    locale: "es-MX",
    currency: "MXN",
    managerName: "Nancy",
    managerHandle: "@nancy",
    twoPhaseReview: false,
    depositMessageTemplate: "Deposita {{deposit}} a {{bankName}} CLABE {{clabe}}",
    completionMessageTemplate: "Ganaste {{profitFinal}} en total",
    payoutMessageTemplate: "Te envié {{clientShare}}",
    theme: {
      incomingBubble: "#fff",
      outgoingBubble: "#eeffde",
      accentColor: "#34C759",
      headerBg: "#F7F7F7",
      statusBarStyle: "light",
    },
    ...over,
  } as ProjectConfig;
}

function baseDialog(over: Partial<GeneratedDialog> = {}): GeneratedDialog {
  const snap = buildAmountSnapshot({
    deposit: 4500,
    profit1: 1200,
    profit2: 3400,
    profitFinal: 12800,
    currency: "MXN",
    clabe: "012345678901234567",
    bankName: "Spin",
  });
  const vars = buildAmountDisplayVars(snap);
  return {
    id: "d1",
    projectId: "nancy",
    scenarioId: "s1",
    legendId: "l1",
    clientName: "Carlos",
    amountPackId: "p1",
    deposit: snap.deposit,
    profit1: snap.profit1,
    profit2: snap.profit2,
    profit3: snap.profit3,
    profitFinal: snap.profitFinal,
    payoutAmount: snap.payoutAmount,
    clabe: snap.clabe!,
    accountLastDigits: "4567",
    depositBankId: "spin",
    payoutBankId: "spin",
    createdAt: new Date().toISOString(),
    messages: [
      {
        id: "m1",
        role: "manager",
        type: "text",
        content: `Deposita ${vars.deposit} a Spin CLABE ${vars.clabe}`,
        delayMinutes: 10,
      },
      {
        id: "m2",
        role: "manager",
        type: "text",
        content: `Ganaste ${vars.profitFinal} en total`,
        delayMinutes: 80,
      },
      {
        id: "m3",
        role: "manager",
        type: "text",
        content: `Te envié ${vars.clientShare}`,
        delayMinutes: 100,
      },
    ],
    ...over,
  };
}

describe("amount sync", () => {
  it("extracts money mentions", () => {
    expect(extractMoneyMentions("Deposita 4,500 MXN y gana $12,800")).toEqual(
      expect.arrayContaining([4500, 12800]),
    );
  });

  it("assertDialogAmountsConsistent passes for matching texts", () => {
    const dialog = baseDialog();
    const project = baseProject();
    expect(assertDialogAmountsConsistent(dialog, project).ok).toBe(true);
  });

  it("assertDialogAmountsConsistent flags foreign amounts", () => {
    const dialog = baseDialog({
      messages: [
        {
          id: "bad",
          role: "client",
          type: "text",
          content: "Te mandé 99999 pesos",
          delayMinutes: 1,
        },
      ],
    });
    const result = assertDialogAmountsConsistent(dialog, baseProject());
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("applyAmountOverride reinjects deposit template", () => {
    const project = baseProject();
    const dialog = baseDialog();
    const next = applyAmountOverride(dialog, project, "captura", 7777);
    expect(next.deposit).toBe(7777);
    expect(next.messages[0]?.content).toContain("7,777");
    expect(snapshotAmountSet(buildAmountSnapshot({
      deposit: next.deposit,
      profit1: next.profit1,
      profit2: next.profit2,
      profitFinal: next.profitFinal,
      currency: "MXN",
      payoutAmount: next.payoutAmount,
    })).has(7777)).toBe(true);
  });

  it("reinjectTemplatedMessages refreshes payout copy", () => {
    const project = baseProject({
      payoutMessageTemplate: "Te envié {{payout}}",
    });
    const dialog = baseDialog({
      payoutAmount: 9999,
      messages: [
        {
          id: "m3",
          role: "manager",
          type: "text",
          content: "Te envié 12,800",
          delayMinutes: 100,
        },
      ],
    });
    const next = reinjectTemplatedMessages(dialog, project);
    expect(next.messages.some((m) => m.content.includes("9,999"))).toBe(true);
  });

  it("applyAmountOverride receipt updates clientShare copy", () => {
    const project = baseProject();
    const dialog = baseDialog();
    const next = applyAmountOverride(dialog, project, "receipt", 9999);
    expect(next.payoutAmount).toBe(9999);
    expect(next.messages.some((m) => m.content.includes("9,999"))).toBe(true);
  });
});
