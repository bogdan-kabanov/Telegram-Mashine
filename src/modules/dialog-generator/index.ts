import { z } from "zod";
import { randomUUID } from "crypto";

import { markCombinationUsed, pickUnusedCombination } from "@/lib/combinations";
import { loadAppConfig } from "@/lib/config/loader";
import {
  amountPackToVars,
  buildDialogVars,
  generateClabe,
  injectTemplate,
  randomAccountLastDigits,
} from "@/lib/format";
import { generateDialogStub } from "@/lib/openai/client";
import { createLogger } from "@/lib/runtime/manager";
import { getFileStore } from "@/lib/storage/file-store";
import {
  clientLegendSchema,
  dialogMessageSchema,
  scenarioSchema,
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
  clabe: string;
  accountLastDigits: string;
  depositBankId: string;
  payoutBankId: string;
  messages: DialogMessage[];
  createdAt: string;
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
  ): Promise<string> {
    if (Array.isArray(replyKey)) {
      return pickRandom(replyKey);
    }
    if (replyKey === "doubt") {
      const phrase = pickRandom(legend.doubtPhrases);
      const ai = await generateDialogStub(
        `Rephrase this Spanish doubt phrase naturally (1 sentence): "${phrase}"`,
      );
      return ai.startsWith("[stub]") ? phrase : ai.trim();
    }
    const phrase = pickRandom(legend.gratitudePhrases);
    const ai = await generateDialogStub(
      `Rephrase this Spanish gratitude phrase naturally (1-2 sentences): "${phrase}"`,
    );
    return ai.startsWith("[stub]") ? phrase : ai.trim();
  }

  private buildManagerMessage(
    stage: ManagerStage,
    vars: Record<string, string | number>,
  ): DialogMessage {
    return dialogMessageSchema.parse({
      id: randomUUID(),
      role: stage.role,
      type: stage.type as MessageType,
      content: injectTemplate(stage.content, vars),
      delayMinutes: stage.delayMinutes,
    });
  }

  async generate(params: {
    projectId: string;
    scenarioId?: string;
    reviewType?: "small" | "big" | "unique_circle";
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
    const combination = await pickUnusedCombination({
      projectId: params.projectId,
      legendIds: availableLegends.map((l) => l.id),
      amountPackIds: config.amounts.packs.map((p) => p.id),
      clientNames: namePool,
    });

    const legend = availableLegends.find((l) => l.id === combination.legendId) ?? availableLegends[0]!;
    const amountPack =
      config.amounts.packs.find((p) => p.id === combination.amountPackId) ?? config.amounts.packs[0]!;

    const depositBank = pickRandom(config.banks.depositBanks);
    const payoutBank = pickRandom(config.banks.payoutBanks);
    const accountLastDigits = randomAccountLastDigits(
      config.amounts.accountLastDigits.min,
      config.amounts.accountLastDigits.max,
    );
    const clabe = generateClabe(depositBank.clabePrefix, accountLastDigits);

    const amountVars = amountPackToVars(amountPack);
    const depositMessage = injectTemplate(project.depositMessageTemplate, { clabe, ...amountVars });
    const completionMessage = injectTemplate(project.completionMessageTemplate, { clabe, ...amountVars });
    const payoutMessage = injectTemplate(project.payoutMessageTemplate, { clabe, ...amountVars });

    const vars = buildDialogVars({
      deposit: amountPack.deposit,
      profitFinal: amountPack.profitFinal,
      clabe,
      depositMessage,
      completionMessage,
      payoutMessage,
    });

    const messages: DialogMessage[] = [];
    let msgIndex = 0;

    const push = (msg: Omit<DialogMessage, "id">) => {
      messages.push(
        dialogMessageSchema.parse({
          id: randomUUID(),
          ...msg,
          delayMinutes: msg.delayMinutes,
        }),
      );
      msgIndex++;
    };

    push({
      role: "client",
      type: "sticker",
      content: "greeting",
      delayMinutes: 0,
    });

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
    });

    if (legend.motivation && problemParts.length < 3) {
      push({
        role: "client",
        type: "text",
        content: legend.motivation,
        delayMinutes: problemParts.length,
      });
    }

    const isSmallReview = params.reviewType === "small";
    const isUniqueCircle = params.reviewType === "unique_circle";
    const stagesToUse = isSmallReview
      ? STAGE_ORDER.slice(0, 6)
      : STAGE_ORDER;

    for (const stageName of stagesToUse) {
      const stageMessages = managerScript.stages[stageName] ?? [];
      for (const stageMsg of stageMessages) {
        push(this.buildManagerMessage(stageMsg, vars));
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
          const content = await this.resolveClientReply(legend, clientReply as string | string[]);
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
      const extraThanks = await this.resolveClientReply(legend, "gratitude");
      push({
        role: "client",
        type: "text",
        content: extraThanks,
        delayMinutes: 58,
      });
    }

    await markCombinationUsed(params.projectId, combination);
    await logger.info("Dialog generated", {
      projectId: params.projectId,
      scenarioId: scenario.id,
      legendId: legend.id,
      messagesCount: messages.length,
      reviewType: params.reviewType ?? "big",
    });

    return {
      id: randomUUID(),
      projectId: params.projectId,
      scenarioId: scenario.id,
      legendId: legend.id,
      clientName: combination.clientName.split(" ")[0] ?? combination.clientName,
      amountPackId: amountPack.id,
      deposit: amountPack.deposit,
      profit1: amountPack.profit1,
      profit2: amountPack.profit2,
      profitFinal: amountPack.profitFinal,
      clabe,
      accountLastDigits,
      depositBankId: depositBank.id,
      payoutBankId: payoutBank.id,
      messages,
      createdAt: new Date().toISOString(),
    };
  }
}

let instance: DialogGenerator | null = null;

export function getDialogGenerator(): DialogGenerator {
  if (!instance) instance = new DialogGenerator();
  return instance;
}
