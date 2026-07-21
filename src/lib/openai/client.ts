import OpenAI from "openai";

import { createLogger } from "@/lib/runtime/manager";
import { getEnv } from "@/lib/schemas/env";

const logger = createLogger("openai");

let clientInstance: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) return null;

  if (!clientInstance) {
    clientInstance = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return clientInstance;
}

/**
 * Stage 2: Full dialog generation with scripts + legends.
 * Stage 1: Stub that validates API key availability.
 */
export async function generateDialogStub(prompt: string): Promise<string> {
  const env = getEnv();
  const client = getOpenAIClient();

  if (!client) {
    await logger.warn("OpenAI API key not configured, returning stub response");
    return `[stub] ${prompt.slice(0, 100)}`;
  }

  const response = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content: "You generate short realistic client messages in Spanish for investment chat scenarios. Keep responses under 2 sentences.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 150,
    temperature: 0.8,
  });

  return response.choices[0]?.message?.content ?? "";
}

export function isOpenAIConfigured(): boolean {
  return Boolean(getEnv().OPENAI_API_KEY);
}
