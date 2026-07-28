import { z } from "zod";
import { randomUUID } from "crypto";

import { markCombinationUsed, pickUnusedCombination } from "@/lib/combinations";
import { loadAppConfig } from "@/lib/config/loader";
import { pickUniqueAccountDigits } from "@/lib/account-digits";
import {
  buildDialogVars,
  formatAmount,
  generateClabe,
  injectTemplate,
} from "@/lib/format";
import { resolveLocaleProfileFromConfig } from "@/lib/i18n/locale-profile";
import {
  generateFullDialogBundle,
  rephraseClientPhrase,
  rephraseManagerPhrase,
  type AiDialogBundle,
} from "@/lib/openai/agents";
import { createLogger } from "@/lib/runtime/manager";
import { getEnv } from "@/lib/schemas/env";
import { getFileStore } from "@/lib/storage/file-store";
import {
  clientLegendSchema,
  dialogMessageSchema,
  findAmountPackForBetPack,
  scenarioSchema,
  selectAmountPacksForProject,
  type ClientLegend,
  type DialogMessage,
  type MessageType,
  type Scenario,
} from "@/lib/schemas";

const logger = createLogger("dialog-generator");

const scenariosFileSchema = z.union([
  z.array(scenarioSchema),
  z.object({ scenarios: z.array(scenarioSchema) }).transform((d) => d.scenarios),
]);

const managerScriptSchema = z.object({
  stages: z.record(
    z.string(),
    z.array(
      z.object({
        role: z.enum(["client", "manager"]),
        type: z.string(),
        content: z.string(),
        delayMinutes: z.number().int().min(0),
      }),
    ),
  ),
  clientReplies: z.record(
    z.string(),
    z.union([
      z.literal("doubt"),
      z.literal("gratitude"),
      z.array(z.string()),
      z.array(
        z.object({
          type: z.string(),
          content: z.string(),
          delayMinutes: z.number().int().min(0),
        }),
      ),
    ]),
  ),
});

export interface GeneratedDialog {
  id: string;
  projectId: string;
  scenarioId: string;
  legendId: string;
  clientName: string;
  amountPackId: string;
  deposit: number;
  profit1: number;
  profit2: number;
  profitFinal: number;
  /** Amount sent to client on payout slip (90% for Francesca). */
  payoutAmount: number;
  clabe: string;
  accountLastDigits: string;
  depositBankId: string;
  payoutBankId: string;
  messages: DialogMessage[];
  createdAt: string;
  aiAuthored?: boolean;
}

type ManagerStage = z.infer<typeof managerScriptSchema>["stages"][string][number];

const STAGE_ORDER = [
  "greeting",
  "trust_building",
  "conditions",
  "deposit",
  "bet_1",
  "bet_2",
  "bet_3",
  "completion",
  "payout",
  "gratitude",
] as const;

const STAGE_DELAY: Record<string, number> = {
  greeting: 1,
  trust_building: 3,
  conditions: 5,
  deposit: 8,
  bet_1: 15,
  bet_2: 25,
  bet_3: 35,
  completion: 45,
  payout: 55,
  gratitude: 58,
};

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function splitProblem(problem: string): string[] {
  const sentences = problem.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length >= 2) return sentences;
  const mid = Math.ceil(problem.length / 2);
  const space = problem.indexOf(" ", mid);
  if (space > 0) {
    return [problem.slice(0, space).trim(), problem.slice(space).trim()];
  }
  return [problem];
}

export class DialogGenerator {
  private readonly store = getFileStore();

  async loadScenarios(): Promise<Scenario[]> {
    return this.store.readJson("scenarios/index.json", scenariosFileSchema);
  }

  async loadLegends(): Promise<ClientLegend[]> {
    return this.store.readJson("scripts/legends.json", clientLegendSchema.array());
  }

  async loadManagerScript() {
    return this.store.readJson("scripts/manager.json", managerScriptSchema);
  }

  private async resolveClientReply(
    legend: ClientLegend,
    replyKey: string | string[],
    context: {
      clientName: string;
      managerName: string;
      deposit: number;
      profitFinal: number;
    },
  ): Promise<string> {
    if (Array.isArray(replyKey)) {
      return pickRandom(replyKey);
    }
    if (replyKey === "doubt") {
      const phrase = pickRandom(legend.doubtPhrases);
      if (getEnv().AI_DIALOG === "off") return phrase;
      return rephraseClientPhrase(phrase, "doubt", context);
    }
    const phrase = pickRandom(legend.gratitudePhrases);
    if (getEnv().AI_DIALOG === "off") return phrase;
    return rephraseClientPhrase(phrase, "gratitude", context);
  }

  private async buildManagerMessage(
    stage: ManagerStage,
    stageName: string,
    vars: Record<string, string | number>,
    context: {
      clientName: string;
      managerName: string;
      deposit: number;
      profitFinal: number;
    },
  ): Promise<DialogMessage> {
    const content = injectTemplate(stage.content, vars);
    const shouldAi =
      getEnv().AI_DIALOG !== "off" &&
      stage.role === "manager" &&
      stage.type === "text" &&
      !content.includes("{{") &&
      content.length > 12;

    const finalContent = shouldAi
      ? await rephraseManagerPhrase(content, stageName, context)
      : content;

    return dialogMessageSchema.parse({
      id: randomUUID(),
      role: stage.role,
      type: stage.type as MessageType,
      content: finalContent,
      delayMinutes: stage.delayMinutes,
    });
  }

  /** Replace AI placeholder tokens (e.g. literal "doubt") with real legend phrases. */
  private resolveAiTurnText(
    text: string,
    legend: AiDialogBundle["legend"] | { gratitudePhrases: string[]; doubtPhrases: string[] },
  ): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (/^(doubt|doubt\d+)$/i.test(trimmed)) {
      return pickRandom(legend.doubtPhrases);
    }
    if (/^(gratitude|thanks|gratitude\d+|thanks\d+)$/i.test(trimmed)) {
      return pickRandom(legend.gratitudePhrases);
    }
    // Strip accidental placeholder-only lines that AI sometimes emits mid-sentence.
    if (/^(openingPhrase|problem|motivation)$/i.test(trimmed)) {
      return null;
    }
    return text;
  }

  private pushMessage(
    messages: DialogMessage[],
    msg: Omit<DialogMessage, "id">,
    legend?: { gratitudePhrases: string[]; doubtPhrases: string[] },
  ): void {
    let content = msg.content;
    if (msg.role === "client" && msg.type === "text" && legend) {
      const fixed = this.resolveAiTurnText(content, legend);
      if (fixed == null) return;
      content = fixed;
    }
    messages.push(
      dialogMessageSchema.parse({
        id: randomUUID(),
        ...msg,
        content,
      }),
    );
  }

  /** Assemble dialog from AI legend + turns, inserting media at fixed stages. */
  private assembleAiDialog(params: {
    bundle: AiDialogBundle;
    legendId: string;
    stagesToUse: readonly string[];
    depositMessage: string;
    completionMessage: string;
    payoutMessage: string;
    conditionsTexts?: string[];
    /** Fixed Vlad captions after bet_1 / bet_2 / bet_3 (already interpolated). */
    betCaptions?: [string, string, string];
    includeConditionsImage?: boolean;
  }): DialogMessage[] {
    const { bundle, legendId, stagesToUse } = params;
    const messages: DialogMessage[] = [];
    const push = (msg: Omit<DialogMessage, "id">) =>
      this.pushMessage(messages, msg, bundle.legend);
    const pushTurn = (role: "client" | "manager", text: string, delayMinutes: number) => {
      const content = this.resolveAiTurnText(text, bundle.legend);
      if (!content) return;
      push({ role, type: "text", content, delayMinutes });
    };

    push({ role: "client", type: "sticker", content: "greeting", delayMinutes: 0 });
    push({
      role: "client",
      type: "text",
      content: bundle.legend.openingPhrase,
      delayMinutes: 0,
    });

    bundle.legend.problemParts.forEach((part, i) => {
      push({
        role: "client",
        type: "text",
        content: part,
        delayMinutes: i + 1,
      });
      if (i === 0) {
        push({
          role: "client",
          type: "image",
          content: legendId,
          delayMinutes: i + 1,
          metadata: { legendId },
        });
      }
    });

    push({
      role: "client",
      type: "text",
      content: bundle.legend.motivation,
      delayMinutes: 3,
    });

    const turnsByStage = new Map<string, typeof bundle.turns>();
    for (const turn of bundle.turns) {
      if (!stagesToUse.includes(turn.stage)) continue;
      const list = turnsByStage.get(turn.stage) ?? [];
      list.push(turn);
      turnsByStage.set(turn.stage, list);
    }

    for (const stageName of stagesToUse) {
      const baseDelay = STAGE_DELAY[stageName] ?? 10;
      const stageTurns = turnsByStage.get(stageName) ?? [];

      if (stageName === "conditions") {
        const fixed = (params.conditionsTexts ?? []).map((t) => t.trim()).filter(Boolean);
        // Image card first when present (Vlad: photo → copy), then fixed texts.
        if (params.includeConditionsImage) {
          push({
            role: "manager",
            type: "conditions",
            content: "conditions",
            delayMinutes: baseDelay,
          });
        }
        if (fixed.length > 0) {
          for (const text of fixed) {
            push({
              role: "manager",
              type: "text",
              content: text,
              delayMinutes: baseDelay,
            });
          }
        } else if (!params.includeConditionsImage) {
          for (const turn of stageTurns) {
            pushTurn(turn.role, turn.text, baseDelay);
          }
        }
        continue;
      }

      if (stageName === "deposit") {
        let injectedDeposit = false;
        for (const turn of stageTurns) {
          const isDepositTpl =
            turn.role === "manager" &&
            (turn.text.includes(params.depositMessage.slice(0, 20)) ||
              turn.text === params.depositMessage);
          if (isDepositTpl) {
            push({
              role: turn.role,
              type: "text",
              content: params.depositMessage,
              delayMinutes: baseDelay,
            });
            injectedDeposit = true;
          } else {
            pushTurn(turn.role, turn.text, baseDelay);
          }
        }
        if (!injectedDeposit) {
          push({
            role: "manager",
            type: "text",
            content: params.depositMessage,
            delayMinutes: baseDelay,
          });
        }
        push({
          role: "client",
          type: "captura",
          content: "payment_proof",
          delayMinutes: baseDelay + 2,
        });
        continue;
      }

      if (stageName === "bet_1" || stageName === "bet_2" || stageName === "bet_3") {
        push({
          role: "manager",
          type: "bet",
          content: stageName,
          delayMinutes: baseDelay,
        });
        const betIndex = stageName === "bet_1" ? 0 : stageName === "bet_2" ? 1 : 2;
        const fixedCaption = params.betCaptions?.[betIndex]?.trim();
        if (fixedCaption) {
          push({
            role: "manager",
            type: "text",
            content: fixedCaption,
            delayMinutes: baseDelay + 1,
          });
          // Keep client reactions from AI if present
          for (const turn of stageTurns) {
            if (turn.role === "client") pushTurn(turn.role, turn.text, baseDelay + 2);
          }
        } else {
          for (const turn of stageTurns) {
            pushTurn(turn.role, turn.text, baseDelay + 1);
          }
        }
        continue;
      }

      if (stageName === "completion") {
        let injected = false;
        for (const turn of stageTurns) {
          const isTpl =
            turn.role === "manager" &&
            (turn.text === params.completionMessage ||
              turn.text.includes(params.completionMessage.slice(0, 20)));
          if (isTpl) {
            push({
              role: turn.role,
              type: "text",
              content: params.completionMessage,
              delayMinutes: baseDelay,
            });
            injected = true;
          } else {
            pushTurn(turn.role, turn.text, baseDelay);
          }
        }
        if (!injected) {
          push({
            role: "manager",
            type: "text",
            content: params.completionMessage,
            delayMinutes: baseDelay,
          });
        }
        continue;
      }

      if (stageName === "payout") {
        push({
          role: "manager",
          type: "receipt",
          content: "receipt",
          delayMinutes: baseDelay,
        });
        let injected = false;
        for (const turn of stageTurns) {
          const isTpl =
            turn.role === "manager" &&
            (turn.text === params.payoutMessage ||
              turn.text.includes(params.payoutMessage.slice(0, 12)));
          if (isTpl) {
            push({
              role: turn.role,
              type: "text",
              content: params.payoutMessage,
              delayMinutes: baseDelay + 1,
            });
            injected = true;
          } else {
            pushTurn(turn.role, turn.text, baseDelay + 1);
          }
        }
        if (!injected) {
          push({
            role: "manager",
            type: "text",
            content: params.payoutMessage,
            delayMinutes: baseDelay + 1,
          });
        }
        continue;
      }

      for (const turn of stageTurns) {
        pushTurn(turn.role, turn.text, baseDelay);
      }
    }

    return messages;
  }

  private async assembleScriptDialog(params: {
    legend: ClientLegend;
    managerScript: z.infer<typeof managerScriptSchema>;
    vars: Record<string, string | number>;
    agentContext: {
      clientName: string;
      managerName: string;
      deposit: number;
      profitFinal: number;
    };
    stagesToUse: readonly string[];
    isUniqueCircle: boolean;
  }): Promise<DialogMessage[]> {
    const { legend, managerScript, vars, agentContext, stagesToUse, isUniqueCircle } = params;
    const messages: DialogMessage[] = [];
    const push = (msg: Omit<DialogMessage, "id">) => this.pushMessage(messages, msg, legend);
    let msgIndex = 0;

    push({ role: "client", type: "sticker", content: "greeting", delayMinutes: 0 });

    if (legend.openingPhrase) {
      push({
        role: "client",
        type: "text",
        content: legend.openingPhrase,
        delayMinutes: 0,
      });
    }

    const problemParts = splitProblem(legend.problem);
    const photoAfterIndex = legend.photoAfterProblemIndex ?? 0;

    problemParts.forEach((part, i) => {
      push({
        role: "client",
        type: "text",
        content: part,
        delayMinutes: i + 1,
      });

      if (i === photoAfterIndex) {
        push({
          role: "client",
          type: "image",
          content: legend.id,
          delayMinutes: i + 1,
          metadata: { legendId: legend.id },
        });
      }
      msgIndex++;
    });

    if (legend.motivation && problemParts.length < 3) {
      push({
        role: "client",
        type: "text",
        content: legend.motivation,
        delayMinutes: problemParts.length,
      });
    }

    for (const stageName of stagesToUse) {
      const stageMessages = managerScript.stages[stageName] ?? [];
      for (const stageMsg of stageMessages) {
        push(await this.buildManagerMessage(stageMsg, stageName, vars, agentContext));
      }

      const clientReply = managerScript.clientReplies[stageName];
      if (clientReply) {
        if (Array.isArray(clientReply) && clientReply.length > 0 && typeof clientReply[0] === "object") {
          for (const item of clientReply) {
            if (typeof item === "object" && "type" in item) {
              push({
                role: "client",
                type: item.type as MessageType,
                content: item.content,
                delayMinutes: item.delayMinutes,
              });
            }
          }
        } else {
          const content = await this.resolveClientReply(
            legend,
            clientReply as string | string[],
            agentContext,
          );
          push({
            role: "client",
            type: "text",
            content,
            delayMinutes: stageMessages.at(-1)?.delayMinutes
              ? stageMessages.at(-1)!.delayMinutes + 1
              : msgIndex,
          });
        }
      }

      if (stageName === "deposit") {
        const capturaSteps = managerScript.clientReplies.deposit_captura;
        if (Array.isArray(capturaSteps)) {
          for (const step of capturaSteps) {
            if (typeof step === "object" && "type" in step) {
              push({
                role: "client",
                type: step.type as MessageType,
                content: step.content,
                delayMinutes: step.delayMinutes,
              });
            }
          }
        }
      }
    }

    if (isUniqueCircle) {
      const extraThanks = await this.resolveClientReply(legend, "gratitude", agentContext);
      push({
        role: "client",
        type: "text",
        content: extraThanks,
        delayMinutes: 58,
      });
    }

    return messages;
  }

  async generate(params: {
    projectId: string;
    scenarioId?: string;
    reviewType?: "small" | "big" | "unique_circle";
    /** When set, force amount pack bound to this bet image pack (1:1). */
    betPack?: number;
  }): Promise<GeneratedDialog> {
    const config = await loadAppConfig();
    const project = config.projects.projects.find((p) => p.id === params.projectId);
    if (!project) throw new Error(`Project not found: ${params.projectId}`);

    const [scenarios, legends, managerScript] = await Promise.all([
      this.loadScenarios(),
      this.loadLegends(),
      this.loadManagerScript(),
    ]);

    const scenario =
      scenarios.find((s) => s.id === params.scenarioId && s.enabled) ??
      scenarios.find((s) => s.projectId === params.projectId && s.enabled);
    if (!scenario) throw new Error(`No scenario for project: ${params.projectId}`);

    const availableLegends = legends.filter((l) => scenario.legendIds.includes(l.id));
    if (availableLegends.length === 0) throw new Error("No legends for scenario");

    const namePool = config.geo.clientNamePools[project.locale] ?? ["Cliente"];
    const localeProfile = resolveLocaleProfileFromConfig(config.geo, project.locale);
    const bankCountry = localeProfile.bankCountry;
    const depositBanks = config.banks.depositBanks.filter((b) => b.country === bankCountry);
    const payoutBanks = config.banks.payoutBanks.filter((b) => b.country === bankCountry);
    const projectPacks = selectAmountPacksForProject(
      config.amounts.packs,
      params.projectId,
      project.currency,
    );
    if (projectPacks.length === 0) {
      throw new Error(
        `No amount packs for project=${params.projectId} currency=${project.currency}`,
      );
    }

    const forcedPack =
      params.betPack != null ? findAmountPackForBetPack(projectPacks, params.betPack) : null;
    const amountPackIds = forcedPack ? [forcedPack.id] : projectPacks.map((p) => p.id);
    const combination = await pickUnusedCombination({
      projectId: params.projectId,
      legendIds: availableLegends.map((l) => l.id),
      amountPackIds,
      clientNames: namePool,
    });

    const seedLegend =
      availableLegends.find((l) => l.id === combination.legendId) ?? availableLegends[0]!;
    const amountPack =
      forcedPack ??
      projectPacks.find((p) => p.id === combination.amountPackId) ??
      projectPacks[0]!;

    const depositBank = pickRandom(depositBanks.length > 0 ? depositBanks : config.banks.depositBanks);
    const payoutBank = pickRandom(payoutBanks.length > 0 ? payoutBanks : config.banks.payoutBanks);
    const accountLastDigits = await pickUniqueAccountDigits({
      min: config.amounts.accountLastDigits.min,
      max: config.amounts.accountLastDigits.max,
      projectId: params.projectId,
    });
    const clabe = generateClabe(depositBank.clabePrefix, accountLastDigits);

    const commissionRate = project.id === "francesca" ? 0.1 : 0;
    const commissionAmount = Math.round(amountPack.profitFinal * commissionRate);
    const clientShareAmount =
      commissionRate > 0 ? amountPack.profitFinal - commissionAmount : amountPack.profitFinal;

    const bankName = depositBank.shortName ?? depositBank.name;
    const displayVars = {
      clabe,
      bankName,
      bank: bankName,
      deposit: formatAmount(amountPack.deposit, project.currency),
      profit1: formatAmount(amountPack.profit1, project.currency),
      profit2: formatAmount(amountPack.profit2, project.currency),
      profitFinal: formatAmount(amountPack.profitFinal, project.currency),
      commission: formatAmount(commissionAmount, project.currency),
      clientShare: formatAmount(clientShareAmount, project.currency),
      currency: project.currency,
    };
    const depositMessage = injectTemplate(project.depositMessageTemplate, displayVars);
    const completionMessage = injectTemplate(project.completionMessageTemplate, displayVars);
    const payoutMessage = injectTemplate(project.payoutMessageTemplate, displayVars);

    const vars = buildDialogVars({
      deposit: amountPack.deposit,
      profitFinal: amountPack.profitFinal,
      clabe,
      depositMessage,
      completionMessage,
      payoutMessage,
    });

    const clientName = combination.clientName.split(" ")[0] ?? combination.clientName;
    const agentContext = {
      clientName,
      managerName: project.managerName,
      deposit: amountPack.deposit,
      profitFinal: amountPack.profitFinal,
    };

    const isSmallReview = params.reviewType === "small";
    const isUniqueCircle = params.reviewType === "unique_circle";
    const stagesToUse = isSmallReview ? STAGE_ORDER.slice(0, 6) : STAGE_ORDER;

    const dialogAiOn = getEnv().AI_DIALOG !== "off";
    const aiBundle = dialogAiOn
      ? await generateFullDialogBundle({
          clientName,
          managerName: project.managerName,
          deposit: amountPack.deposit,
          profit1: amountPack.profit1,
          profit2: amountPack.profit2,
          profitFinal: amountPack.profitFinal,
          currency: project.currency,
          locale: project.locale,
          reviewType: params.reviewType ?? "big",
          depositMessage,
          completionMessage,
          payoutMessage,
        })
      : null;

    const legendId = aiBundle ? `ai_${randomUUID().slice(0, 8)}` : seedLegend.id;
    let messages: DialogMessage[];
    let aiAuthored = false;

    if (aiBundle) {
      const formatProfit = (n: number) => formatAmount(n, project.currency);
      const betCaptionVars = {
        deposit: formatProfit(amountPack.deposit),
        profit1: formatProfit(amountPack.profit1),
        profit2: formatProfit(amountPack.profit2),
        profitFinal: formatProfit(amountPack.profitFinal),
        commission: formatProfit(commissionAmount),
        clientShare: formatProfit(clientShareAmount),
        currency: project.currency,
      };
      const betCaptions = project.betCaptionTemplates
        ? ([
            injectTemplate(project.betCaptionTemplates[0], betCaptionVars),
            injectTemplate(project.betCaptionTemplates[1], betCaptionVars),
            injectTemplate(project.betCaptionTemplates[2], betCaptionVars),
          ] as [string, string, string])
        : undefined;

      messages = this.assembleAiDialog({
        bundle: aiBundle,
        legendId,
        stagesToUse,
        depositMessage,
        completionMessage,
        payoutMessage,
        includeConditionsImage: Boolean(project.conditionsImagePath),
        ...(project.conditionsTexts?.length ? { conditionsTexts: project.conditionsTexts } : {}),
        ...(betCaptions ? { betCaptions } : {}),
      });
      aiAuthored = true;
    } else {
      messages = await this.assembleScriptDialog({
        legend: seedLegend,
        managerScript,
        vars,
        agentContext,
        stagesToUse,
        isUniqueCircle,
      });
    }

    await markCombinationUsed(params.projectId, combination);
    await logger.info("Dialog generated", {
      projectId: params.projectId,
      scenarioId: scenario.id,
      legendId,
      messagesCount: messages.length,
      reviewType: params.reviewType ?? "big",
      aiAuthored,
    });

    return {
      id: randomUUID(),
      projectId: params.projectId,
      scenarioId: scenario.id,
      legendId,
      clientName,
      amountPackId: amountPack.id,
      deposit: amountPack.deposit,
      profit1: amountPack.profit1,
      profit2: amountPack.profit2,
      profitFinal: amountPack.profitFinal,
      payoutAmount: clientShareAmount,
      clabe,
      accountLastDigits,
      depositBankId: depositBank.id,
      payoutBankId: payoutBank.id,
      messages,
      createdAt: new Date().toISOString(),
      aiAuthored,
    };
  }
}

let instance: DialogGenerator | null = null;

export function getDialogGenerator(): DialogGenerator {
  if (!instance) instance = new DialogGenerator();
  return instance;
}
