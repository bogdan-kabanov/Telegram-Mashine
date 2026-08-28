import { z } from "zod";
import { randomUUID } from "crypto";

import { betProfitForSlot } from "@/lib/amounts/split-profit";
import { markCombinationUsed, pickUnusedCombination } from "@/lib/combinations";
import { loadAppConfig } from "@/lib/config/loader";
import { pickUniqueAccountDigits } from "@/lib/account-digits";
import {
  buildDialogVars,
  formatAmount,
  generateClabe,
  injectTemplate,
} from "@/lib/format";
import {
  generateClientCardNumber,
  stripInvertedPunctuation,
} from "@/lib/format/spanish-chat";
import { resolveLocaleProfileFromConfig } from "@/lib/i18n/locale-profile";
import {
  generateFullDialogBundle,
  rephraseClientPhrase,
  rephraseManagerPhrase,
  type AiDialogBundle,
} from "@/lib/openai/agents";
import { createLogger } from "@/lib/runtime/manager";
import { getEnv } from "@/lib/schemas/env";
import { isStandaloneLegend } from "@/lib/legends/standalone";
import { getFileStore } from "@/lib/storage/file-store";
import { DialogClock } from "@/lib/dialog/timing";
import {
  clientLegendSchema,
  dialogMessageSchema,
  findAmountPackForBetPack,
  scenarioSchema,
  selectAmountPacksForProject,
  type AmountPack,
  type ClientLegend,
  type DialogMessage,
  type MessageType,
  type Scenario,
} from "@/lib/schemas";
import type { CustomAmounts } from "@/lib/amounts/split-profit";

const OPERATOR_CUSTOM_PACK_ID = "operator_custom";

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
  profit3?: number;
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

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Occasionally insert a client voice bubble after the personal story block. */
function injectClientVoiceMessage(
  messages: DialogMessage[],
  chance: number,
  rng: () => number = Math.random,
): DialogMessage[] {
  if (chance <= 0 || rng() >= chance) return messages;

  let insertIdx = messages.findIndex((m) => m.type === "conditions");
  if (insertIdx < 0) {
    insertIdx = messages.findIndex((m) => m.type === "captura");
  }
  if (insertIdx < 0) insertIdx = messages.length;

  const prevDelay = insertIdx > 0 ? (messages[insertIdx - 1]?.delayMinutes ?? 1) : 1;
  const durationSec = 5 + Math.floor(rng() * 25);
  const voiceMsg: DialogMessage = {
    id: randomUUID(),
    role: "client",
    type: "voice",
    content: "voice",
    delayMinutes: prevDelay + 1,
    metadata: { durationSec },
  };

  const result = [...messages];
  result.splice(insertIdx, 0, voiceMsg);
  return result;
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

function isRussianLocale(locale?: string): boolean {
  return Boolean(locale?.toLowerCase().startsWith("ru"));
}

function fallbackManagerGreeting(locale?: string): string {
  return isRussianLocale(locale)
    ? "Здравствуйте, расскажите что случилось. Я здесь, чтобы помочь 💙"
    : "Hola, cuéntame qué te pasa. Estoy aquí para ayudarte 💙";
}

function fallbackManagerEmpathy(locale?: string): string {
  return isRussianLocale(locale)
    ? "Мне очень жаль, что вам приходится через это проходить. Давайте посмотрим, чем я могу помочь 🙏"
    : "Lo siento mucho por lo que estás pasando. Vamos a ver cómo podemos ayudarte con esto 🙏";
}

function fallbackDepositEncourage(locale?: string): string {
  return isRussianLocale(locale)
    ? "Да, доверяйте. Если идёте по шагам — всё получится 💙"
    : "Sí, confía. Si sigues los pasos, todo va a salir bien 💙";
}

export class DialogGenerator {
  private readonly store = getFileStore();

  async loadScenarios(): Promise<Scenario[]> {
    return this.store.readJson("scenarios/index.json", scenariosFileSchema);
  }

  async loadLegends(): Promise<ClientLegend[]> {
    return this.store.readJson("scripts/legends.json", clientLegendSchema.array());
  }

  async loadManagerScript(locale?: string) {
    const candidates: string[] = [];
    if (locale) {
      candidates.push(`scripts/manager.${locale}.json`);
      const lang = locale.split("-")[0];
      if (lang && lang !== locale) {
        candidates.push(`scripts/manager.${lang}.json`);
      }
    }

    for (const path of candidates) {
      try {
        if (!(await this.store.exists(path))) continue;
        return await this.store.readJson(path, managerScriptSchema);
      } catch (error) {
        await logger.warn("Manager script unreadable — trying next", {
          path,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    if (locale && !locale.toLowerCase().startsWith("es")) {
      await logger.warn("No localized manager script — falling back to Spanish default", {
        locale,
        tried: candidates,
      });
    }
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
    delayMinutes: number,
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
      content: stripInvertedPunctuation(finalContent),
      delayMinutes,
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
    if (msg.type === "text") {
      content = stripInvertedPunctuation(content);
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
    /** Script fallbacks when AI under-delivers greeting/trust conversation. */
    managerScript?: z.infer<typeof managerScriptSchema>;
    locale?: string;
  }): DialogMessage[] {
    const { bundle, legendId, stagesToUse, locale } = params;
    const messages: DialogMessage[] = [];
    const clock = new DialogClock();
    const push = (msg: Omit<DialogMessage, "id">) =>
      this.pushMessage(messages, msg, bundle.legend);
    const pushTurn = (role: "client" | "manager", text: string, delayMinutes: number) => {
      const content = this.resolveAiTurnText(text, bundle.legend);
      if (!content) return;
      push({ role, type: "text", content, delayMinutes });
    };

    const turnsByStage = new Map<string, typeof bundle.turns>();
    for (const turn of bundle.turns) {
      if (!stagesToUse.includes(turn.stage)) continue;
      const list = turnsByStage.get(turn.stage) ?? [];
      list.push(turn);
      turnsByStage.set(turn.stage, list);
    }

    // --- Personal legend conversation FIRST (Vlad: not just deposit→bets→payout) ---
    push({ role: "client", type: "sticker", content: "greeting", delayMinutes: clock.atStart("client") });
    push({
      role: "client",
      type: "text",
      content: bundle.legend.openingPhrase,
      delayMinutes: clock.clientBurst(),
    });

    const greetingTurns = turnsByStage.get("greeting") ?? [];
    clock.setStage("greeting");
    if (greetingTurns.length > 0) {
      for (const turn of greetingTurns) {
        pushTurn(turn.role, turn.text, clock.next(turn.role));
      }
    } else {
      push({
        role: "manager",
        type: "text",
        content: fallbackManagerGreeting(locale),
        delayMinutes: clock.next("manager"),
      });
    }

    bundle.legend.problemParts.forEach((part, i) => {
      push({
        role: "client",
        type: "text",
        content: part,
        delayMinutes: clock.clientBurst(),
      });
      if (i === 0 && !isStandaloneLegend(legendId)) {
        push({
          role: "client",
          type: "image",
          content: legendId,
          delayMinutes: clock.sameTime(),
          metadata: { legendId },
        });
      }
    });

    const trustTurns = turnsByStage.get("trust_building") ?? [];
    const empathyTurns = trustTurns.slice(0, Math.min(4, trustTurns.length));
    const restTrustTurns = trustTurns.slice(empathyTurns.length);

    clock.setStage("trust_building");
    if (empathyTurns.length > 0) {
      for (const turn of empathyTurns) {
        pushTurn(turn.role, turn.text, clock.next(turn.role));
      }
    } else {
      push({
        role: "manager",
        type: "text",
        content: fallbackManagerEmpathy(locale),
        delayMinutes: clock.next("manager"),
      });
      push({
        role: "client",
        type: "text",
        content: pickRandom(bundle.legend.doubtPhrases),
        delayMinutes: clock.next("client"),
      });
    }

    push({
      role: "client",
      type: "text",
      content: bundle.legend.motivation,
      delayMinutes: clock.clientBurst(),
    });

    if (restTrustTurns.length > 0) {
      for (const turn of restTrustTurns) {
        pushTurn(turn.role, turn.text, clock.next(turn.role));
      }
    } else if (empathyTurns.length === 0 && params.managerScript) {
      for (const stageMsg of params.managerScript.stages.trust_building ?? []) {
        if (stageMsg.type === "text") {
          push({
            role: stageMsg.role,
            type: "text",
            content: stageMsg.content,
            delayMinutes: clock.next(stageMsg.role),
          });
        }
      }
      push({
        role: "client",
        type: "text",
        content: pickRandom(bundle.legend.doubtPhrases),
        delayMinutes: clock.next("client"),
      });
    }

    // Money/ops stages after the personal story
    for (const stageName of stagesToUse) {
      if (stageName === "greeting" || stageName === "trust_building") continue;

      clock.setStage(stageName);
      const stageTurns = turnsByStage.get(stageName) ?? [];

      if (stageName === "conditions") {
        const fixed = (params.conditionsTexts ?? []).map((t) => t.trim()).filter(Boolean);
        if (params.includeConditionsImage) {
          push({
            role: "manager",
            type: "conditions",
            content: "conditions",
            delayMinutes: clock.next("manager"),
          });
        }
        if (fixed.length > 0) {
          for (const text of fixed) {
            push({
              role: "manager",
              type: "text",
              content: text,
              delayMinutes: clock.managerBurst(),
            });
          }
        } else if (!params.includeConditionsImage) {
          for (const turn of stageTurns) {
            pushTurn(turn.role, turn.text, clock.next(turn.role));
          }
        }
        continue;
      }

      if (stageName === "deposit") {
        push({
          role: "manager",
          type: "text",
          content: params.depositMessage,
          delayMinutes: clock.next("manager"),
        });
        let clientSpoke = false;
        for (const turn of stageTurns) {
          if (turn.role !== "client") continue;
          pushTurn(turn.role, turn.text, clock.next("client"));
          clientSpoke = true;
        }
        if (!clientSpoke) {
          push({
            role: "client",
            type: "text",
            content: pickRandom(bundle.legend.doubtPhrases),
            delayMinutes: clock.next("client"),
          });
        }
        push({
          role: "manager",
          type: "text",
          content: fallbackDepositEncourage(locale),
          delayMinutes: clock.next("manager"),
        });
        push({
          role: "client",
          type: "captura",
          content: "payment_proof",
          delayMinutes: clock.next("client", "captura"),
        });
        continue;
      }

      if (stageName === "bet_1" || stageName === "bet_2" || stageName === "bet_3") {
        push({
          role: "manager",
          type: "bet",
          content: stageName,
          delayMinutes: clock.next("manager"),
        });
        const betIndex = stageName === "bet_1" ? 0 : stageName === "bet_2" ? 1 : 2;
        const fixedCaption = params.betCaptions?.[betIndex]?.trim();
        if (fixedCaption) {
          push({
            role: "manager",
            type: "text",
            content: fixedCaption,
            delayMinutes: clock.managerBurst(),
          });
          for (const turn of stageTurns) {
            if (turn.role === "client") pushTurn(turn.role, turn.text, clock.next("client", "bet_reply"));
          }
        } else {
          for (const turn of stageTurns) {
            if (turn.role === "client") {
              pushTurn(turn.role, turn.text, clock.next("client", "bet_reply"));
            } else {
              pushTurn(turn.role, turn.text, clock.managerBurst());
            }
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
              delayMinutes: clock.next("manager"),
            });
            injected = true;
          } else if (turn.role === "client") {
            pushTurn(turn.role, turn.text, clock.next("client"));
          } else {
            pushTurn(turn.role, turn.text, clock.managerBurst());
          }
        }
        if (!injected) {
          push({
            role: "manager",
            type: "text",
            content: params.completionMessage,
            delayMinutes: clock.next("manager"),
          });
        }
        push({
          role: "client",
          type: "text",
          content: generateClientCardNumber(),
          delayMinutes: clock.next("client"),
        });
        continue;
      }

      if (stageName === "payout") {
        push({
          role: "manager",
          type: "receipt",
          content: "receipt",
          delayMinutes: clock.next("manager"),
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
              delayMinutes: clock.managerBurst(),
            });
            injected = true;
          } else {
            pushTurn(turn.role, turn.text, clock.next(turn.role));
          }
        }
        if (!injected) {
          push({
            role: "manager",
            type: "text",
            content: params.payoutMessage,
            delayMinutes: clock.managerBurst(),
          });
        }
        continue;
      }

      for (const turn of stageTurns) {
        pushTurn(turn.role, turn.text, clock.next(turn.role));
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
    locale?: string;
  }): Promise<DialogMessage[]> {
    const { legend, managerScript, vars, agentContext, stagesToUse, isUniqueCircle, locale } = params;
    const messages: DialogMessage[] = [];
    const clock = new DialogClock();
    const push = (msg: Omit<DialogMessage, "id">) => this.pushMessage(messages, msg, legend);

    const pushStage = async (stageName: string) => {
      clock.setStage(stageName);
      const stageMessages = managerScript.stages[stageName] ?? [];
      for (const stageMsg of stageMessages) {
        const delayMinutes = clock.next(stageMsg.role);
        push(await this.buildManagerMessage(stageMsg, stageName, vars, agentContext, delayMinutes));
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
                delayMinutes: clock.next("client"),
              });
            }
          }
        } else {
          const content = await this.resolveClientReply(
            legend,
            clientReply as string | string[],
            agentContext,
          );
          const isBetStage = stageName === "bet_1" || stageName === "bet_2" || stageName === "bet_3";
          push({
            role: "client",
            type: "text",
            content,
            delayMinutes: isBetStage ? clock.next("client", "bet_reply") : clock.next("client"),
          });
        }
      }

      if (stageName === "deposit") {
        push({
          role: "manager",
          type: "text",
          content: fallbackDepositEncourage(locale),
          delayMinutes: clock.next("manager"),
        });
        const capturaSteps = managerScript.clientReplies.deposit_captura;
        if (Array.isArray(capturaSteps)) {
          for (const step of capturaSteps) {
            if (typeof step === "object" && "type" in step) {
              push({
                role: "client",
                type: step.type as MessageType,
                content: step.content,
                delayMinutes: clock.next("client", "captura"),
              });
            }
          }
        }
      }

      if (stageName === "completion") {
        push({
          role: "client",
          type: "text",
          content: generateClientCardNumber(),
          delayMinutes: clock.next("client"),
        });
      }
    };

    // Personal story first, then money stages (Vlad)
    push({ role: "client", type: "sticker", content: "greeting", delayMinutes: clock.atStart("client") });

    if (legend.openingPhrase) {
      push({
        role: "client",
        type: "text",
        content: legend.openingPhrase,
        delayMinutes: clock.clientBurst(),
      });
    }

    if (stagesToUse.includes("greeting")) {
      await pushStage("greeting");
    }

    const problemParts = splitProblem(legend.problem);
    const photoAfterIndex = legend.photoAfterProblemIndex ?? 0;

    problemParts.forEach((part, i) => {
      push({
        role: "client",
        type: "text",
        content: part,
        delayMinutes: clock.clientBurst(),
      });

      if (i === photoAfterIndex && photoAfterIndex >= 0 && !isStandaloneLegend(legend.id)) {
        push({
          role: "client",
          type: "image",
          content: legend.id,
          delayMinutes: clock.sameTime(),
          metadata: { legendId: legend.id },
        });
      }
    });

    if (legend.motivation) {
      push({
        role: "client",
        type: "text",
        content: legend.motivation,
        delayMinutes: clock.clientBurst(),
      });
    }

    if (stagesToUse.includes("trust_building")) {
      await pushStage("trust_building");
    }

    for (const stageName of stagesToUse) {
      if (stageName === "greeting" || stageName === "trust_building") continue;
      await pushStage(stageName);
    }

    if (isUniqueCircle) {
      clock.setStage("gratitude");
      const extraThanks = await this.resolveClientReply(legend, "gratitude", agentContext);
      push({
        role: "client",
        type: "text",
        content: extraThanks,
        delayMinutes: clock.next("client"),
      });
    }

    return messages;
  }

  async generate(params: {
    projectId: string;
    scenarioId?: string;
    reviewType?: "small" | "big" | "unique_circle";
    /** When set, force this legend (e.g. weekly circle already picked). */
    forcedLegendId?: string;
    /** When set, force amount pack bound to this bet image pack (1:1). */
    betPack?: number;
    /** Explicit amount pack from constructor / operator (overrides betPack mapping). */
    amountPackId?: string;
    /** Operator-defined amounts — decoupled from config/amounts.json rows. */
    customAmounts?: CustomAmounts;
  }): Promise<GeneratedDialog> {
    const config = await loadAppConfig();
    const project = config.projects.projects.find((p) => p.id === params.projectId);
    if (!project) throw new Error(`Project not found: ${params.projectId}`);

    const [scenarios, legends, managerScript] = await Promise.all([
      this.loadScenarios(),
      this.loadLegends(),
      this.loadManagerScript(project.locale),
    ]);

    const scenario =
      scenarios.find((s) => s.id === params.scenarioId && s.enabled) ??
      scenarios.find((s) => s.projectId === params.projectId && s.enabled);
    if (!scenario) throw new Error(`No scenario for project: ${params.projectId}`);

    const availableLegends = legends.filter(
      (l) =>
        scenario.legendIds.includes(l.id) &&
        (l.locale === project.locale || l.locale.startsWith(project.locale.split("-")[0]!)),
    );
    const localeLegends = legends.filter(
      (l) => l.locale === project.locale || l.locale.startsWith(project.locale.split("-")[0]!),
    );
    if (availableLegends.length === 0 && !params.forcedLegendId) {
      throw new Error(
        `No legends for scenario=${scenario.id} locale=${project.locale} (ids: ${scenario.legendIds.join(", ")})`,
      );
    }

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

    const forcedLegend = params.forcedLegendId
      ? localeLegends.find((l) => l.id === params.forcedLegendId) ??
        legends.find((l) => l.id === params.forcedLegendId)
      : null;

    const forcedPack = params.amountPackId
      ? projectPacks.find((p) => p.id === params.amountPackId) ?? null
      : params.customAmounts
        ? ({
            id: OPERATOR_CUSTOM_PACK_ID,
            projectId: params.projectId,
            deposit: params.customAmounts.deposit,
            profit1: params.customAmounts.profit1,
            profit2: params.customAmounts.profit2,
            profit3: params.customAmounts.profit3,
            profitFinal: params.customAmounts.profitFinal,
            currency: project.currency,
          } satisfies AmountPack & { profit3: number })
        : params.betPack != null
          ? findAmountPackForBetPack(projectPacks, params.betPack)
          : null;
    if (params.amountPackId && !forcedPack) {
      throw new Error(`Пак сумм не найден для этого проекта: ${params.amountPackId}`);
    }
    if (params.customAmounts && !forcedPack) {
      throw new Error("Некорректные суммы для отзыва");
    }
    const amountPackIds = forcedPack ? [forcedPack.id] : projectPacks.map((p) => p.id);
    const combination = await pickUnusedCombination({
      projectId: params.projectId,
      legendIds: forcedLegend
        ? [forcedLegend.id]
        : availableLegends.map((l) => l.id),
      amountPackIds,
      clientNames: namePool,
    });

    const seedLegend =
      forcedLegend ??
      availableLegends.find((l) => l.id === combination.legendId) ??
      availableLegends[0]!;
    const amountPack =
      forcedPack ??
      projectPacks.find((p) => p.id === combination.amountPackId) ??
      projectPacks[0]!;
    const profit3 =
      "profit3" in amountPack && typeof amountPack.profit3 === "number" && amountPack.profit3 > 0
        ? amountPack.profit3
        : betProfitForSlot(
            {
              profit1: amountPack.profit1,
              profit2: amountPack.profit2,
              profit3: 0,
              profitFinal: amountPack.profitFinal,
            },
            3,
          );

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
      locale: project.locale,
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
          seedLegend: {
            title: seedLegend.title,
            openingPhrase: seedLegend.openingPhrase ?? (
              project.locale.toLowerCase().startsWith("ru")
                ? "Здравствуйте… мне нужна ваша помощь"
                : "Hola… necesito tu ayuda"
            ),
            problem: seedLegend.problem,
            motivation: seedLegend.motivation,
            doubtPhrases: seedLegend.doubtPhrases,
            gratitudePhrases: seedLegend.gratitudePhrases,
          },
        })
      : null;

    const legendId = seedLegend.id;
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
        managerScript,
        locale: project.locale,
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
        locale: project.locale,
      });
    }

    await markCombinationUsed(params.projectId, combination);

    const voiceChance = config.schedule.clientVoiceChance ?? 0.25;
    messages = injectClientVoiceMessage(messages, voiceChance);

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
      profit3,
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
