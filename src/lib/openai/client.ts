import OpenAI from "openai";

import { getOutboundFetch } from "@/lib/http/outbound-fetch";
import { createLogger } from "@/lib/runtime/manager";
import { getEnv } from "@/lib/schemas/env";
import { getProxyUrl } from "@/lib/config/proxy-settings";

const logger = createLogger("openai");

let clientInstance: OpenAI | null = null;
let clientFingerprint: string | null = null;

function fingerprint(apiKey: string, proxyUrl: string): string {
  return `${apiKey}::${proxyUrl}`;
}

export function resetOpenAIClient(): void {
  clientInstance = null;
  clientFingerprint = null;
}

export function getOpenAIClient(): OpenAI | null {
  if (!isOpenAIConfigured()) return null;

  const env = getEnv();
  const proxyUrl = getProxyUrl();
  const nextFp = fingerprint(env.OPENAI_API_KEY!, proxyUrl);
  if (!clientInstance || clientFingerprint !== nextFp) {
    clientInstance = new OpenAI({
      apiKey: env.OPENAI_API_KEY!,
      fetch: getOutboundFetch(),
    });
    clientFingerprint = nextFp;
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
  const key = getEnv().OPENAI_API_KEY?.trim() ?? "";
  if (!key) return false;
  // Reject .env.example placeholders so we don't pretend Images API works.
  if (/your[_-]?openai|changeme|xxx+|placeholder|sk-proj-your/i.test(key)) return false;
  return key.length >= 20;
}
