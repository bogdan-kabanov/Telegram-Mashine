import { getOpenAIClient, isOpenAIConfigured } from "@/lib/openai/client";
import { getEnv } from "@/lib/schemas/env";
import type { DialogMessage } from "@/lib/schemas";

/**
 * Apply a free-text operator instruction to dialog messages via chat model.
 */
export async function applyDialogAiFix(params: {
  messages: DialogMessage[];
  instruction: string;
  locale?: string;
}): Promise<DialogMessage[]> {
  if (!isOpenAIConfigured()) {
    throw new Error("OpenAI не настроен — нельзя применить правку через ИИ.");
  }
  const client = getOpenAIClient();
  if (!client) throw new Error("OpenAI client unavailable");

  const textMsgs = params.messages
    .map((m, i) => ({ i, type: m.type, role: m.role, content: m.content }))
    .filter((m) => m.type === "text" && typeof m.content === "string");

  const response = await client.chat.completions.create({
    model: getEnv().OPENAI_MODEL,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "You edit chat messages for a Spanish Telegram investment review. Return ONLY a JSON array of {index:number, content:string} for messages you change. Keep language/locale of each message. Do not invent new message indices.",
      },
      {
        role: "user",
        content: [
          `Operator instruction:\n${params.instruction}`,
          params.locale ? `Project locale: ${params.locale}` : "",
          "Messages:",
          JSON.stringify(textMsgs, null, 2),
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "[]";
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return params.messages;
  let patches: Array<{ index: number; content?: string; text?: string }> = [];
  try {
    patches = JSON.parse(jsonMatch[0]!) as Array<{
      index: number;
      content?: string;
      text?: string;
    }>;
  } catch {
    return params.messages;
  }

  const next = [...params.messages];
  for (const p of patches) {
    if (typeof p.index !== "number") continue;
    const nextText = p.content ?? p.text;
    if (typeof nextText !== "string") continue;
    const cur = next[p.index];
    if (!cur) continue;
    next[p.index] = { ...cur, content: nextText };
  }
  return next;
}
