import { z } from "zod";

import { createLogger } from "@/lib/runtime/manager";
import { getEnv } from "@/lib/schemas/env";
import { getOpenAIClient, isOpenAIConfigured } from "./client";

const logger = createLogger("openai-agents");

export type AgentRole = "client" | "manager";

export interface AgentTurnInput {
  role: AgentRole;
  stage: string;
  /** Script / legend phrase used as constraint or fallback. */
  seedPhrase: string;
  context: {
    clientName: string;
    managerName: string;
    deposit?: number;
    profitFinal?: number;
    locale?: string;
    previousMessages?: string[];
  };
}

export const aiLegendSchema = z.object({
  openingPhrase: z.string().min(3),
  problemParts: z.array(z.string().min(8)).min(2).max(4),
  motivation: z.string().min(8),
  doubtPhrases: z.array(z.string().min(3)).min(2).max(5),
  gratitudePhrases: z.array(z.string().min(3)).min(2).max(5),
});

export type AiLegend = z.infer<typeof aiLegendSchema>;

export const aiDialogTurnSchema = z.object({
  stage: z.string(),
  role: z.enum(["client", "manager"]),
  text: z.string().min(1),
});

export const aiDialogBundleSchema = z.object({
  legend: aiLegendSchema,
  turns: z.array(aiDialogTurnSchema).min(16),
});

export type AiDialogBundle = z.infer<typeof aiDialogBundleSchema>;

export interface FullDialogContext {
  clientName: string;
  managerName: string;
  deposit: number;
  profit1: number;
  profit2: number;
  profitFinal: number;
  currency: string;
  locale?: string;
  reviewType?: "small" | "big" | "unique_circle";
  /** Fixed templates that must appear verbatim (CLABE / amounts). */
  depositMessage: string;
  completionMessage: string;
  payoutMessage: string;
  /** Seed legend from legends.json — AI must expand THIS story, not skip to money. */
  seedLegend?: {
    title?: string;
    openingPhrase: string;
    problem: string;
    motivation: string;
    doubtPhrases: string[];
    gratitudePhrases: string[];
  };
}

/**
 * Stage-aware AI agents for client and manager.
 * Scripts remain the source of truth; the model rewrites within constraints.
 * Without OPENAI_API_KEY — returns the seed phrase unchanged.
 */
export async function generateAgentTurn(input: AgentTurnInput): Promise<string> {
  const client = getOpenAIClient();
  if (!client) {
    await logger.warn("OpenAI not configured — agent stub uses seed phrase", {
      role: input.role,
      stage: input.stage,
    });
    return input.seedPhrase;
  }

  const env = getEnv();
  const locale = input.context.locale ?? "es-MX";
  const history = (input.context.previousMessages ?? []).slice(-6).join("\n");

  const system =
    input.role === "client"
      ? [
          locale.toLowerCase().startsWith("ru")
            ? `You are a Russian client chatting with an investment manager on Telegram. Locale: ${locale}. Write natural Russian, 1-2 short sentences max.`
            : `You are a Mexican client chatting with an investment manager on Telegram. Locale: ${locale}. Write natural Spanish (Mexico), 1-2 short sentences max.`,
          `Stay in character: cautious at first, warmer after wins. No English.`,
          `Do not invent bank details, CLABE, amounts, or links — only rephrase the seed.`,
          `Do NOT use inverted punctuation ¿ or ¡ — Mexican Telegram users almost never type them.`,
          `Match grammatical gender to the client first name (${input.context.clientName}): use feminine adjectives/agreements for female names (agradecida, segura, nerviosa, desesperada), masculine only for clearly male names.`,
        ].join(" ")
      : [
          locale.toLowerCase().startsWith("ru")
            ? `You are a professional female investment manager ("актриса") on Telegram. Locale: ${locale}. Write natural Russian, warm and confident, 1-2 sentences.`
            : `You are a professional female investment manager ("actriz") on Telegram. Locale: ${locale}. Write natural Spanish (Mexico), warm and confident, 1-2 sentences.`,
          `Guide the client stage-by-stage. Do not invent CLABE/amounts — keep placeholders from the seed.`,
          `No English. Keep the meaning of the seed phrase.`,
          `Do NOT use inverted punctuation ¿ or ¡.`,
          `You are female — use feminine self-reference (lista, dispuesta, atenta), never masculine (listo, dispuesto).`,
        ].join(" ");

  const user = [
    `Stage: ${input.stage}`,
    `Client: ${input.context.clientName}`,
    `Manager: ${input.context.managerName}`,
    input.context.deposit != null ? `Deposit: ${input.context.deposit}` : "",
    input.context.profitFinal != null ? `Profit: ${input.context.profitFinal}` : "",
    history ? `Recent chat:\n${history}` : "",
    `Seed phrase (rewrite naturally, keep meaning):\n"${input.seedPhrase}"`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 180,
      temperature: 0.85,
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) return input.seedPhrase;
    return text;
  } catch (error) {
    await logger.warn("Agent turn failed — using seed", {
      role: input.role,
      stage: input.stage,
      error: error instanceof Error ? error.message : "unknown",
    });
    return input.seedPhrase;
  }
}

export async function rephraseClientPhrase(
  phrase: string,
  kind: "doubt" | "gratitude",
  context: AgentTurnInput["context"],
): Promise<string> {
  return generateAgentTurn({
    role: "client",
    stage: kind,
    seedPhrase: phrase,
    context,
  });
}

export async function rephraseManagerPhrase(
  phrase: string,
  stage: string,
  context: AgentTurnInput["context"],
): Promise<string> {
  return generateAgentTurn({
    role: "manager",
    stage,
    seedPhrase: phrase,
    context,
  });
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1]?.trim() ?? trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model response");
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Full AI authoring: unique client legend + conversational turns for all stages.
 * Media slots (conditions / bets / captura / receipt) are inserted by the dialog generator.
 * Without OPENAI_API_KEY — returns null (caller falls back to scripts).
 */
export async function generateFullDialogBundle(
  ctx: FullDialogContext,
): Promise<AiDialogBundle | null> {
  const client = getOpenAIClient();
  if (!client) {
    await logger.warn("OpenAI not configured — full dialog AI skipped");
    return null;
  }

  const env = getEnv();
  const locale = ctx.locale ?? "es-MX";
  const isSmall = ctx.reviewType === "small";

  const system = [
    locale.toLowerCase().startsWith("ru")
      ? `You write realistic Telegram chats in Russian (${locale}) between a Russian client and a female investment manager.`
      : `You write realistic Telegram chats in Spanish (${locale}) between a Latin-American client and a female investment manager.`,
    `ALL chat texts (client AND manager) must be in the same language for locale ${locale}. Never mix Russian and Spanish in one dialog.`,
    `Return ONLY valid JSON. No markdown, no English in chat texts.`,
    `Do NOT invent CLABE numbers, bank account digits, payment links, or amounts other than those given.`,
    `When a turn must include deposit/completion/payout details, copy the provided template text VERBATIM.`,
    `CRITICAL: The chat must feel like a human conversation about the client's life problem FIRST.`,
    `Forbidden: jumping straight from hello → deposit → bets → payout with no personal talk.`,
    `Texts: short Telegram style (1–3 sentences). Client starts cautious, becomes warmer after wins.`,
    `Do NOT use inverted Spanish punctuation ¿ or ¡ anywhere — real Telegram users almost never type them.`,
    `Client gender: match adjectives to the client first name "${ctx.clientName}" (female names → agradecida/nerviosa/segura/desesperada; male → masculine forms).`,
    `Manager is female: feminine self-reference only (lista, dispuesta, atenta).`,
  ].join(" ");

  const stages = isSmall
    ? ["greeting", "trust_building", "conditions", "deposit", "bet_1", "bet_2"]
    : [
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
      ];

  const seed = ctx.seedLegend;
  const seedBlock = seed
    ? [
        `SEED CLIENT LEGEND (expand and keep this story — do not replace with a different plot):`,
        `title: ${seed.title ?? "client hardship"}`,
        `openingPhrase seed: ${JSON.stringify(seed.openingPhrase)}`,
        `problem seed: ${JSON.stringify(seed.problem)}`,
        `motivation seed: ${JSON.stringify(seed.motivation)}`,
        `doubt seeds: ${JSON.stringify(seed.doubtPhrases)}`,
        `gratitude seeds: ${JSON.stringify(seed.gratitudePhrases)}`,
        ``,
      ]
    : [
        `No seed legend — invent a concrete hardship (sick relative / hospital / medical debt) that fits a phone photo.`,
        ``,
      ];

  const user = [
    `Client first name: ${ctx.clientName}`,
    `Manager name: ${ctx.managerName}`,
    `Deposit: ${ctx.deposit} ${ctx.currency}`,
    `Intermediate profits: ${ctx.profit1}, ${ctx.profit2}`,
    `Final profit: ${ctx.profitFinal} ${ctx.currency}`,
    `Review size: ${isSmall ? "small" : "full"}`,
    ``,
    ...seedBlock,
    `FIXED templates (use verbatim when stage needs them):`,
    `depositMessage: ${JSON.stringify(ctx.depositMessage)}`,
    `completionMessage: ${JSON.stringify(ctx.completionMessage)}`,
    `payoutMessage: ${JSON.stringify(ctx.payoutMessage)}`,
    ``,
    `Stages that need text turns: ${stages.join(", ")}`,
    ``,
    `JSON shape:`,
    `{`,
    `  "legend": {`,
    `    "openingPhrase": "short greeting from client",`,
    `    "problemParts": ["part1", "part2", "part3"],`,
    `    "motivation": "why they want to earn",`,
    `    "doubtPhrases": ["...", "..."],`,
    `    "gratitudePhrases": ["...", "..."]`,
    `  },`,
    `  "turns": [`,
    `    {"stage":"greeting","role":"manager","text":"..."},`,
    `    {"stage":"greeting","role":"client","text":"..."}`,
    `  ]`,
    `}`,
    ``,
    `Rules for legend:`,
    `- problemParts: 2–4 messages telling the hardship in first person (expand the seed problem).`,
    `- motivation must clearly connect the hardship to needing money.`,
    `- doubtPhrases / gratitudePhrases: natural variants of the seeds.`,
    ``,
    `Rules for turns:`,
    `- Produce 32–48 text turns total so the chat is long enough for 9–12 screenshots.`,
    `- Stages "greeting" and "trust_building" MUST contain a real conversation (≥8 turns combined)`,
    `  about the client's problem, empathy from the manager, questions, doubts — BEFORE any conditions/deposit talk.`,
    `- Manager must acknowledge the hardship (sympathy, questions) before pitching investment.`,
    `- If the client mentions sending a photo of a sick relative / injury, keep that promise in problemParts — the photo is inserted by the pipeline.`,
    `- Client should ask how long the work takes; manager answers ~1.5–2 hours / patiently before conditions.`,
    `- After deposit details: client asks if it will really work; manager reassures; only then the payment proof is inserted by the pipeline (do not invent a receipt image).`,
    `- After completion (ask for card): include a client turn that is ONLY a card number (16 digits with spaces). Do not skip straight to payout.`,
    `- Each later stage should still have several back-and-forth messages (manager + client).`,
    `- Include EXACTLY one manager turn with text equal to depositMessage in stage "deposit".`,
    `- Include EXACTLY one manager turn with text equal to completionMessage in stage "completion" (if full).`,
    `- Include EXACTLY one manager turn with text equal to payoutMessage in stage "payout" (if full).`,
    `- After bet images the client should react happily; after payout — gratitude tied to the hardship.`,
    `- Do not mention screenshots, AI, or that this is a script.`,
    `- Never output placeholder words like "doubt", "gratitude", "openingPhrase" — only real chat sentences.`,
  ].join("\n");

  try {
    const response = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 4500,
      temperature: 0.9,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const parsed = extractJsonObject(raw);
    const bundle = aiDialogBundleSchema.parse(parsed);

    await logger.info("Full AI dialog bundle generated", {
      turns: bundle.turns.length,
      problemParts: bundle.legend.problemParts.length,
    });

    return bundle;
  } catch (error) {
    await logger.warn("Full dialog AI failed — fallback to scripts", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

export { isOpenAIConfigured, getOpenAIClient };
