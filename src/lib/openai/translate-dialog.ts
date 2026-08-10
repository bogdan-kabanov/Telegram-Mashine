import { z } from "zod";

import { getEnv } from "@/lib/schemas/env";
import type { DialogMessage } from "@/lib/schemas/dialog";
import { createLogger } from "@/lib/runtime/manager";
import { getOpenAIClient } from "@/lib/openai/client";

const logger = createLogger("translate-dialog");

const batchSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
    }),
  ),
});

/**
 * Translate dialog text messages for the operator (does not change screenshot language).
 * Returns map messageId → translation.
 */
export async function translateDialogMessages(params: {
  messages: DialogMessage[];
  targetLocale?: string;
  sourceLocale?: string;
}): Promise<Record<string, string>> {
  const target = params.targetLocale ?? "ru-RU";
  const source = params.sourceLocale ?? "es";
  const texts = params.messages.filter((m) => m.type === "text" && m.content.trim().length > 0);

  if (texts.length === 0) return {};

  const client = getOpenAIClient();
  if (!client) {
    await logger.warn("OpenAI not configured — cannot translate dialog");
    throw new Error("OPENAI_API_KEY не задан — перевод недоступен");
  }

  const env = getEnv();
  const payload = texts.map((m) => ({ id: m.id, text: m.content }));

  const response = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `You translate chat messages for an operator preview.
Source language hint: ${source}. Target locale: ${target}.
Keep meaning, tone, and emojis. Do not translate bank account numbers, CLABE/CBU/CVU, aliases, @handles, or amounts.
Return JSON: {"items":[{"id":"...","text":"..."}]} with the same ids.`,
      },
      {
        role: "user",
        content: JSON.stringify({ items: payload }),
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed: z.infer<typeof batchSchema>;
  try {
    parsed = batchSchema.parse(JSON.parse(raw));
  } catch (error) {
    await logger.warn("Failed to parse translation JSON", {
      error: error instanceof Error ? error.message : String(error),
      raw: raw.slice(0, 400),
    });
    throw new Error("Не удалось разобрать ответ перевода");
  }

  const out: Record<string, string> = {};
  for (const item of parsed.items) {
    if (item.id && item.text) out[item.id] = item.text;
  }
  return out;
}
