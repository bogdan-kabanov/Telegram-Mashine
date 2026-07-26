import { getEnv, resetEnvCache } from "@/lib/schemas/env";
import { getOpenAIClient } from "./client";

export type GeneratedImageResult = {
  b64: string;
  model: string;
};

/**
 * Generate a PNG via OpenAI Images.
 * Tries OPENAI_IMAGE_MODEL first, then gpt-image-1 if the configured model is missing.
 */
export async function generateImagePngBase64(prompt: string): Promise<GeneratedImageResult> {
  // Pick up .env changes without full process restart.
  resetEnvCache();

  const client = getOpenAIClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY не задан");
  }

  const preferred = (process.env.OPENAI_IMAGE_MODEL || getEnv().OPENAI_IMAGE_MODEL || "gpt-image-1").trim();
  const candidates = [...new Set([preferred, "gpt-image-1"].filter(Boolean))];
  let lastError = "Неизвестная ошибка Images API";

  for (const model of candidates) {
    try {
      const response = await client.images.generate({
        model,
        prompt,
        n: 1,
        size: "1024x1024",
      });
      const first = response.data?.[0];
      let b64 = first?.b64_json ?? null;
      if (!b64 && first?.url) {
        const imgRes = await fetch(first.url);
        if (!imgRes.ok) {
          throw new Error(`Не удалось скачать картинку по URL (${imgRes.status})`);
        }
        b64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
      }
      if (!b64) {
        throw new Error("Ответ Images API без изображения (ни b64, ни url)");
      }
      return { b64, model };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      // Try next candidate only for missing/unknown model.
      if (!/does not exist|model_not_found|invalid_model|not available/i.test(lastError)) {
        throw new Error(lastError);
      }
    }
  }

  throw new Error(lastError);
}
